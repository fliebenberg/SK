import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CandidateTeam,
  Event,
  EventOrgBadge,
  EventOrgHistory,
  hasLeft,
} from '@sk/shared';
import { ScreenHeader } from '../../../../../../components/ScreenHeader';
import { AccessDenied } from '../../../../../../components/AccessDenied';
import { OverflowMenu } from '../../../../../../components/OverflowMenu';
import { SegmentedControl } from '../../../../../../components/SegmentedControl';
import { FloatingSaveBar } from '../../../../../../components/FloatingSaveBar';
import { NominateFor, RemoveOrganisationDialog, useCanWriteInto } from '../../../../../../components/tournament/OrganisationDialogs';
import { OrgTeamsByDivision, useOrgTeamPicks } from '../../../../../../components/tournament/OrganisationTeams';
import { OrganisationBanner, OrganisationResponse, isLongReason } from '../../../../../../components/tournament/OrganisationResponse';
import { OrganisationTeamCards } from '../../../../../../components/tournament/OrganisationTeamCards';
import { useOrgTeams } from '../../../../../../hooks/useOrgTeams';
import { useMineAll } from '../../../../../../hooks/useMineAll';
import { useEventDivisions, useEventRecord, useSports } from '../../../../../../hooks/useEventRooms';
import { useEventEntrants } from '../../../../../../hooks/useEventEntrants';
import { useEventCapabilities } from '../../../../../../hooks/useEventCapabilities';
import { useOrgSummary } from '../../../../../../hooks/useOrgSummary';
import { useSafeBack } from '../../../../../../hooks/useSafeBack';
import { useUnsavedChanges } from '../../../../../../hooks/useUnsavedChanges';
import { useUnsavedChangesStore } from '../../../../../../store/unsavedChangesStore';
import { useAuthStore } from '../../../../../../store/authStore';
import { useWsStore } from '../../../../../../store/wsStore';
import { wsService } from '../../../../../../services/websocket';
import { PageBody } from '../../../../../../components/PageBody';

/**
 * One organisation in a tournament (`FIX-26`, agreed 2026-10-07/08 on
 * `mockups/organisations-teams.html`, option B): its invitation, and its teams.
 *
 * A page rather than the dialog it replaces, so that it has a link to send to whoever enters an
 * organisation's teams, and room for a big club in a big tournament. Reached from the tournament's
 * step 3 and its Organisations card.
 *
 * - **The banner** holds the name and the status; the **response** has a small card of its own,
 *   beside the banner on a wide screen and under it on a phone. While there is no answer it offers
 *   *Accepted* / *Declined* ("they can respond, or you can set their response"); once there is one,
 *   it says who answered and when, with *Change response* and *Remove from the tournament*.
 * - **The teams** card: every division by sport, the organisation's teams as tick chips, a ＋ on
 *   every division, and *All divisions / Entered*. Changes collect in the save bar.
 *
 * **Two readers** (`FIX-30`): the tournament's organisers, who manage everything here, and the
 * organisation's own members once it is invited — they answer (an admin, not staff: `FIX-31`), ask
 * to withdraw, and answer for its teams on cards (`OrganisationTeamCards`, `FIX-31`): its admins for
 * any team, a coach for their own, with Mine / All for a coach.
 */


/** The participant's invitation, read from the event as it arrives — before `org` is worked out. */
function useLiveRoomOwnStatus(events: Event[], eventId: string, participantOrgId: string) {
  return events.find(e => e?.id === eventId)?.participatingOrgs?.find(o => o.id === participantOrgId)?.invitation;
}

/** One empty list, so a page still loading its event hands the same one to every render. */
const NO_SPORTS: string[] = [];

