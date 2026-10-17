import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TournamentStandingRow, ordinal } from '@sk/shared';
import { ScreenHeader } from '../../../../../../../components/ScreenHeader';
import { AccessDenied } from '../../../../../../../components/AccessDenied';
import { PageBody } from '../../../../../../../components/PageBody';
import { StandingsTable } from '../../../../../../../components/tournament/StandingsTable';
import { ResultsHead } from '../../../../../../../components/tournament/StandingsTab';
import { formByEntrant, hasOneTable } from '../../../../../../../components/tournament/standingsBits';
import { useEventDivisions, useEventFixtures, useEventRecord, useEventStandings, useSports } from '../../../../../../../hooks/useEventRooms';
import { useSafeBack } from '../../../../../../../hooks/useSafeBack';

/**
 * One organisation's results in a tournament (stage 4, docs/events.md §10): where it stands on the
 * leaderboard, and a row for each of its teams — the same columns as every other table — by sport.
 * Reached from the Standings tab's leaderboard.
 *
 * A page of its own rather than a card on `organisations/[participantOrgId]` (agreed 2026-10-17):
 * that page manages an organisation's invitation and entries and is the organisers' and the
 * organisation's alone, while results are for anyone who can see the tournament.
 *
 * The rows are each division's **whole** table (`EventStandings.divisions`), the same rows the
 * leaderboard added up, so the points here sum to the organisation's line there.
 */
export default function OrganisationResultsScreen() {
  const { orgId, eventId, participantOrgId } = useLocalSearchParams<{ orgId: string; eventId: string; participantOrgId: string }>();
  const router = useRouter();
  const safeBack = useSafeBack();
  const back = () => safeBack(`/admin/${orgId}/events/${eventId}?tab=standings`);
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const { event, accessDenied } = useEventRecord(eventId);
  const divisions = useEventDivisions(eventId);
  const games = useEventFixtures(eventId);
  const sports = useSports();
  const { rows: leaderboard, divisions: tables, isLoading } = useEventStandings(eventId);
  const form = useMemo(() => formByEntrant(games), [games]);

  if (accessDenied) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <AccessDenied message="This tournament is not open to you." actionLabel="Back" onAction={back} />
      </SafeAreaView>
    );
  }

  const org = event?.participatingOrgs?.find(o => o.id === participantOrgId);
  const name = org?.name || 'Organisation';
  if (!event || isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title={name} onBack={back} backLabel="Standings" />
        <View className="flex-1 items-center justify-center p-6"><ActivityIndicator /></View>
      </SafeAreaView>
    );
  }

  const line = leaderboard.find(r => (r.orgId || r.teamId) === participantOrgId);
  const joint = !!line?.rank && leaderboard.filter(r => r.rank === line.rank).length > 1;

  // Its teams, division by division in the tournament's order, so a sport's divisions sit together.
  const sportName = (sportId?: string) => sports.find(s => s.id === sportId)?.name || 'Other';
  const rows: Array<TournamentStandingRow & { divisionId: string }> = [];
  for (const division of divisions) {
    const table = tables.find(t => t.divisionId === division.id)?.rows || [];
    for (const row of table) if (row.orgId === participantOrgId) rows.push({ ...row, divisionId: division.id });
  }
  const sportOrder = [...new Set(divisions.map(d => d.sportId || ''))];
  rows.sort((a, b) => {
    const da = divisions.find(d => d.id === a.divisionId), db = divisions.find(d => d.id === b.divisionId);
    return sportOrder.indexOf(da?.sportId || '') - sportOrder.indexOf(db?.sportId || '');
  });
  const division = (row: { divisionId?: string }) => divisions.find(d => d.id === row.divisionId);
  const place = (row: TournamentStandingRow & { divisionId?: string }) => {
    const d = division(row);
    const table = tables.find(t => t.divisionId === row.divisionId)?.rows || [];
    const finished = games.some(g => g.divisionId === row.divisionId && g.status === 'Finished');
    const where = d?.name || '';
    if (row.withdrawn || !d || !finished || !hasOneTable(d) || !row.rank) return where;
    return `${where} · ${ordinal(row.rank)} of ${table.filter(r => !r.withdrawn).length}`;
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader title={name} context={event.name} onBack={back} backLabel="Standings" />
      <ScrollView contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 80 }}>
        <PageBody className="gap-3.5">
          <ResultsHead
            orgId={participantOrgId}
            orgs={event.participatingOrgs}
            title={name}
            meta={line ? (
              <>
                <Text className="font-inter-bold text-primary-ink">{joint ? 'Joint ' : ''}{line.rank ? ordinal(line.rank) : '–'}</Text>
                {` of ${leaderboard.length} · ${line.points} point${line.points === 1 ? '' : 's'} · ${rows.length} team${rows.length === 1 ? '' : 's'}`}
              </>
            ) : 'Not on the leaderboard yet'}
          />
          <View className="rounded-2xl border border-line bg-card p-4 gap-3">
            <StandingsTable
              rows={rows}
              subjectLabel="Team"
              orgs={event.participatingOrgs}
              isWide={isWide}
              form={form}
              plain
              framed={false}
              nameOf={row => row.teamName}
              subline={row => place(row as any)}
              groupOf={row => sportName(division(row as any)?.sportId)}
              onPressRow={row => router.push(`/admin/${orgId}/events/${eventId}/standings/teams/${row.entrantId || row.teamId}`)}
              emptyMessage="No teams in the tables yet."
            />
            {rows.length ? (
              <Text className="font-inter text-xs text-ink-muted">
                The leaderboard adds up the points these teams earn in their divisions{line?.adjustment ? ', after an adjustment by the organisers' : ''}.
              </Text>
            ) : null}
          </View>
        </PageBody>
      </ScrollView>
    </SafeAreaView>
  );
}
