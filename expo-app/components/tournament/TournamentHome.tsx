import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  DEFAULT_SCORING_SYSTEM,
  Event,
  Facility,
  GameSummary,
  Organization,
  Site,
  SocketAction,
  Sport,
  TournamentDivision,
  TournamentEntrant,
  TournamentOrganizer,
  divisionAutoName,
  drawChanges,
} from '@sk/shared';
import { OverflowMenu } from '../OverflowMenu';
import { AddressMap } from '../address/AddressMap';
import { facilityMarkers } from '../address/facilityMarker';
import { FacilityIcon, addressText } from '../sites/SiteBits';
import { FixtureSideFitted, RowTag, TournamentMark, fixtureSideNames, sideScores } from '../events/EventBits';
import { useShowFieldHelp } from '../FieldLabel';
import { DivisionState, SchoolRow, SchoolsList, SportsDivisions, StepNumber, StepPills, StepProgressBar, StepState, isFinished } from './TournamentBits';
import { EditTournamentDialog, ScoringDialog, SportsDialog, WhereDialog } from './TournamentDialogs';
import { sendAction } from '../../services/actions';
import { useActiveTheme, useSettingsStore } from '../../store/settingsStore';
import { calendarRangeStatus, dateCountdown, eventDayOfRange, formatDateRange } from '../../utils/dates';
import { themeColor } from '../../constants/Colors';

/**
 * The tournament page's first tab (docs/events.md, stage 2; mockups/tournament-read-first.html).
 *
 * **While it is being set up** an organiser's first tab is *Setting up*, and that tab is the setup
 * itself: five numbered cards in the order the work is done, each saying in its heading whether it
 * is done and holding what it is about, read-first, with Edit. There is no separate checklist —
 * the numbers, the pills and the segmented bar are the checklist (closes `UI-11`). Done and
 * waiting steps fold to one line; the step to do next is open.
 *
 * **Once every step is finished** — or for anyone who cannot edit — it is the *Overview*: the
 * tournament as everyone sees it. Every card keeps its Edit for an organiser.
 */

export type StepKey = 'basics' | 'divisions' | 'entrants' | 'scoring' | 'fixtures';

export interface TournamentStep {
  key: StepKey;
  title: string;
  state: StepState;
  /** The folded line: what has been decided, or what it waits for. */
  summary: string;
  /** A step the organiser may mark "not needed" (`settings.dismissedSetupSteps`). */
  dismissible: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Where each setup step stands, from the state of the data — never from having been visited (U17). */
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
    const dismissed = event.settings?.dismissedSetupSteps || [];
    const sportIds = event.sportIds || [];
    const playing = divisions.filter(d => !!d.sportId);
    const active = (d: TournamentDivision) => (entrantsByDivision.get(d.id) || []).filter(e => e.status !== 'withdrawn');
    const entered = entrants.filter(e => e.status !== 'withdrawn');
    // The host can be among `participatingOrgs`; it is not one of the schools invited.
    const invited = (event.participatingOrgs || []).filter(o => o.id !== event.orgId);
    const thin = playing.filter(d => active(d).length < 2);
    const drawn = playing.filter(d => games.some(g => g.divisionId === d.id));
    const changed = playing.filter(d => drawChanges(d.firstStageId, games.filter(g => g.divisionId === d.id), active(d)).count > 0);
    const scoring = event.settings?.scoring;
    const sportName = (id: string) => sports.find(s => s.id === id)?.name;

