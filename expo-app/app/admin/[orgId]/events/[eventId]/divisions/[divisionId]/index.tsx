import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CandidateTeam,
  Event,
  EventCandidateTeams,
  Facility,
  GameSummary,
  OrgBadge,
  Site,
  SocketAction,
  Sport,
  TournamentDivision,
  TournamentEntrant,
  TournamentOrganizer,
  TournamentStage,
  divisionFullName,
  drawChanges,
  isPlayedFixture,
} from '@sk/shared';
import { ScreenHeader } from '../../../../../../../components/ScreenHeader';
import { AccessDenied } from '../../../../../../../components/AccessDenied';
import { OverflowMenu, OverflowMenuItem } from '../../../../../../../components/OverflowMenu';
import { ConfirmationModal } from '../../../../../../../components/ConfirmationModal';
import { EditLink } from '../../../../../../../components/ReadCard';
import { DivisionStateLine, TournamentCard, divisionStateOf } from '../../../../../../../components/tournament/TournamentBits';
import { DivisionDetailsDialog, FormatDialog, formatDetail, formatLabel, formatOfStages } from '../../../../../../../components/tournament/DivisionDialogs';
import { DivisionTeamsCard } from '../../../../../../../components/tournament/DivisionTeams';
import { DivisionFixturesCard } from '../../../../../../../components/tournament/DivisionFixtures';
import { DivisionStandings } from '../../../../../../../components/tournament/DivisionStandings';
import { useLiveRoom } from '../../../../../../../hooks/useLiveRoom';
import { useDivisionEntrants } from '../../../../../../../hooks/useDivisionEntrants';
import { useEventEntrants } from '../../../../../../../hooks/useEventEntrants';
import { useEventCapabilities } from '../../../../../../../hooks/useEventCapabilities';
import { useSafeBack } from '../../../../../../../hooks/useSafeBack';
import { wsService } from '../../../../../../../services/websocket';
import { sendAction } from '../../../../../../../services/actions';
import { useWsStore } from '../../../../../../../store/wsStore';

/**
 * A division of a tournament (`FIX-27`, agreed 2026-10-09 on `mockups/division-read-first.html`,
 * option A; docs/events.md §8): one page of cards, read first.
 *
 * - **The banner** says what the division is and where it has got to, in the same words as its
 *   tile on the tournament page (`divisionStateOf`), with Edit for its details.
 * - **One strip** under it says what the division needs next, for whoever runs it.
 * - **Cards**, two columns on a wide screen, ordered by the moment: Teams leads while setting up;
 *   once drawn the fixtures sit beside the teams; on the day the fixtures lead, then the table.
 *
 * It replaces the division's two screens — its basics form and its schedule (U53) — and the
 * Entrants screen for entering by division: a convenor runs the whole division from here.
 *
 * **Who may do what** follows the server (`tournamentGate.ts`): a division organiser has the
 * teams, how it is played, the draw, the fixtures and the courts; renaming, moving and deleting the
 * division are the tournament's organisers' and the sport's.
 */
