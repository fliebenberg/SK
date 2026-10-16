import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { useActiveTheme } from '../../../../store/settingsStore';
import { wsService } from '../../../../services/websocket';
import { sendAction } from '../../../../services/actions';
import { useWsStore } from '../../../../store/wsStore';
import { useAuthStore } from '../../../../store/authStore';
import {
  SocketAction,
  TournamentOrganizer,
  LeagueStandingRow,
  dualUnpaired,
  isDualEvent,
} from '@sk/shared';

import { Tabs } from '../../../../components/Tabs';
import { OverflowMenu } from '../../../../components/OverflowMenu';
import { ScreenHeader } from '../../../../components/ScreenHeader';
import { formatDateRange, dateCountdown } from '../../../../utils/dates';
import { TournamentHome, useTournamentSteps } from '../../../../components/tournament/TournamentHome';
import { OrganizersDialog } from '../../../../components/tournament/TournamentDialogs';
import { useTournamentData } from '../../../../hooks/useTournamentData';
import { StandingsTable } from '../../../../components/tournament/StandingsTable';
import { DivisionStandings } from '../../../../components/tournament/DivisionStandings';
import { ScheduleTab } from '../../../../components/tournament/ScheduleTab';
import { DualResults } from '../../../../components/tournament/DualResults';
import { EventRoleChips } from '../../../../components/EventRoleChips';
import { useLiveRoom } from '../../../../hooks/useLiveRoom';
import { useMyEventGrants } from '../../../../hooks/useEventCapabilities';
import { deriveEventRoles } from '@sk/shared';
import { resolveEventType, unknownEventTypeMessage } from '@sk/shared';
import { isCollapsed } from '@sk/shared';
import { themeColor } from '../../../../constants/Colors';
import { PageBody } from '../../../../components/PageBody';

/**
 * One event, at whichever of its two altitudes applies.
 *
 * A `SingleMatch` is one game and shows it. A `Tournament` is a structure — divisions, stages and
 * the fixtures under them — and shows that, with the collapse rule (U15) hiding every level that
 * has only one child. A tournament's first tab is the read-first *Overview* (docs/events.md §7):
 * cards that, while it is being set up, carry their status — the setup itself
 * ([TournamentHome](../../../../components/tournament/TournamentHome.tsx)). It replaced the U48
 * checklist, whose rows each opened a step screen of their own (closes `UI-11`), and then the
 * numbered step cards of stage 2 (2026-10-09).
 * Creation is a name and a date on the events list (U45). A type we cannot name shows an error
 * rather than guessing at Tournament, which is `FIX-1` / U39.
 *
 * **The screen reads from rooms rather than fetching.** Joining `event:{id}` pushes the event, its
 * fixture summaries, its divisions and the event-level table, so there is no `get_data` for any of
 * them — the subscription is the load, and every later change arrives carrying its own data. This
 * is also what closed `FIX-2`: the screen used to read *every organisation in the system* to
 * resolve a handful of names, and kept the answer only `if (Array.isArray(res))`, which a
 * paginated response never satisfies. Names of orgs already in the event now travel on the event;
 * a fixture's team and org names travel on its summary; and choosing an org to *invite* — a set no
 * room owns — is still a search.
 */
/**
 * The standings scope, remembered per event for the life of the session (U28).
 *
 * Module state rather than a store: it is a view preference with no consequence outside this
 * screen, it must not survive a reload, and putting it in the global store would make every screen
 * reading that store re-render when a tab changes.
 */
const rememberedScope = new Map<string, string>();