    const raw: Array<Omit<TournamentStep, 'state'> & { state: Exclude<StepState, 'skip'> }> = [
      {
        key: 'basics', title: 'Where', dismissible: false,
        state: event.siteId || facilityIds.length ? 'done' : 'none',
        summary: event.siteId || facilityIds.length
          ? [sites.find(s => s.id === event.siteId)?.name, `${facilityIds.length} ${facilityIds.length === 1 ? 'facility' : 'facilities'}`].filter(Boolean).join(' · ')
          : 'No venue yet',
      },
      {
        key: 'divisions', title: 'Sports & divisions', dismissible: false,
        state: !sportIds.length ? 'none' : divisions.some(d => !d.sportId) ? 'part' : 'done',
        summary: sportIds.length ? `${sportIds.map(sportName).filter(Boolean).join(', ')} · ${plural(divisions.length, 'division')}` : 'No sports yet',
      },
      {
        key: 'entrants', title: 'Schools & teams', dismissible: true,
        state: !entered.length ? (invited.length ? 'part' : 'none') : thin.length ? 'part' : 'done',
        summary: !playing.length
          ? invited.length ? `${plural(invited.length, 'school')} invited · teams once there are divisions` : 'Starts once there are divisions'
          : `${plural(invited.length + 1, 'school')} · ${plural(entered.length, 'team')} entered`,
      },
      {
        key: 'scoring', title: 'Rules & scoring', dismissible: true,
        state: scoring ? 'done' : 'part',
        summary: scoring?.mode === 'byResult'
          ? `${scoring.pointsPerWin} / ${scoring.pointsPerDraw} / ${scoring.pointsPerLoss} for a win, draw, loss`
          : scoring?.mode === 'byPlacing' ? 'Points by finishing position' : 'Default 3 / 1 / 0, not confirmed',
      },
      {
        key: 'fixtures', title: 'Fixtures', dismissible: true,
        state: playing.length && drawn.length === playing.length && !changed.length ? 'done' : drawn.length || games.length ? 'part' : 'none',
        summary: !playing.length ? 'After teams are entered' : `${drawn.length} of ${plural(playing.length, 'division')} drawn${changed.length ? ` · ${changed.length} changed since` : ''}`,
      },
    ];
    const steps: TournamentStep[] = raw.map(step => ({
      ...step,
      state: step.dismissible && dismissed.includes(step.key) && step.state !== 'done' ? 'skip' : step.state,
    }));
    const nextIndex = steps.findIndex(s => !isFinished(s.state));
    return { steps, complete: nextIndex === -1, nextIndex };
  }, [event, divisions, games, entrants, entrantsByDivision, facilityIds, sports, sites]);
}

