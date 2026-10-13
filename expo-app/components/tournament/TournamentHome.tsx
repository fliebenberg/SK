import React, { useMemo, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  DEFAULT_SCORING_SYSTEM,
  Event,
  Facility,
  GameSummary,
  Organization,
  SocketAction,
  Sport,
  Site,
  TournamentDivision,
  TournamentEntrant,
  TournamentOrganizer,
  divisionFullName,
  drawChanges,
  hasLeft,
  isEntrantEntered,
  entryLockGaps,
  dualUnpaired,
  isDualEvent,
} from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { lockGapsLine } from './DivisionEntries';
import { TeamInvitationRows } from './TeamInvitations';
import { SegmentedControl } from '../SegmentedControl';
import { useMineAll } from '../../hooks/useMineAll';
import { AddressMap } from '../address/AddressMap';
import { facilityMarkers } from '../address/facilityMarker';
import { FacilityIcon, addressText } from '../sites/SiteBits';
import { FixtureSideFitted, RowTag, TournamentMark, fixtureSideNames, sideScores } from '../events/EventBits';
import { useShowFieldHelp } from '../FieldLabel';
import {
  DivisionStateLine, NotInvitedBox, OrgsList, SetupProgress, SportsDivisions, StepState, TournamentCard, UnnamedList,
  WarningsCount, WarningsList, isFinished,
} from './TournamentBits';
import { useOrganisationsSection, useSportsSection } from './TournamentSections';
import { EditTournamentDialog, ScoringDialog, WhereDialog } from './TournamentDialogs';
import { GapsDialog, WhenDialog, gapsLine } from './ScheduleSetup';
import { ScheduleAllDialog } from './ScheduleActions';
import { OrganisationResponse } from './OrganisationResponse';
import { DualResultsCard, SideCrest, dualSides } from './DualResults';
import { useAuthStore } from '../../store/authStore';
import { sendAction } from '../../services/actions';
import { useActiveTheme, useSettingsStore } from '../../store/settingsStore';
import { calendarRangeStatus, dateCountdown, eventDayOfRange, formatDateRange, formatKickoffTime, formatPlayingDay, venueTimeZone, whenMs } from '../../utils/dates';
import { themeColor } from '../../constants/Colors';
import { LAYOUT } from '../../constants/layout';

/**
 * The tournament page's first tab, *Overview* (docs/events.md §7; agreed 2026-10-09 on
 * `mockups/tournament-cards.html`, which replaced the numbered step cards of stage 2).
 *
 * One page of cards in every phase, read first, as the division page is: a banner that says what
 * the tournament is and where it has got to, **one strip** for what it needs next, then cards in
 * two columns on a wide screen, three on a wider one. **While it is being set up** an organiser sees each card's status
 * on its heading — Done, In progress, Not started — and a progress bar in the banner
 * with a segment per card; the cards keep **one fixed order**, so nothing moves while the work is
 * done, and on a phone a finished card folds to its heading. **Once set up** the statuses go and
 * the page is the tournament as everyone sees it; **on the day** it rearranges around what is live.
 * Sports & divisions and Organisations & teams open as full pages; Fixtures opens the Schedule tab.
 */

export type StepKey = 'basics' | 'when' | 'divisions' | 'entrants' | 'scoring' | 'fixtures';