export default function DivisionScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, eventId, divisionId } = useLocalSearchParams<{ orgId: string; eventId: string; divisionId: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const isConnected = useWsStore((state: any) => state.isConnected);
  const backToTournament = () => safeBack(`/admin/${orgId}/events/${eventId}`);

  /* -- data ------------------------------------------------------------------------------- */
  const { capabilities } = useEventCapabilities(eventId);

  const { items: divisionItems, accessDenied } = useLiveRoom<TournamentDivision>(divisionId ? `division:${divisionId}` : null, {
    reduce: message => {
      switch (message.type) {
        case 'DIVISION_ADDED':
        case 'DIVISION_UPDATED': return { kind: 'upsert', item: message.data };
        case 'DIVISION_DELETED': return { kind: 'remove', id: message.data?.id };
        default: return { kind: 'ignore' };
      }
    },
  });
  const division = divisionItems.find(d => d.id === divisionId);

  const { items: eventItems } = useLiveRoom<Event>(eventId ? `event:${eventId}` : null, {
    reduce: message =>
      message.type === 'EVENT_ADDED' || message.type === 'EVENT_UPDATED'
        ? { kind: 'upsert', item: message.data }
        : message.type === 'EVENT_DELETED'
          ? { kind: 'remove', id: message.data?.id }
          : { kind: 'ignore' },
  });
  const event = eventItems.find(e => e?.id === eventId);

  // The tournament's other divisions: names are unique within a sport, and the last division of a
  // sport takes the sport with it when it goes.
  const { items: eventDivisions } = useLiveRoom<TournamentDivision>(eventId ? `event:${eventId}:divisions` : null, {
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
  const siblings = eventDivisions.filter(d => d.id !== divisionId);

  const { items: stages } = useLiveRoom<TournamentStage>(divisionId ? `division:${divisionId}:stages` : null, {
    // Stages always arrive as a set, because their order is part of what changed.
    reduce: message => (message.type === 'STAGES_SYNC' ? { kind: 'replace', items: message.data?.stages || [] } : { kind: 'ignore' }),
  });

  const { items: games } = useLiveRoom<GameSummary>(divisionId ? `division:${divisionId}:fixtures` : null, {
    reduce: message => {
      switch (message.type) {
        case 'DIVISION_GAMES_SYNC': return { kind: 'replace', items: message.data || [] };
        // A draw arrives as one message (D13): the stage's whole set, so it replaces that stage's
        // fixtures — merging would keep the old draw's after a redo.
        case 'STAGE_FIXTURES_SYNC':
          return { kind: 'replaceWhere', items: message.data?.games || [], where: game => game.stageId === message.data?.stageId };
        case 'GAME_SUMMARY_UPDATED': return { kind: 'upsert', item: message.data };
        case 'GAME_SUMMARY_REMOVED': return { kind: 'remove', id: message.data?.id };
        default: return { kind: 'ignore' };
      }
    },
  });

  /* -- who may do what -------------------------------------------------------------------- */
  const runsThisSport = !!division?.sportId && !!capabilities?.convenesSportIds.includes(division.sportId);
  const canEditEvent = !!capabilities?.canEditEvent;
  const canEdit = canEditEvent || !!capabilities?.convenesDivisionIds.includes(divisionId) || runsThisSport;
  const canEditRecord = canEditEvent || runsThisSport;

  // The roster is the organisers' tier; the whole tournament's, the tournament organisers'.
  const { entrants } = useDivisionEntrants(divisionId, canEdit);
  const { entrants: eventEntrantsAll } = useEventEntrants(eventId, canEditEvent);
  const eventEntrants = canEditEvent ? eventEntrantsAll : null;

  const [sports, setSports] = useState<Sport[]>([]);
  useEffect(() => {
    if (!isConnected) return;
    let live = true;
    wsService.emit('get_data', { type: 'sports' }, (res: any) => { if (live && Array.isArray(res)) setSports(res); });
    return () => { live = false; };
  }, [isConnected]);

  // The organisations that may enter, and their teams: a one-shot read, as no room owns that set.
  // Addressed by division too, so a division organiser is answered.
  const [candidates, setCandidates] = useState<{ teams: CandidateTeam[]; orgs: OrgBadge[] }>({ teams: [], orgs: [] });
  useEffect(() => {
    if (!isConnected || !canEdit || !eventId) return;
    let live = true;
    wsService.emit('get_data', { type: 'event_candidate_teams', eventId, divisionId }, (res: EventCandidateTeams | null) => {
      if (live && res) setCandidates({ teams: res.teams || [], orgs: res.orgs || [] });
    });
    return () => { live = false; };
  }, [isConnected, canEdit, eventId, divisionId, entrants.length]);

  const [organizers, setOrganizers] = useState<TournamentOrganizer[]>([]);
  useEffect(() => {
    if (!isConnected || !divisionId || !canEdit) return;
    let live = true;
    wsService.emit('get_data', { type: 'division_organizers', divisionId }, (res: any) => { if (live && Array.isArray(res)) setOrganizers(res); });
    return () => { live = false; };
  }, [isConnected, divisionId, canEdit]);

  const { items: sites } = useLiveRoom<Site>(orgId ? `org:${orgId}:sites` : null, {
    reduce: message => {
      switch (message.type) {
        case 'SITES_SYNC': return { kind: 'replace', items: message.data || [] };
        case 'SITE_ADDED':
        case 'SITE_UPDATED': return { kind: 'upsert', item: message.data };
        case 'SITE_DELETED': return { kind: 'remove', id: message.data?.id };
        default: return { kind: 'ignore' };
      }
    },
  });
  const { items: facilities } = useLiveRoom<Facility>(orgId ? `org:${orgId}:facilities` : null, {
    reduce: message => {
      switch (message.type) {
        case 'FACILITIES_SYNC': return { kind: 'replace', items: message.data || [] };
        case 'FACILITY_ADDED':
        case 'FACILITY_UPDATED': return { kind: 'upsert', item: message.data };
        case 'FACILITY_DELETED': return { kind: 'remove', id: message.data?.id };
        default: return { kind: 'ignore' };
      }
    },
  });

  /* -- where it has got to ------------------------------------------------------------------ */
  const ordered = useMemo(() => [...stages].sort((a, b) => (a.sequence || 0) - (b.sequence || 0)), [stages]);
  const format = formatOfStages(ordered);
  const active = entrants.filter(e => e.status !== 'withdrawn');
  const started = games.some(isPlayedFixture);
  const drawn = games.length > 0;
  const changes = canEdit ? drawChanges(ordered, games, entrants) : null;
  const state = divisionStateOf({ setupMode: canEdit, games, entrants, firstStageId: ordered[0]?.id });
  const invitationOf = (id?: string) => (!id || id === event?.orgId ? null : event?.participatingOrgs?.find(o => o.id === id)?.invitation || null);
  // Teams whose organisation has not accepted — until teams answer for themselves (`FIX-31`).
  const pendingTeams = active.filter(e => {
    const inv = invitationOf(e.orgId);
    return inv === 'not_invited' || inv === 'invited' || inv === 'withdrawal_pending';
  });

  const [dialog, setDialog] = useState<null | 'details' | 'format' | 'delete'>(null);
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState<TournamentEntrant | null>(null);
  const [drawDialog, setDrawDialog] = useState<null | 'make' | 'redo'>(null);
  const [deleting, setDeleting] = useState(false);

  if (accessDenied) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <AccessDenied message="You do not have permission to view this part of the tournament." actionLabel="Back to the tournament" onAction={backToTournament} />
      </SafeAreaView>
    );
  }
  if (!division || !event) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Division" context={event?.name} onBack={backToTournament} />
        <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>
      </SafeAreaView>
    );
  }

  const sport = sports.find(s => s.id === division.sportId);
  const lastOfSport = !!division.sportId && !siblings.some(d => d.sportId === division.sportId);
  // Deleting the last division of a sport takes the sport out of the tournament, which is the
  // tournament's decision; once a game has started, nobody deletes it.
  const canDelete = canEditRecord && (canEditEvent || !lastOfSport);
  const addFixture = () => router.push(`/admin/${orgId}/events/${eventId}/games/new`);

  const handleDelete = async () => {
    setDeleting(true);
    const result = await sendAction(SocketAction.DELETE_DIVISION, { id: division.id, orgId });
    setDeleting(false);
    if (!result.ok) return;
    setDialog(null);
    router.replace(`/admin/${orgId}/events/${eventId}`);
  };

  /* -- the page's ⋯ ------------------------------------------------------------------------- */
  const menu: OverflowMenuItem[] = [];
  if (canEdit) {
    menu.push({ label: 'Edit details', icon: 'pencil-outline', onPress: () => setDialog('details') });
    menu.push({ label: "How it's played", icon: 'git-network-outline', onPress: () => setDialog('format') });
  }
  if (canDelete) {
    menu.push(started
      ? { label: 'Delete division', description: 'Games have started — it can no longer be deleted', icon: 'trash-outline', onPress: () => {}, destructive: true, disabled: true }
      : { label: 'Delete division', description: lastOfSport ? `Removes ${sport?.name || 'the sport'} too — its last division` : undefined, icon: 'trash-outline', onPress: () => setDialog('delete'), destructive: true });
  }

  /* -- the banner and what's next ----------------------------------------------------------- */
  const banner = (
    <View className="rounded-2xl border border-line bg-card p-4 flex-row items-start gap-3">
      <View className="flex-1 min-w-0 gap-1">
        <Text className="font-inter-semibold text-xs text-ink-muted" numberOfLines={1}>{event.name}{sport ? ` · ${sport.name}` : ''}</Text>
        <Text className="font-inter-bold text-ink" style={{ fontSize: isWide ? 24 : 20 }}>{division.name}</Text>
        <Text className="font-inter text-sm text-ink-soft">
          {[division.ageGroup ? `Age group ${division.ageGroup}` : 'Any age', formatLabel(format, ordered), `${active.length} ${active.length === 1 ? 'team' : 'teams'}`].join('  ·  ')}
        </Text>
        <View className="mt-1"><DivisionStateLine state={state} large /></View>
      </View>
      {canEdit ? <EditLink label={isWide ? 'Edit' : ''} onPress={() => setDialog('details')} /> : null}
    </View>
  );

  const nextStrip = (() => {
    if (!canEdit) return null;
    const byHand = format?.format === 'Festival';
    if (active.length < 2) {
      return <NextStrip tone="wait" text="Needs at least two teams." detail="Add them here, or from each organisation's page." action={{ label: '＋ Add teams', onPress: () => setAdding(true) }} />;
    }
    if (!drawn && !byHand) {
      const warning = pendingTeams.length
        ? `${pendingTeams.length} ${pendingTeams.length === 1 ? "team's organisation has" : "teams' organisations have"} not accepted yet.`
        : undefined;
      return <NextStrip tone="go" text="Ready for the draw." warning={warning} isWide={isWide} action={{ label: 'Make the draw', onPress: () => setDrawDialog('make') }} />;
    }
    if (changes && changes.count > 0 && !started) {
      const parts = [
        ...changes.leftDraw.map(c => `${c.entrant.name || c.entrant.label} withdrew with ${c.unplayed} ${c.unplayed === 1 ? 'fixture' : 'fixtures'} still to play`),
        ...changes.notInDraw.map(e => `${e.name || e.label} has no fixtures`),
      ];
      return <NextStrip tone="wait" text={`${changes.count} ${changes.count === 1 ? 'change' : 'changes'} since the draw:`} detail={parts.join(' · ')} action={{ label: 'Redo the draw', onPress: () => setDrawDialog('redo'), ghost: true }} />;
    }
    if (changes && changes.leftDraw.length && started) {
      const first = changes.leftDraw[0];
      return (
        <NextStrip
          tone="wait"
          text={`${first.entrant.name || first.entrant.label} withdrew with ${first.unplayed} ${first.unplayed === 1 ? 'fixture' : 'fixtures'} still to play.`}
          detail="Games have started, so the draw is not redone — change those fixtures by hand, or replace the team."
          action={{ label: 'Replace', onPress: () => setReplacing(first.entrant), ghost: true }}
        />
      );
    }
    return null;
  })();

  /* -- the cards ---------------------------------------------------------------------------- */
  const teamsCard = (
    <DivisionTeamsCard
      key="teams"
      division={division}
      event={event}
      orgId={orgId}
      entrants={canEdit ? entrants : []}
      games={games}
      orgs={candidates.orgs}
      teams={candidates.teams}
      eventEntrants={eventEntrants}
      canEdit={canEdit}
      drawn={drawn}
      started={started}
      adding={adding}
      onAdding={setAdding}
      replacing={replacing}
      onReplacing={setReplacing}
    />
  );
  const fixturesCard = (
    <DivisionFixturesCard
      key="fixtures"
      orgId={orgId}
      eventId={eventId}
      divisionId={divisionId}
      stages={ordered}
      games={games}
      entrants={entrants}
      format={format}
      facilities={facilities}
      canEdit={canEdit}
      started={started}
      pendingTeams={pendingTeams}
      isWide={isWide}
      ownOrgId={event.orgId}
      dialog={drawDialog}
      onDialog={setDrawDialog}
    />
  );
  const formatCard = (
    <TournamentCard
      key="format"
      title="How it's played"
      right={canEdit ? (started
        ? <TouchableOpacity onPress={() => setDialog('format')} accessibilityRole="button"><Text className="font-inter-semibold text-sm text-ink-muted">Fixed</Text></TouchableOpacity>
        : <EditLink onPress={() => setDialog('format')} />) : undefined}
    >
      <View className="gap-0.5">
        <Text className="font-inter-bold text-sm text-ink">{formatLabel(format, ordered)}</Text>
        <Text className="font-inter text-xs text-ink-muted">{formatDetail(format, active.length)}</Text>
      </View>
    </TournamentCard>
  );
  const courtNames = (division.facilityIds || []).map(id => facilities.find(f => f.id === id)?.name).filter(Boolean);
  const detailsCard = canEdit ? (
    <TournamentCard key="details" title="Organisers & courts" right={<EditLink onPress={() => setDialog('details')} />}>
      <View className="gap-2">
        <View>
          <Text className="font-inter text-xs text-ink-muted">Division organisers</Text>
          <Text className="font-inter text-sm text-ink">{organizers.length ? organizers.map(o => o.name).join(' · ') : 'None — the tournament\'s organisers run it'}</Text>
        </View>
        <View>
          <Text className="font-inter text-xs text-ink-muted">{sport?.facilityTerm ? `${sport.facilityTerm}s` : 'Facilities'}</Text>
          <Text className="font-inter text-sm text-ink">{courtNames.length ? courtNames.join(', ') : "Any of the tournament's"}</Text>
        </View>
      </View>
    </TournamentCard>
  ) : null;
  const standingsCard = drawn ? (
    <TournamentCard key="standings" title="Standings">
      <DivisionStandings divisionId={divisionId} canEdit={canEdit} />
    </TournamentCard>
  ) : null;

  // The order follows the moment (option A): teams while setting up, fixtures on the day.
  const columns: [React.ReactNode[], React.ReactNode[]] = started
    ? [[fixturesCard], [standingsCard, canEdit ? teamsCard : null, formatCard, detailsCard]]
    : drawn
      ? [[canEdit ? teamsCard : null, formatCard, detailsCard], [fixturesCard, standingsCard]]
      : [[canEdit ? teamsCard : null], [formatCard, fixturesCard, detailsCard]];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader
        title={divisionFullName(division.name, sport?.name)}
        context={event.name}
        onBack={backToTournament}
        right={menu.length ? <OverflowMenu items={menu} title={divisionFullName(division.name, sport?.name)} accessibilityLabel="Division actions" /> : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 80 }}>
        <View className="w-full self-center gap-3.5" style={{ maxWidth: 1060 }}>
          {banner}
          {nextStrip}
          {isWide ? (
            <View className="flex-row gap-4 items-start">
              <View className="gap-3.5 min-w-0" style={{ flex: 1.1 }}>{columns[0]}</View>
              <View className="gap-3.5 min-w-0" style={{ flex: 1 }}>{columns[1]}</View>
            </View>
          ) : (
            <View className="gap-2.5">{[...columns[0], ...columns[1]]}</View>
          )}
        </View>
      </ScrollView>

      <DivisionDetailsDialog
        visible={dialog === 'details'}
        onClose={() => setDialog(null)}
        orgId={orgId}
        eventId={eventId}
        event={event}
        division={division}
        sports={sports}
        siblings={siblings}
        entrants={entrants}
        fixtureCount={games.length}
        canEditRecord={canEditRecord}
        canEdit={canEdit}
        canChangeSport={canEditEvent}
        organizers={organizers}
        onOrganizersChange={setOrganizers}
        sites={sites}
        facilities={facilities}
      />
      <FormatDialog
        visible={dialog === 'format'}
        onClose={() => setDialog(null)}
        divisionId={divisionId}
        orgId={orgId}
        stages={ordered}
        fixtureCount={games.length}
        started={started}
        onAddFixture={() => { setDialog(null); addFixture(); }}
      />
      <ConfirmationModal
        isOpen={dialog === 'delete'}
        title={`Delete ${divisionFullName(division.name, sport?.name)}?`}
        description={
          `Its ${active.length} ${active.length === 1 ? 'team is' : 'teams are'} taken out, and its ${games.length} ${games.length === 1 ? 'fixture is' : 'fixtures are'} deleted.` +
          (lastOfSport ? ` It is the last ${sport?.name || ''} division, so ${sport?.name || 'the sport'} is removed from the tournament too.` : '')
        }
        confirmText={lastOfSport ? `Delete and remove ${sport?.name || 'the sport'}` : 'Delete division'}
        cancelText="Cancel"
        variant="danger"
        isProcessing={deleting}
        onConfirm={handleDelete}
        onClose={() => setDialog(null)}
      />
    </SafeAreaView>
  );
}