export function TournamentHome({
  event, orgId, canEdit, isWide, steps, nextIndex, complete, sports, sites, facilities, facilityIds,
  divisions, games, entrantsByDivision, organizers, onEditOrganizers, hostOrg, viewerOrgIds,
}: {
  event: Event;
  orgId: string;
  canEdit: boolean;
  isWide: boolean;
  steps: TournamentStep[];
  nextIndex: number;
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
  /** The viewer's organisations, to put theirs first in Schools. */
  viewerOrgIds: string[];
}) {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';
  const showHelp = useShowFieldHelp();
  const [dialog, setDialog] = useState<null | 'details' | 'where' | 'scoring' | 'sports'>(null);
  const close = () => setDialog(null);
  const eventId = event.id;
  const setupMode = canEdit && !complete;

  const sportName = (id?: string | null) => sports.find(s => s.id === id)?.name || '';
  const site = sites.find(s => s.id === event.siteId) || null;
  const usedFacilities = facilities.filter(f => facilityIds.includes(f.id));
  const active = (d: TournamentDivision) => (entrantsByDivision.get(d.id) || []).filter(e => e.status !== 'withdrawn');
  const gamesIn = (d: TournamentDivision) => games.filter(g => g.divisionId === d.id);
  const liveGames = games.filter(g => g.status === 'Live');

  /* ------------------------------------------------------------------ divisions, schools --- */
  const divisionState = (d: TournamentDivision): DivisionState => {
    const own = gamesIn(d);
    const live = own.filter(g => g.status === 'Live').length;
    const played = own.filter(g => g.status === 'Finished').length;
    if (setupMode) {
      if (active(d).length < 2) return { tone: 'wait', label: 'Needs more teams' };
      if (!own.length) return { tone: 'mute', label: 'Not drawn yet' };
      if (drawChanges(d.firstStageId, own, active(d)).count > 0) return { tone: 'wait', label: 'Changed since the draw' };
      return { tone: 'ok', label: 'Draw made' };
    }
    if (live) return { tone: 'live', label: `${live} live · ${played} of ${own.length} played` };
    if (!own.length) return { tone: 'mute', label: 'Fixtures to come' };
    if (played === own.length) return { tone: 'ok', label: 'Finished' };
    if (played) return { tone: 'ok', label: `${played} of ${own.length} played` };
    return { tone: 'ok', label: plural(own.length, 'fixture') };
  };
  const attention = (sportId: string): 'wait' | 'live' | null => {
    const own = divisions.filter(d => d.sportId === sportId);
    if (!setupMode) return own.some(d => gamesIn(d).some(g => g.status === 'Live')) ? 'live' : null;
    return own.some(d => divisionState(d).tone !== 'ok') ? 'wait' : null;
  };
  const addDivision = async (sportId: string) => {
    const result = await sendAction(SocketAction.ADD_DIVISION, {
      eventId,
      orgId,
      sportId,
      name: divisionAutoName(sportName(sportId), undefined, divisions.map(d => d.name)) || 'Division',
      // Every division has at least one stage (D11); its own screen sets the format.
      stage: { name: 'Fixtures', format: 'Festival', sequence: 1 },
    });
    if (result.ok) router.push(`/admin/${orgId}/events/${eventId}/divisions/${result.data.id}`);
  };
  const removeSport = (sportId: string) =>
    sendAction(SocketAction.UPDATE_EVENT, { id: eventId, orgId, data: { sportIds: (event.sportIds || []).filter(id => id !== sportId) } });
  const sportMenu = (sportId: string) => {
    const count = divisions.filter(d => d.sportId === sportId).length;
    return (
      <OverflowMenu
        accessibilityLabel={`${sportName(sportId)} actions`}
        title={sportName(sportId)}
        items={[
          { label: 'Sport organisers', description: 'Who runs this sport — appointed on the Sports & Divisions screen', icon: 'people-outline', onPress: () => router.push(`/admin/${orgId}/events/${eventId}/setup/playing`) },
          {
            label: 'Remove sport',
            description: count ? `Not available: it has ${plural(count, 'division')}. Remove them first, from each division's page.` : 'Take it off this tournament.',
            icon: 'trash-outline',
            destructive: true,
            disabled: count > 0,
            onPress: () => removeSport(sportId),
          },
        ]}
      />
    );
  };

  const schoolRows: SchoolRow[] = useMemo(() => {
    const teamsOf = (id: string) => Array.from(entrantsByDivision.values()).flat().filter(e => e.status !== 'withdrawn' && e.orgId === id).length;
    const rows: SchoolRow[] = [];
    if (hostOrg) rows.push({ org: { id: hostOrg.id, name: hostOrg.name, logo: hostOrg.logo, logoConfig: (hostOrg.settings as any)?.logoConfig, primaryColor: hostOrg.primaryColor }, teams: teamsOf(hostOrg.id), isHost: true });
    for (const org of event.participatingOrgs || []) {
      if (org.id === hostOrg?.id) continue;
      rows.push({ org, teams: teamsOf(org.id), isHost: false });
    }
    // The viewer's own school first, after the host, when they are a guest.
    const mine = rows.filter(r => !r.isHost && viewerOrgIds.includes(r.org.id));
    return [...rows.filter(r => r.isHost), ...mine, ...rows.filter(r => !r.isHost && !viewerOrgIds.includes(r.org.id))];
  }, [hostOrg, event.participatingOrgs, entrantsByDivision, viewerOrgIds]);

  const gapsLine = (() => {
    const thin = divisions.filter(d => d.sportId && active(d).length < 2);
    const noTeams = schoolRows.filter(r => !r.isHost && !r.teams);
    const parts = [
      thin.length === 1 ? `${sportName(thin[0].sportId)} ${thin[0].name} has ${active(thin[0]).length ? 'only one team' : 'no teams'}` : thin.length ? `${thin.length} divisions need more teams` : '',
      noTeams.length === 1 ? `${noTeams[0].org.name} has not entered any yet` : noTeams.length ? `${noTeams.length} invited schools have not entered any yet` : '',
    ].filter(Boolean);
    return parts.length ? `${parts.join(', and ')}.` : null;
  })();

  /* ------------------------------------------------------------------------------ pieces --- */
  const edit = (onPress: () => void, label = 'Edit') => (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" className="flex-row items-center gap-1">
      {label === 'Edit' ? <Ionicons name="pencil" size={13} color={themeColor(isDark, 'primary')} /> : null}
      <Text className="font-inter-bold text-sm text-primary-ink">{label}</Text>
    </TouchableOpacity>
  );
  const link = (label: string, onPress: () => void) => (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" className="self-start py-1">
      <Text className="font-inter-bold text-[13px] text-primary-ink">{label}</Text>
    </TouchableOpacity>
  );
  const scoring = event.settings?.scoring;
  const points = scoring?.mode === 'byResult' ? scoring : DEFAULT_SCORING_SYSTEM.mode === 'byResult' ? DEFAULT_SCORING_SYSTEM : null;
  const confirmScoring = () =>
    sendAction(SocketAction.UPDATE_EVENT, { id: eventId, orgId, data: { settings: { ...(event.settings || {}), scoring: DEFAULT_SCORING_SYSTEM } } });
  const saveDismissed = (next: string[]) =>
    sendAction(SocketAction.UPDATE_EVENT, { id: eventId, orgId, data: { settings: { ...(event.settings || {}), dismissedSetupSteps: next } } });

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

  const whereBody = (withMap: boolean) => {
    const markers = facilityMarkers(usedFacilities, sports, isDark);
    return (
      <View className="gap-2.5">
        {site ? (
          <View>
            <Text className="font-inter-bold text-sm text-ink">{site.name}</Text>
            {addressText(site.address) ? <Text className="font-inter text-xs text-ink-muted">{addressText(site.address)}</Text> : null}
          </View>
        ) : null}
        {facilityChips}
        {withMap && site?.address?.latitude != null && site?.address?.longitude != null ? (
          <AddressMap latitude={site.address.latitude} longitude={site.address.longitude} title={site.name} interactive={false} height={isWide ? 200 : 170} markers={markers} />
        ) : null}
      </View>
    );
  };

  const sportsBlock = (mode: 'setup' | 'public') => (
    <View className="gap-3">
      {(mode === 'setup' ? showHelp : true) ? (
        <Text className="font-inter text-[13px] text-ink-muted leading-relaxed">
          {mode === 'setup' ? (
            <>
              <Text className="font-inter-semibold text-ink-soft">Choose the sports being played, then the divisions within each. </Text>
              A division is a group of teams that compete against each other — usually an age group, e.g. Rugby U16. Each division has its own draw and table, and teams are entered into a division. A sport can have one division or several.
            </>
          ) : 'A division is a group of teams that compete against each other — usually an age group, e.g. Rugby U16.'}
        </Text>
      ) : null}
      <SportsDivisions
        sports={sports}
        sportIds={event.sportIds || []}
        divisions={divisions}
        entrantsByDivision={entrantsByDivision}
        divisionState={divisionState}
        isWide={isWide}
        canEdit={canEdit}
        setupMode={mode === 'setup'}
        attention={attention}
        onOpenDivision={d => router.push(`/admin/${orgId}/events/${eventId}/divisions/${d.id}`)}
        onAddDivision={canEdit ? addDivision : undefined}
        onAddSport={canEdit ? () => setDialog('sports') : undefined}
        sportMenu={canEdit && mode === 'setup' ? sportMenu : undefined}
      />
    </View>
  );

  const card = (title: string, body: React.ReactNode, right?: React.ReactNode, count?: number) => (
    <View className="rounded-2xl border border-line bg-card p-4 gap-3">
      <View className="flex-row items-center gap-2">
        <Text className="font-inter-bold text-[13px] text-ink-soft">{title}</Text>
        {count !== undefined ? <Text className="font-inter text-[13px] text-ink-muted">{count}</Text> : null}
        <View className="flex-1" />
        {right}
      </View>
      {body}
    </View>
  );

  /* ------------------------------------------------------------------------------ banner --- */
  const today = calendarRangeStatus(event.startDate, event.endDate) === 'during';
  const dayOf = eventDayOfRange(event.startDate, event.endDate);
  const banner = (
    <View className="rounded-2xl border border-line bg-card p-4 flex-row gap-3.5 items-center">
      <TournamentMark size={isWide ? 60 : 48} />
      <View className="flex-1 min-w-0 gap-0.5">
        <View className="flex-row items-center gap-2 flex-wrap">
          <Text className="font-inter-bold text-ink" style={{ fontSize: isWide ? 22 : 19 }}>{event.name}</Text>
          {event.status === 'Cancelled' ? <RowTag tone="cancelled" label="Cancelled" /> : null}
        </View>
        <View className="flex-row flex-wrap items-center gap-3">
          <Text className="font-inter-semibold text-sm text-ink">{formatDateRange(event.startDate, event.endDate, { compact: true })}</Text>
          {today && (liveGames.length || dayOf) ? (
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
  );

  /* ------------------------------------------------------------------------ setting up --- */
  const openKey = `tournamentSetupOpen:${eventId}`;
  const savedOpen = useSettingsStore(state => state.localOverrides[openKey]) as number[] | undefined;
  const setLocalOverride = useSettingsStore(state => state.setLocalOverride);
  const open = new Set<number>(savedOpen ?? (nextIndex >= 0 ? [nextIndex] : []));
  const toggle = (i: number) => {
    const next = new Set(open);
    next.has(i) ? next.delete(i) : next.add(i);
    setLocalOverride(openKey, Array.from(next));
  };
  const dismissed = event.settings?.dismissedSetupSteps || [];

  const stepBody = (step: TournamentStep): React.ReactNode => {
    switch (step.key) {
      case 'basics':
        return site || usedFacilities.length
          ? whereBody(false)
          : <View className="gap-1"><Text className="font-inter text-[13px] text-ink-muted">Add where it is played — the base site, and the courts, fields and amenities it uses.</Text>{link('＋ Add venue', () => setDialog('where'))}</View>;
      case 'divisions':
        return (event.sportIds || []).length
          ? sportsBlock('setup')
          : <View className="gap-1"><Text className="font-inter text-[13px] text-ink-muted">Choose the sports being played — each gets its first division straight away.</Text>{link('＋ Add a sport', () => setDialog('sports'))}</View>;
      case 'entrants':
        return (
          <View className="gap-2">
            {gapsLine ? <Text className="font-inter text-[13px] text-ink-muted">{gapsLine}</Text> : null}
            {!divisions.length ? <Text className="font-inter text-[13px] text-ink-muted">Teams are entered into divisions, so this starts once there are some. Schools can be invited now.</Text> : null}
            <SchoolsList rows={schoolRows} />
            {link('Enter teams ›', () => router.push(`/admin/${orgId}/events/${eventId}/entrants`))}
          </View>
        );
      case 'scoring':
        return (
          <View className="gap-2.5">
            {pointsTiles}
            {!scoring ? (
              <View className="flex-row items-center gap-2 flex-wrap">
                <Text className="font-inter text-[13px] text-ink-muted flex-1">The default. Confirm it, or change it, before the first result is entered.</Text>
                <TouchableOpacity onPress={confirmScoring} accessibilityRole="button"><Text className="font-inter-bold text-[13px] text-primary-ink">Confirm</Text></TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      case 'fixtures': {
        const playing = divisions.filter(d => !!d.sportId);
        return (
          <View className="gap-1">
            <Text className="font-inter text-[13px] text-ink-muted">Each division is drawn on its own, once its teams are in. Nothing is drawn for you, so a late entry does not force a redraw.</Text>
            {playing.map((d, i) => {
              const st = divisionState(d);
              return (
                <TouchableOpacity key={d.id} onPress={() => router.push(`/admin/${orgId}/events/${eventId}/divisions/${d.id}/schedule`)} accessibilityRole="link" className={`flex-row items-center gap-2 py-2 ${i ? 'border-t border-line-soft' : ''}`}>
                  <Text className="flex-1 font-inter-semibold text-sm text-ink" numberOfLines={1}>{sportName(d.sportId)} {d.name}</Text>
                  <Text className={`font-inter-semibold text-xs ${st.tone === 'ok' ? 'text-success-ink' : st.tone === 'wait' ? 'text-warning-ink' : 'text-ink-muted'}`}>{st.label}</Text>
                  <Ionicons name="chevron-forward" size={14} color={themeColor(isDark, 'ink-muted')} />
                </TouchableOpacity>
              );
            })}
            {link('＋ Add a fixture by hand', () => router.push(`/admin/${orgId}/events/${eventId}/games/new`))}
          </View>
        );
      }
    }
  };
  const stepRight = (step: TournamentStep): React.ReactNode => {
    if (step.key === 'basics') return edit(() => setDialog('where'));
    if (step.key === 'scoring') return edit(() => setDialog('scoring'));
    if (step.key === 'entrants') return edit(() => router.push(`/admin/${orgId}/events/${eventId}/entrants`), '＋ Invite');
    return null;
  };

  const settingUp = (
    <>
      <View className="flex-row flex-wrap items-center gap-3">
        <Text className="font-inter-bold text-[15px] text-ink">Setting up</Text>
        <Text className="font-inter text-[13px] text-ink-muted">{steps.filter(s => isFinished(s.state)).length} of {steps.length} done</Text>
        <StepProgressBar states={steps.map(s => s.state)} />
        <View className="flex-row items-center gap-3.5 ml-auto">
          <TouchableOpacity onPress={() => setLocalOverride(openKey, open.size === steps.length ? [] : steps.map((_, i) => i))} accessibilityRole="button">
            <Text className="font-inter-semibold text-[13px] text-ink-soft">{open.size === steps.length ? 'Close all' : 'Open all'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      {steps.map((step, i) => {
        const isOpen = open.has(i);
        return (
          <View key={step.key} className={`rounded-2xl border border-line bg-card px-4 ${isOpen ? 'py-4 gap-3' : 'py-3'}`}>
            <View className="flex-row items-center gap-2.5">
              <TouchableOpacity onPress={() => toggle(i)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} accessibilityLabel={`${i + 1}. ${step.title}, ${step.summary}`} className="flex-1 min-w-0 flex-row items-center gap-2.5">
                <StepNumber index={i} state={step.state} />
                <Text className="font-inter-bold text-[15px] text-ink">{step.title}</Text>
                <StepPills state={step.state} isNext={i === nextIndex} />
                {!isOpen && isWide ? <Text className="flex-1 font-inter text-[13px] text-ink-muted ml-1" numberOfLines={1}>{step.summary}</Text> : null}
              </TouchableOpacity>
              {isOpen ? stepRight(step) : null}
              <TouchableOpacity onPress={() => toggle(i)} accessibilityLabel={isOpen ? `Close ${step.title}` : `Open ${step.title}`} hitSlop={8}>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={themeColor(isDark, 'ink-muted')} />
              </TouchableOpacity>
            </View>
            {!isOpen && !isWide ? <Text className="font-inter text-[13px] text-ink-muted mt-1" style={{ marginLeft: 34 }} numberOfLines={2}>{step.summary}</Text> : null}
            {isOpen ? (
              <View style={{ marginLeft: isWide ? 34 : 0 }} className="gap-3">
                {stepBody(step)}
                {step.dismissible && step.state !== 'done' ? (
                  <TouchableOpacity
                    onPress={() => saveDismissed(step.state === 'skip' ? dismissed.filter(k => k !== step.key) : [...dismissed, step.key])}
                    accessibilityRole="button"
                    className="self-start"
                  >
                    <Text className="font-inter-semibold text-xs text-ink-muted">{step.state === 'skip' ? 'Needed after all' : 'Not needed for this tournament'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </>
  );

  /* ---------------------------------------------------------------------------- overview --- */
  const liveCard = liveGames.length ? card('● Live now', (
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
              {[g.periodLabel, facilities.find(f => f.id === g.facilityId)?.name, division ? `${sportName(division.sportId)} ${division.name}` : ''].filter(Boolean).join(' · ')}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  ), undefined, liveGames.length) : null;

  const sportsCard = (event.sportIds || []).length ? card('Sports & divisions', sportsBlock('public'), undefined, divisions.length) : null;
  const schoolsCard = schoolRows.length ? card('Schools', <SchoolsList rows={schoolRows} />, canEdit ? edit(() => router.push(`/admin/${orgId}/events/${eventId}/entrants`)) : undefined, schoolRows.length) : null;
  const whereCard = site || usedFacilities.length ? card('Where', whereBody(true), canEdit ? edit(() => setDialog('where')) : undefined) : null;
  const rulesCard = card('Rules & scoring', pointsTiles, canEdit ? edit(() => setDialog('scoring')) : undefined);
  const organizersCard = canEdit && organizers.length ? card('Organisers', (
    <View>
      {organizers.map((o, i) => (
        <View key={o.orgProfileId} className={`flex-row items-center gap-2 py-1.5 ${i ? 'border-t border-line-soft' : ''}`}>
          <Text className="flex-1 font-inter text-sm text-ink" numberOfLines={1}>{o.name || 'Organiser'}</Text>
          {o.orgShortName ? <Text className="font-inter text-xs text-ink-muted">{o.orgShortName}</Text> : null}
        </View>
      ))}
    </View>
  ), edit(onEditOrganizers)) : null;

  const isGuest = !canEdit && viewerOrgIds.some(id => (event.participatingOrgs || []).some(o => o.id === id));
  const overview = (
    <>
      {liveCard}
      {isGuest && !isWide ? whereCard : null}
      {sportsCard}
      {isWide ? (
        <View className="flex-row gap-4 items-start">
          <View className="flex-1 gap-4">{schoolsCard}{organizersCard}</View>
          <View className="flex-1 gap-4">{whereCard}{rulesCard}</View>
        </View>
      ) : (
        <>{schoolsCard}{isGuest ? null : whereCard}{rulesCard}{organizersCard}</>
      )}
    </>
  );

  return (
    <View className="gap-4">
      {banner}
      {setupMode ? settingUp : overview}

      {canEdit ? (
        <>
          <EditTournamentDialog visible={dialog === 'details'} event={event} orgId={orgId} onClose={close} />
          <WhereDialog visible={dialog === 'where'} event={event} orgId={orgId} sites={sites} facilities={facilities} facilityIds={facilityIds} onClose={close} />
          <ScoringDialog visible={dialog === 'scoring'} event={event} orgId={orgId} onClose={close} />
          <SportsDialog visible={dialog === 'sports'} event={event} orgId={orgId} sports={sports} divisionCount={id => divisions.filter(d => d.sportId === id).length} onClose={close} />
        </>
      ) : null}
    </View>
  );
}
