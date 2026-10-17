import React, { useMemo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Event, EventOrgBadge, GameSummary, Sport, TournamentDivision } from '@sk/shared';
import { StandingsTable } from './StandingsTable';
import { FixtureCrest } from '../events/EventBits';
import { DivisionStateLine, TournamentCard, divisionFormatLabel, divisionStateOf } from './TournamentBits';
import { crestOf, entrantName, hasOneTable } from './standingsBits';
import { useEventStandings } from '../../hooks/useEventRooms';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/**
 * The tournament page's Standings tab (stage 4, agreed 2026-10-17 on
 * `mockups/standings-read-first.html`, option A; docs/events.md §10).
 *
 * **The highest level first:** the leaderboard by organisation — who is winning the day — and
 * beside it (under it on a phone) every division, by sport, with who leads it and how far it has
 * got. Each row is a door: an organisation opens its results page, a division its own page, whose
 * Standings card has the division's tables. So there is no division scope selector any more, and a
 * stage's table is shown in one place (2026-10-17: "we do not want too many views of the same data").
 */
export function StandingsTab({ event, orgId, isWide, divisions, games, sports, viewerOrgIds }: {
  event: Event;
  orgId: string;
  isWide: boolean;
  /** In their order. */
  divisions: TournamentDivision[];
  games: GameSummary[];
  sports: Sport[];
  viewerOrgIds: string[];
}) {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';
  const { rows, divisions: tables } = useEventStandings(event.id);
  const orgs = event.participatingOrgs;

  // Teams per organisation: the entrants the leaderboard counted, from each division's table.
  const teamCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const table of tables) for (const row of table.rows) {
      if (row.orgId) counts.set(row.orgId, (counts.get(row.orgId) || 0) + 1);
    }
    return counts;
  }, [tables]);

  const counted = games.filter(g => g.status !== 'Cancelled' && g.divisionId);
  const played = counted.filter(g => g.status === 'Finished').length;

  const leaderboard = (
    <TournamentCard
      title="Leaderboard"
      right={counted.length ? <Text className="font-inter text-xs text-ink-muted">{played} of {counted.length} fixtures played</Text> : undefined}
    >
      <StandingsTable
        rows={rows}
        kind="organisation"
        subjectLabel="Organisation"
        orgs={orgs}
        isWide={isWide}
        framed={false}
        teamCounts={teamCounts}
        highlight={row => viewerOrgIds.includes(row.orgId || row.teamId)}
        onPressRow={row => router.push(`/admin/${orgId}/events/${event.id}/standings/organisations/${row.orgId || row.teamId}`)}
        emptyMessage="Nothing to rank yet. The leaderboard fills in as results come in."
      />
    </TournamentCard>
  );

  // The divisions by sport, in the order the tournament lists them.
  const bySport: Array<{ sportId: string; name: string; divisions: TournamentDivision[] }> = [];
  for (const division of divisions) {
    const key = division.sportId || '';
    let group = bySport.find(g => g.sportId === key);
    if (!group) {
      group = { sportId: key, name: sports.find(s => s.id === key)?.name || 'Other', divisions: [] };
      bySport.push(group);
    }
    group.divisions.push(division);
  }

  const divisionLine = (division: TournamentDivision, divisionGames: GameSummary[]) => {
    const finished = divisionGames.filter(g => g.status === 'Finished').length;
    const table = tables.find(t => t.divisionId === division.id)?.rows || [];
    const top = table.find(r => !r.withdrawn && r.rank === 1);
    const level = table.filter(r => !r.withdrawn && r.rank === 1).length > 1;
    if (!finished || !hasOneTable(division) || !top) return divisionFormatLabel(division);
    const all = finished === divisionGames.filter(g => g.status !== 'Cancelled').length;
    if (level) return all ? 'Level at the top' : 'Level at the top so far';
    return `${all ? 'Won by' : 'Led by'} ${entrantName(top, orgs, true)}`;
  };

  const divisionsCard = (
    <TournamentCard title="Divisions" count={divisions.length}>
      {divisions.length ? (
        <View>
          {bySport.map(group => (
            <View key={group.sportId}>
              {bySport.length > 1 ? (
                <Text className="font-orbitron-bold text-[9px] text-ink-muted uppercase tracking-widest pt-2 pb-1">{group.name}</Text>
              ) : null}
              {group.divisions.map(division => {
                const divisionGames = games.filter(g => g.divisionId === division.id);
                const state = divisionStateOf({ setupMode: false, games: divisionGames, entrants: [], division });
                return (
                  <TouchableOpacity
                    key={division.id}
                    onPress={() => router.push(`/admin/${orgId}/events/${event.id}/divisions/${division.id}`)}
                    accessibilityRole="link"
                    accessibilityLabel={`${division.name}, ${state.label}`}
                    className="flex-row items-center gap-3 py-2.5 border-t border-line-soft"
                  >
                    <View className="flex-1 min-w-0 gap-0.5">
                      <Text className="font-inter-bold text-sm text-ink" numberOfLines={1}>{division.name}</Text>
                      <Text className="font-inter text-xs text-ink-muted" numberOfLines={1}>{divisionLine(division, divisionGames)}</Text>
                    </View>
                    <DivisionStateLine state={state} />
                    <Ionicons name="chevron-forward" size={14} color={themeColor(isDark, 'ink-faint')} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      ) : (
        <Text className="font-inter text-sm text-ink-muted">No divisions yet.</Text>
      )}
    </TournamentCard>
  );

  if (!isWide) return <View className="gap-3">{leaderboard}{divisionsCard}</View>;
  return (
    <View className="flex-row items-start gap-5">
      <View style={{ flex: 1.55, minWidth: 0 }}>{leaderboard}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{divisionsCard}</View>
    </View>
  );
}

/**
 * The heading card of an organisation's or a team's results page: crest, name, and where it stands
 * in a line under it.
 */
export function ResultsHead({ orgId, orgs, title, meta, right }: {
  orgId?: string;
  orgs?: EventOrgBadge[];
  title: string;
  meta?: React.ReactNode;
  right?: React.ReactNode;
}) {
  const crest = crestOf(orgId, orgs);
  return (
    <View className="rounded-2xl border border-line bg-card p-4 flex-row items-center gap-3.5">
      {crest ? <FixtureCrest participant={crest as any} size={46} /> : null}
      <View className="flex-1 min-w-0 gap-0.5">
        <Text className="font-inter-bold text-xl text-ink" numberOfLines={2}>{title}</Text>
        {meta ? <Text className="font-inter text-[13px] text-ink-muted">{meta}</Text> : null}
      </View>
      {right}
    </View>
  );
}
