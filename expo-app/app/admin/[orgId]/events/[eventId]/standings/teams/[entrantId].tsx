import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { divisionFullName, ordinal } from '@sk/shared';
import { ScreenHeader } from '../../../../../../../components/ScreenHeader';
import { AccessDenied } from '../../../../../../../components/AccessDenied';
import { PageBody } from '../../../../../../../components/PageBody';
import { StandingsTable } from '../../../../../../../components/tournament/StandingsTable';
import { ResultsHead } from '../../../../../../../components/tournament/StandingsTab';
import { TournamentCard } from '../../../../../../../components/tournament/TournamentBits';
import { FixtureList } from '../../../../../../../components/tournament/DivisionFixtures';
import { awardsPoints, entrantName, hasOneTable, standingSummary } from '../../../../../../../components/tournament/standingsBits';
import { useEventDivisions, useEventFixtures, useEventRecord, useEventStandings, useSports } from '../../../../../../../hooks/useEventRooms';
import { useOrgSites } from '../../../../../../../hooks/useOrgSites';
import { useSafeBack } from '../../../../../../../hooks/useSafeBack';
import { useAuthStore } from '../../../../../../../store/authStore';
import { whenMs } from '../../../../../../../utils/dates';

/**
 * One team's results in a tournament (stage 4, docs/events.md §10): where it stands, its fixtures
 * and results, and its division's table with it picked out. A page rather than a sheet (agreed
 * 2026-10-17), like the organisation and division it is reached from, so every row of the
 * Standings tab opens the same way.
 *
 * The table is the division's **whole** table, the one the leaderboard counted; a division played
 * in pools or with a knockout has its stage tables on the division page, which *Full table* opens.
 */
export default function TeamResultsScreen() {
  const { orgId, eventId, entrantId } = useLocalSearchParams<{ orgId: string; eventId: string; entrantId: string }>();
  const router = useRouter();
  const safeBack = useSafeBack();
  const back = () => safeBack(`/admin/${orgId}/events/${eventId}?tab=standings`);
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const memberships = useAuthStore((state: any) => state.orgMemberships);
  const viewerOrgIds = useMemo(() => (memberships || []).map((m: any) => m.orgId) as string[], [memberships]);

  const { event, accessDenied } = useEventRecord(eventId);
  const divisions = useEventDivisions(eventId);
  const games = useEventFixtures(eventId);
  const sports = useSports();
  const { facilities } = useOrgSites(event?.orgId);
  const { divisions: tables, isLoading } = useEventStandings(eventId);

  if (accessDenied) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <AccessDenied message="This tournament is not open to you." actionLabel="Back" onAction={back} />
      </SafeAreaView>
    );
  }

  const table = tables.find(t => t.rows.some(r => (r.entrantId || r.teamId) === entrantId));
  const row = table?.rows.find(r => (r.entrantId || r.teamId) === entrantId);
  const division = divisions.find(d => d.id === table?.divisionId);
  const orgs = event?.participatingOrgs;
  const name = row ? entrantName(row, orgs, false) : 'Team';

  if (!event || isLoading || (!row && !tables.length)) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title={name} onBack={back} backLabel="Standings" />
        <View className="flex-1 items-center justify-center p-6"><ActivityIndicator /></View>
      </SafeAreaView>
    );
  }
  if (!row || !division || !table) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Team" context={event.name} onBack={back} backLabel="Standings" />
        <View className="flex-1 items-center justify-center p-6">
          <Text className="font-inter text-sm text-ink-muted">This team is not in the tournament's tables.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const divisionName = divisionFullName(division.name, sports.find(s => s.id === division.sportId)?.name);
  const fixtures = games
    .filter(g => (g.participants || []).some(p => p.entrantId === entrantId))
    .sort((a, b) => whenMs(a.startTime || a.scheduledStartTime) - whenMs(b.startTime || b.scheduledStartTime));
  const finished = fixtures.some(g => g.status === 'Finished');
  const placed = !row.withdrawn && !!row.rank && finished && hasOneTable(division);
  // The team's own page is its organisation's, so the link is there for that organisation's members.
  const teamId = fixtures.flatMap(g => g.participants || []).find(p => p.entrantId === entrantId)?.teamId;
  const teamLink = teamId && row.orgId && viewerOrgIds.includes(row.orgId) ? (
    <TouchableOpacity onPress={() => router.push(`/admin/${row.orgId}/teams/${teamId}`)} accessibilityRole="link">
      <Text className="font-inter-bold text-[13px] text-primary-ink">Team page ›</Text>
    </TouchableOpacity>
  ) : null;
  const openDivision = () => router.push(`/admin/${orgId}/events/${eventId}/divisions/${division.id}`);

  const head = (
    <ResultsHead
      orgId={row.orgId}
      orgs={orgs}
      title={name}
      meta={(
        <>
          {row.withdrawn ? 'Withdrawn' : placed ? <Text className="font-inter-bold text-primary-ink">{ordinal(row.rank!)}</Text> : null}
          {`${row.withdrawn || placed ? ' in ' : ''}${divisionName} · ${standingSummary(row, awardsPoints(event))}`}
        </>
      )}
      right={isWide ? teamLink : null}
    />
  );
  const fixturesCard = (
    <TournamentCard title="Fixtures" count={fixtures.length || undefined}>
      {fixtures.length ? (
        <FixtureList games={fixtures} orgId={orgId} eventId={eventId} facilities={facilities} isWide={isWide} ownOrgId={event.orgId} />
      ) : (
        <Text className="font-inter text-sm text-ink-muted">No fixtures yet.</Text>
      )}
    </TournamentCard>
  );
  const tableCard = (
    <TournamentCard
      title={divisionName}
      right={(
        <TouchableOpacity onPress={openDivision} accessibilityRole="link">
          <Text className="font-inter-bold text-[13px] text-primary-ink">Full table ›</Text>
        </TouchableOpacity>
      )}
    >
      <StandingsTable
        rows={table.rows}
        orgs={orgs}
        isWide={isWide}
        compact
        showPoints={awardsPoints(event)}
        framed={false}
        highlight={r => (r.entrantId || r.teamId) === entrantId}
        onPressRow={r => (r.entrantId || r.teamId) !== entrantId && router.push(`/admin/${orgId}/events/${eventId}/standings/teams/${r.entrantId || r.teamId}`)}
      />
    </TournamentCard>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader title={name} context={event.name} onBack={back} backLabel="Standings" />
      <ScrollView contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 80 }}>
        <PageBody className="gap-3.5">
          {head}
          {isWide ? (
            <View className="flex-row items-start gap-5">
              <View style={{ flex: 1.2, minWidth: 0 }}>{fixturesCard}</View>
              <View style={{ flex: 1, minWidth: 0 }}>{tableCard}</View>
            </View>
          ) : (
            <>
              {fixturesCard}
              {tableCard}
              {teamLink ? <View className="items-center py-1">{teamLink}</View> : null}
            </>
          )}
        </PageBody>
      </ScrollView>
    </SafeAreaView>
  );
}
