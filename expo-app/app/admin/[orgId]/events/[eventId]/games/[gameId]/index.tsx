import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Event, Facility, Game, GameSummary, Site, SocketAction, resolveEventType, timeOfDay } from '@sk/shared';
import { ScreenHeader } from '../../../../../../../components/ScreenHeader';
import { PageBody } from '../../../../../../../components/PageBody';
import { GameOfficialsCard } from '../../../../../../../components/game/GameOfficialsCard';
import { Tabs } from '../../../../../../../components/Tabs';
import { OverflowMenu, OverflowMenuItem } from '../../../../../../../components/OverflowMenu';
import { ConfirmationModal } from '../../../../../../../components/ConfirmationModal';
import { ReadFailure } from '../../../../../../../components/ReadFailure';
import { RoomFailure } from '../../../../../../../components/RoomFailure';
import { EditDialog } from '../../../../../../../components/EditDialog';
import { AccessDenied } from '../../../../../../../components/AccessDenied';
import { RecordResultModal } from '../../../../../../../components/RecordResultModal';
import { PendingResultNote } from '../../../../../../../components/PendingResultNote';
import { RowTag } from '../../../../../../../components/events/EventBits';
import { DivisionCard, GameMoment, MatchEventsCard, Scoreboard, ScoreboardAction, TeamsCard, WhereCard, gameMoment, sideLabel } from '../../../../../../../components/game/GameBits';
import { EditMatchDialog, WhoPlayedDialog } from '../../../../../../../components/game/GameDialogs';
import { MoveSheet } from '../../../../../../../components/tournament/MoveSheet';
import { useScheduleCheck } from '../../../../../../../components/tournament/useScheduleCheck';
import { useSafeBack } from '../../../../../../../hooks/useSafeBack';
import { useGameSummary } from '../../../../../../../hooks/useGameSummary';
import { useGameLineups, useLineupProposals } from '../../../../../../../hooks/useGameLineups';
import { useEventCapabilities } from '../../../../../../../hooks/useEventCapabilities';
import { useGameCapabilities } from '../../../../../../../hooks/useGameCapabilities';
import { useSocketQuery } from '../../../../../../../hooks/useSocketQuery';
import { useEventDivisions, useEventFacilityIds, useEventFixtures, useEventRecord, useSports } from '../../../../../../../hooks/useEventRooms';
import { awardsPoints } from '../../../../../../../components/tournament/standingsBits';
import { useOrgSites } from '../../../../../../../hooks/useOrgSites';
import { useOrgSummary } from '../../../../../../../hooks/useOrgSummary';
import { useResultSent } from '../../../../../../../services/resultQueue';
import { sendAction } from '../../../../../../../services/actions';
import { readData } from '../../../../../../../services/reads';
import { useAuthStore } from '../../../../../../../store/authStore';
import { useWsStore } from '../../../../../../../store/wsStore';
import { useRoomStatusStore } from '../../../../../../../store/roomStatusStore';
import { useActiveTheme } from '../../../../../../../store/settingsStore';
import { themeColor } from '../../../../../../../constants/Colors';
import { getMatchPermissions } from '../../../../../../../utils/matchPermissions';
import { formatInstantDate, formatKickoffTime, venueInputsToInstant } from '../../../../../../../utils/dates';
import { useTournamentLinks } from '../../../../../../../components/tournament/tournamentLinks';
import { useCanOpenOrg } from '../../../../../../../hooks/useCanOpenOrg';

type Dialog = null | 'edit' | 'move' | 'who' | 'result' | 'cancel' | 'reinstate' | 'delete';
type PhoneTab = 'overview' | 'teams' | 'events';

/**
 * One game, read first (events redesign stage 3, `FIX-21`; agreed 2026-10-14 on
 * `mockups/game-read-first.html`, option B revised). In place of the old View and Edit screens.
 *
 * - **A scoreboard** with the teams, the kick-off or the score, and the buttons in the order things
 *   happen — Pick team, Start scoring, Record result — the next step highlighted.
 * - **Wide: no tabs.** The teams' sheets on the left (and a fixture's division under them); Match
 *   events (scrolling) and When & where in a narrower column on the right. **Phone: tabs** —
 *   Overview, Teams, and Match events once the game has started.
 * - **Edit and ⋯ only for whoever may edit the game**; a coach or scorer gets the result buttons. A
 *   single match edits everything in one dialog; a tournament fixture has **no team pickers** — it
 *   is moved with the Schedule's sheet, and *Who played* covers a different team turning up.
 * - Nothing on the page explains what a viewer cannot do (agreed 2026-10-14).
 *
 * Decisions in docs/events.md §9.
 */
