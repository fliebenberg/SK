import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CandidateTeam,
  EventCandidateTeams,
  GameSummary,
  OrgBadge,
  SocketAction,
  TournamentDivision,
  TournamentEntrant,
  TournamentOrganizer,
  TournamentStage,
  divisionFullName,
  drawChanges,
  entryLockGaps,
  isPlayedFixture,
  isEntrantEntered,
  fixtureMinutes,
  minuteOfDay,
  timeOfDay,
  dualUnpaired,
  isDualEvent,
} from '@sk/shared';
import { lockGapsLine } from '../../../../../../../components/tournament/DivisionEntries';
import { ScreenHeader } from '../../../../../../../components/ScreenHeader';
import { AccessDenied } from '../../../../../../../components/AccessDenied';
import { OverflowMenu, OverflowMenuItem } from '../../../../../../../components/OverflowMenu';
import { ConfirmationModal } from '../../../../../../../components/ConfirmationModal';
import { EditLink } from '../../../../../../../components/ReadCard';
import { DivisionStateLine, TournamentCard, divisionStateOf } from '../../../../../../../components/tournament/TournamentBits';
import { DivisionDetailsDialog, DivisionOrganisersDialog, FormatDialog, formatDetail, formatLabel, formatOfStages } from '../../../../../../../components/tournament/DivisionDialogs';
import { DivisionWhenDialog, DivisionWhereDialog, GapsDialog, divisionDayLines, gapsLine } from '../../../../../../../components/tournament/ScheduleSetup';
import { ScheduleDivisionDialog, scheduleReadiness } from '../../../../../../../components/tournament/ScheduleActions';
import { afterDayEndByDivision, isUnscheduled, scheduleModel } from '../../../../../../../components/tournament/scheduleModel';
import { formatPlayingDay, instantToVenueInputs, venueTimeZone } from '../../../../../../../utils/dates';
import { DivisionTeamsCard } from '../../../../../../../components/tournament/DivisionTeams';
import { DivisionFixturesCard } from '../../../../../../../components/tournament/DivisionFixtures';
import { DivisionStandings } from '../../../../../../../components/tournament/DivisionStandings';
import { DualPairingCard } from '../../../../../../../components/tournament/DualPairing';
import { useLiveRoom } from '../../../../../../../hooks/useLiveRoom';
import { useEventDivisions, useEventRecord, useSports } from '../../../../../../../hooks/useEventRooms';
import { useOrgSites } from '../../../../../../../hooks/useOrgSites';
import { useDivisionEntrants } from '../../../../../../../hooks/useDivisionEntrants';
import { useEventEntrants } from '../../../../../../../hooks/useEventEntrants';
import { useEventCapabilities } from '../../../../../../../hooks/useEventCapabilities';
import { useSafeBack } from '../../../../../../../hooks/useSafeBack';
import { wsService } from '../../../../../../../services/websocket';
import { sendAction } from '../../../../../../../services/actions';
import { useWsStore } from '../../../../../../../store/wsStore';
import { PageBody } from '../../../../../../../components/PageBody';

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

  const event = useEventRecord(eventId).event || undefined;

  // The tournament's other divisions: names are unique within a sport, and the last division of a
  // sport takes the sport with it when it goes.
  const eventDivisions = useEventDivisions(eventId);
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

  const sports = useSports();

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

  const { sites, facilities } = useOrgSites(orgId);

  /* -- where it has got to ------------------------------------------------------------------ */
  const ordered = useMemo(() => [...stages].sort((a, b) => (a.sequence || 0) - (b.sequence || 0)), [stages]);
  const format = formatOfStages(ordered);
  const active = entrants.filter(e => isEntrantEntered(e.status));
  const started = games.some(isPlayedFixture);
  const drawn = games.length > 0;
  const changes = canEdit ? drawChanges(ordered, games, entrants) : null;
  // Phase 7: the division's fixtures against its own days, for the after-the-day's-end warning.
  const venueZone = venueTimeZone(sites.find(s => s.id === event?.siteId) as any);
  const lateCount = event && division
    ? afterDayEndByDivision(scheduleModel({ event, divisions: [division], games, sports, timeZone: venueZone }), games).get(division.id) || 0
    : 0;
  const unscheduledCount = games.filter(isUnscheduled).length;
  const state = divisionStateOf({ setupMode: canEdit, games, entrants, firstStageId: ordered[0]?.id, afterDayEnd: lateCount, dual: isDualEvent(event), division });
  // What stands between the division and its lock (`FIX-31`); the draw is made from locked entries.
  const gaps = entryLockGaps(entrants, event || {});
  const locked = !!division?.entriesLockedAt;
  const [locking, setLocking] = useState(false);
  const lockEntries = async () => {
    setLocking(true);
    await sendAction(SocketAction.SET_DIVISION_LOCK, { divisionId, orgId, locked: true });
    setLocking(false);
  };

  const [dialog, setDialog] = useState<null | 'details' | 'format' | 'delete' | 'where' | 'when' | 'gaps' | 'organisers' | 'schedule' | 'reschedule'>(null);
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
  /*
   * A Head to Head's division (`H2H-1`): paired rather than drawn, so no format, no lock and no
   * table — its games card is the two-column pairing, and its strip says what pairing still needs.
   */
  const dual = isDualEvent(event);
  const unpaired = dual ? dualUnpaired(entrants, games) : [];
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
    if (!dual) menu.push({ label: "How it's played", icon: 'git-network-outline', onPress: () => setDialog('format') });
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
          {[division.ageGroup ? `Age group ${division.ageGroup}` : 'Any age', dual ? `${games.length} ${games.length === 1 ? 'game' : 'games'}` : formatLabel(format, ordered), `${active.length} ${active.length === 1 ? 'team' : 'teams'}`].join('  ·  ')}
        </Text>
        <View className="mt-1 flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <DivisionStateLine state={state} large />
          {canEdit && active.length && !dual ? (
            <View className={`rounded-full px-2 py-0.5 ${locked ? 'bg-sunken border border-line' : 'bg-sunken'}`}>
              <Text className={`font-inter-semibold text-[11px] ${locked ? 'text-ink-soft' : 'text-ink-muted'}`}>{locked ? '🔒 Entries locked' : 'Entries open'}</Text>
            </View>
          ) : null}
        </View>
      </View>
      {canEdit ? <EditLink label={isWide ? 'Edit' : ''} onPress={() => setDialog('details')} /> : null}
    </View>
  );

  const nextStrip = (() => {
    if (!canEdit) return null;
    if (dual) {
      if (!drawn) return null; // The games card says how to pair, with the button.
      if (unpaired.length) {
        const names = unpaired.map(e => e.name || e.label || 'A team');
        return <NextStrip tone="wait" text={`${names.length === 1 ? `${names[0]} has` : `${names.length} teams have`} no game.`} detail="Give each one an opponent, or leave it out." />;
      }
      if (!started && unscheduledCount) {
        return <NextStrip tone="go" text={unscheduledCount === games.filter(g => g.status !== 'Cancelled').length ? 'Paired — ready to schedule.' : `${unscheduledCount} ${unscheduledCount === 1 ? 'game has' : 'games have'} no time yet.`} action={{ label: 'Schedule', onPress: () => setDialog('schedule') }} />;
      }
      return null;
    }
    const byHand = format?.format === 'Festival';
    if (active.length < 2) {
      return <NextStrip tone="wait" text="Needs at least two teams." detail="Add them here, or from each organisation's page." action={{ label: '＋ Add teams', onPress: () => setAdding(true) }} />;
    }
    if (!drawn && !byHand) {
      // The draw needs the lock, and the lock needs every answer (`FIX-31`).
      if (!locked && gaps.total) {
        return <NextStrip tone="wait" text={`${lockGapsLine(gaps)}.`} detail="Entries can be locked, and the draw made, once each is answered." />;
      }
      if (!locked) {
        return <NextStrip tone="go" text="Everyone has answered." detail="Lock the entries to make the draw." action={{ label: locking ? 'Locking…' : '🔒 Lock entries', onPress: lockEntries }} />;
      }
      const late = entrants.filter(e => e.status === 'requested');
      const orgName = (id?: string) => event.participatingOrgs?.find(o => o.id === id)?.name;
      const warning = late.length
        ? late.length === 1
          ? `${[orgName(late[0].orgId), late[0].name || 'A team'].filter(Boolean).join(' ')} asks to enter late.`
          : `${late.length} teams ask to enter late.`
        : undefined;
      return <NextStrip tone="go" text="Entries are locked — ready for the draw." warning={warning} isWide={isWide} action={{ label: 'Make the draw', onPress: () => setDrawDialog('make') }} />;
    }
    if (!drawn && byHand && !locked && gaps.total) {
      return <NextStrip tone="wait" text={`${lockGapsLine(gaps)}.`} />;
    }
    if (changes && changes.count > 0 && !started) {
      const parts = [
        ...changes.leftDraw.map(c => `${c.entrant.name || c.entrant.label} withdrew with ${c.unplayed} ${c.unplayed === 1 ? 'fixture' : 'fixtures'} still to play`),
        ...changes.notInDraw.map(e => `${e.name || e.label} has no fixtures`),
      ];
      return <NextStrip tone="wait" text={`${changes.count} ${changes.count === 1 ? 'change' : 'changes'} since the draw:`} detail={parts.join(' · ')} action={{ label: 'Redo the draw', onPress: () => setDrawDialog('redo'), ghost: true }} />;
    }
    // Phase 7: drawn, then scheduled. Only fixtures with no time are placed; the rest stay.
    if (drawn && !started && unscheduledCount) {
      return unscheduledCount === games.filter(g => g.status !== 'Cancelled').length
        ? <NextStrip tone="go" text="The draw is made — ready to schedule." action={{ label: 'Schedule', onPress: () => setDialog('schedule') }} />
        : <NextStrip tone="wait" text={`${unscheduledCount} ${unscheduledCount === 1 ? 'fixture has' : 'fixtures have'} no time yet.`} detail="Scheduling places them around the ones already placed." action={{ label: 'Schedule', onPress: () => setDialog('schedule') }} />;
    }
    if (drawn && lateCount) {
      return (
        <NextStrip
          tone="wait"
          text={`${lateCount} ${lateCount === 1 ? 'fixture runs' : 'fixtures run'} past the division's day end on its last day.`}
          detail="Give it more time or another facility and schedule again, or move them by hand."
          action={{ label: 'When', onPress: () => setDialog('when'), ghost: true }}
        />
      );
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
  const ownGaps = division.gapBetweenGamesMin != null || division.minTeamBreakMin != null;
  const schedulingFooter = (
    // Scheduling sits with the settings it uses: a primary Schedule once drawn, a quiet Schedule
    // again once anything has a time, and before the draw just why there is nothing to schedule.
    <View className="gap-2.5 border-t border-line-soft pt-2.5 mt-1">
    <View className="flex-row items-center gap-3">
      <View className="flex-1 min-w-0">
        <Text className="font-inter text-xs text-ink-muted">Scheduling{ownGaps ? '' : " · the tournament's"}</Text>
        <Text className="font-inter text-sm text-ink">{gapsLine(division.gapBetweenGamesMin ?? event.gapBetweenGamesMin ?? 5, division.minTeamBreakMin ?? event.minTeamBreakMin ?? 0)}</Text>
      </View>
      {canEdit ? <EditLink onPress={() => setDialog('gaps')} /> : null}
    </View>
    {canEdit && !started ? (
      !drawn ? (
        <Text className="font-inter text-xs text-ink-muted">
          {dual ? 'Games can be scheduled once they are paired.' : format?.format === 'Festival' ? 'Fixtures can be scheduled once they are added.' : 'Fixtures can be scheduled once the draw is made.'}
        </Text>
      ) : unscheduledCount === games.filter(g => g.status !== 'Cancelled').length ? (
        <TouchableOpacity onPress={() => setDialog('schedule')} accessibilityRole="button" className="self-start rounded-xl bg-primary px-4 py-2">
          <Text className="font-inter-bold text-sm text-on-primary">Schedule</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={() => setDialog('reschedule')} accessibilityRole="button" className="self-start">
          <Text className="font-inter-semibold text-[13px] text-ink-muted">Schedule again</Text>
        </TouchableOpacity>
      )
    ) : null}
    </View>
  );
  const fixturesCard = dual ? (
    <DualPairingCard key="fixtures" event={event} division={division} orgId={orgId} entrants={entrants} games={games} canEdit={canEdit} footer={schedulingFooter} />
  ) : (
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
      entriesLocked={locked}
      lockGaps={gaps}
      isWide={isWide}
      ownOrgId={event.orgId}
      dialog={drawDialog}
      onDialog={setDrawDialog}
      scheduleOffer={scheduleReadiness({ event, division, sport })}
      footer={schedulingFooter}
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
  /*
   * Where, When and Organisers (Phase 7, agreed 2026-10-11): the division's sections match the
   * tournament page's, so its old *Organisers & courts* is split. No title names a facility type,
   * since that word is the sport's: the line says *Courts* for netball, *Fields* for rugby.
   */
  const courtNames = (division.facilityIds || []).map(id => facilities.find(f => f.id === id)?.name).filter(Boolean);
  const facilityTerm = sport?.facilityTerm?.trim() ? `${sport.facilityTerm.trim()}s` : 'Facilities';
  const whereCard = (
    <TournamentCard key="where" title="Where" right={canEdit ? <EditLink onPress={() => setDialog('where')} /> : undefined}>
      <View>
        <Text className="font-inter text-xs text-ink-muted">{facilityTerm}</Text>
        <Text className="font-inter text-sm text-ink">{courtNames.length ? courtNames.join(', ') : "Any of the tournament's"}</Text>
      </View>
    </TournamentCard>
  );
  // A calculated end shows the time the schedule worked out, once there is one.
  const timeZone = venueTimeZone(sites.find(s => s.id === event.siteId) as any);
  const minutes = fixtureMinutes(sport?.defaultSettings);
  const calculatedEnd = (day: string) => {
    if (minutes == null) return null;
    const ends = games
      .map(g => (g.startTime && !g.timeTbd ? instantToVenueInputs(g.startTime, timeZone) : null))
      .filter((v): v is { date: string; time: string } => !!v && v.date === day)
      .map(v => (minuteOfDay(v.time) ?? 0) + minutes);
    return ends.length ? timeOfDay(Math.max(...ends)) : null;
  };
  const whenCard = (event.days || []).length ? (
    <TournamentCard key="when" title="When" right={canEdit ? <EditLink onPress={() => setDialog('when')} /> : undefined}>
      <View>
        {divisionDayLines(event, division).map((line, i) => {
          const calc = !line.muted && line.text.endsWith('end calculated') ? calculatedEnd(line.day) : null;
          return (
            <View key={line.day} className={`flex-row items-center justify-between gap-3 py-1 ${i ? 'border-t border-line-soft' : ''}`}>
              <Text className="font-inter text-sm text-ink">{formatPlayingDay(line.day)}</Text>
              <Text className={`font-inter text-sm ${line.muted ? 'text-ink-muted' : 'text-ink'}`}>
                {calc ? `${line.text.replace(' · end calculated', '').replace('From ', '')} – ${calc}` : line.text}
                {calc ? <Text className="font-inter text-xs text-ink-muted">  · calculated</Text> : null}
              </Text>
            </View>
          );
        })}
      </View>
    </TournamentCard>
  ) : null;
  const organisersCard = canEdit ? (
    <TournamentCard key="organisers" title="Organisers" right={<EditLink onPress={() => setDialog('organisers')} />}>
      <Text className="font-inter text-sm text-ink">{organizers.length ? organizers.map(o => o.name).join(' · ') : 'None — the tournament\'s organisers run it'}</Text>
    </TournamentCard>
  ) : null;
  const detailsCard = <React.Fragment key="details">{whereCard}{whenCard}{organisersCard}</React.Fragment>;
  const standingsCard = drawn && !dual ? (
    <TournamentCard key="standings" title="Standings">
      <DivisionStandings divisionId={divisionId} canEdit={canEdit} />
    </TournamentCard>
  ) : null;

  // The order follows the moment (option A): teams while setting up, fixtures on the day.
  const format_ = dual ? null : formatCard;
  const columns: [React.ReactNode[], React.ReactNode[]] = dual
    // A Head to Head's games are its teams' pairing, so they lead from the start.
    ? [[fixturesCard], [canEdit ? teamsCard : null, detailsCard]]
    : started
    ? [[fixturesCard], [standingsCard, canEdit ? teamsCard : null, format_, detailsCard]]
    : drawn
      ? [[canEdit ? teamsCard : null, format_, detailsCard], [fixturesCard, standingsCard]]
      : [[canEdit ? teamsCard : null], [format_, fixturesCard, detailsCard]];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader
        title={divisionFullName(division.name, sport?.name)}
        context={event.name}
        onBack={backToTournament}
        right={menu.length ? <OverflowMenu items={menu} title={divisionFullName(division.name, sport?.name)} accessibilityLabel="Division actions" /> : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 80 }}>
        <PageBody className="gap-3.5">
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
        </PageBody>
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
      <DivisionWhereDialog visible={dialog === 'where'} onClose={() => setDialog(null)} event={event} division={division} orgId={orgId} sites={sites} facilities={facilities} facilityTerm={facilityTerm} />
      <DivisionWhenDialog visible={dialog === 'when'} onClose={() => setDialog(null)} event={event} division={division} orgId={orgId} />
      <ScheduleDivisionDialog
        visible={dialog === 'schedule' || dialog === 'reschedule'}
        again={dialog === 'reschedule'}
        event={event}
        division={division}
        sport={sport}
        facilities={facilities}
        games={games}
        orgId={orgId}
        onClose={() => setDialog(null)}
        onChangeWhen={() => setDialog('when')}
      />
      <GapsDialog visible={dialog === 'gaps'} onClose={() => setDialog(null)} event={event} division={division} orgId={orgId} />
      <DivisionOrganisersDialog visible={dialog === 'organisers'} onClose={() => setDialog(null)} orgId={orgId} eventId={eventId} event={event} division={division} organizers={organizers} onOrganizersChange={setOrganizers} />
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
