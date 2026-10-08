import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CandidateTeam,
  Event,
  EventOrgBadge,
  EventOrgHistory,
  hasLeft,
  Sport,
  TournamentDivision,
} from '@sk/shared';
import { ScreenHeader } from '../../../../../../components/ScreenHeader';
import { AccessDenied } from '../../../../../../components/AccessDenied';
import { OverflowMenu } from '../../../../../../components/OverflowMenu';
import { SegmentedControl } from '../../../../../../components/SegmentedControl';
import { FloatingSaveBar } from '../../../../../../components/FloatingSaveBar';
import { FixtureCrest } from '../../../../../../components/events/EventBits';
import { InvitationBadge } from '../../../../../../components/tournament/TournamentBits';
import { NominateFor, RemoveOrganisationDialog, useCanWriteInto } from '../../../../../../components/tournament/OrganisationDialogs';
import { OrgTeamsByDivision, useOrgTeamPicks } from '../../../../../../components/tournament/OrganisationTeams';
import { OrganisationResponse, isLongReason } from '../../../../../../components/tournament/OrganisationResponse';
import { useLiveRoom } from '../../../../../../hooks/useLiveRoom';
import { useEventEntrants } from '../../../../../../hooks/useEventEntrants';
import { useEventCapabilities } from '../../../../../../hooks/useEventCapabilities';
import { useOrgSummary } from '../../../../../../hooks/useOrgSummary';
import { useSafeBack } from '../../../../../../hooks/useSafeBack';
import { useUnsavedChanges } from '../../../../../../hooks/useUnsavedChanges';
import { useUnsavedChangesStore } from '../../../../../../store/unsavedChangesStore';
import { useAuthStore } from '../../../../../../store/authStore';
import { useWsStore } from '../../../../../../store/wsStore';
import { wsService } from '../../../../../../services/websocket';

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
 * organisation's own members once it is invited — they answer (an admin or staff member), ask to
 * withdraw, and see their teams, read-only until self-entry exists (FUTURE_IDEAS).
 */


/** The participant's invitation, read from the event as it arrives — before `org` is worked out. */
function useLiveRoomOwnStatus(events: Event[], eventId: string, participantOrgId: string) {
  return events.find(e => e?.id === eventId)?.participatingOrgs?.find(o => o.id === participantOrgId)?.invitation;
}

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
  // Answering for it is an admin's or staff member's, as the server's `answer-invitation` gate has it.
  const runsOwnOrg = memberships.some((m: any) => current(m) && (m.roleId === 'role-org-admin' || m.roleId === 'role-org-staff'));

  /* -- data ------------------------------------------------------------------------------- */
  const { items: eventItems, isLoading: eventLoading } = useLiveRoom<Event>(eventId ? `event:${eventId}` : null, {
    reduce: message =>
      message.type === 'EVENT_ADDED' || message.type === 'EVENT_UPDATED'
        ? { kind: 'upsert', item: message.data }
        : message.type === 'EVENT_DELETED'
          ? { kind: 'remove', id: message.data?.id }
          : { kind: 'ignore' },
  });
  const event = eventItems.find(e => e?.id === eventId) || null;

  const { items: divisions } = useLiveRoom<TournamentDivision>(eventId ? `event:${eventId}:divisions` : null, {
    reduce: message => {
      switch (message.type) {
        case 'DIVISIONS_SYNC': return { kind: 'replace', items: message.data || [] };
        case 'DIVISION_ADDED':
        case 'DIVISION_UPDATED': return { kind: 'upsert', item: message.data };
        case 'DIVISION_DELETED': return { kind: 'remove', id: message.data?.id };
        default: return { kind: 'ignore' };
      }
    },
  });
  // Its teams: the organisers', and an invited or taking-part organisation's own (its members' room).
  const ownStatus = useLiveRoomOwnStatus(eventItems, eventId, participantOrgId);
  const { entrants } = useEventEntrants(eventId, canEdit || (isOwnOrg && !!ownStatus && ['invited', 'accepted', 'withdrawal_pending'].includes(ownStatus)));

  const [sports, setSports] = useState<Sport[]>([]);
  const [candidateTeams, setCandidateTeams] = useState<CandidateTeam[]>([]);
  useEffect(() => {
    if (!isConnected) return;
    let live = true;
    wsService.emit('get_data', { type: 'sports' }, (res: any) => { if (live && Array.isArray(res)) setSports(res); });
    return () => { live = false; };
  }, [isConnected]);
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
  const teams = useOrgTeamPicks({ org, orgId, divisions, sportIds: event?.sportIds || [], entrants, candidateTeams });
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
  const response = (
    <OrganisationResponse
      event={event}
      orgId={orgId}
      org={org}
      isHost={isHost}
      viewer={viewer}
      canAnswer={canEdit || runsOwnOrg}
      hostName={hostOrg?.name || 'the organisers'}
      history={history}
      myUserId={myUserId}
      wide={isWide && !isLongReason(history)}
      onRemove={() => setDialog('remove')}
    />
  );
  // A long reason would make the card beside the banner tall and narrow: it goes under it instead.
  const sideBySide = isWide && !isLongReason(history);

  const banner = (
    <View className="flex-1 rounded-2xl border border-line bg-card p-4 flex-row items-center gap-3.5">
      <FixtureCrest participant={{ id: org.id, orgId: org.id, orgLogo: org.logo, orgLogoConfig: org.logoConfig, orgPrimaryColor: org.primaryColor }} size={isWide ? 60 : 50} />
      <View className="flex-1 min-w-0 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="font-inter-bold text-ink" style={{ fontSize: isWide ? 22 : 19 }}>{org.name}</Text>
          {isHost ? null : <InvitationBadge invitation={org.invitation} large />}
        </View>
        <Text className="font-inter text-sm text-ink-muted">
          <Text className="font-inter-semibold text-ink">{event.name}</Text>
          {'   '}{entered.length ? `${entered.length} ${entered.length === 1 ? 'entry' : 'entries'} in ${enteredDivisions} ${enteredDivisions === 1 ? 'division' : 'divisions'}` : 'Nothing entered yet'}
        </Text>
      </View>
    </View>
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
        <View className="w-full self-center gap-4" style={{ maxWidth: 960 }}>
          {sideBySide ? <View className="flex-row gap-4 items-stretch">{banner}{response}</View> : <>{banner}{response}</>}

          <View className="rounded-2xl border border-line bg-card p-4 gap-2">
            <View className="flex-row items-center gap-2">
              <Text className="font-inter-bold text-[13px] text-ink-soft">Teams</Text>
              <Text className="font-inter text-[13px] text-ink-muted">{entered.length}</Text>
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
        </View>
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
