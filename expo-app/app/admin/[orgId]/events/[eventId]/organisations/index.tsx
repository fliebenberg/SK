import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Event } from '@sk/shared';
import { ScreenHeader } from '../../../../../../components/ScreenHeader';
import { AccessDenied } from '../../../../../../components/AccessDenied';
import {
  ChipCarousel, NotInvitedBox, OrgRow, OrgsList, SectionPageHeading, SportChip, UnnamedList, WarningsCount, WarningsList,
} from '../../../../../../components/tournament/TournamentBits';
import { useOrganisationsSection } from '../../../../../../components/tournament/TournamentSections';
import { useTournamentSteps } from '../../../../../../components/tournament/TournamentHome';
import { useTournamentData } from '../../../../../../hooks/useTournamentData';
import { useSafeBack } from '../../../../../../hooks/useSafeBack';
import { useAuthStore } from '../../../../../../store/authStore';
import { PageBody } from '../../../../../../components/PageBody';

/**
 * Organisations & teams as a page of its own — the Overview card's *See all ›* (agreed 2026-10-09
 * on `mockups/tournament-cards.html`). The card's warnings, its *not invited yet* box and its rows,
 * unchanged, with room: every warning rather than the first few, each organisation's entries in
 * full rather than cut to one line, and filters for a big tournament — *Needs attention*, and one
 * per sport, which also trims each row to that sport's entries. A row opens the organisation's page.
 */
export default function TournamentOrganisationsScreen() {
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();
  const safeBack = useSafeBack();
  const backToTournament = () => safeBack(`/admin/${orgId}/events/${eventId}`);
  const data = useTournamentData(orgId, eventId);

  if (data.accessDenied) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <AccessDenied message="This tournament is not open to you." actionLabel="Back" onAction={backToTournament} />
      </SafeAreaView>
    );
  }
  if (!data.event) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Organisations" onBack={backToTournament} backLabel="Overview" />
        <View className="flex-1 items-center justify-center p-6"><ActivityIndicator /></View>
      </SafeAreaView>
    );
  }
  return <OrganisationsPage orgId={orgId} event={data.event} data={data} onBack={backToTournament} />;
}

/** `all`, `attention`, or a sport's name. */
type Filter = string;

/** The page itself, once the event is here — its own component, so the section's hooks always run. */
function OrganisationsPage({ orgId, event, data, onBack }: {
  orgId: string;
  event: Event;
  data: ReturnType<typeof useTournamentData>;
  onBack: () => void;
}) {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const { divisions, games, entrants, entrantsByDivision, facilityIds, sports, sites, canEdit, hostOrg } = data;
  const { steps, complete } = useTournamentSteps({ event, divisions, games, entrants, entrantsByDivision, facilityIds, sports, sites });
  const setupMode = canEdit && !complete;
  const orgMemberships = useAuthStore((state: any) => state.orgMemberships) || [];
  const viewerOrgIds: string[] = orgMemberships.map((m: any) => m.orgId);
  const orgs = useOrganisationsSection({ event, orgId, sports, divisions, entrantsByDivision, hostOrg, viewerOrgIds, canEdit, setupMode });
  const [filter, setFilter] = useState<Filter>('all');

  const rows = orgs.visibleRows;
  const needsAttention = (r: OrgRow) => !r.isHost && (r.invitation === 'not_invited' || orgs.warnings.some(w => w.orgId === r.org.id));
  const attentionCount = setupMode ? rows.filter(needsAttention).length : 0;
  const sportNames = (event.sportIds || []).map(id => sports.find(s => s.id === id)?.name).filter((n): n is string => !!n);
  const inSport = (r: OrgRow, sport: string) => r.bySport.some(([name]) => name === sport);
  const shown: OrgRow[] = filter === 'all' ? rows
    : filter === 'attention' ? rows.filter(needsAttention)
    : rows.filter(r => inSport(r, filter)).map(r => {
        // Trimmed to that sport: its entries there, and its counts with them.
        const names = r.bySport.find(([name]) => name === filter)?.[1] || [];
        return { ...r, bySport: [[filter, names]], teams: names.length, players: 0, toBeNamed: 0 } as OrgRow;
      });

  const chips = (
    <>
      <SportChip name="All" count={rows.length} on={filter === 'all'} onPress={() => setFilter('all')} />
      {attentionCount ? <SportChip name="Needs attention" count={attentionCount} on={filter === 'attention'} dot="wait" onPress={() => setFilter('attention')} /> : null}
      {sportNames.map(name => (
        <SportChip key={name} name={name} count={rows.filter(r => inSport(r, name)).length} on={filter === name} onPress={() => setFilter(name)} />
      ))}
    </>
  );
  const title = canEdit ? 'Organisations & teams' : 'Taking part';

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader title="Organisations" context={event.name} onBack={onBack} backLabel="Overview" />
      <ScrollView contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 80 }}>
        <PageBody className="gap-3">
          <SectionPageHeading
            title={title}
            count={rows.length}
            status={setupMode ? steps.find(s => s.key === 'entrants')?.state ?? null : null}
            phone={!isWide}
            right={(
              <>
                {setupMode ? <WarningsCount count={orgs.warnings.length} /> : null}
                {orgs.addOrganisation ? (
                  <TouchableOpacity onPress={orgs.addOrganisation} accessibilityRole="button" className="rounded-xl border border-line bg-card px-3.5 py-2">
                    <Text className="font-inter-bold text-[13px] text-ink">＋ Add organisation</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          />
          <WarningsList warnings={orgs.warnings} />
          {canEdit ? <NotInvitedBox count={orgs.notInvited.length} nobodyYet={orgs.nobodyInvited} onInviteAll={orgs.inviteAll} /> : null}

          <View className="rounded-2xl border border-line bg-card p-4 gap-3">
            {/* The filters wrap on a wide screen; on a phone they are one line, as a carousel. */}
            {isWide ? <View className="flex-row flex-wrap gap-1.5">{chips}</View> : <ChipCarousel>{chips}</ChipCarousel>}
            {shown.length ? (
              <OrgsList
                rows={shown}
                isWide={isWide}
                showInvitations={canEdit}
                onOpen={canEdit || orgs.highlightOrgId ? orgs.openOrg : undefined}
                openOnly={canEdit ? undefined : orgs.highlightOrgId}
                highlightOrgId={orgs.highlightOrgId}
                beforeDivisions={setupMode && !divisions.some(d => d.sportId)}
                fullEntries
              />
            ) : (
              <Text className="font-inter text-sm text-ink-muted">{filter === 'attention' ? 'Nothing needs attention.' : 'None in this sport yet.'}</Text>
            )}
            {filter === 'all' ? <UnnamedList entrants={orgs.unnamed} divisionName={orgs.divisionName} onOpen={canEdit ? orgs.openUnnamed : undefined} /> : null}
            {orgs.addingLine}
          </View>
          {setupMode ? (
            <Text className="font-inter text-xs text-ink-muted px-0.5">Tap an organisation to enter its teams or change its invitation. To enter teams one division at a time, open the division under Sports & divisions.</Text>
          ) : null}
        </PageBody>
      </ScrollView>
      {orgs.dialogs}
    </SafeAreaView>
  );
}
