import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { HOME_RADIUS_KM, HomeNearby, NearbyGame, NearbyTournament, Sport } from '@sk/shared';
import { TournamentCard } from '../tournament/TournamentBits';
import { MatchRow, TournamentRow } from '../events/EventRows';
import { GroupHeading, ShowMore } from './HomeBits';
import { homeLinks } from './homeLinks';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import { addCalendarDays, instantCalendarDate, todayCalendarDate } from '../../utils/dates';

/** Rows shown before *Show more*. */
const FIRST_ROWS = 6;

type Group = 'now' | 'today' | 'week';
const GROUP_LABELS: Record<Group, string> = { now: '● On now', today: 'Later today', week: 'This week' };
const GROUP_ORDER: Group[] = ['now', 'today', 'week'];

type Item =
  | { kind: 'game'; key: string; group: Group; km: number | null; when: string; nearby: NearbyGame }
  | { kind: 'tournament'; key: string; group: Group; km: number | null; when: string; nearby: NearbyTournament };

/**
 * Which group a single match belongs to, in the viewer's own calendar: live, later today, or in the
 * next six days. `null` for anything outside that — the server's window is generous on purpose.
 */
function gameGroup({ game }: NearbyGame, today: string, weekEnd: string): Group | null {
  if (game.status === 'Live') return 'now';
  const day = instantCalendarDate(game.scheduledStartTime || game.startTime);
  if (!day || day < today || day > weekEnd) return null;
  return day === today ? 'today' : 'week';
}

/** A tournament is on now while a game is live, later today while today is one of its days. */
function tournamentGroup({ event, games }: NearbyTournament, today: string, weekEnd: string): Group | null {
  const last = event.endDate || event.startDate;
  if (!event.startDate || last < today || event.startDate > weekEnd) return null;
  if (games.some(g => g.status === 'Live')) return 'now';
  return event.startDate <= today ? 'today' : 'week';
}

/**
 * *On now & next near you* (`HOME-1`): single matches and tournaments, grouped by time — on now,
 * later today, this week — and closest first inside each group (decided 2026-10-22). When nothing
 * is within the radius the closest are shown, and the card says so once.
 */
export function NearbyEventsCard({ nearby, isLoading, hasLocation, sports }: {
  nearby: HomeNearby | null;
  isLoading: boolean;
  hasLocation: boolean;
  sports: Sport[];
}) {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';
  const [showAll, setShowAll] = useState(false);
  const today = todayCalendarDate();

  const items = useMemo(() => {
    if (!nearby) return [];
    const weekEnd = addCalendarDays(today, 6) ?? today;
    const list: Item[] = [];
    for (const g of nearby.games) {
      const group = gameGroup(g, today, weekEnd);
      if (group) list.push({ kind: 'game', key: g.game.id, group, km: g.km, when: g.game.scheduledStartTime || g.game.startTime || '', nearby: g });
    }
    for (const t of nearby.tournaments) {
      const group = tournamentGroup(t, today, weekEnd);
      if (group) list.push({ kind: 'tournament', key: t.event.id, group, km: t.km, when: t.event.startDate || '', nearby: t });
    }
    return list.sort((a, b) =>
      GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
      || (a.km ?? Infinity) - (b.km ?? Infinity)
      || a.when.localeCompare(b.when));
  }, [nearby, today]);

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
        {hasLocation ? `Nothing on within ${HOME_RADIUS_KM} km this week.` : 'Nothing on this week.'}
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
                  showDate={item.group === 'week'}
                  onPress={() => router.push(homeLinks.game(game.eventId, game.id) as any)}
                />
              </View>
            );
          }
          const { event, games, km } = item.nearby;
          return (
            <View key={item.key}>
              {heading}
              <TournamentRow
                {...rowProps}
                km={km}
                event={event}
                games={games}
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
