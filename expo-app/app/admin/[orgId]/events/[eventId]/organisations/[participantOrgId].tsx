import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CandidateTeam,
  Event,
  EventOrgBadge,
  EventOrgHistory,
  SocketAction,
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
import { useLiveRoom } from '../../../../../../hooks/useLiveRoom';
import { useEventEntrants } from '../../../../../../hooks/useEventEntrants';
import { useEventCapabilities } from '../../../../../../hooks/useEventCapabilities';
import { useOrgSummary } from '../../../../../../hooks/useOrgSummary';
import { useSafeBack } from '../../../../../../hooks/useSafeBack';
import { useUnsavedChanges } from '../../../../../../hooks/useUnsavedChanges';
import { useUnsavedChangesStore } from '../../../../../../store/unsavedChangesStore';
import { useAuthStore } from '../../../../../../store/authStore';
import { useWsStore } from '../../../../../../store/wsStore';
import { sendAction } from '../../../../../../services/actions';
import { wsService } from '../../../../../../services/websocket';
import { formatInstantDate } from '../../../../../../utils/dates';

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
 * For the tournament's organisers. The organisation's own view — answering, withdrawing — is `FIX-30`.
 */

type Answer = 'invited' | 'accepted' | 'declined';

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
  const { entrants } = useEventEntrants(eventId, canEdit);

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
    if (!isConnected || !canEdit || !eventId || !participantOrgId) return;
    let live = true;
    wsService.emit('get_data', { type: 'event_org_history', eventId, participantOrgId }, (res: any) => { if (live) setHistory(res || null); });
    return () => { live = false; };
  }, [isConnected, canEdit, eventId, participantOrgId, org?.invitation, org?.answeredAt, org?.invitedAt]);

  /* -- teams ------------------------------------------------------------------------------- */
  const teams = useOrgTeamPicks({ org, orgId, divisions, sportIds: event?.sportIds || [], entrants, candidateTeams });
  const [onlyEntered, setOnlyEntered] = useState(false);
  const { confirmThenNavigate } = useUnsavedChanges(teams.isDirty && !teams.saving, teams.reset);
  const save = async () => {
    if (await teams.save()) useUnsavedChangesStore.getState().clear();
  };

  /* -- the response ------------------------------------------------------------------------ */
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | 'remove' | 'nominate'>(null);
  const answer = async (value: Answer) => {
    if (!org) return;
    setBusy(true);
    const result = await sendAction(SocketAction.SET_EVENT_ORG_ANSWER, { eventId, orgId, participantOrgId: org.id, answer: value });
    setBusy(false);
    if (result.ok) setChanging(false);
  };
  const invite = async () => {
    if (!org) return;
    setBusy(true);
    await sendAction(SocketAction.INVITE_EVENT_ORGS, { eventId, orgId, participantOrgIds: [org.id] });
    setBusy(false);
  };

  if (!loadingCapabilities && !canEdit) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <AccessDenied message="This page is for the tournament's organisers." actionLabel="Back to the tournament" onAction={backToTournament} />
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

  /** "Accepted by Pieter Joubert (Laerskool Waterkloof) · Tue 7 Oct", or "… by you". */
  const by = (who: EventOrgHistory['answeredBy']) =>
    !who ? '' : who.userId === myUserId ? ' by you' : ` by ${who.name}${who.orgName ? ` (${who.orgName})` : ''}`;
  const answeredLine = () => {
    const label = org.invitation === 'accepted' ? 'Accepted' : 'Declined';
    // An organiser recording an answer heard another way: "Set to Accepted by …".
    const setByOrganiser = history?.answeredBy && history.answeredBy.orgName !== org.name;
    const when = formatInstantDate(org.answeredAt);
    return `${setByOrganiser ? `Set to ${label}` : label}${by(history?.answeredBy || null)}${when ? ` · ${when}` : ''}`;
  };
  const invitedLine = () => {
    const when = formatInstantDate(org.invitedAt);
    return `Invited${when ? ` ${when}` : ''}${by(history?.invitedBy || null)}`;
  };

  const link = (label: string, onPress: () => void, danger?: boolean) => (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" disabled={busy}>
      <Text className={`font-inter-bold text-[13px] ${danger ? 'text-danger-ink' : 'text-primary-ink'}`}>{label}</Text>
    </TouchableOpacity>
  );
  const button = (label: string, onPress: () => void, primary?: boolean) => (
    <TouchableOpacity onPress={onPress} disabled={busy} accessibilityRole="button" className={`rounded-xl px-3 py-1.5 border ${primary ? 'bg-primary border-primary' : 'border-line'}`}>
      <Text className={`font-inter-bold text-[13px] ${primary ? 'text-on-primary' : 'text-ink'}`}>{label}</Text>
    </TouchableOpacity>
  );
  const remove = link('Remove from the tournament', () => setDialog('remove'), true);

  const awaiting = org.invitation === 'invited' || (changing && (org.invitation === 'accepted' || org.invitation === 'declined'));
  const response = (
    <View className="rounded-2xl border border-line bg-card p-4 gap-2" style={isWide ? { width: 300 } : undefined}>
      <Text className="font-inter-bold text-[13px] text-ink-soft">Response</Text>
      {isHost ? (
        <>
          <Text className="font-inter text-xs text-ink-muted">The host takes part by hosting, so it has no invitation.</Text>
          <View className="flex-row flex-wrap gap-3.5 mt-0.5">{remove}</View>
        </>
      ) : org.invitation === 'not_invited' ? (
        <>
          <Text className="font-inter text-xs text-ink-muted">Not invited yet: it can't see the tournament.</Text>
          <View className="flex-row flex-wrap items-center gap-3.5 mt-0.5">{button('Invite', invite, true)}{remove}</View>
        </>
      ) : awaiting ? (
        <>
          <View className="flex-row flex-wrap gap-2">
            {button('✓ Accepted', () => answer('accepted'))}
            {button('✕ Declined', () => answer('declined'))}
          </View>
          <Text className="font-inter text-xs text-ink-muted">
            {changing ? 'Change their response, or ' : `${invitedLine()} · they can respond, or you can set their response.`}
            {changing ? <Text onPress={() => setChanging(false)} className="font-inter-bold text-primary-ink">keep it as it is</Text> : null}
          </Text>
          {!changing ? <View className="flex-row flex-wrap gap-3.5 mt-0.5">{remove}</View> : null}
        </>
      ) : (
        <>
          <Text className="font-inter text-xs text-ink-muted">{answeredLine()}</Text>
          <View className="flex-row flex-wrap gap-3.5 mt-0.5">
            {link('Change response', () => setChanging(true))}
            {remove}
          </View>
        </>
      )}
    </View>
  );

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

  const menuItems = org.isClaimed === false
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
          {isWide ? <View className="flex-row gap-4 items-stretch">{banner}{response}</View> : <>{banner}{response}</>}

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
            <OrgTeamsByDivision
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
            />
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
        visible={teams.isDirty}
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
