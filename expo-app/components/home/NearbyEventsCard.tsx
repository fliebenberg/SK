import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { HOME_RADIUS_KM, HomeNearby, NearbyGame, NearbyTournament, Sport } from '@sk/shared';
import { TournamentCard } from '../tournament/TournamentBits';
import { MatchRow, TournamentRow } from '../events/EventRows';
import { GroupHeading, ShowMore } from './HomeBits';
import { homeLinks } from './homeLinks';
import { useEventRows, useGameRows } from '../../hooks/useListRows';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import { addCalendarDays, instantCalendarDate, todayCalendarDate } from '../../utils/dates';

/** Rows shown before *Show more*. */
const FIRST_ROWS = 6;

type Group = 'now' | 'today' | 'week' | 'weeks';
const GROUP_LABELS: Record<Group, string> = { now: '● On now', today: 'Later today', week: 'This week', weeks: 'Coming weeks' };
const GROUP_ORDER: Group[] = ['now', 'today', 'week', 'weeks'];

/** A group whose rows are on another day: they show their date, and have nothing to wait for yet. */
const isAhead = (group: Group) => group === 'week' || group === 'weeks';

/** Days ahead the card covers, today being the first: the next seven are *This week*. */
const WEEK_DAYS = 6;
const MONTH_DAYS = 30;

type Item =
  | { kind: 'game'; key: string; group: Group; km: number | null; when: string; nearby: NearbyGame }
  | { kind: 'tournament'; key: string; group: Group; km: number | null; when: string; nearby: NearbyTournament };

/**
 * Which group a single match belongs to, in the viewer's own calendar: live, later today, in the
 * next six days, or in the rest of the month. `null` for anything outside that — the server's window
 * is generous on purpose.
 */
function gameGroup({ game }: NearbyGame, today: string, weekEnd: string, monthEnd: string): Group | null {
  if (game.status === 'Live') return 'now';
  const day = instantCalendarDate(game.scheduledStartTime || game.startTime);
  if (!day || day < today || day > monthEnd) return null;
  if (day === today) return 'today';
  return day <= weekEnd ? 'week' : 'weeks';
}

/** A tournament is on now while a game is live, later today while today is one of its days. */
function tournamentGroup({ event, liveCount }: NearbyTournament, today: string, weekEnd: string, monthEnd: string): Group | null {
  const last = event.endDate || event.startDate;
  if (!event.startDate || last < today || event.startDate > monthEnd) return null;
  if (liveCount > 0) return 'now';
  if (event.startDate <= today) return 'today';
  return event.startDate <= weekEnd ? 'week' : 'weeks';
}

function itemsOf(nearby: HomeNearby | null, today: string): Item[] {
  if (!nearby) return [];
  const weekEnd = addCalendarDays(today, WEEK_DAYS) ?? today;
  const monthEnd = addCalendarDays(today, MONTH_DAYS) ?? today;
  const list: Item[] = [];
  for (const g of nearby.games) {
    const group = gameGroup(g, today, weekEnd, monthEnd);
    if (group) list.push({ kind: 'game', key: g.game.id, group, km: g.km, when: g.game.scheduledStartTime || g.game.startTime || '', nearby: g });
  }
  for (const t of nearby.tournaments) {
    const group = tournamentGroup(t, today, weekEnd, monthEnd);
    if (group) list.push({ kind: 'tournament', key: t.event.id, group, km: t.km, when: t.event.startDate || '', nearby: t });
  }
  return list.sort((a, b) =>
    GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
    // What is still to come reads by time: soonest matters more than a few kilometres (decided 2026-11-04).
    || (a.group !== 'now' ? a.when.localeCompare(b.when) : 0)
    || (a.km ?? Infinity) - (b.km ?? Infinity)
    || a.when.localeCompare(b.when));
}

/**
 * *On now & next near you* (`HOME-1`): single matches and tournaments, grouped by time — on now,
 * later today, this week, coming weeks. On now is closest first, since all of it has started; the rest
 * is soonest first (decided 2026-11-04). When nothing is within the radius the closest are shown, and
 * the card says so once.
 */