export default function GamePage() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, eventId, gameId } = useLocalSearchParams<{ orgId: string; eventId: string; gameId: string }>();
  const links = useTournamentLinks(orgId);
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((s: any) => s.isConnected);

  const { summary, isLoading, accessDenied, notFound, failure: summaryFailure, room: summaryRoom } = useGameSummary(gameId);
  const { event, notFound: eventNotFound, failure: eventFailure, room: eventRoom } = useEventRecord(eventId);
  const isMatch = resolveEventType(event).kind === 'SingleMatch';
  const isFixture = !!event && !isMatch;
  const sports = useSports();
  const sport = sports.find(s => s.id === summary?.sportId);
  // rooms-ok: capability updates only; the read is the load and its failure is in `detailsFailure`
  const { capabilities, error: capabilitiesError, retry: retryCapabilities } = useEventCapabilities(eventId, { suppressToast: true });
  // Appointed officials, whom no membership names (`PERM-6`); not asked on the public page.
  const { capabilities: gameCapabilities, error: gameCapabilitiesError, retry: retryGameCapabilities } = useGameCapabilities(links.isPublic ? null : gameId, { suppressToast: true });
  const user = useAuthStore((s: any) => s.user);
  const orgMemberships = useAuthStore((s: any) => s.orgMemberships);
  const teamMemberships = useAuthStore((s: any) => s.teamMemberships);

  // The full record, for the result dialog and the match events; read again whenever the summary moves.
  const [game, setGame] = useState<Game | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);
  const [gameAttempt, setGameAttempt] = useState(0);
  useEffect(() => {
    // The full record is the members' (it carries who scored); the public page has the summary (`FIX-39`).
    if (!isConnected || !gameId || links.isPublic) return;
    let active = true;
    setGameError(null);
    void readData<Game | null>('game', { id: gameId }, { suppressToast: true, stillWanted: () => active }).then(result => {
      if (!active) return;
      if (!result.ok) { setGameError(result.message); return; }
      if (result.data) setGame(result.data);
    });
    return () => { active = false; };
  }, [isConnected, gameId, summary?.updatedAt, summary?.status, gameAttempt]);
  useResultSent(gameId, setGame);

  // The venue, for its name and whose ground it is (*Home*).
  const siteRead = useSocketQuery<Site>('site', { id: summary?.siteId }, { enabled: !!summary?.siteId, suppressToast: true });
  const facilityRead = useSocketQuery<Facility>('facility', { id: summary?.facilityId }, { enabled: !!summary?.facilityId, suppressToast: true });
  const site = summary?.siteId ? siteRead.data : null;
  const facility = summary?.facilityId ? facilityRead.data : null;

  const sides = useMemo(() => (summary?.participants || []).slice(0, 2), [summary]);
  // A private organisation's game, read by someone who played in it and has since left (`ORG-14`):
  // its names stay, but nothing links to its tournament or division, which would refuse them.
  const canOpenOrg = useCanOpenOrg(event?.orgId, sides.some(p => p.orgIsPrivate));
  // The team sheets — public too, by decision until `PEOPLE-4` gives a way to hide players.
  const { lineups, error: lineupsError, reload: reloadLineups } = useGameLineups(sides.map(p => p.id));
  const homeSides = useMemo(() => new Set(sides.filter(p => site?.orgId && p.orgId === site.orgId).map(p => p.id)), [sides, site]);

  const { divisions: divisions, room: divisionsRoom } = useEventDivisions(isFixture ? eventId : null);
  const division = divisions.find(d => d.id === summary?.divisionId);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [whoSide, setWhoSide] = useState<string | null>(null);
  const [tab, setTab] = useState<PhoneTab>('overview');
  const [busy, setBusy] = useState(false);

  // The public page is read-only whoever is looking: a coach picks their team in their workspace.
  const permissions = getMatchPermissions(links.isPublic
    ? { game: summary || null, event, user: null, orgMemberships: [], teamMemberships: [], capabilities: null }
    : { game: summary || null, event, currentOrgId: orgId, user, orgMemberships, teamMemberships, capabilities, gameCapabilities });
  const canEdit = permissions.canEdit;
  // The viewer's own sides' proposed teams (`FIX-32`); another side's is not theirs to see as picked.
  const mySideIds = sides.filter((p, i) => (i === 0 ? permissions.canEditTeam1Lineup : permissions.canEditTeam2Lineup)).map(p => p.id);
  const { proposals, reload: reloadProposals } = useLineupProposals(isFixture ? mySideIds : []);

  const backHref = !canOpenOrg ? '/' : isMatch ? links.home() : links.event(eventId);
  const goBack = () => safeBack(backHref);

  if (accessDenied) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Game" onBack={goBack} />
        <AccessDenied message="This game is not one you can see." actionLabel="Back" onAction={goBack} />
      </SafeAreaView>
    );
  }
  if (isLoading || !summary || !event) {
    // Its room says so when the game or its event is gone (`LIVE-25`), rather than leaving this spinning.
    const missing = notFound ? 'This game does not exist any more.'
      : eventNotFound ? 'The event this game belongs to does not exist any more.' : null;
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Game" onBack={goBack} />
        <View className="flex-1 items-center justify-center px-6">
          {missing ? <Text className="font-inter text-sm text-ink-muted text-center">{missing}</Text>
            : summaryFailure || eventFailure ? <RoomFailure rooms={[summaryRoom, eventRoom]} what="This game" />
            : <ActivityIndicator color={themeColor(isDark, 'primary')} />}
        </View>
      </SafeAreaView>
    );
  }

  const moment: GameMoment = gameMoment(summary, isFixture);
  const started = moment === 'live' || moment === 'done';
  const when = summary.scheduledStartTime || summary.startTime;
  const whenText = when ? (moment === 'tbc' || moment === 'notPlaced' ? formatInstantDate(when) : `${formatInstantDate(when)} · ${formatKickoffTime(when)}`) : '';
  const whereText = [site?.name, facility?.name].filter(Boolean).join(' · ');
  const title = `${sideLabel(sides[0])} v ${sideLabel(sides[1])}`;

  /* -- the buttons, in the order things happen; the next step is highlighted -- */
  const mySides = sides.filter((p, i) => (i === 0 ? permissions.canEditTeam1Lineup : permissions.canEditTeam2Lineup));
  const picked = mySides.length > 0 && mySides.every(p => (lineups[p.id] || []).length > 0);
  // A sheet that did not load is not one still to pick: the button stays, as a way to the sheet, but says neither.
  const sheetUnknown = !!lineupsError && mySides.some(p => !lineups[p.id]);
  const next = moment === 'live' ? 'score' : moment === 'done' ? 'correct'
    : mySides.length && !picked && !sheetUnknown ? 'pick' : permissions.canScore ? 'start' : null;
  const pickTeam = () => router.push(`/admin/${orgId}/events/${eventId}/games/${gameId}/selection${mySides.length === 1 && mySides[0].teamId ? `?teamId=${mySides[0].teamId}` : ''}` as any);
  const score = () => router.push(links.event(eventId, `/games/${gameId}/score`) as any);
  /*
   * A side with no team of its own but a proposed one (`FIX-32`): *Confirm team* saves the proposal
   * as this game's, and stays the next step until done — nothing the coach has not looked at shows
   * as picked. *Change team* opens Pick team, starting from the proposal.
   */
  // Only a side known to have no sheet: confirming a proposal over one that did not load would replace it.
  const proposedSides = mySides.filter(p => !!lineups[p.id] && !lineups[p.id]!.length && !!proposals[p.id]);
  const confirmProposals = async () => {
    setBusy(true);
    for (const p of proposedSides) {
      const items = (proposals[p.id]?.items || []).map(r => ({ orgProfileId: r.orgProfileId, position: r.position || undefined, jerseyNumber: r.jerseyNumber || undefined, isReserve: !!r.isReserve }));
      const res = await sendAction(SocketAction.SAVE_GAME_ROSTER, { gameId: gameId!, participantId: p.id, items });
      if (!res.ok) break;
    }
    setBusy(false);
    reloadLineups();
    reloadProposals();
  };
  const actions: ScoreboardAction[] = [];
  if (moment !== 'cancelled') {
    if (mySides.length && moment !== 'done') {
      if (proposedSides.length && !picked) {
        actions.push({ label: 'Confirm team', onPress: confirmProposals, primary: next === 'pick' });
        actions.push({ label: 'Change team', onPress: pickTeam });
      } else {
        actions.push({ label: picked ? 'Change team' : sheetUnknown ? 'Team sheet' : 'Pick team', onPress: pickTeam, primary: next === 'pick' });
      }
    }
    if (permissions.canScore) {
      if (moment === 'live') actions.push({ label: 'Score', onPress: score, primary: true });
      // The result dialog needs the full record: offered once it has arrived, so it never does nothing.
      else if (moment === 'done') { if (game) actions.push({ label: 'Correct result', onPress: () => setDialog('result'), primary: true }); }
      else {
        actions.push({ label: 'Start scoring', onPress: score, primary: next === 'start' });
        if (game) actions.push({ label: 'Record result', onPress: () => setDialog('result') });
      }
    } else if (gameCapabilities?.canKeepTime && moment !== 'done') {
      // An appointed timekeeper opens the control room to its clock alone (`PERM-7`).
      actions.push({ label: 'Keep time', onPress: score, primary: true });
    }
  }

  /* -- the line above the teams, and the status beside it -- */
  const openDivision = () => summary.divisionId && router.push(links.event(eventId, `/divisions/${summary.divisionId}`) as any);
  const sportName = sport?.name || '';
  const divisionName = division ? (division.name.startsWith(sportName) ? division.name : `${sportName} ${division.name}`.trim()) : sportName;
  const kicker = isMatch ? (
    <Text className="font-inter-semibold text-[13px] text-ink-muted">{sportName ? `${sportName} · ` : ''}Match</Text>
  ) : (
    <Text className="font-inter-semibold text-[13px] text-ink-muted" numberOfLines={2}>
      {canOpenOrg
        ? <Text className="text-primary-ink" onPress={() => router.push(links.event(eventId) as any)}>{event.name}</Text>
        : <Text>{event.name}</Text>}
      {division ? <Text>{' · '}{canOpenOrg ? <Text className="text-primary-ink" onPress={openDivision}>{divisionName}</Text> : divisionName}</Text> : null}
      {summary.round ? ` · Round ${summary.round}` : ''}
    </Text>
  );
  const statusRight = moment === 'live' ? <RowTag tone="live" label="LIVE" />
    : moment === 'done' ? <Text className="font-inter-semibold text-[13px] text-success-ink">Finished</Text>
    : moment === 'before' ? <Text className="font-inter-semibold text-[13px] text-ink-muted">Not started</Text>
    : null;

  /* -- the ⋯: only for whoever may edit -- */
  const word = isMatch ? 'match' : 'fixture';
  const menu: OverflowMenuItem[] = [];
  if (canEdit) {
    if (isMatch) menu.push({ label: 'Edit match', description: 'Teams, date, time and where', icon: 'pencil-outline', onPress: () => setDialog('edit'), disabled: !game || moment === 'cancelled' });
    else {
      menu.push({ label: 'When & where', description: 'Move it, as on the Schedule', icon: 'time-outline', onPress: () => setDialog('move'), disabled: started || moment === 'cancelled' });
      menu.push({ label: 'Who played', description: 'A different team turned up for this game', icon: 'swap-horizontal-outline', onPress: () => { setWhoSide(sides.find(p => p.entrantId)?.id || null); setDialog('who'); }, disabled: !sides.some(p => p.entrantId) || moment === 'cancelled' });
    }
    if (moment === 'cancelled') menu.push({ label: 'Reinstate', description: `Put the ${word} back on`, icon: 'refresh-outline', onPress: () => setDialog('reinstate') });
    else menu.push({ label: `Cancel ${word}`, description: started ? 'Not once it has started' : 'Both organisations see it as cancelled', icon: 'close-circle-outline', onPress: () => setDialog('cancel'), disabled: started });
    menu.push({ label: `Delete ${word}`, description: started ? 'Not once it has started' : isMatch ? 'Gone for everyone' : 'Taken out of the division', icon: 'trash-outline', onPress: () => setDialog('delete'), disabled: started, destructive: true });
  }

  /* -- what the dialogs send -- */
  const setStatus = async (status: 'Scheduled' | 'Cancelled') => {
    setBusy(true);
    const res = await sendAction(SocketAction.UPDATE_GAME, { id: gameId!, orgId: orgId!, data: { status } });
    if (res.ok && isMatch) await sendAction(SocketAction.UPDATE_EVENT, { id: eventId!, orgId: orgId!, data: { status } });
    setBusy(false);
    if (res.ok) setDialog(null);
  };
  const remove = async () => {
    setBusy(true);
    const res = isMatch
      ? await sendAction(SocketAction.DELETE_EVENT, { id: eventId!, orgId: orgId! })
      : await sendAction(SocketAction.DELETE_GAME, { id: gameId!, orgId: orgId! });
    setBusy(false);
    // A refused delete leaves the page as it was, with the dialog open.
    if (!res.ok) return;
    setDialog(null);
    router.replace(backHref as any);
  };

  /* -- the cards -- */
  const venueError = siteRead.error || facilityRead.error;
  const retryVenue = () => {
    if (siteRead.error) siteRead.refetch();
    if (facilityRead.error) facilityRead.refetch();
  };
  const edit = canEdit ? () => setDialog(isMatch ? 'edit' : 'move') : undefined;
  const whoPlayed = canEdit && isFixture && moment !== 'cancelled' ? (id: string) => { setWhoSide(id); setDialog('who'); } : undefined;
  const whereCard = (
    <>
      {venueError ? <ReadFailure what="The venue" reason={venueError} onRetry={retryVenue} stale /> : null}
      <WhereCard
        moment={moment}
        whenText={whenText}
        siteName={siteRead.error && !site ? 'Did not load' : site?.name}
        facilityName={facility?.name}
        facilityWord={facility?.category === 'indoor_hall' ? 'Court' : 'Field'}
        sportName={sportName}
        onEdit={edit && !started ? edit : undefined}
        onPlace={edit && (moment === 'tbc' || moment === 'notPlaced') ? edit : undefined}
      />
    </>
  );
  const divisionCard = isFixture && summary.divisionId && division && canOpenOrg ? (
    <DivisionCard divisionId={summary.divisionId} title={divisionName} summary={summary} showPoints={awardsPoints(event)} onOpen={openDivision} />
  ) : null;
  const cancelledStrip = moment === 'cancelled' && canEdit ? (
    <View className="rounded-xl border border-warning-line bg-warning-soft px-3.5 py-2.5 flex-row flex-wrap items-center gap-3">
      <Text className="flex-1 font-inter text-sm text-warning-ink" style={{ minWidth: 200 }}>Both organisations see this {word} as called off.</Text>
      <TouchableOpacity onPress={() => setDialog('reinstate')} accessibilityRole="button" className="rounded-xl px-3.5 py-1.5 bg-primary">
        <Text className="font-inter-bold text-[13px] text-on-primary">Reinstate</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  const scoreboard = (
    <Scoreboard
      summary={summary}
      moment={moment}
      isWide={isWide}
      kicker={kicker}
      statusRight={statusRight}
      whereLine={[whenText, whereText].filter(Boolean).join(' · ')}
      homeSides={homeSides}
      actions={actions}
    />
  );

  // The match events read the scoring feed, which is public (`FIX-39`); the public page has no full
  // record, so they go by the summary, which carries what the feed needs — its id, sides and sport.
  const feedGame = game || (links.isPublic ? (summary as unknown as Game) : null);

  // Who officiates it: for the people who run the fixture, who appoint them (`PERM-7`).
  const officialsCard = canEdit && !links.isPublic && event?.orgId
    ? <GameOfficialsCard gameId={gameId!} hostOrgId={event.orgId} />
    : null;

  // A sheet that did not load is not *Not picked yet*: the failure takes the card's place until it does.
  const sheetsMissing = !!lineupsError && sides.some(p => !lineups[p.id]);
  const teamsCard = (props: Partial<React.ComponentProps<typeof TeamsCard>>) => (
    <>
      {lineupsError ? <ReadFailure what="The team sheets" reason={lineupsError} onRetry={reloadLineups} stale={!sheetsMissing} /> : null}
      {sheetsMissing ? null : (
        <TeamsCard summary={summary} lineups={lineups} proposals={proposals} homeSides={homeSides} started={started || moment === 'cancelled'} {...props} />
      )}
    </>
  );

  // What this viewer may do, and what the buttons and the match events need: said once, under the scoreboard.
  const rightsError = capabilitiesError || gameCapabilitiesError;
  const rightsMatter = !!rightsError && !(canEdit && permissions.canScore);
  const recordMatters = !!gameError && (started || canEdit || permissions.canScore);
  const retryDetails = () => {
    if (capabilitiesError) retryCapabilities();
    if (gameCapabilitiesError) retryGameCapabilities();
    if (gameError) setGameAttempt(n => n + 1);
  };
  const detailsFailure = rightsMatter || recordMatters ? (
    <ReadFailure
      title={rightsMatter ? 'What you can do at this game did not load.' : game ? 'This game did not update.' : 'This game\'s full record did not load.'}
      reason={(rightsMatter ? rightsError : gameError)!}
      onRetry={retryDetails}
    />
  ) : null;

  let body: React.ReactNode;
  if (isWide) {
    body = (
      <View className="flex-row gap-4 items-start">
        <View className="flex-1 gap-3.5 min-w-0">
          {teamsCard({ sideBySide: true, onWhoPlayed: whoPlayed })}
          {divisionCard}
        </View>
        <View className="gap-3.5" style={{ width: 340 }}>
          {started && feedGame ? <MatchEventsCard game={feedGame} height={260} spectator={links.isPublic} /> : null}
          {whereCard}
          {officialsCard}
        </View>
      </View>
    );
  } else {
    const tabs = [{ key: 'overview' as PhoneTab, label: 'Overview' }, { key: 'teams' as PhoneTab, label: 'Teams' }];
    if (started) tabs.push({ key: 'events', label: 'Match events' });
    const shown = tabs.some(t => t.key === tab) ? tab : 'overview';
    body = (
      <View className="gap-2.5">
        <View className="rounded-xl border border-line bg-card overflow-hidden"><Tabs items={tabs} activeKey={shown} onChange={setTab} /></View>
        {shown === 'teams' ? teamsCard({ onWhoPlayed: whoPlayed }) : null}
        {shown === 'events' && feedGame ? <MatchEventsCard game={feedGame} height={520} spectator={links.isPublic} /> : null}
        {shown === 'overview' ? (
          <>
            {teamsCard({ compact: true, onOpen: () => setTab('teams') })}
            {started && feedGame ? <MatchEventsCard game={feedGame} height={280} spectator={links.isPublic} /> : null}
            {whereCard}
            {officialsCard}
            {divisionCard}
          </>
        ) : null}
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader
        title={isWide ? title : 'Game'}
        context={isFixture ? event.name : undefined}
        onBack={goBack}
        backLabel={isMatch ? 'Events' : 'Back'}
        right={menu.length ? <OverflowMenu items={menu} title={title} accessibilityLabel="Game actions" /> : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 80 }}>
        <PageBody className="gap-3.5">
          {scoreboard}
          {detailsFailure}
          {/* The score, status and division come live from these rooms: without them this is the last known state. */}
          <RoomFailure rooms={[summaryRoom, eventRoom, divisionsRoom]} what="This game" stale />
          <PendingResultNote gameId={gameId} />
          {cancelledStrip}
          {body}
        </PageBody>
      </ScrollView>

      {game && isMatch ? (
        <EditMatchDialog visible={dialog === 'edit'} orgId={orgId!} hostOrgId={event?.orgId || orgId!} eventId={eventId!} game={game} summary={summary} sportName={sportName} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'move' && isFixture ? (
        <FixtureMove event={event} orgId={orgId!} summary={summary} canEdit={canEdit} onClose={() => setDialog(null)} />
      ) : null}
      {isFixture ? (
        <WhoPlayedDialog
          visible={dialog === 'who'}
          side={sides.find(p => p.id === whoSide)}
          summary={summary}
          orgId={orgId!}
          eventId={eventId!}
          divisionName={divisionName}
          onOpenDivision={openDivision}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {game ? (
        <RecordResultModal
          isOpen={dialog === 'result'}
          onClose={() => setDialog(null)}
          game={game}
          sideLabels={sides.map(sideLabel)}
          onRecorded={setGame}
        />
      ) : null}
      <ConfirmationModal
        isOpen={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        title={`Cancel this ${word}?`}
        description={`${title}${whenText ? `, ${whenText}` : ''}. It stays on the list as cancelled, so both organisations know it is off, and you can reinstate it later.`}
        confirmText={`Cancel ${word}`}
        cancelText="Keep it"
        isProcessing={busy}
        onConfirm={() => setStatus('Cancelled')}
      />
      <ConfirmationModal
        isOpen={dialog === 'reinstate'}
        onClose={() => setDialog(null)}
        title={`Reinstate this ${word}?`}
        description={`It goes back on${whenText ? ` at ${whenText}` : ''}${whereText ? `, ${whereText}` : ''}.`}
        confirmText="Reinstate"
        variant="primary"
        isProcessing={busy}
        onConfirm={() => setStatus('Scheduled')}
      />
      <ConfirmationModal
        isOpen={dialog === 'delete'}
        onClose={() => setDialog(null)}
        title={`Delete this ${word}?`}
        description={isMatch
          ? 'The match and its team sheets are deleted for both organisations. To keep a record that it was off, cancel it instead.'
          : `It comes out of ${divisionName || 'its division'}, and the division shows it as changed since the draw.`}
        confirmText="Delete"
        cancelText="Keep it"
        isProcessing={busy}
        onConfirm={remove}
      />
    </SafeAreaView>
  );
}

/**
 * A tournament fixture's *When & where*: the Schedule's move sheet, with the Schedule's clash check
 * over the whole tournament. Mounted only while open, since it reads the tournament's fixtures.
 */
function FixtureMove({ event, orgId, summary, canEdit, onClose }: { event: Event; orgId: string; summary: GameSummary; canEdit: boolean; onClose: () => void }) {
  const online = useWsStore((s: any) => s.isConnected);
  const { games: games, room: gamesRoom } = useEventFixtures(event.id);
  const { divisions: divisions, room: divisionsRoom } = useEventDivisions(event.id);
  const { facilityIds: facilityIds, room: facilityIdsRoom } = useEventFacilityIds(event.id);
  const { sites, facilities, rooms: siteRooms } = useOrgSites(event.orgId);
  const { org: hostOrg, room: hostRoom } = useOrgSummary(event.orgId);
  const sports = useSports();
  // The clash check is worked out from all of these; with one missing it cannot be relied on (`LIVE-25`).
  const scheduleRooms = [gamesRoom, divisionsRoom, facilityIdsRoom, ...siteRooms, hostRoom];
  const scheduleFailed = useRoomStatusStore(state => scheduleRooms.some(room => !!room && !!state.failed[room]));
  const check = useScheduleCheck({ event, orgId, canEdit, divisions, games, sports, sites, facilities, facilityIds, hostOrg });
  const game = games.find(g => g.id === summary.id) || summary;
  const days = (event.days || []).map(d => d.day);
  const playingDays = days.length ? days : [...new Set(check.model.bookings.map(b => b.day))].sort();

  const move = async (to: { day: string; start: number; facilityId: string } | null) => {
    const startAt = to ? venueInputsToInstant(to.day as any, timeOfDay(to.start), check.timeZone) : null;
    const res = await sendAction(SocketAction.MOVE_FIXTURE, { gameId: summary.id, orgId, startAt, facilityId: to ? to.facilityId : null });
    if (res.ok) onClose();
  };

  if (scheduleFailed) {
    return (
      <EditDialog visible title="Move fixture" onClose={onClose}>
        <RoomFailure rooms={[gamesRoom, divisionsRoom, facilityIdsRoom, ...siteRooms, hostRoom]} title="The tournament's schedule did not load." />
        <Text className="font-inter text-[13px] text-ink-muted">Moving a fixture needs it, to check for clashes.</Text>
      </EditDialog>
    );
  }

  return (
    <MoveSheet
      game={game}
      event={event}
      days={playingDays as any}
      division={check.divisionOf(game.divisionId)}
      facilities={facilities}
      facilityIds={facilityIds}
      divisionFacilityIds={game.divisionId ? check.divisionFacilityIds(game.divisionId) : new Set()}
      facilityLabel={check.facilityLabel}
      model={check.model}
      wouldClash={(fid, d, start) => check.wouldClash(game, fid, d, start)}
      online={online}
      onClose={onClose}
      onMove={move}
    />
  );
}