export default function OrganisationInTournamentScreen() {
  const { orgId, eventId, participantOrgId } = useLocalSearchParams<{ orgId: string; eventId: string; participantOrgId: string }>();
  const safeBack = useSafeBack();
  const backToTournament = () => safeBack(`/admin/${orgId}/events/${eventId}`);
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const isConnected = useWsStore((state: any) => state.isConnected);
  const myUserId = useAuthStore((state: any) => state.user?.id);
  const canWriteInto = useCanWriteInto();

  const { capabilities, isLoading: loadingCapabilities } = useEventCapabilities(eventId);
  const canEdit = !!capabilities?.canEditEvent;
  // The organisation's own members: its page is theirs too, once it is invited (`FIX-30`).
  const memberships = useAuthStore((state: any) => state.orgMemberships) || [];
  const current = (m: any) => m.orgId === participantOrgId && (!m.endDate || new Date(m.endDate) > new Date());
  const isOwnOrg = memberships.some(current);
  // Answering for it is an admin's, as the server's `answer-invitation` gate has it (`FIX-31`).
  const adminsOwnOrg = memberships.some((m: any) => current(m) && m.roleId === 'role-org-admin');
  // A team's coach answers for their own team (`FIX-31`): the teams this viewer coaches.
  const teamMemberships = useAuthStore((state: any) => state.teamMemberships) || [];
  const coachTeamIds = useMemo(
    () => new Set<string>(teamMemberships.filter((m: any) => m.roleId === 'role-coach' || m.roleId === 'role-assistant-coach').map((m: any) => m.teamId)),
    [teamMemberships]
  );
  // Mine / All — the events list's one choice (`useMineAll`) — for a coach who is not an admin.
  const [mineAll, setMineAll] = useMineAll(orgId);

  /* -- data ------------------------------------------------------------------------------- */
  const { event, items: eventItems, isLoading: eventLoading } = useEventRecord(eventId);
  const divisions = useEventDivisions(eventId);
  // Its teams: the organisers', and an invited or taking-part organisation's own (its members' room).
  const ownStatus = useLiveRoomOwnStatus(eventItems, eventId, participantOrgId);
  const { entrants } = useEventEntrants(eventId, canEdit || (isOwnOrg && !!ownStatus && ['invited', 'accepted', 'withdrawal_pending'].includes(ownStatus)));

  const sports = useSports();
  // Its own teams, for asking to add one (the candidate set is the organisers').
  const { teams: ownTeams } = useOrgTeams(isOwnOrg && !canEdit ? participantOrgId : null);
  const [candidateTeams, setCandidateTeams] = useState<CandidateTeam[]>([]);
  // The teams that could be entered: a one-shot read, as no room owns that set (`FIX-2`).
  useEffect(() => {
    if (!isConnected || !canEdit || !eventId) return;
    let live = true;
    wsService.emit('get_data', { type: 'event_candidate_teams', eventId }, (res: any) => { if (live && res) setCandidateTeams(res.teams || []); });
    return () => { live = false; };
  }, [isConnected, canEdit, eventId]);

  // The host may be off the list (it can run a tournament it does not play in) and still opens here.
  const { org: hostOrg } = useOrgSummary(event?.orgId);
  const isHost = participantOrgId === event?.orgId;
  const org: EventOrgBadge | null =
    event?.participatingOrgs?.find(o => o.id === participantOrgId) ||
    (isHost && hostOrg
      ? { id: hostOrg.id, name: hostOrg.name, shortName: hostOrg.shortName || hostOrg.name, logo: hostOrg.logo, logoConfig: (hostOrg.settings as any)?.logoConfig, primaryColor: hostOrg.primaryColor, isClaimed: true, invitation: 'accepted' }
      : null);

  // Who invited and who answered: names, so a read of their own rather than on the public event.
  const [history, setHistory] = useState<EventOrgHistory | null>(null);
  useEffect(() => {
    if (!isConnected || !(canEdit || isOwnOrg) || !eventId || !participantOrgId) return;
    let live = true;
    wsService.emit('get_data', { type: 'event_org_history', eventId, participantOrgId }, (res: any) => { if (live) setHistory(res || null); });
    return () => { live = false; };
  }, [isConnected, canEdit, isOwnOrg, eventId, participantOrgId, org?.invitation, org?.answeredAt, org?.invitedAt]);

  /* -- teams ------------------------------------------------------------------------------- */
  const teams = useOrgTeamPicks({ org, orgId, divisions, sportIds: event?.sportIds || NO_SPORTS, entrants, candidateTeams });
  const [onlyEntered, setOnlyEntered] = useState(false);
  const { confirmThenNavigate } = useUnsavedChanges(teams.isDirty && !teams.saving, teams.reset);
  const save = async () => {
    if (await teams.save()) useUnsavedChangesStore.getState().clear();
  };

  const [dialog, setDialog] = useState<null | 'remove' | 'nominate'>(null);

  const mayOpen = canEdit || (isOwnOrg && !!ownStatus && ownStatus !== 'not_invited');
  if (!loadingCapabilities && !eventLoading && event && !mayOpen) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <AccessDenied message="This page is for the tournament's organisers, and for the organisation itself once it is invited." actionLabel="Back to the tournament" onAction={backToTournament} />
      </SafeAreaView>
    );
  }
  if (eventLoading || !event || !org) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Organisation" context={event?.name} onBack={backToTournament} />
        <View className="flex-1 items-center justify-center p-6">
          {eventLoading || !event ? <ActivityIndicator /> : <Text className="font-inter text-sm text-ink-muted">That organisation is not taking part in this tournament.</Text>}
        </View>
      </SafeAreaView>
    );
  }

  const entered = Object.values(teams.picks).flat().filter(p => p.was);
  const enteredDivisions = Object.entries(teams.picks).filter(([, rows]) => rows.some(p => p.was)).length;

  const viewer = canEdit ? 'organiser' : 'organisation';
  // A coach of one of its teams in the tournament, and not its admin: Mine / All applies.
  const ownEntrants = entrants.filter(e => e.orgId === org.id);
  const coachOnly = !canEdit && !adminsOwnOrg && ownEntrants.some(e => !!e.teamId && coachTeamIds.has(e.teamId));
  const myTeamNames = ownEntrants.filter(e => !!e.teamId && coachTeamIds.has(e.teamId)).map(e => e.name).filter(Boolean).join(', ');
  const response = (
    <OrganisationResponse
      event={event}
      orgId={orgId}
      org={org}
      isHost={isHost}
      viewer={viewer}
      canAnswer={canEdit || adminsOwnOrg}
      hostName={hostOrg?.name || 'the organisers'}
      history={history}
      myUserId={myUserId}
      wide={isWide && !isLongReason(history)}
      onRemove={() => setDialog('remove')}
      teams={entrants.filter(e => e.orgId === org.id)}
      divisions={divisions}
      sportName={id => sports.find(sp => sp.id === id)?.name || ''}
    />
  );
  // A long reason would make the card beside the banner tall and narrow: it goes under it instead.
  const sideBySide = isWide && !isLongReason(history);

  const banner = (
    <OrganisationBanner org={org} isHost={isHost} eventName={event.name} entries={entered.length} divisions={enteredDivisions} isWide={isWide} />
  );

  const menuItems = canEdit && org.isClaimed === false
    ? [{ label: 'Nominate a contact', description: `Nobody manages ${org.name} on ScoreKeeper yet.`, icon: 'person-add-outline' as const, onPress: () => setDialog('nominate') }]
    : [];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="Organisation"
        context={event.name}
        onBack={() => confirmThenNavigate(backToTournament)}
        right={menuItems.length ? <OverflowMenu items={menuItems} title={org.name} accessibilityLabel={`${org.name} actions`} /> : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 120 }}>
        <PageBody className="gap-4">
          {sideBySide ? <View className="flex-row gap-4 items-stretch">{banner}{response}</View> : <>{banner}{response}</>}

          {canEdit ? (
            <View className="rounded-2xl border border-line bg-card p-4 gap-2">
              {/* A section heading (design_system.md, *Section headings*): the control drops under it when it does not fit. */}
              <View className="flex-row flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <View className="flex-row items-baseline gap-2">
                  <Text className="font-inter-bold text-[18px] text-ink">Teams</Text>
                  <Text className="font-inter text-[15px] text-ink-muted">{entered.length}</Text>
                </View>
                <View className="flex-1" />
                <SegmentedControl
                  fit
                  isCompact
                  value={onlyEntered ? 'entered' : 'all'}
                  onChange={key => setOnlyEntered(key === 'entered')}
                  options={[{ key: 'all', label: 'All divisions' }, { key: 'entered', label: 'Entered' }]}
                />
              </View>
              {hasLeft(org.invitation) ? (
                <Text className="font-inter text-[13px] text-ink-muted">{org.invitation === 'declined' ? 'Declined' : 'Withdrawn'}: its teams were taken out of their divisions.</Text>
              ) : <OrgTeamsByDivision
                org={org}
                orgId={orgId}
                sports={sports}
                sportIds={event.sportIds || []}
                picks={teams.picks}
                ordered={teams.ordered}
                candidateTeams={candidateTeams}
                enteredTeamIds={teams.enteredTeamIds}
                writable={canWriteInto(org, orgId)}
                canEdit={canEdit}
                onlyEntered={onlyEntered}
                isWide={isWide}
                requests={entrants.filter(e => e.orgId === org.id && (e.status === 'requested' || e.status === 'withdrawal_pending'))}
                onToggle={teams.toggle}
                onAdd={teams.add}
                onTeamCreated={team => setCandidateTeams(prev => [...prev, {
                  id: team.id, name: team.name, shortName: team.shortName, orgId: team.orgId,
                  orgName: org.name, orgShortName: org.shortName,
                  sportId: team.sportId, ageGroupId: team.ageGroupId ?? null, ageGroup: team.ageGroup,
                }])}
              />}
              {teams.withdrawing.length ? (
                <View className="rounded-xl bg-warning-soft px-3 py-2">
                  <Text className="font-inter text-[13px] text-warning-ink">
                    {teams.withdrawing.map(p => p.label).join(', ')} {teams.withdrawing.length === 1 ? 'has' : 'have'} played, so saving withdraws {teams.withdrawing.length === 1 ? 'it' : 'them'} rather than removing: results stay in the table, and remaining fixtures stay in the draw until replaced or redrawn.
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <>
              {coachOnly ? (
                <View className={isWide ? 'flex-row items-center gap-3' : 'gap-1'}>
                  <SegmentedControl
                    fit
                    isCompact
                    value={mineAll}
                    onChange={key => setMineAll(key as 'mine' | 'all')}
                    options={[{ key: 'mine', label: 'Mine' }, { key: 'all', label: 'All' }]}
                  />
                  <Text className="font-inter text-xs text-ink-muted">
                    {mineAll === 'mine' ? `Showing ${myTeamNames || 'your teams'}` : `Showing all of ${org.name}'s teams`}
                  </Text>
                </View>
              ) : null}
              <OrganisationTeamCards
                event={event}
                org={org}
                actingOrgId={orgId}
                divisions={divisions}
                sports={sports}
                entrants={entrants}
                ownTeams={ownTeams}
                isAdmin={adminsOwnOrg}
                coachTeamIds={coachTeamIds}
                onlyTeamIds={coachOnly && mineAll === 'mine' ? coachTeamIds : null}
                isWide={isWide}
              />
            </>
          )}
        </PageBody>
      </ScrollView>

      <FloatingSaveBar
        visible={canEdit && teams.isDirty}
        title={`${teams.changedCount} ${teams.changedCount === 1 ? 'division' : 'divisions'} changed`}
        description={`${org.name}'s teams`}
        saveLabel={teams.withdrawing.length ? `Save and withdraw ${teams.withdrawing.length}` : 'Save'}
        onSave={save}
        onCancel={teams.reset}
        isProcessing={teams.saving}
      />

      <RemoveOrganisationDialog
        visible={dialog === 'remove'}
        event={event}
        orgId={orgId}
        org={org}
        entrants={entrants}
        onClose={() => setDialog(null)}
        onRemoved={() => { setDialog(null); useUnsavedChangesStore.getState().clear(); backToTournament(); }}
      />
      {dialog === 'nominate' ? <NominateFor org={org} onClose={() => setDialog(null)} /> : null}
    </SafeAreaView>
  );
}