export default function EventDetails() {
  const router = useRouter();
  const safeBack = useSafeBack();
  /**
   * `tab` makes the Setup tab addressable, which is what a step screen needs to come back to
   * (U48). A push keeps this screen mounted, so `router.back()` restores the tab on its own — the
   * param is the fallback for the cases where there is no history to pop: a refresh on web, or a
   * deep link straight onto a step.
   */
  const { orgId, eventId, tab: tabParam, division: divisionParam } = useLocalSearchParams<{
    orgId: string;
    eventId: string;
    tab?: string;
    /** With `tab=schedule`: the division the Schedule opens on (the division page's *Edit in the Schedule*). */
    division?: string;
  }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);
  const secondary = themeColor(isDark, 'ink-muted');

  const user = useAuthStore((state: any) => state.user);
  const orgMemberships = useAuthStore((state: any) => state.orgMemberships);
  const teamMemberships = useAuthStore((state: any) => state.teamMemberships);

  // ------------------------------------------------------------------------------------------
  // Live data — one room per dataset (rule 4), plus the org's reference data for venue names
  //
  // `event:{id}` carried all five of these until 2026-09-11. One room meant one join, but it also
  // meant every screen touching an event was handed all five whatever it rendered — the entrants
  // screen wants the event and its divisions and was paying for the fixture list, the facilities
  // and the standings table too. Five joins cost five socket frames and the same five queries the
  // single join already ran, against one identity lookup, so the split is close to free.
  //
  // The rooms, and how each message is read, live in `useTournamentData` (2026-10-09), shared with
  // the Overview's full pages so the two can never read an update differently. The facilities in
  // play (U47) are a **set**, and the base site beside them is not a filter on it: a tournament
  // based at the school may still play half its fixtures on the fields next door. Only the
  // standings table is this screen's alone.
  // ------------------------------------------------------------------------------------------

  const {
    event, eventLoading, accessDenied, games, divisions, facilityIds: savedFacilityIds, sites, facilities, sports,
    capabilities, canEdit, entrants, entrantsByDivision, hostOrg,
  } = useTournamentData(orgId, eventId);

  const { items: serverStandings } = useLiveRoom<LeagueStandingRow>(eventId ? `event:${eventId}:standings` : null, {
    reduce: (message) =>
      message.type === 'EVENT_STANDINGS_UPDATED'
        ? { kind: 'replace', items: message.data?.rows || [] }
        : { kind: 'ignore' },
    getId: (row: any) => row?.teamId,
  });

  // ------------------------------------------------------------------------------------------
  // Permissions
  // ------------------------------------------------------------------------------------------

  const grants = useMyEventGrants();
  /*
   * `canEdit` is what the server says (`capabilities.canEditEvent`), rather than
   * `event.orgId === orgId`, which was the old test. That question cannot see an appointed organiser
   * who is not an org admin (D33), and it answered "yes" for any member of the hosting org whether or
   * not they could actually write anything. The roster is joined only for a viewer who may edit: it
   * is the organiser's tier.
   */

  const roles = useMemo(
    () =>
      event
        ? deriveEventRoles({ event, grants, orgMemberships, teamMemberships, games })
        : [],
    [event, grants, orgMemberships, teamMemberships, games]
  );

  // ------------------------------------------------------------------------------------------
  // UI state
  // ------------------------------------------------------------------------------------------

  /**
   * The first tab, then `Schedule / Standings` (docs/events.md, stage 2).
   *
   * The first tab is the *Overview* in every phase (2026-10-09): while the tournament is being set
   * up its cards carry their status, so there is no separate *Setting up* tab. Its key stays
   * `setup`, so `?tab=setup` from a division or entrants screen still lands on it. It is the
   * default tab.
   */
  const [activeTab, setActiveTab] = useState<'setup' | 'schedule' | 'standings'>(
    () => (tabParam === 'schedule' || tabParam === 'standings' ? tabParam : 'setup')
  );
  // Arriving again with new params — a link back to a page already open — follows them.
  useEffect(() => { if (tabParam === 'schedule' || tabParam === 'standings') setActiveTab(tabParam); }, [tabParam, divisionParam]);
  const [organizersOpen, setOrganizersOpen] = useState(false);
  /** The page's scroll, and where the Overview starts in it — for the progress bar's jumps to a card. */
  const scrollRef = useRef<ScrollView>(null);
  const overviewTop = useRef(0);
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  /**
   * Which subject the table ranks (U28) — `all`, or a division id.
   *
   * Seeded from {@link rememberedScope} so the choice survives leaving the screen and coming back,
   * which is what "remembered for the session" means: an organiser checking the u14 table between
   * fixtures should not have to re-select it every time.
   */
  const [standingsScope, setStandingsScopeState] = useState<string>(
    () => rememberedScope.get(eventId) || 'all'
  );
  const setStandingsScope = (scope: string) => {
    rememberedScope.set(eventId, scope);
    setStandingsScopeState(scope);
  };
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  /**
   * The appointed organisers, for the Basic Info row's detail line only.
   *
   * A one-shot read, because "who is appointed to run this" is a set no room publishes changes
   * to. The Basic Info *screen* reads the same thing for its picker — one extra round trip on a screen
   * that is only reached by an organiser, which is cheaper than teaching a room about it.
   */
  const [organizers, setOrganizers] = useState<TournamentOrganizer[]>([]);
  useEffect(() => {
    if (!isConnected || !eventId || !canEdit) return;
    let active = true;
    wsService.emit('get_data', { type: 'event_organizers', eventId }, (res: any) => {
      if (active && Array.isArray(res)) setOrganizers(res);
    });
    return () => {
      active = false;
    };
  }, [isConnected, eventId, canEdit]);


  // ------------------------------------------------------------------------------------------
  // Derived
  // ------------------------------------------------------------------------------------------

  const resolved = resolveEventType(event);
  const orderedDivisions = useMemo(
    () => [...divisions].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [divisions]
  );
  // One division renders its fixtures inline on the Schedule tab (U15). Setup names it regardless
  // (U50) — what collapses is the layout, no longer the concept.
  const divisionsCollapsed = isCollapsed(orderedDivisions.length);
  const onlyDivision = divisionsCollapsed ? orderedDivisions[0] : undefined;

  /**
   * Which sports are played: the tournament's own list (U51).
   *
   * The organiser chooses these first on Sports & Divisions, and each division plays one of them —
   * the server refuses anything else. So the event's `sportIds` is the answer here. U46–U50 read it
   * off the divisions instead; that direction was reversed because it left the division screen
   * offering every sport in the system.
   *
   * The checklist only *reads* this, to say whether the step is done and which sports to name.
   */
  const effectiveSportIds = event?.sportIds || [];
  /** A division with no sport can only happen with several to choose from; the row says so. */
  const divisionsWithoutSport = orderedDivisions.filter(d => !d.sportId).length;
  const sportName = (sportId?: string) => sports.find(s => s.id === sportId)?.name;

  /**
   * The event-level table — **the server's, and only the server's** (D30).
   *
   * Phase 5 kept a client-side `calculateStandings` fallback here, because the choke point only
   * writes a table for a fixture that sits in a stage and a tournament whose fixtures were added
   * by hand had none. Phase 6 closes both halves of that: generated fixtures land in a stage by
   * construction, `FIX-12` makes a hand-added one name its stage, and the Phase 6 migration
   * attaches the rows that already existed. So the fallback goes, and with it the possibility of
   * this screen and the standings tab disagreeing about who won — which is what a second
   * implementation of a ranking always eventually does.
   */
  const standingsRows: LeagueStandingRow[] = serverStandings;

  /** Where each setup step stands, and the tournament's host for the Schools list. */
  const { steps: setupSteps, complete: setupComplete } = useTournamentSteps({
    event,
    divisions: orderedDivisions,
    games,
    entrants,
    entrantsByDivision,
    facilityIds: savedFacilityIds,
    sports,
    sites,
  });

  // ------------------------------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------------------------------

  const handleCancelEvent = () => {
    setIsProcessing(true);
    // `orgId`: the server checks it against the event's. The status follows the event room; a refusal is toasted.
    sendAction(SocketAction.UPDATE_EVENT, {
      id: eventId,
      orgId,
      data: { status: 'Cancelled' },
    }).then(() => {
      setIsProcessing(false);
      setIsCancelling(false);
    });
  };

  const handleDeleteEvent = () => {
    setIsProcessing(true);
    sendAction(SocketAction.DELETE_EVENT, {
      id: eventId,
      orgId,
    }).then(result => {
      setIsProcessing(false);
      setIsDeleting(false);
      // A failed delete leaves the organiser on the event; the refusal is already toasted.
      if (result.ok) router.push(`/admin/${orgId}/events`);
    });
  };

  // ------------------------------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------------------------------

  if (accessDenied) {
    return (
      <SafeAreaView className="flex-1 bg-canvas justify-center items-center px-8">
        <Ionicons name="lock-closed-outline" size={44} color={themeColor(isDark, 'ink-muted')} style={{ opacity: 0.3 }} />
        <Text className="font-orbitron-bold text-base text-ink-soft mt-4">No Access</Text>
        <Text className="font-inter text-xs text-ink-muted text-center mt-1">
          You do not have permission to view this event.
        </Text>
      </SafeAreaView>
    );
  }

  if (eventLoading || !event) {
    return (
      <SafeAreaView className="flex-1 bg-canvas justify-center items-center">
        <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
        <Text className="font-orbitron text-xs text-ink-muted mt-4 uppercase tracking-widest">
          Loading Details...
        </Text>
      </SafeAreaView>
    );
  }

  /**
   * When it is, said rather than stored (U49).
   *
   * This bar used to print `startDate.split('T')[0]` — `2026-09-19`, with nothing beside it to say
   * which of an event's dates it was, in a format nobody speaks. Three changes: the date is
   * written out, it is labelled, and it is followed by how far off it is, which is the half of
   * "when" that a date alone never answers and the reason anybody glances at this bar at all.
   */
  const dateLabel = formatDateRange(event.startDate, event.endDate);
  const countdown = dateCountdown(event.startDate, event.endDate);
  const isMultiDay = !!dateLabel && dateLabel.includes('–');
  // A Head to Head (`H2H-1`) is a tournament between two organisations, under its own name.
  const dual = isDualEvent(event);
  const subjectNoun = resolved.kind === 'SingleMatch' ? 'match' : dual ? 'Head to Head' : 'tournament';

  const resultsRecorded = games.filter(g => g.status === 'Finished').length;
  const header = (
    <>
      {/* One of the thirty-four screens `UI-10` is about, converted here because U49 was rewriting
          this header anyway and the menu it gained is exactly what the `right` prop is for. */}
      <ScreenHeader
        /* A tournament's name is its banner's (stage 2), so the bar names what the page is. */
        title={resolved.kind === 'Tournament' ? (dual ? 'Head to Head' : 'Tournament') : event.name}
        onBack={() => safeBack(`/admin/${orgId}/events`)}
        right={
          /* The danger zone, relocated here from the bottom of the Setup tab (U49): it belongs to
             the event rather than to its setup, and ending a set-up checklist on a red box
             offering to delete the thing you are setting up is a strange note to finish on. It is
             not offered on the Unknown branch, which renders no confirmation modal for either
             action to open; `ScreenHeader` supplies the spacer when this is undefined. */
          canEdit && resolved.kind !== 'Unknown' ? (
            <OverflowMenu
              accessibilityLabel="Event actions"
              title={`This ${subjectNoun}`}
              items={[
                ...(resolved.kind === 'Tournament'
                  ? [{
                      // Most tournaments have no organiser besides the host's admins, so there is
                      // no empty card for them (read-first rule 13): appointing one starts here.
                      label: 'Organisers',
                      description: 'Others who run this tournament — from your organisation or a school taking part.',
                      icon: 'people-outline' as const,
                      onPress: () => setOrganizersOpen(true),
                    }]
                  : []),
                {
                  label: 'Cancel event',
                  description: `Marks the ${subjectNoun} as cancelled. Nothing is deleted.`,
                  icon: 'ban-outline',
                  disabled: event.status === 'Cancelled',
                  onPress: () => setIsCancelling(true),
                },
                {
                  label: 'Delete event',
                  // Rule 19: not available stays in the menu, saying why — once results are
                  // recorded a tournament is cancelled, not deleted.
                  description:
                    resolved.kind === 'SingleMatch'
                      ? 'Permanently deletes the match and everything recorded against it.'
                      : resultsRecorded
                      ? `Not available: ${resultsRecorded} result${resultsRecorded === 1 ? ' is' : 's are'} recorded. Cancel it instead.`
                      : `Permanently deletes the ${subjectNoun}, its divisions and its ${dual ? 'games' : 'fixtures'}.`,
                  icon: 'trash-outline',
                  destructive: true,
                  disabled: resolved.kind === 'Tournament' && resultsRecorded > 0,
                  onPress: () => setIsDeleting(true),
                },
              ]}
            />
          ) : undefined
        }
      />

      {resolved.kind !== 'Tournament' ? (
      <View className="bg-card px-6 py-2.5 flex-row justify-between items-center gap-3 border-b border-line-soft">
        <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
          <Ionicons name="calendar-outline" size={16} color={themeColor(isDark, 'primary')} />
          <View className="flex-1 min-w-0">
            <Text className="font-inter-bold text-[9px] uppercase tracking-widest text-ink-muted">
              {dateLabel ? (isMultiDay ? 'Runs' : 'Takes place') : 'When'}
            </Text>
            <Text
              className="font-inter-bold text-xs text-ink-soft"
              numberOfLines={1}
            >
              {dateLabel || 'No date set yet'}
              {!!countdown && (
                <Text className="font-inter text-xs text-ink-muted">
                  {`  ·  ${countdown}`}
                </Text>
              )}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <EventRoleChips roles={roles} />
          <View className="bg-sunken px-2 py-0.5 rounded">
            <Text className="font-orbitron-bold text-[9px] text-ink-muted uppercase tracking-widest">
              {/* A tournament is described by its format, which is also its label (U34). */}
              {resolved.label}
            </Text>
          </View>
        </View>
      </View>
      ) : null}
    </>
  );

  // U39 — an event whose type we cannot name is an error state, never a Tournament by default.
  if (resolved.kind === 'Unknown') {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        {header}
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="alert-circle-outline" size={44} color={themeColor(isDark, 'danger')} style={{ opacity: 0.7 }} />
          <Text className="font-orbitron-bold text-base text-ink-soft mt-4 text-center">
            We cannot show this event
          </Text>
          <Text className="font-inter text-xs text-ink-muted text-center mt-2 leading-relaxed">
            {unknownEventTypeMessage(resolved)}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------- single match ---
  if (resolved.kind === 'SingleMatch') {
    // A single match has no event page: the match *is* the event, and its page is the game's (stage 3).
    const game = games[0];
    if (game) return <Redirect href={`/admin/${orgId}/events/${eventId}/games/${game.id}` as any} />;
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        {header}
        <View className="flex-1 items-center justify-center"><ActivityIndicator color={themeColor(isDark, 'primary')} /></View>
      </SafeAreaView>
    );
  }



  // ------------------------------------------------------------------------------ tournament ---
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      {header}

      <View className="bg-card">
        <Tabs
          items={[
            { key: 'setup', label: 'Overview' },
            { key: 'schedule', label: 'Schedule' },
            // A Head to Head has no tables: it is won by games, so its third tab is Results.
            { key: 'standings', label: dual ? 'Results' : 'Standings' },
          ]}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as typeof activeTab)}
        />
      </View>

      {/* One scroll for all three tabs. Setup needed its own while it was an accordion, because
          `stickyHeaderIndices` addresses a scroll's children by position and a `false` sibling is
          stripped on native but kept on web — so the pinned row differed between platforms. With
          the steps on their own screens there is nothing to pin and nothing to index (U48). */}
      <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 60 }}>
        {/* The first tab, the Overview: cards in two or three columns on a wide screen. Each card saves itself
            through its own dialog, so the tab is never dirty. */}
        {activeTab === 'setup' && (
          <PageBody onLayout={e => { overviewTop.current = e.nativeEvent.layout.y; }}>
            <TournamentHome
              event={event}
              orgId={orgId}
              canEdit={canEdit}
              isWide={isWide}
              steps={setupSteps}
              complete={setupComplete}
              sports={sports}
              sites={sites}
              facilities={facilities}
              facilityIds={savedFacilityIds}
              divisions={orderedDivisions}
              games={games}
              entrantsByDivision={entrantsByDivision}
              organizers={organizers}
              onEditOrganizers={() => setOrganizersOpen(true)}
              hostOrg={hostOrg}
              viewerOrgIds={(orgMemberships || []).map((m: any) => m.orgId)}
              onOpenSchedule={() => setActiveTab('schedule')}
              onOpenResults={() => setActiveTab('standings')}
              mySportIds={capabilities?.convenesSportIds}
              onScrollTo={y => scrollRef.current?.scrollTo({ y: Math.max(0, overviewTop.current + y - 8), animated: true })}
            />
          </PageBody>
        )}
        {activeTab === 'schedule' && (
          <PageBody className="gap-4">
            {/* The Schedule tab (Phase 7): the grid on a wide screen, the day's list on a phone, the
                fixtures without a time, the clashes, and moving a fixture — replacing the list of
                divisions it used to be (the collapse rule's one-division panel included). */}
            <ScheduleTab
              event={event}
              orgId={orgId}
              canEdit={canEdit || !!capabilities?.convenesDivisionIds?.length || !!capabilities?.convenesSportIds?.length}
              isWide={isWide}
              divisions={divisions}
              games={games}
              sports={sports}
              sites={sites}
              facilities={facilities}
              facilityIds={savedFacilityIds}
              hostOrg={hostOrg as any}
              canSetHours={divisionId => canEdit || (!!divisionId && (
                !!capabilities?.convenesDivisionIds?.includes(divisionId)
                || !!capabilities?.convenesSportIds?.includes(divisions.find(d => d.id === divisionId)?.sportId || '')))}
              initialDivisionId={divisionParam}
            />
          </PageBody>
        )}

        {activeTab === 'standings' && dual && (
          <PageBody>
            <DualResults
              event={event}
              orgId={orgId}
              hostOrg={hostOrg as any}
              divisions={orderedDivisions}
              games={games}
              sports={sports}
              unpairedNames={divisionId => {
                const orgName = (id?: string) => event.participatingOrgs?.find(o => o.id === id)?.name || '';
                return dualUnpaired(entrantsByDivision.get(divisionId) || [], games.filter(g => g.divisionId === divisionId))
                  .map(e => `${orgName(e.orgId)} ${e.name || e.label || ''}`.trim());
              }}
            />
          </PageBody>
        )}
        {activeTab === 'standings' && !dual && (
          <PageBody className="gap-4">
            {/*
              One table with a division scope selector (U28), rather than a `By division / By
              organisation` toggle. **The scope decides the row, not just the filter** (U29): all
              divisions ranks the tournament's scoring subject — for a Festival that is the
              organisation, so the default view is the day's leaderboard by school — while one
              division ranks its entrants, so a school that entered u14A and u14B is two rows.
              The two still sum into one school line above, which is right for the day's total.
            */}
            {orderedDivisions.length > 1 && (
              <View className="mb-1">
                <Tabs
                  items={[
                    { key: 'all', label: 'All divisions' },
                    ...orderedDivisions.map(division => ({ key: division.id, label: division.name })),
                  ]}
                  activeKey={standingsScope}
                  onChange={setStandingsScope}
                  scrollable={orderedDivisions.length > 2}
                />
              </View>
            )}

            {standingsScope === 'all' ? (
              <View className="gap-2">
                <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-widest pl-1">
                  Event Leaderboard
                </Text>
                <StandingsTable
                  rows={standingsRows as any}
                  subjectLabel="Organisation"
                  emptyMessage="Nothing to rank yet. Add fixtures and record results."
                />
              </View>
            ) : (
              <DivisionStandings divisionId={standingsScope} canEdit={canEdit} />
            )}
          </PageBody>
        )}

      </ScrollView>

      {canEdit ? (
        <OrganizersDialog
          visible={organizersOpen}
          event={event}
          orgId={orgId}
          organizers={organizers}
          onChange={setOrganizers}
          onClose={() => setOrganizersOpen(false)}
        />
      ) : null}
      <ConfirmationModal
        isOpen={isCancelling}
        title="Cancel this tournament?"
        description="It will be marked as cancelled. Nothing is deleted."
        confirmText="Cancel Event"
        cancelText="Keep it"
        onConfirm={handleCancelEvent}
        onClose={() => setIsCancelling(false)}
        isProcessing={isProcessing}
      />
      <ConfirmationModal
        isOpen={isDeleting}
        title="Delete this tournament?"
        description="This permanently deletes the tournament, every division under it and every fixture recorded against them."
        confirmText="Delete Event"
        cancelText="Cancel"
        onConfirm={handleDeleteEvent}
        onClose={() => setIsDeleting(false)}
        isProcessing={isProcessing}
      />
    </SafeAreaView>
  );
}