/**
 * What the division needs next, in one strip under the banner. A warning inside an otherwise good
 * strip keeps the warning colour, and starts its own line on a phone.
 */
function NextStrip({ tone, text, detail, warning, action, isWide }: {
  tone: 'wait' | 'go';
  text: string;
  detail?: string;
  warning?: string;
  action?: { label: string; onPress: () => void; ghost?: boolean };
  isWide?: boolean;
}) {
  const box = tone === 'go' ? 'bg-success-soft border-success-line' : 'bg-warning-soft border-warning-line';
  const ink = tone === 'go' ? 'text-success-ink' : 'text-warning-ink';
  return (
    <View className={`rounded-xl border px-3.5 py-2.5 flex-row flex-wrap items-center gap-x-3 gap-y-2 ${box}`}>
      <Text className={`flex-1 font-inter text-sm ${ink}`} style={{ minWidth: 200 }}>
        <Text className="font-inter-bold">{text}</Text>
        {detail ? ` ${detail}` : ''}
        {warning ? (
          <Text className="font-inter-semibold text-warning-ink">{isWide ? '  ' : '\n'}⚠ {warning}</Text>
        ) : null}
      </Text>
      {action ? (
        <TouchableOpacity
          onPress={action.onPress}
          accessibilityRole="button"
          className={`rounded-xl px-3.5 py-1.5 ${action.ghost ? 'border border-line bg-card' : 'bg-primary'}`}
        >
          <Text className={`font-inter-bold text-[13px] ${action.ghost ? 'text-ink-soft' : 'text-on-primary'}`}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