export function NearbyEventsCard({ nearby, isLoading, hasLocation, sports, live }: {
  nearby: HomeNearby | null;
  isLoading: boolean;
  hasLocation: boolean;
  sports: Sport[];
  /** Home is the tab on screen, so its rows are worth keeping live. */
  live: boolean;
}) {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';
  const [showAll, setShowAll] = useState(false);
  const today = todayCalendarDate();

  // Only a row on screen that can change now holds a room: live, or on today. Next Thursday's match
  // has no score to wait for, and the list's next read catches a change to it. Judged from the list
  // as read, so that a score moving a row does not change what is held.
  const asRead = useMemo(() => itemsOf(nearby, today), [nearby, today]);
  const worthRooms = (showAll ? asRead : asRead.slice(0, FIRST_ROWS)).filter(item => !isAhead(item.group));
  const gameRows = useGameRows(worthRooms.filter(item => item.kind === 'game').map(item => item.key), live);
  const eventRows = useEventRows(worthRooms.filter(item => item.kind === 'tournament').map(item => item.key), live);

  const items = useMemo(() => {
    if (!nearby || (!gameRows.size && !eventRows.size)) return asRead;
    return itemsOf({
      ...nearby,
      games: nearby.games
        .filter(g => gameRows.get(g.game.id) !== null)
        .map(g => ({ ...g, game: { ...g.game, ...gameRows.get(g.game.id) } })),
      tournaments: nearby.tournaments.map(t => ({ ...t, ...eventRows.get(t.event.id) })),
    }, today);
  }, [nearby, today, asRead, gameRows, eventRows]);

  const sportName = (id?: string) => sports.find(s => s.id === id)?.name || '';
  const siteName = (id?: string | null) => (id && nearby?.siteNames[id]) || '';
  const facilityName = (id?: string | null) => (id && nearby?.facilityNames[id]) || '';
  const rowProps = { isWide: false, canCreate: false, sportName, siteName, facilityName, today, away: false, convening: false };

  const shown = showAll ? items : items.slice(0, FIRST_ROWS);
  const title = hasLocation ? 'On now & next near you' : 'On now & next';

  let body: React.ReactNode;
  if (isLoading && !nearby) {
    body = <View className="items-center py-6"><ActivityIndicator color={themeColor(isDark, 'primary')} /></View>;
  } else if (!items.length) {
    body = (
      <Text className="font-inter text-sm text-ink-muted py-1">
        {hasLocation ? `Nothing on within ${HOME_RADIUS_KM} km in the next month.` : 'Nothing on in the next month.'}
      </Text>
    );
  } else {
    body = (
      <View>
        {nearby?.eventsBeyondRadius ? (
          <Text className="font-inter text-[13px] text-ink-muted pb-2">Nothing on within {HOME_RADIUS_KM} km. The closest:</Text>
        ) : null}
        {shown.map((item, i) => {
          const newGroup = i === 0 || shown[i - 1].group !== item.group;
          const heading = newGroup ? <GroupHeading label={GROUP_LABELS[item.group]} first={i === 0} tone={item.group === 'now' ? 'live' : 'muted'} /> : null;
          const first = newGroup;
          if (item.kind === 'game') {
            const { game, km } = item.nearby;
            return (
              <View key={item.key}>
                {heading}
                <MatchRow
                  {...rowProps}
                  km={km}
                  game={game}
                  first={first}
                  showDate={isAhead(item.group)}
                  onPress={() => router.push(homeLinks.game(game.eventId, game.id) as any)}
                />
              </View>
            );
          }
          const { event, gameCount, liveCount, km } = item.nearby;
          return (
            <View key={item.key}>
              {heading}
              <TournamentRow
                {...rowProps}
                km={km}
                event={event}
                games={[]}
                gameCount={gameCount}
                liveCount={liveCount}
                sportIds={event.sportIds || []}
                isPast={false}
                first={first}
                onPress={() => router.push(homeLinks.event(event.id) as any)}
              />
            </View>
          );
        })}
        {items.length > FIRST_ROWS ? <ShowMore open={showAll} onToggle={() => setShowAll(v => !v)} /> : null}
      </View>
    );
  }

  return <TournamentCard title={title}>{body}</TournamentCard>;
}