export interface TournamentStep {
  key: StepKey;
  title: string;
  state: StepState;
  /** A folded card's line: what has been decided, or what it waits for. */
  summary: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A division's fixture with no time or no facility yet (Phase 7) — what keeps Fixtures from done. */
export const unscheduledIn = (g: GameSummary, playing: TournamentDivision[]) =>
  !!g.divisionId && playing.some(d => d.id === g.divisionId) && g.status !== 'Cancelled' && (!g.startTime || !!g.timeTbd || !g.facilityId);

/** Where each section of setting up stands, from the state of the data — never from having been visited (U17). */
export function useTournamentSteps({ event, divisions, games, entrants, entrantsByDivision, facilityIds, sports, sites }: {
  event: Event | null;
  divisions: TournamentDivision[];
  games: GameSummary[];
  entrants: TournamentEntrant[];
  entrantsByDivision: Map<string, TournamentEntrant[]>;
  facilityIds: string[];
  sports: Sport[];
  sites: Site[];
}): { steps: TournamentStep[]; complete: boolean; nextIndex: number } {
  return useMemo(() => {
    if (!event) return { steps: [], complete: false, nextIndex: -1 };
    const sportIds = event.sportIds || [];
    const playing = divisions.filter(d => !!d.sportId);
    const entered = entrants.filter(e => isEntrantEntered(e.status));
    // The host takes part by hosting; every other organisation has an invitation (`FIX-29`).
    // One that declined or withdrew stays listed as the record, but is out of it (`FIX-30`).
    const others = (event.participatingOrgs || []).filter(o => o.id !== event.orgId && !hasLeft(o.invitation));
    const teamsOf = (id: string) => entered.filter(e => e.orgId === id).length;
    const notInvited = others.filter(o => o.invitation === 'not_invited');
    const unanswered = others.filter(o => o.invitation === 'invited');
    const leaving = others.filter(o => o.invitation === 'withdrawal_pending');
    const empty = others.filter(o => !teamsOf(o.id));
    const warnings = empty.length + unanswered.length + leaving.length;
    /*
     * Done (`FIX-26`, `FIX-30`; narrowed 2026-10-09): every organisation still in it has accepted and
     * entered something, and none is asking to withdraw. A division with fewer than two teams no
     * longer holds this up — it is the division's, and it keeps Fixtures from being done instead,
     * since such a division cannot be drawn.
     */
    const entrantsDone = playing.length > 0 && entered.length > 0 && !notInvited.length && !unanswered.length && !leaving.length && !empty.length;
    const drawn = playing.filter(d => games.some(g => g.divisionId === d.id));
    // Phase 7: a fixture is scheduled when it has a time and a facility. Fixtures is done only once
    // every division is drawn *and* scheduled (agreed 2026-10-11).
    const unscheduled = games.filter(g => unscheduledIn(g, playing));
    const days = event.days || [];
    // The whole roster: a team that withdrew after the draw is one of the changes (`drawChanges`).
    const changed = playing.filter(d => drawChanges(d.firstStageId, games.filter(g => g.divisionId === d.id), entrantsByDivision.get(d.id) || []).count > 0);
    const scoring = event.settings?.scoring;
    const sportName = (id: string) => sports.find(s => s.id === id)?.name;
    /*
     * A Head to Head (`H2H-1`): the organisation it plays rather than a list of organisations, its
     * pairings rather than draws, and no rules or scoring — it is won by games.
     */
    const dual = isDualEvent(event);
    const guest = others[0];
    const unpairedIn = (d: TournamentDivision) => dualUnpaired(entrantsByDivision.get(d.id) || [], games.filter(g => g.divisionId === d.id));
    const withUnpaired = dual ? playing.filter(d => unpairedIn(d).length > 0) : [];
    // Paired once pairing has run: it entered teams, even where none had a counterpart.
    const paired = playing.filter(d => games.some(g => g.divisionId === d.id) || (entrantsByDivision.get(d.id) || []).some(e => isEntrantEntered(e.status)));
    const unpairedTeams = withUnpaired.reduce((n, d) => n + unpairedIn(d).length, 0);

    const steps: TournamentStep[] = [
      {
        key: 'basics', title: 'Where',
        state: event.siteId || facilityIds.length ? 'done' : 'none',
        summary: event.siteId || facilityIds.length
          ? [sites.find(s => s.id === event.siteId)?.name, `${facilityIds.length} ${facilityIds.length === 1 ? 'facility' : 'facilities'}`].filter(Boolean).join(' · ')
          : 'No venue yet',
      },
      {
        key: 'when', title: 'When',
        state: days.length ? 'done' : 'none',
        summary: days.length ? `${plural(days.length, 'day')} · ${formatDateRange(days[0].day, days[days.length - 1].day, { compact: true })}` : 'No playing days yet',
      },
      {
        key: 'divisions', title: 'Sports & divisions',
        state: !sportIds.length ? 'none' : divisions.some(d => !d.sportId) ? 'part' : 'done',
        summary: sportIds.length ? `${sportIds.map(sportName).filter(Boolean).join(', ')} · ${plural(divisions.length, 'division')}` : 'No sports yet',
      },
      dual ? {
        key: 'entrants', title: 'Playing against',
        state: !guest ? 'none' : guest.invitation === 'accepted' ? 'done' : 'part',
        summary: !guest
          ? 'Nobody chosen yet'
          : `${guest.name} · ${guest.invitation === 'accepted' ? 'accepted' : guest.invitation === 'not_invited' ? 'not invited yet' : guest.invitation === 'withdrawal_pending' ? 'asks to withdraw' : 'invited'}`,
      } : {
        key: 'entrants', title: 'Organisations & teams',
        state: !playing.length ? 'none' : entrantsDone ? 'done' : entered.length || others.length ? 'part' : 'none',
        summary: !playing.length
          ? others.length
            ? `${plural(others.length, 'organisation')} added · ${notInvited.length === others.length ? 'nobody invited yet' : `${others.length - notInvited.length} invited`}`
            : 'Starts once there are divisions'
          : [
              plural(others.length + 1, 'organisation'),
              plural(entered.length, 'team'),
              notInvited.length ? `${notInvited.length} not invited` : '',
              warnings ? `⚠ ${warnings}` : '',
            ].filter(Boolean).join(' · '),
      },
      ...(dual ? [] : [{
        key: 'scoring' as const, title: 'Rules & scoring',
        state: (scoring ? 'done' : 'part') as StepState,
        summary: scoring?.mode === 'byResult'
          ? `${scoring.pointsPerWin} / ${scoring.pointsPerDraw} / ${scoring.pointsPerLoss} for a win, draw, loss`
          : scoring?.mode === 'byPlacing' ? 'Points by finishing position' : 'Default 3 / 1 / 0, not confirmed',
      }]),
      dual ? {
        key: 'fixtures', title: 'Pairings',
        state: playing.length && paired.length === playing.length && !unpairedTeams && !unscheduled.length ? 'done' : paired.length || games.length ? 'part' : 'none',
        summary: !playing.length ? 'Once there are divisions' : `${paired.length} of ${plural(playing.length, 'division')} paired${unpairedTeams ? ` · ${plural(unpairedTeams, 'team')} without a game` : ''}${unscheduled.length ? ` · ${plural(unscheduled.length, 'game')} without a time` : ''}`,
      } : {
        key: 'fixtures', title: 'Fixtures',
        state: playing.length && drawn.length === playing.length && !changed.length && !unscheduled.length ? 'done' : drawn.length || games.length ? 'part' : 'none',
        summary: !playing.length ? 'After teams are entered' : `${drawn.length} of ${plural(playing.length, 'division')} drawn${changed.length ? ` · ${changed.length} changed since` : ''}${unscheduled.length ? ` · ${plural(unscheduled.length, 'fixture')} without a time` : ''}`,
      },
    ];
    const nextIndex = steps.findIndex(s => !isFinished(s.state));
    return { steps, complete: nextIndex === -1, nextIndex };
  }, [event, divisions, games, entrants, entrantsByDivision, facilityIds, sports, sites]);
}

export function TournamentHome({
  event, orgId, canEdit, isWide, steps, complete, sports, sites, facilities, facilityIds,
  divisions: allDivisions, games: allGames, entrantsByDivision: allEntrantsByDivision, organizers, onEditOrganizers, hostOrg, viewerOrgIds,
  onOpenSchedule, onOpenResults, onScrollTo, mySportIds = [],
}: {
  event: Event;
  orgId: string;
  canEdit: boolean;
  isWide: boolean;
  steps: TournamentStep[];
  complete: boolean;
  sports: Sport[];
  sites: Site[];
  facilities: Facility[];
  facilityIds: string[];
  divisions: TournamentDivision[];
  games: GameSummary[];
  entrantsByDivision: Map<string, TournamentEntrant[]>;
  organizers: TournamentOrganizer[];
  onEditOrganizers: () => void;
  hostOrg: Organization | null;
  /** The viewer's organisations, to put theirs first. */
  viewerOrgIds: string[];
  /** Fixtures' *Schedule ›*: the Schedule tab is Fixtures' full page. */
  onOpenSchedule: () => void;
  /** A Head to Head's *All results ›*: the Results tab. */
  onOpenResults?: () => void;
  /** Scroll the page to a point measured from the top of this component — the progress bar's jumps. */
  onScrollTo: (y: number) => void;
  /** The sports the viewer organises without running the tournament — theirs to run on the card. */
  mySportIds?: string[];
}) {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';
  const showHelp = useShowFieldHelp();

  /*
   * Mine / All (agreed 2026-10-10, `FIX-31`): for someone outside the organisers with a team in the
   * tournament — the events list's one choice (`useMineAll`), on the line above the cards. Mine
   * narrows what every card is given — the divisions, the rosters and the fixtures — to their teams,
   * so the sections narrow without each one knowing why. Shown only when Mine and All would differ.
   */
  const teamMemberships = useAuthStore((state: any) => state.teamMemberships) || [];
  const myTeamIds = useMemo(() => new Set<string>(teamMemberships.map((m: any) => m.teamId)), [teamMemberships]);
  const myEntrants = useMemo(
    () => Array.from(allEntrantsByDivision.values()).flat().filter(e => !!e.teamId && myTeamIds.has(e.teamId)),
    [allEntrantsByDivision, myTeamIds]
  );
  const offersMine = !canEdit && myEntrants.length > 0;
  const [mineAll, setMineAll] = useMineAll(false);
  const mine = offersMine && mineAll === 'mine';
  const myEntrantIds = new Set(myEntrants.map(e => e.id));
  const divisions = mine ? allDivisions.filter(d => myEntrants.some(e => e.divisionId === d.id)) : allDivisions;
  const games = mine
    ? allGames.filter(g => (g.participants || []).some(p => (!!p.entrantId && myEntrantIds.has(p.entrantId)) || (!!p.teamId && myTeamIds.has(p.teamId))))
    : allGames;
  const entrantsByDivision = useMemo(() => {
    if (!mine) return allEntrantsByDivision;
    const narrowed = new Map<string, TournamentEntrant[]>();
    for (const e of myEntrants) narrowed.set(e.divisionId, [...(narrowed.get(e.divisionId) || []), e]);
    return narrowed;
  }, [mine, allEntrantsByDivision, myEntrants]);

  const [dialog, setDialog] = useState<null | 'details' | 'where' | 'when' | 'gaps' | 'scoring' | 'scheduleAll'>(null);
  const close = () => setDialog(null);
  const eventId = event.id;
  const setupMode = canEdit && !complete;
  const phone = !isWide;

  const sportName = (id?: string | null) => sports.find(s => s.id === id)?.name || '';
  const site = sites.find(s => s.id === event.siteId) || null;
  const usedFacilities = facilities.filter(f => facilityIds.includes(f.id));
  const playing = divisions.filter(d => !!d.sportId);
  const gamesIn = (d: TournamentDivision) => games.filter(g => g.divisionId === d.id);
  const liveGames = games.filter(g => g.status === 'Live');
  const unscheduledCount = games.filter(g => unscheduledIn(g, playing)).length;
  const timeZone = venueTimeZone(site as any, hostOrg as any);
  const today = calendarRangeStatus(event.startDate, event.endDate);
  const onTheDay = !setupMode && (today === 'during' || liveGames.length > 0);
  const stepOf = (key: TournamentStep['key']) => steps.find(s => s.key === key);
  const statusOf = (key: TournamentStep['key']) => (setupMode ? stepOf(key)?.state ?? null : null);

  const dual = isDualEvent(event);
  const sides = dual ? dualSides(event, hostOrg) : null;
  const guestOrg = dual ? (event.participatingOrgs || []).find(o => o.id !== event.orgId && !hasLeft(o.invitation)) : undefined;
  const unpairedOf = (d: TournamentDivision) => dualUnpaired(entrantsByDivision.get(d.id) || [], gamesIn(d));
  /** Not paired yet: no games, and no teams entered by a pairing or by hand. */
  const notPaired = (d: TournamentDivision) => !gamesIn(d).length && !(entrantsByDivision.get(d.id) || []).some(e => isEntrantEntered(e.status));
  const [pairing, setPairing] = useState(false);
  const pairAll = async () => {
    setPairing(true);
    await sendAction(SocketAction.PAIR_DUAL_DIVISIONS, { eventId, orgId });
    setPairing(false);
  };
  const sportsSection = useSportsSection({ event, orgId, sports, divisions, games, entrantsByDivision, canEdit, setupMode, complete, mySportIds, timeZone: venueTimeZone(site as any, hostOrg as any) });
  const orgs = useOrganisationsSection({ event, orgId, sports, divisions, entrantsByDivision, hostOrg, viewerOrgIds, canEdit, setupMode });
  const openSportsPage = () => router.push(`/admin/${orgId}/events/${eventId}/sports` as any);
  const openOrgsPage = () => router.push(`/admin/${orgId}/events/${eventId}/organisations` as any);

  /* ---------------------------------------------------------------- folding and jumping --- */
  /*
   * On a phone, while setting up, a finished card starts folded to its heading and summary; any
   * heading opens or closes it, remembered on the device per tournament (2026-10-09). A wide
   * screen does not fold: its columns keep a long card from pushing the rest out of sight.
   */
  const foldKey = `tournamentCardsFolded:${eventId}`;
  const savedFolds = (useSettingsStore(state => state.localOverrides[foldKey]) || {}) as Record<string, boolean>;
  const setLocalOverride = useSettingsStore(state => state.setLocalOverride);
  const folds = phone && setupMode;
  const isFolded = (key: TournamentStep['key']) => {
    if (!folds) return undefined;
    const st = stepOf(key)?.state;
    return savedFolds[key] ?? (!!st && isFinished(st));
  };
  const setFolded = (key: string, folded: boolean) => setLocalOverride(foldKey, { ...savedFolds, [key]: folded });

  const rootRef = useRef<View>(null);
  const cardRefs = useRef<Record<string, View | null>>({});
  const jump = (key: TournamentStep['key']) => {
    if (isFolded(key)) setFolded(key, false);
    const card = cardRefs.current[key];
    if (!card || !rootRef.current) return;
    card.measureLayout(rootRef.current as any, (_x, y) => onScrollTo(y), () => {});
  };
  const anchor = (key: string, node: React.ReactNode) =>
    node ? <View key={key} ref={ref => { cardRefs.current[key] = ref; }} collapsable={false}>{node}</View> : null;

  /* ---------------------------------------------------------------------------- pieces --- */
  const edit = (onPress: () => void, label = 'Edit') => (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" className="flex-row items-center gap-1" hitSlop={8}>
      {label === 'Edit' ? <Ionicons name="pencil" size={13} color={themeColor(isDark, 'primary')} /> : null}
      <Text className="font-inter-bold text-sm text-primary-ink">{label}</Text>
    </TouchableOpacity>
  );
  const link = (label: string, onPress: () => void) => (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" className="self-start py-1">
      <Text className="font-inter-bold text-[13px] text-primary-ink">{label}</Text>
    </TouchableOpacity>
  );
  /** A heading's way to the section's full page — a link, not a bare icon (2026-10-09). */
  const seeAll = (onPress: () => void, label?: string) => edit(onPress, `${label || (phone ? 'All' : 'See all')} ›`);
  const scoring = event.settings?.scoring;
  const points = scoring?.mode === 'byResult' ? scoring : DEFAULT_SCORING_SYSTEM.mode === 'byResult' ? DEFAULT_SCORING_SYSTEM : null;
  const confirmScoring = () =>
    sendAction(SocketAction.UPDATE_EVENT, { id: eventId, orgId, data: { settings: { ...(event.settings || {}), scoring: DEFAULT_SCORING_SYSTEM } } });
  const pointsTiles = scoring?.mode === 'byPlacing' ? (
    <Text className="font-inter text-sm text-ink-soft">Points are awarded by finishing position.</Text>
  ) : points ? (
    <View className="flex-row gap-1.5">
      {[['Win', points.pointsPerWin], ['Draw', points.pointsPerDraw], ['Loss', points.pointsPerLoss]].map(([k, v]) => (
        <View key={k as string} className="flex-1 rounded-xl bg-sunken items-center py-2">
          <Text className="font-orbitron-bold text-lg text-ink">{v}</Text>
          <Text className="font-inter text-[11px] text-ink-muted">{k}</Text>
        </View>
      ))}
    </View>
  ) : null;

  const facilityChips = usedFacilities.length ? (
    <View className="flex-row flex-wrap gap-1.5">
      {usedFacilities.map(f => (
        <View key={f.id} className="flex-row items-center gap-1.5 rounded-full border border-line pl-1 pr-2.5 py-0.5">
          <FacilityIcon facility={f} sports={sports} size={18} />
          <Text className="font-inter text-xs text-ink-soft">{f.name}</Text>
        </View>
      ))}
    </View>
  ) : null;

  /* ---------------------------------------------------------------------------- banner --- */
  const dayOf = eventDayOfRange(event.startDate, event.endDate);
  const banner = (
    <View className="rounded-2xl border border-line bg-card p-4 gap-3">
      <View className="flex-row gap-3.5 items-center">
        {sides ? (
          // Crest over crest on a phone, where the name needs the width and the banner has the height.
          <View className={`items-center gap-1.5 ${isWide ? 'flex-row' : ''}`}>
            <SideCrest side={sides.host} size={isWide ? 44 : 34} />
            <Text className="font-orbitron-bold text-xs text-ink-muted">V</Text>
            {sides.guest ? <SideCrest side={sides.guest} size={isWide ? 44 : 34} /> : null}
          </View>
        ) : (
          <TournamentMark size={isWide ? 60 : 48} />
        )}
        <View className="flex-1 min-w-0 gap-0.5">
          <View className="flex-row items-center gap-2 flex-wrap">
            <Text className="font-inter-bold text-ink" style={{ fontSize: isWide ? 22 : 19 }}>{event.name}</Text>
            {event.status === 'Cancelled' ? <RowTag tone="cancelled" label="Cancelled" /> : null}
          </View>
          <View className="flex-row flex-wrap items-center gap-3">
            <Text className="font-inter-semibold text-sm text-ink">{formatDateRange(event.startDate, event.endDate, { compact: true })}</Text>
            {today === 'during' && (liveGames.length || dayOf) ? (
              <Text className="font-inter-bold text-sm text-danger-ink">{[dayOf, liveGames.length ? `${liveGames.length} live` : ''].filter(Boolean).join(' · ')}</Text>
            ) : dateCountdown(event.startDate, event.endDate) ? (
              <Text className="font-inter text-sm text-ink-muted">{dateCountdown(event.startDate, event.endDate)}</Text>
            ) : null}
          </View>
          <Text className="font-inter text-sm text-ink-muted" numberOfLines={2}>
            {[site?.name || (setupMode ? 'No venue yet' : ''), (event.sportIds || []).map(sportName).filter(Boolean).join(' · ')].filter(Boolean).join('   ')}
          </Text>
        </View>
        {canEdit ? <View className="self-start">{edit(() => setDialog('details'))}</View> : null}
      </View>
      {setupMode ? (
        <SetupProgress sections={steps.map(s => ({ key: s.key, title: s.title, state: s.state }))} phone={phone} onJump={key => jump(key as TournamentStep['key'])} />
      ) : null}
    </View>
  );

  /* ---------------------------------------------------------------------- the one strip --- */
  /*
   * What the tournament needs next: the first section not finished, in the order the work is done,
   * and its most important task — with the one button that does it (2026-10-09, as on the
   * division page). Once set up, a green line until the tournament starts.
   */
  const strip = (tone: 'wait' | 'go', text: React.ReactNode, action?: { label: string; onPress: () => void }, more?: { label: string; onPress: () => void }) => (
    <View className={`rounded-xl px-3.5 py-2.5 flex-row flex-wrap items-center gap-2.5 ${tone === 'wait' ? 'bg-warning-soft' : 'bg-success-soft'}`}>
      <View className="flex-1 gap-0.5" style={{ minWidth: 200 }}>
        <Text className={`font-inter text-sm leading-snug ${tone === 'wait' ? 'text-warning-ink' : 'text-success-ink'}`}>{text}</Text>
        {more ? (
          <TouchableOpacity onPress={more.onPress} accessibilityRole="link" className="self-start">
            <Text className="font-inter-bold text-sm text-warning-ink underline">{more.label}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {action ? (
        <TouchableOpacity onPress={action.onPress} accessibilityRole="button" className="rounded-xl bg-primary px-3.5 py-2">
          <Text className="font-inter-bold text-[13px] text-on-primary">{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
  const bold = (s: string) => <Text className="font-inter-bold">{s}</Text>;
  const nextStrip = (() => {
    if (!canEdit) return null;
    if (!setupMode) {
      return today === 'before'
        ? strip('go', dual
          ? <>{bold('Set up and ready.')} {guestOrg?.name || 'They'} accepted and every division is paired.</>
          : <>{bold('Set up and ready.')} Every organisation has accepted and every division is drawn.</>)
        : null;
    }
    const next = steps.find(s => !isFinished(s.state));
    if (!next) return null;
    switch (next.key) {
      case 'basics':
        return strip('wait', <>{bold("Start with where it's played")} — the base site and the courts and fields it uses.</>, { label: '＋ Add venue', onPress: () => setDialog('where') });
      case 'divisions':
        return (event.sportIds || []).length
          ? strip('wait', <>{bold('A division has no sport.')} Open it from Sports & divisions and choose one.</>, undefined, { label: 'Sports & divisions', onPress: () => jump('divisions') })
          : strip('wait', <>{bold('Choose the sports being played')} — each gets its first division straight away.</>, { label: '＋ Add a sport', onPress: sportsSection.chooseSports });
      case 'entrants': {
        if (dual) {
          if (!guestOrg) return strip('wait', <>{bold('Choose who you are playing.')}</>, orgs.addOrganisation ? { label: '＋ Choose', onPress: orgs.addOrganisation } : undefined);
          if (guestOrg.invitation === 'not_invited') {
            return strip('wait', <>{bold(`${guestOrg.name} is not invited yet`)} — they can't see this until invited. Pair the divisions first if you'd like them to see the games.</>, { label: 'Invite', onPress: orgs.inviteAll });
          }
          if (guestOrg.invitation === 'withdrawal_pending') return strip('wait', <>{bold(`${guestOrg.name} asks to withdraw.`)}</>, undefined, { label: 'Playing against', onPress: () => jump('entrants') });
          return strip('wait', <>{bold(`Waiting for ${guestOrg.name} to accept.`)} They see the days, the divisions and the pairings before answering.</>);
        }
        if (!playing.length && !orgs.orgRows.some(r => !r.isHost)) {
          return strip('wait', <>{bold('Add the organisations taking part.')} You can enter their teams once there are divisions.</>, orgs.addOrganisation ? { label: '＋ Add organisation', onPress: orgs.addOrganisation } : undefined);
        }
        const more = orgs.warnings.length ? { label: `${plural(orgs.warnings.length, 'more thing')} to sort out`, onPress: () => jump('entrants') } : undefined;
        if (orgs.notInvited.length) {
          const n = orgs.notInvited.length;
          return strip('wait', <>{bold(n === 1 ? `${orgs.notInvited[0].name} is not invited yet` : `${n} organisations are not invited yet`)} — {n === 1 ? 'it' : 'they'} can't see this {dual ? 'Head to Head' : 'tournament'} until invited.</>, { label: n === 1 ? 'Invite' : `Invite all ${n}`, onPress: orgs.inviteAll }, more);
        }
        const [first, ...rest] = orgs.warnings;
        if (first) {
          return strip('wait', bold(first.text), first.actionLabel && first.onAction ? { label: first.actionLabel, onPress: first.onAction } : undefined,
            rest.length ? { label: `${plural(rest.length, 'more thing')} to sort out`, onPress: () => jump('entrants') } : undefined);
        }
        return strip('wait', <>{bold('Enter the teams taking part')} — from each organisation's page, or each division's.</>, undefined, { label: 'Organisations & teams', onPress: () => jump('entrants') });
      }
      case 'scoring':
        return strip('wait', <>{bold('Scoring runs on the default 3 / 1 / 0.')} Confirm it, or change it, before the first result is entered.</>, { label: 'Confirm', onPress: confirmScoring });
      case 'fixtures': {
        if (dual) {
          const unpairedDivisions = playing.filter(notPaired).length;
          if (unpairedDivisions) {
            return strip('wait', <>{bold(`${plural(unpairedDivisions, 'division')} still to pair.`)} Each of your teams plays the other side's team in the same place: A v A, B v B.</>, guestOrg ? { label: pairing ? 'Pairing…' : 'Pair all', onPress: pairAll } : undefined);
          }
          const alone = playing.reduce((n, d) => n + unpairedOf(d).length, 0);
          if (alone) return strip('wait', <>{bold(`${plural(alone, 'team')} without a game.`)} Give each an opponent, or leave it out, on its division's page.</>, undefined, { label: 'Pairings', onPress: () => jump('fixtures') });
          return strip('wait', <>{bold(`${plural(unscheduledCount, 'game')} without a time.`)}</>, { label: 'Schedule all', onPress: () => setDialog('scheduleAll') });
        }
        const undrawn = playing.filter(d => !gamesIn(d).length).length;
        if (!undrawn && unscheduledCount) {
          return strip('wait', <>{bold(`${plural(unscheduledCount, 'fixture')} without a time.`)} Fixtures is done once every division is scheduled.</>, { label: 'Schedule all', onPress: () => setDialog('scheduleAll') });
        }
        return strip('wait', <>{bold(undrawn ? `${plural(undrawn, 'division')} still to draw.` : 'Some draws have changed since they were made.')} Each division is drawn on its own page.</>, undefined, { label: 'Fixtures', onPress: () => jump('fixtures') });
      }
    }
  })();

  /* ----------------------------------------------------------------------------- cards --- */
  const cardProps = (key: TournamentStep['key']) => ({
    status: statusOf(key),
    folded: isFolded(key),
    summary: stepOf(key)?.summary,
    onToggle: () => setFolded(key, !isFolded(key)),
  });

  const whereCard = site || usedFacilities.length ? (
    <TournamentCard title="Where" {...cardProps('basics')} right={canEdit ? edit(() => setDialog('where')) : undefined}>
      <View className="gap-2.5">
        {site ? (
          <View>
            <Text className="font-inter-bold text-sm text-ink">{site.name}</Text>
            {addressText(site.address) ? <Text className="font-inter text-xs text-ink-muted">{addressText(site.address)}</Text> : null}
          </View>
        ) : null}
        {facilityChips}
        {/* The map is for the people coming: not while it is being set up. */}
        {!setupMode && site?.address?.latitude != null && site?.address?.longitude != null ? (
          <AddressMap latitude={site.address.latitude} longitude={site.address.longitude} title={site.name} interactive={false} height={isWide ? 200 : 170} markers={facilityMarkers(usedFacilities, sports, isDark)} />
        ) : null}
      </View>
    </TournamentCard>
  ) : canEdit ? (
    <TournamentCard title="Where" {...cardProps('basics')}>
      <View className="gap-1">
        <Text className="font-inter text-[13px] text-ink-muted">Add where it is played — the base site, and the courts, fields and amenities it uses.</Text>
        {link('＋ Add venue', () => setDialog('where'))}
      </View>
    </TournamentCard>
  ) : null;

  /*
   * When (Phase 7, agreed 2026-10-11): its own section, listing each playing day and its hours —
   * the banner says only the span. Days need not follow each other.
   */
  const playingDays = event.days || [];
  const whenCard = playingDays.length ? (
    <TournamentCard title="When" count={plural(playingDays.length, 'day')} {...cardProps('when')} right={canEdit ? edit(() => setDialog('when')) : undefined}>
      <View className="gap-1.5">
        <View>
          {playingDays.map((d, i) => (
            <View key={d.day} className={`flex-row items-center justify-between gap-3 py-1 ${i ? 'border-t border-line-soft' : ''}`}>
              <Text className="font-inter text-sm text-ink">{formatPlayingDay(d.day)}</Text>
              <Text className="font-inter text-sm text-ink">{d.dayStarts} – {d.dayEnds}</Text>
            </View>
          ))}
        </View>
        <Text className="font-inter text-xs text-ink-muted">When the first games start and by when the last must end, at the venue.</Text>
      </View>
    </TournamentCard>
  ) : canEdit ? (
    <TournamentCard title="When" {...cardProps('when')}>
      <View className="gap-1">
        <Text className="font-inter text-[13px] text-ink-muted">Add the days it is played, and their hours — what the schedule fits the fixtures into.</Text>
        {link('＋ Add playing days', () => setDialog('when'))}
      </View>
    </TournamentCard>
  ) : null;

  const hasSports = (event.sportIds || []).length > 0;
  const sportsCard = hasSports ? (
    <TournamentCard
      title="Sports & divisions"
      count={divisions.length}
      {...cardProps('divisions')}
      right={narrow => (
        <>
          {sportsSection.addSport ? edit(sportsSection.addSport, narrow || phone ? '＋ Add' : '＋ Add a sport') : null}
          {seeAll(openSportsPage)}
        </>
      )}
    >
      <View className="gap-3">
        {(setupMode ? showHelp : true) ? (
          <Text className="font-inter text-[13px] text-ink-muted leading-relaxed">
            {setupMode ? (
              <>
                <Text className="font-inter-semibold text-ink-soft">Choose the sports being played, then the divisions within each. </Text>
                {dual
                  ? 'Each sport gets a division for every age group your teams play in, e.g. Rugby U13; each of your teams there plays its counterpart. Add or remove divisions as you need.'
                  : 'A division is a group of teams that compete against each other — usually an age group, e.g. Rugby U16. Each division has its own draw and table, and teams are entered into a division. A sport can have one division or several.'}
              </>
            ) : dual ? 'A division is one age group of a sport, e.g. Rugby U13, where each of your teams plays its counterpart.' : 'A division is a group of teams that compete against each other — usually an age group, e.g. Rugby U16.'}
          </Text>
        ) : null}
        <SportsDivisions
          dual={dual}
          sports={sports}
          sportIds={mine ? (event.sportIds || []).filter(id => divisions.some(d => d.sportId === id)) : event.sportIds || []}
          divisions={divisions}
          entrantsByDivision={entrantsByDivision}
          divisionState={sportsSection.divisionState}
          isWide={isWide}
          attention={sportsSection.attention}
          onOpenDivision={sportsSection.openDivision}
          onAddDivision={sportsSection.addDivision}
          canAddDivision={sportsSection.canAddDivision}
          sportMenu={sportsSection.sportMenu}
        />
      </View>
    </TournamentCard>
  ) : canEdit ? (
    <TournamentCard title="Sports & divisions" {...cardProps('divisions')}>
      <View className="gap-1">
        <Text className="font-inter text-[13px] text-ink-muted">Choose the sports being played — each gets its first division straight away.</Text>
        {link('＋ Add a sport', sportsSection.chooseSports)}
      </View>
    </TournamentCard>
  ) : null;

  const beforeDivisions = !playing.length;
  // Mine: only the organisations with a team of the viewer's in it.
  const orgRowsShown = mine ? orgs.visibleRows.filter(r => r.teams + r.players + r.toBeNamed > 0) : orgs.visibleRows;
  const orgsCard = orgRowsShown.length || canEdit ? (
    <TournamentCard
      title={dual ? 'Playing against' : canEdit ? 'Organisations & teams' : 'Taking part'}
      count={dual ? undefined : orgRowsShown.length}
      {...cardProps('entrants')}
      right={narrow => (
        <>
          {setupMode ? <WarningsCount count={orgs.warnings.length} /> : null}
          {/* A Head to Head plays one organisation: once it has one, there is nobody to add. */}
          {orgs.addOrganisation && !onTheDay && !(dual && guestOrg) ? edit(orgs.addOrganisation, dual ? '＋ Choose' : narrow || phone ? '＋ Add' : '＋ Add organisation') : null}
          {orgRowsShown.length ? seeAll(openOrgsPage) : null}
        </>
      )}
    >
      <View className="gap-2.5">
        {setupMode && beforeDivisions ? (
          <Text className="font-inter text-[13px] text-ink-muted">Teams are entered into divisions, so entering starts once there are some. Organisations can be added and invited now.</Text>
        ) : null}
        <WarningsList warnings={orgs.warnings} limit={3} onMore={openOrgsPage} />
        {canEdit ? <NotInvitedBox count={orgs.notInvited.length} nobodyYet={orgs.nobodyInvited} onInviteAll={orgs.inviteAll} subject={dual ? 'Head to Head' : 'tournament'} orgName={dual ? guestOrg?.name : undefined} /> : null}
        <View>
          <OrgsList rows={orgRowsShown} isWide={isWide} showInvitations={canEdit} onOpen={canEdit ? orgs.openOrg : undefined} highlightOrgId={orgs.highlightOrgId} beforeDivisions={setupMode && beforeDivisions} />
          <UnnamedList entrants={orgs.unnamed} divisionName={orgs.divisionName} onOpen={canEdit ? orgs.openUnnamed : undefined} />
        </View>
        {setupMode && !beforeDivisions ? (
          <Text className="font-inter text-xs text-ink-muted">Tap an organisation to enter its teams or change its invitation. To enter teams one division at a time, open the division under Sports & divisions.</Text>
        ) : null}
        {orgs.addingLine}
      </View>
    </TournamentCard>
  ) : null;

  const rulesCard = dual ? null : (
    <TournamentCard
      title="Rules & scoring"
      {...cardProps('scoring')}
      right={canEdit ? <>{edit(() => setDialog('scoring'))}</> : undefined}
    >
      <View className="gap-2.5">
        {pointsTiles}
        {canEdit && !scoring ? (
          <View className="flex-row items-center gap-2.5 flex-wrap rounded-xl bg-sunken px-3 py-2">
            <Text className="font-inter text-[13px] text-ink-soft flex-1" style={{ minWidth: 160 }}>The default. Confirm it, or change it, before the first result is entered.</Text>
            <TouchableOpacity onPress={confirmScoring} accessibilityRole="button" className="rounded-xl border border-line bg-card px-3 py-1.5">
              <Text className="font-inter-bold text-[13px] text-ink">Confirm</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </TournamentCard>
  );

  /*
   * Fixtures, in every phase (2026-10-09). While setting up, the divisions still to draw come
   * first, so what is outstanding is at the top. On the day, what is next up. Its full page is the
   * Schedule tab.
   */
  const divisionRow = (d: TournamentDivision, i: number) => (
    <TouchableOpacity key={d.id} onPress={() => sportsSection.openDivision(d)} accessibilityRole="link" className={`flex-row items-center gap-2 py-2 ${i ? 'border-t border-line-soft' : ''}`}>
      <Text className="flex-1 font-inter-semibold text-sm text-ink" numberOfLines={1}>{divisionFullName(d.name, sportName(d.sportId))}</Text>
      <DivisionStateLine state={sportsSection.divisionState(d)} />
      <Ionicons name="chevron-forward" size={14} color={themeColor(isDark, 'ink-muted')} />
    </TouchableOpacity>
  );
  const groupLabel = (label: string) => (
    <Text className="font-inter-bold text-[11px] text-ink-muted uppercase tracking-wider mt-2">{label}</Text>
  );
  const meter = (done: number, total: number) => (
    <View className="h-1.5 rounded-full bg-line-strong overflow-hidden">
      <View className="h-full bg-success" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
    </View>
  );
  /*
   * The divisions still to draw, by their entries (`FIX-31`): open — with why each cannot lock yet,
   * or that it is ready — and locked, to draw. *Lock all* sits on the open group, since that is what
   * it acts on; it locks what it can and says why the rest stay open.
   */
  const gapsOf = (d: TournamentDivision) => entryLockGaps(entrantsByDivision.get(d.id) || [], event);
  const [lockAll, setLockAll] = useState(false);
  const [lockingAll, setLockingAll] = useState(false);
  const entryRow = (d: TournamentDivision, i: number) => {
    const gaps = gapsOf(d);
    const locked = !!d.entriesLockedAt;
    const teams = (entrantsByDivision.get(d.id) || []).filter(e => isEntrantEntered(e.status)).length;
    const late = (entrantsByDivision.get(d.id) || []).filter(e => e.status === 'requested').length;
    const note = locked
      ? `${plural(teams, 'team')}${late ? ` · ${late} ${late === 1 ? 'asks' : 'ask'} to enter late` : ''}`
      : gaps.total ? lockGapsLine(gaps) : `All ${plural(teams, 'team')} answered — ready to lock`;
    const warn = (!locked && gaps.total > 0) || (locked && late > 0);
    return (
      <TouchableOpacity key={d.id} onPress={() => sportsSection.openDivision(d)} accessibilityRole="link" className={`flex-row items-center gap-2 py-2 ${i ? 'border-t border-line-soft' : ''}`}>
        <View className="flex-1 min-w-0">
          <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>{divisionFullName(d.name, sportName(d.sportId))}</Text>
          <Text className={`font-inter text-xs ${warn ? 'text-warning-ink' : 'text-ink-muted'}`} numberOfLines={1}>{note}</Text>
        </View>
        <View className="rounded-full bg-sunken px-2 py-0.5"><Text className="font-inter-semibold text-[11px] text-ink-soft">{locked ? '🔒 Locked' : 'Entries open'}</Text></View>
        <Ionicons name="chevron-forward" size={14} color={themeColor(isDark, 'ink-muted')} />
      </TouchableOpacity>
    );
  };
  const pairingRow = (d: TournamentDivision, i: number) => {
    const n = gamesIn(d).filter(g => g.status !== 'Cancelled').length;
    const alone = unpairedOf(d);
    const orgName = (id?: string) => (event.participatingOrgs || []).find(o => o.id === id)?.name || '';
    return (
      <TouchableOpacity key={d.id} onPress={() => sportsSection.openDivision(d)} accessibilityRole="link" className={`flex-row items-center gap-2 py-2 ${i ? 'border-t border-line-soft' : ''}`}>
        <View className="flex-1 min-w-0">
          <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>{divisionFullName(d.name, sportName(d.sportId))}</Text>
          <Text className={`font-inter text-xs ${alone.length && n ? 'text-warning-ink' : 'text-ink-muted'}`} numberOfLines={1}>
            {notPaired(d) ? 'Not paired yet' : alone.length ? `${plural(n, 'game')} · ${alone.map(e => `${orgName(e.orgId)} ${e.name || e.label || ''}`.trim()).join(', ')} without a game` : `${plural(n, 'game')} · paired`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={themeColor(isDark, 'ink-muted')} />
      </TouchableOpacity>
    );
  };
  const pairingsBody = (() => {
    if (!playing.length) return <Text className="font-inter text-[13px] text-ink-muted">Each division is paired once there are some.</Text>;
    const unpairedDivisions = playing.filter(notPaired);
    return (
      <View className="gap-1.5">
        {meter(playing.length - unpairedDivisions.length, playing.length)}
        {canEdit && unpairedDivisions.length && guestOrg && !onTheDay ? (
          <View className="flex-row items-center gap-2.5 flex-wrap rounded-xl bg-sunken px-3 py-2">
            <Text className="font-inter text-[13px] text-ink-soft flex-1" style={{ minWidth: 160 }}>
              {plural(unpairedDivisions.length, 'division')} not paired yet. Pairing enters both sides' teams and puts A v A, B v B.
            </Text>
            <TouchableOpacity onPress={pairAll} disabled={pairing} accessibilityRole="button" className="rounded-xl border border-line bg-card px-3 py-1.5">
              <Text className="font-inter-bold text-[13px] text-ink">{pairing ? 'Pairing…' : 'Pair all automatically'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <View>{playing.map(pairingRow)}</View>
      </View>
    );
  })();
  const fixturesBody = (() => {
    if (!playing.length) {
      return <Text className="font-inter text-[13px] text-ink-muted">Each division is drawn on its own, once its teams are in.</Text>;
    }
    if (setupMode) {
      const toDraw = playing.filter(d => !gamesIn(d).length);
      const open = toDraw.filter(d => !d.entriesLockedAt);
      const lockedToDraw = toDraw.filter(d => !!d.entriesLockedAt);
      const drawn = playing.filter(d => gamesIn(d).length);
      const toSchedule = drawn.filter(d => gamesIn(d).some(g => unscheduledIn(g, playing)));
      // A draw that has changed since it was made is outstanding too: it leads the drawn ones.
      const drawnSorted = [...drawn].sort((a, b) => Number(sportsSection.divisionState(b).tone === 'wait') - Number(sportsSection.divisionState(a).tone === 'wait'));
      return (
        <View className="gap-1.5">
          {meter(drawn.length, playing.length)}
          <Text className="font-inter text-[13px] text-ink-muted">{drawn.length} of {plural(playing.length, 'division')} drawn. Each division is drawn on its own page, once its teams are in.</Text>
          {open.length ? (
            <View>
              <View className="flex-row items-center gap-2 mt-2">
                <Text className="flex-1 font-inter-bold text-[11px] text-ink-muted uppercase tracking-wider">Entries open · {open.length}</Text>
                {canEdit ? (
                  <TouchableOpacity onPress={() => setLockAll(true)} accessibilityRole="button">
                    <Text className="font-inter-bold text-[13px] text-primary-ink">🔒 Lock all…</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {open.map(entryRow)}
            </View>
          ) : null}
          {lockedToDraw.length ? <View>{groupLabel(`Locked, to draw · ${lockedToDraw.length}`)}{lockedToDraw.map(entryRow)}</View> : null}
          {canEdit && toSchedule.length ? (
            <View className="flex-row items-center gap-2.5 flex-wrap rounded-xl bg-sunken px-3 py-2 mt-1">
              <Text className="font-inter text-[13px] text-ink-soft flex-1" style={{ minWidth: 160 }}>{plural(toSchedule.length, 'drawn division')} with fixtures that have no time yet.</Text>
              <TouchableOpacity onPress={() => setDialog('scheduleAll')} accessibilityRole="button" className="rounded-xl border border-line bg-card px-3 py-1.5">
                <Text className="font-inter-bold text-[13px] text-ink">Schedule all</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {drawn.length ? <View>{groupLabel(`Drawn · ${drawn.length}`)}{drawnSorted.map(divisionRow)}</View> : null}
          {link('＋ Add a fixture by hand', () => router.push(`/admin/${orgId}/events/${eventId}/games/new`))}
        </View>
      );
    }
    if (onTheDay) {
      const played = games.filter(g => g.status === 'Finished').length;
      const counted = games.filter(g => g.status !== 'Cancelled').length;
      const nextUp = games
        .filter(g => g.status === 'Scheduled' && g.startTime && whenMs(g.startTime) >= Date.now() - 60 * 60 * 1000)
        .sort((a, b) => whenMs(a.startTime) - whenMs(b.startTime))
        .slice(0, 3);
      return (
        <View className="gap-1.5">
          {meter(played, counted)}
          <Text className="font-inter text-[13px] text-ink-muted">{played} of {counted} played</Text>
          {nextUp.length ? (
            <View>
              {groupLabel('Next up')}
              {nextUp.map((g, i) => {
                const [home, away] = g.participants || [];
                const division = divisions.find(d => d.id === g.divisionId);
                return (
                  <TouchableOpacity key={g.id} onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/${g.id}/view`)} accessibilityRole="link" className={`py-2 ${i ? 'border-t border-line-soft' : ''}`}>
                    <View className="flex-row items-center gap-2">
                      <FixtureSideFitted names={fixtureSideNames(home, orgId)} participant={home} align="left" />
                      <Text className="font-inter-semibold text-xs text-ink-muted" style={{ minWidth: 40, textAlign: 'center' }}>{g.timeTbd ? 'TBD' : formatKickoffTime(g.startTime)}</Text>
                      <FixtureSideFitted names={fixtureSideNames(away, orgId)} participant={away} align="right" />
                    </View>
                    <Text className="font-inter text-xs text-ink-muted mt-1" numberOfLines={1}>
                      {[division ? divisionFullName(division.name, sportName(division.sportId)) : '', facilities.find(f => f.id === g.facilityId)?.name].filter(Boolean).join(' · ')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>
      );
    }
    const total = games.filter(g => g.status !== 'Cancelled').length;
    return (
      <View className="gap-1.5">
        <Text className="font-inter text-[13px] text-ink-muted">{plural(playing.length, 'division')} · {plural(total, 'fixture')}</Text>
        <View>{playing.map(divisionRow)}</View>
      </View>
    );
  })();
  const openToDraw = playing.filter(d => !gamesIn(d).length && !d.entriesLockedAt);
  const readyToLock = openToDraw.filter(d => gapsOf(d).total === 0);
  const stayOpen = openToDraw.filter(d => gapsOf(d).total > 0);
  const lockAllDialog = (
    <EditDialog
      visible={lockAll}
      title={readyToLock.length ? `Lock entries in ${plural(readyToLock.length, 'division')}?` : 'No division can be locked yet'}
      onClose={() => setLockAll(false)}
      onSave={readyToLock.length ? async () => {
        setLockingAll(true);
        const result = await sendAction(SocketAction.LOCK_EVENT_DIVISIONS, { eventId: event.id, orgId });
        setLockingAll(false);
        if (result.ok) setLockAll(false);
      } : undefined}
      saveLabel={`🔒 Lock ${plural(readyToLock.length, 'division')}`}
      isSaving={lockingAll}
    >
      <Text className="font-inter text-sm text-ink leading-relaxed">Once locked, a team leaves only by withdrawing, which you confirm, and an organisation can ask to enter late. You can unlock a division from its page.</Text>
      {readyToLock.length ? (
        <View className="gap-1">
          <Text className="font-inter-semibold text-[13px] text-ink-soft">Ready to lock</Text>
          {readyToLock.map(d => <Text key={d.id} className="font-inter text-[13px] text-ink">✓ {divisionFullName(d.name, sportName(d.sportId))}</Text>)}
        </View>
      ) : null}
      {stayOpen.length ? (
        <View className="gap-1">
          <Text className="font-inter-semibold text-[13px] text-ink-soft">Stays open</Text>
          {stayOpen.map(d => (
            <Text key={d.id} className="font-inter text-[13px] text-warning-ink">– {divisionFullName(d.name, sportName(d.sportId))}: {lockGapsLine(gapsOf(d))}</Text>
          ))}
        </View>
      ) : null}
    </EditDialog>
  );
  const fixturesCard = (
    <TournamentCard
      title={dual ? 'Pairings' : 'Fixtures'}
      count={dual && games.length ? plural(games.filter(g => g.status !== 'Cancelled').length, 'game') : undefined}
      {...cardProps('fixtures')}
      right={<>{playing.length ? seeAll(onOpenSchedule, 'Schedule') : null}</>}
    >
      {dual ? pairingsBody : fixturesBody}
      {/* The scheduling gaps (Phase 7): how the scheduler spaces games, so they sit with the fixtures, not under When. */}
      <View className="flex-row items-center gap-3 border-t border-line-soft pt-2.5 mt-1">
        <View className="flex-1 min-w-0">
          <Text className="font-inter text-xs text-ink-muted">Scheduling</Text>
          <Text className="font-inter text-sm text-ink">{gapsLine(event.gapBetweenGamesMin ?? 5, event.minTeamBreakMin ?? 0)}</Text>
        </View>
        {canEdit ? edit(() => setDialog('gaps')) : null}
      </View>
      {lockAllDialog}
    </TournamentCard>
  );

  const liveCard = liveGames.length ? (
    <TournamentCard
      title={<View className="flex-row items-center gap-2"><View className="w-2 h-2 rounded-full bg-danger" /><Text className="font-inter-bold text-[18px] text-ink">Live now</Text></View>}
      count={liveGames.length}
      right={seeAll(onOpenSchedule, 'Schedule')}
    >
      <View>
        {liveGames.slice(0, 6).map((g, i) => {
          const [home, away] = g.participants || [];
          const scores = sideScores(g);
          const division = divisions.find(d => d.id === g.divisionId);
          return (
            <TouchableOpacity key={g.id} onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/${g.id}/view`)} accessibilityRole="link" className={`py-2 ${i ? 'border-t border-line-soft' : ''}`} style={{ maxWidth: 560 }}>
              <View className="flex-row items-center gap-2">
                <FixtureSideFitted names={fixtureSideNames(home, orgId)} participant={home} align="left" />
                <View className="items-center" style={{ minWidth: 52 }}>
                  <Text className="font-orbitron-bold text-[15px] text-danger-ink">{scores ? `${scores[0]} – ${scores[1]}` : 'Live'}</Text>
                </View>
                <FixtureSideFitted names={fixtureSideNames(away, orgId)} participant={away} align="right" />
              </View>
              <Text className="font-inter text-xs text-ink-muted mt-1" numberOfLines={1}>
                {[g.periodLabel, facilities.find(f => f.id === g.facilityId)?.name, division ? divisionFullName(division.name, sportName(division.sportId)) : ''].filter(Boolean).join(' · ')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </TournamentCard>
  ) : null;

  const anyPlayed = games.some(g => g.status === 'Finished' || g.status === 'Live');
  const resultsCard = dual && (anyPlayed || onTheDay) ? (
    <DualResultsCard event={event} hostOrg={hostOrg} divisions={divisions} games={games} sports={sports} onOpenAll={onOpenResults || onOpenSchedule} />
  ) : null;

  const organizersCard = canEdit && organizers.length ? (
    <TournamentCard title="Organisers" right={edit(onEditOrganizers)}>
      <View>
        {organizers.map((o, i) => (
          <View key={o.orgProfileId} className={`flex-row items-center gap-2 py-1.5 ${i ? 'border-t border-line-soft' : ''}`}>
            <Text className="flex-1 font-inter text-sm text-ink" numberOfLines={1}>{o.name || 'Organiser'}</Text>
            {o.orgShortName ? <Text className="font-inter text-xs text-ink-muted">{o.orgShortName}</Text> : null}
          </View>
        ))}
      </View>
    </TournamentCard>
  ) : null;

  /*
   * The viewer's own organisation, invited and not simply taking part (`FIX-30`): "Valley Prep has
   * invited you", with Accept and Decline — or where its request to withdraw, or its answer, stands.
   * The same card as on its page, which this links to for its teams.
   */
  const myUserId = useAuthStore((state: any) => state.user?.id);
  const myMemberships = useAuthStore((state: any) => state.orgMemberships) || [];
  /** An admin of that organisation — who may answer for it; staff may not (`FIX-31`). */
  const adminsOrg = (id: string) => myMemberships.some((m: any) => m.orgId === id && m.roleId === 'role-org-admin' && (!m.endDate || new Date(m.endDate) > new Date()));
  const myInvitations = canEdit ? [] : (event.participatingOrgs || []).filter(o => o.id !== event.orgId && viewerOrgIds.includes(o.id) && o.invitation !== 'accepted' && o.invitation !== 'not_invited');
  const invitationBanners = myInvitations.map(o => (
    <View key={o.id} className="gap-1.5">
      <OrganisationResponse
        event={event}
        orgId={orgId}
        org={o}
        isHost={false}
        viewer="organisation"
        canAnswer={adminsOrg(o.id)}
        hostName={hostOrg?.name || 'the organisers'}
        history={null}
        myUserId={myUserId}
        wide={false}
        onRemove={() => {}}
      />
      {link(`${o.name}'s page in this tournament ›`, () => orgs.openOrg(o.id))}
    </View>
  ));

  /* ---------------------------------------------------------------------------- layout --- */
  /*
   * The order follows the moment, but stays put while setting up (2026-10-09: sections jumping
   * around as they are finished would confuse). Setting up and set up: the big sections on the
   * left, the small ones on the right. On the day: Live now leads. For anyone who cannot edit:
   * what is played and where, then who is taking part.
   *
   * Three columns once the page is wide enough (2026-10-11, `LAYOUT.threeColumnsMinWidth`): the
   * same order read left to right, each big section given a column of its own rather than stretched.
   */
  const [rootWidth, setRootWidth] = useState(0);
  const three = isWide && rootWidth >= LAYOUT.threeColumnsMinWidth;
  const live = anchor('live', liveCard), sportsA = anchor('divisions', sportsCard), fixturesA = anchor('fixtures', fixturesCard);
  const whenA = anchor('when', whenCard);
  const whereA = anchor('basics', whereCard), orgsA = anchor('entrants', orgsCard), rulesA = anchor('scoring', rulesCard), organizersA = anchor('organizers', organizersCard);
  const columns = onTheDay
    ? three
      ? [[live, fixturesA], [sportsA, orgsA], [whereA, whenA, rulesA, organizersA]]
      : [[live, sportsA, fixturesA], [whereA, whenA, orgsA, rulesA, organizersA]]
    : !canEdit
      ? three
        ? [[sportsA, fixturesA], [whereA, whenA, rulesA], [orgsA]]
        : [[sportsA, fixturesA], [whereA, whenA, orgsA, rulesA]]
      : three
        ? [[sportsA], [orgsA], [whereA, whenA, rulesA, fixturesA, organizersA]]
        : [[sportsA, orgsA], [whereA, whenA, rulesA, fixturesA, organizersA]];
  // A Head to Head's results lead once anything is played (`H2H-1`).
  const resultsA = anchor('results', resultsCard);
  if (resultsA) columns[0].unshift(resultsA);

  // The teams this viewer answers for, still invited: theirs as coach, or any of an organisation they admin.
  const coachTeamIds = new Set<string>(teamMemberships.filter((m: any) => m.roleId === 'role-coach' || m.roleId === 'role-assistant-coach').map((m: any) => m.teamId));
  const invitationOf = (id?: string) => event.participatingOrgs?.find(o => o.id === id)?.invitation;
  const myTeamInvitations = canEdit ? [] : Array.from(allEntrantsByDivision.values()).flat().filter(e =>
    e.status === 'invited' && !allDivisions.find(d => d.id === e.divisionId)?.entriesLockedAt &&
    ((!!e.teamId && coachTeamIds.has(e.teamId)) || (!!e.orgId && adminsOrg(e.orgId))) &&
    !hasLeft(invitationOf(e.orgId) || 'accepted'));
  const mineLine = offersMine ? (
    <View className={isWide ? 'flex-row items-center gap-3' : 'gap-1'}>
      <SegmentedControl
        fit
        isCompact
        value={mineAll}
        onChange={key => setMineAll(key as 'mine' | 'all')}
        options={[{ key: 'mine', label: 'Mine' }, { key: 'all', label: 'All' }]}
      />
      <Text className="font-inter text-xs text-ink-muted">
        {mine ? `Showing ${[...new Set(myEntrants.map(e => e.name).filter(Boolean))].join(', ')}` : 'Showing the whole tournament'}
      </Text>
    </View>
  ) : null;

  return (
    <View ref={rootRef} collapsable={false} className="gap-4" onLayout={e => setRootWidth(e.nativeEvent.layout.width)}>
      {invitationBanners}
      {banner}
      <TeamInvitationRows
        entrants={myTeamInvitations}
        orgId={orgId}
        eventName={event.name}
        divisionName={id => { const d = allDivisions.find(x => x.id === id); return d ? divisionFullName(d.name, sportName(d.sportId)) : ''; }}
        orgName={id => event.participatingOrgs?.find(o => o.id === id)?.name || 'Your organisation'}
      />
      {nextStrip}
      {mineLine}
      {isWide ? (
        <View className="flex-row gap-4 items-start">
          {columns.map((cards, i) => (
            <View key={i} className="gap-4 min-w-0" style={{ flex: !three && i === 0 ? 1.15 : 1 }}>{cards}</View>
          ))}
        </View>
      ) : (
        <>{columns.flat()}</>
      )}

      {sportsSection.dialogs}
      {orgs.dialogs}
      {canEdit ? (
        <>
          <EditTournamentDialog visible={dialog === 'details'} event={event} orgId={orgId} onClose={close} />
          <WhereDialog visible={dialog === 'where'} event={event} orgId={orgId} sites={sites} facilities={facilities} facilityIds={facilityIds} onClose={close} />
          <ScoringDialog visible={dialog === 'scoring'} event={event} orgId={orgId} onClose={close} />
          <WhenDialog visible={dialog === 'when'} event={event} orgId={orgId} games={allGames} timeZone={timeZone} onClose={close} />
          <GapsDialog visible={dialog === 'gaps'} event={event} orgId={orgId} onClose={close} />
          <ScheduleAllDialog visible={dialog === 'scheduleAll'} event={event} divisions={allDivisions} games={allGames} sports={sports} orgId={orgId} onClose={close} />
        </>
      ) : null}
    </View>
  );
}
