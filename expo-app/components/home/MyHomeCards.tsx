import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GameSummary, MyHome, MyHomeRunEvent, Sport } from '@sk/shared';
import { TournamentCard } from '../tournament/TournamentBits';
import { MatchRow } from '../events/EventRows';
import { GroupHeading, HomeRow, IconMark } from './HomeBits';
import { ReadFailure } from '../ReadFailure';
import { homeLinks } from './homeLinks';
import { useGameRows } from '../../hooks/useListRows';
import { formatDateRange, instantCalendarDate, todayCalendarDate } from '../../utils/dates';

type Group = 'now' | 'next' | 'results';
const GROUP_LABELS: Record<Group, string> = { now: '● On now', next: 'Coming up', results: 'Latest results' };
const GROUP_ORDER: Group[] = ['now', 'next', 'results'];

const groupOf = (game: GameSummary): Group =>
  game.status === 'Live' ? 'now' : game.status === 'Finished' ? 'results' : 'next';

const whenOf = (game: GameSummary) => game.finishTime || game.scheduledStartTime || game.startTime || '';
const kickoffOf = (game: GameSummary) => game.scheduledStartTime || game.startTime;

/** By time: on now, then the soonest to come, then the latest result. */
function byTime(a: GameSummary, b: GameSummary) {
  const group = GROUP_ORDER.indexOf(groupOf(a)) - GROUP_ORDER.indexOf(groupOf(b));
  if (group) return group;
  const when = whenOf(a).localeCompare(whenOf(b));
  return groupOf(a) === 'results' ? -when : when;
}

/**
 * *My games* (docs/home.md §5): the live games, next games and latest results that matter most to the
 * viewer, chosen on the server. It shows nothing when there are none, unless the read failed: a
 * viewer with games must not simply lose the card (`SYNC-9`).
 */
export function MyGamesCard({ mine, sports, isWide, live, error, onRetry }: {
  /** `null` only when the read failed: Home draws no card while it is on its way. */
  mine: MyHome | null;
  sports: Sport[];
  /** The page has the room for the rows' wide form, with its column for where. */
  isWide: boolean;
  /** Home is the tab on screen, so its rows are worth keeping live. */
  live: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const router = useRouter();
  const today = todayCalendarDate();

  // Only what can change now holds a room: live, or on today. Judged from the list as read, so that a
  // score moving a row does not change what is held.
  const worthRooms = (mine?.games ?? [])
    .filter(game => game.status === 'Live' || (game.status === 'Scheduled' && instantCalendarDate(kickoffOf(game)) === today))
    .map(game => game.id);
  const gameRows = useGameRows(worthRooms, live);

  const games = useMemo(() => (mine?.games ?? [])
    .filter(game => gameRows.get(game.id) !== null)
    .map(game => ({ ...game, ...gameRows.get(game.id) }))
    .sort(byTime), [mine?.games, gameRows]);
  if (!mine) {
    return (
      <TournamentCard title="My games">
        <ReadFailure what="Your games" reason={error || 'The server did not answer.'} onRetry={onRetry} />
      </TournamentCard>
    );
  }
  if (!games.length && !error) return null;

  const rowProps = {
    isWide,
    canCreate: false,
    sportName: (id?: string) => sports.find(s => s.id === id)?.name || '',
    siteName: (id?: string | null) => (id && mine.siteNames[id]) || '',
    facilityName: (id?: string | null) => (id && mine.facilityNames[id]) || '',
    today,
    away: false,
    convening: false,
  };

  return (
    <TournamentCard title="My games">
      <View>
        {error ? <ReadFailure what="Your games" reason={error} onRetry={onRetry} stale /> : null}
        {games.map((game, i) => {
          const group = groupOf(game);
          const newGroup = i === 0 || groupOf(games[i - 1]) !== group;
          return (
            <View key={game.id}>
              {newGroup ? <GroupHeading label={GROUP_LABELS[group]} first={i === 0} tone={group === 'now' ? 'live' : 'muted'} /> : null}
              <MatchRow
                {...rowProps}
                game={game}
                first={newGroup}
                showDate={group !== 'now'}
                onPress={() => router.push(homeLinks.game(game.eventId, game.id) as any)}
              />
            </View>
          );
        })}
      </View>
    </TournamentCard>
  );
}

/** What an appointment to a tournament is called on Home. */
const RUN_SCOPE_LABELS: Record<string, string> = {
  event: 'Organiser',
  sport: 'Sport organiser',
  division: 'Convenor',
};

/**
 * *Tournaments I run* (`PERM-8`): for an organiser or convenor from outside the host, this is the way
 * in to the tournament's workspace.
 */
export function TournamentsIRunCard({ runs }: { runs: MyHomeRunEvent[] }) {
  const router = useRouter();
  return (
    <TournamentCard title="Tournaments I run">
      <View>
        {runs.map((run, i) => (
          <HomeRow
            key={run.id}
            first={i === 0}
            lead={<IconMark name="trophy" />}
            title={run.name}
            subtitle={[run.orgName, RUN_SCOPE_LABELS[run.scope]].filter(Boolean).join(' · ')}
            end={run.startDate ? <Text className="font-inter-semibold text-[13px] text-ink">{formatDateRange(run.startDate, run.endDate, { compact: true })}</Text> : undefined}
            onPress={() => router.push(`/admin/${run.orgId}/events/${run.id}` as any)}
          />
        ))}
      </View>
    </TournamentCard>
  );
}
