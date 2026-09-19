import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { useActiveTheme } from '../../../../store/settingsStore';
import { wsService } from '../../../../services/websocket';
import { sendAction } from '../../../../services/actions';
import { useWsStore } from '../../../../store/wsStore';
import { useAuthStore } from '../../../../store/authStore';
import {
  SocketAction,
  Event,
  GameSummary,
  Sport,
  Site,
  Facility,
  TournamentDivision,
  TournamentOrganizer,
  LeagueStandingRow,
  participantLabel,
  hasLiveScore,
} from '@sk/shared';
import { COLORS, getThemeColor } from '../../../../constants/Colors';
import { Tabs } from '../../../../components/Tabs';
import {
  SetupChecklistIntro,
  SetupDismissedSteps,
  SetupChecklistRow,
  SetupStep,
} from '../../../../components/SetupChecklist';
import { OverflowMenu } from '../../../../components/OverflowMenu';
import { ScreenHeader } from '../../../../components/ScreenHeader';
import { formatDateRange, dateCountdown } from '../../../../utils/dates';
import { SETUP_STEPS } from '../../../../components/tournament/setupSteps';
import { StandingsTable } from '../../../../components/tournament/StandingsTable';
import { DivisionStandings } from '../../../../components/tournament/DivisionStandings';
import { DivisionPanel } from '../../../../components/tournament/DivisionPanel';
import { EventRoleChips } from '../../../../components/EventRoleChips';
import { useLiveRoom } from '../../../../hooks/useLiveRoom';
import { useEventCapabilities, useMyEventGrants } from '../../../../hooks/useEventCapabilities';
import { useEventEntrants } from '../../../../hooks/useEventEntrants';
import { getMatchPermissions } from '../../../../utils/matchPermissions';
import { deriveEventRoles } from '@sk/shared';
import { resolveEventType, tournamentFormatLabel, unknownEventTypeMessage } from '@sk/shared';
import { isCollapsed } from '@sk/shared';

/**
 * One event, at whichever of its two altitudes applies.
 *
 * A `SingleMatch` is one game and shows it. A `Tournament` is a structure — divisions, stages and
 * the fixtures under them — and shows that, with the collapse rule (U15) hiding every level that
 * has only one child. Its Setup tab is the **checklist** and nothing else: five rows in the order
 * a tournament is actually set up (U46), each opening a screen of its own (U48). It is where a
 * tournament is finished rather than created — creation is a name and a date on the events list
 * (U45). A type we cannot name shows an error rather than guessing at Tournament, which is
 * `FIX-1` / U39.
 *
 * **The work left this file with U48.** The Setup tab used to hold six accordion sections and
 * every input they contained, one form, one save bar, and a pair of platform-specific pinning
 * mechanisms to keep the open section's heading visible. What is left of all that is the step
 * statuses — computed here because this is the screen that already holds the event, its divisions,
 * its fixtures and its entrants — and the rows that report them.
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
  const { orgId, eventId, tab: tabParam } = useLocalSearchParams<{
    orgId: string;
    eventId: string;
    tab?: string;
  }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);
  const secondary = getThemeColor(isDark, 'textSecondary');

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
  // ------------------------------------------------------------------------------------------

  const eventRoom = eventId ? `event:${eventId}` : null;
  const eventFixturesRoom = eventId ? `event:${eventId}:fixtures` : null;
  const eventDivisionsRoom = eventId ? `event:${eventId}:divisions` : null;
  const eventFacilitiesRoom = eventId ? `event:${eventId}:facilities` : null;
  const eventStandingsRoom = eventId ? `event:${eventId}:standings` : null;

  const { items: eventItems, isLoading: eventLoading, accessDenied } = useLiveRoom<Event>(eventRoom, {
    reduce: (message) => {
      switch (message.type) {
        case 'EVENT_ADDED':
        case 'EVENT_UPDATED':
          return { kind: 'upsert', item: message.data };
        case 'EVENT_DELETED':
          return { kind: 'remove', id: message.data?.id };
        default:
          return { kind: 'ignore' };
      }
    },
  });
  const event = eventItems.find(e => e?.id === eventId) || null;

  const { items: games } = useLiveRoom<GameSummary>(eventFixturesRoom, {
    reduce: (message) => {
      switch (message.type) {
        case 'GAME_SUMMARIES_SYNC':
          return { kind: 'replace', items: message.data || [] };
        case 'STAGE_FIXTURES_SYNC':
          return { kind: 'upsertMany', items: message.data?.games || [] };
        case 'GAME_SUMMARY_UPDATED':
          return { kind: 'upsert', item: message.data };
        case 'GAME_SUMMARY_REMOVED':
        case 'GAME_DELETED':
          return { kind: 'remove', id: message.data?.id };
        default:
          return { kind: 'ignore' };
      }
    },
  });

  // The divisions room hands these over on join, so the screen never has to join a division's own
  // room just to learn that it exists.
  const { items: divisions } = useLiveRoom<TournamentDivision>(eventDivisionsRoom, {
    reduce: (message) => {
      switch (message.type) {
        case 'DIVISIONS_SYNC':
          return { kind: 'replace', items: message.data || [] };
        case 'DIVISION_ADDED':
        case 'DIVISION_UPDATED':
          return { kind: 'upsert', item: message.data };
        case 'DIVISION_DELETED':
          return { kind: 'remove', id: message.data?.id };
        default:
          return { kind: 'ignore' };
      }
    },
  });

  /**
   * The facilities in play (U47).
   *
   * A **set**, and the base site beside it is not a filter on it: a tournament based at the school
   * may still play half its fixtures on the fields next door. `event:{id}:facilities` owns this, so
   * it arrives on join and again whenever anybody changes it, like everything else on this screen.
   *
   * Held as `{ id }` rows because that is the shape `useLiveRoom` addresses items by; the ids
   * themselves are what every consumer wants, which is what `savedFacilityIds` unwraps.
   */
  const { items: eventFacilityRows } = useLiveRoom<{ id: string }>(eventFacilitiesRoom, {
    reduce: (message) =>
      message.type === 'EVENT_FACILITIES_SYNC'
        ? {
            kind: 'replace',
            items: (message.data?.facilityIds || []).map((id: string) => ({ id })),
          }
        : { kind: 'ignore' },
  });

  const { items: serverStandings } = useLiveRoom<LeagueStandingRow>(eventStandingsRoom, {
    reduce: (message) =>
      message.type === 'EVENT_STANDINGS_UPDATED'
        ? { kind: 'replace', items: message.data?.rows || [] }
        : { kind: 'ignore' },
    getId: (row: any) => row?.teamId,
  });

  const { items: sites } = useLiveRoom<Site>(orgId ? `org:${orgId}:sites` : null, {
    reduce: (message) => {
      switch (message.type) {
        case 'SITES_SYNC':
          return { kind: 'replace', items: message.data || [] };
        case 'SITE_ADDED':
        case 'SITE_UPDATED':
          return { kind: 'upsert', item: message.data };
        case 'SITE_DELETED':
          return { kind: 'remove', id: message.data?.id };
        default:
          return { kind: 'ignore' };
      }
    },
  });

  const { items: facilities } = useLiveRoom<Facility>(orgId ? `org:${orgId}:facilities` : null, {
    reduce: (message) => {
      switch (message.type) {
        case 'FACILITIES_SYNC':
          return { kind: 'replace', items: message.data || [] };
        case 'FACILITY_ADDED':
        case 'FACILITY_UPDATED':
          return { kind: 'upsert', item: message.data };
        case 'FACILITY_DELETED':
          return { kind: 'remove', id: message.data?.id };
        default:
          return { kind: 'ignore' };
      }
    },
  });

  // Sports are global reference data that no room owns, so this stays a one-shot read.
  const [sports, setSports] = useState<Sport[]>([]);
  useEffect(() => {
    if (!isConnected) return;
    let active = true;
    wsService.emit('get_data', { type: 'sports' }, (res: any) => {
      if (active && Array.isArray(res)) setSports(res);
    });
    return () => {
      active = false;
    };
  }, [isConnected]);

  // ------------------------------------------------------------------------------------------
  // Permissions
  // ------------------------------------------------------------------------------------------

  const { capabilities } = useEventCapabilities(eventId);
  const grants = useMyEventGrants();
  /**
   * What the server says, rather than `event.orgId === orgId`, which was the old test.
   *
   * That question cannot see an appointed organiser who is not an org admin (D33), and it answered
   * "yes" for any member of the hosting org whether or not they could actually write anything.
   */
  const canEdit = !!capabilities?.canEditEvent;

  /**
   * How many competitors have been entered, for the checklist.
   *
   * Joined only for a viewer who may edit, because the roster is the organiser's tier — and only
   * a viewer who may edit sees the checklist at all, so there is nothing to load for anybody else.
   */
  const { entrants } = useEventEntrants(eventId, canEdit);
  const entrantCount = entrants.filter(entrant => entrant.status !== 'withdrawn').length;

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
   * `Setup / Schedule / Standings` for an organiser; `Schedule / Standings` for everyone else.
   *
   * Setup is where the checklist lives **and** where every input it points at lives, so a step is
   * always one tap from the thing that completes it. Settings is gone as a tab: its contents were
   * setup, and the danger zone sits at the bottom of Setup, which is the last place you go for a
   * tournament. The default tab keys off phase (§8): Setup while the checklist is incomplete,
   * Schedule once it is done. Reversed 2026-09-07 from "checklist at the top of Schedule", which
   * left three of six steps with nowhere to go.
   */
  const [activeTab, setActiveTab] = useState<'setup' | 'schedule' | 'standings'>(
    () => (tabParam === 'setup' || tabParam === 'standings' ? tabParam : 'schedule')
  );
  const defaultTabApplied = useRef(false);

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

  const savedFacilityIds = useMemo(
    () => eventFacilityRows.map(row => row.id),
    [eventFacilityRows]
  );

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

  const getVenueLabel = (siteId?: string, facilityId?: string): string | undefined => {
    const site = sites.find(s => s.id === siteId)?.name;
    const facility = facilities.find(f => f.id === facilityId)?.name;
    const parts = [site, facility].filter(Boolean);
    return parts.length ? parts.join(' · ') : undefined;
  };

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

  const dismissedSteps = event?.settings?.dismissedSetupSteps || [];

  const saveDismissed = (next: string[]) => {
    if (!event) return;
    void sendAction(SocketAction.UPDATE_EVENT, {
      id: eventId,
      orgId,
      data: { settings: { ...(event.settings || {}), dismissedSetupSteps: next } },
    });
  };

  /**
   * Where each step stands, in the order the work is actually done (U46).
   *
   * The order, the labels and the routes are
   * [setupSteps.ts](file:///c:/Fred/Coding/SK/expo-app/components/tournament/setupSteps.ts); what
   * is computed here is the half that needs data — whether a step is done, and the line of detail
   * that says where it has got to. This screen already holds the event, its divisions, its
   * fixtures and its entrants, so the statuses cost nothing; a checklist that fetched to render a
   * number would fetch on every broadcast.
   *
   * Scoring comes before fixtures rather than last, because it is a rule of the competition rather
   * than a finishing touch: it binds the moment the first result is entered, and leaving it to the
   * end is how a morning gets scored on defaults nobody chose.
   *
   * A step is done by the **state of the data**, never by having been visited — which is what
   * keeps this a checklist rather than a wizard (U17), now that each step has a screen it could
   * plausibly have been marked complete by leaving.
   */
  const setupSteps: SetupStep[] = useMemo(() => {
    const fixtureCount = games.length;
    const scoring = event?.settings?.scoring;
    const scoringDetail =
      scoring?.mode === 'byResult'
        ? `${scoring.pointsPerWin} / ${scoring.pointsPerDraw} / ${scoring.pointsPerLoss} for a win, draw, loss`
        : scoring?.mode === 'byPlacing'
        ? 'Points by finishing position'
        : 'Using the default 3 / 1 / 0';

    // The same formatter the header uses — this row said `2026-09-19` under a header reading
    // `Sat 19 Sep 2026` until U49, which is the disagreement this consolidation is about.
    const whenLabel = formatDateRange(event?.startDate, event?.endDate, { compact: true });
    const venueName = sites.find(s => s.id === event?.siteId)?.name;
    const facilityCount = savedFacilityIds.length;
    const invitedCount = (event?.participatingOrgs || []).length;

    const state: Record<string, Omit<SetupStep, 'key' | 'label' | 'dismissible'>> = {
      basics: {
        status: event?.siteId || facilityCount > 0 ? 'done' : 'todo',
        detail:
          [
            whenLabel,
            venueName,
            facilityCount > 0
              ? `${facilityCount} facilit${facilityCount === 1 ? 'y' : 'ies'}`
              : undefined,
            organizers.length > 0
              ? `${organizers.length} organiser${organizers.length === 1 ? '' : 's'}`
              : undefined,
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
      },
      divisions: {
        status: effectiveSportIds.length > 0 ? 'done' : 'todo',
        detail:
          [
            effectiveSportIds.map(id => sportName(id)).filter(Boolean).join(', ') || undefined,
            orderedDivisions.length > 0
              ? `${orderedDivisions.length} division${orderedDivisions.length === 1 ? '' : 's'}`
              : undefined,
            divisionsWithoutSport > 0 ? `${divisionsWithoutSport} without a sport` : undefined,
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
        hint:
          effectiveSportIds.length > 0
            ? undefined
            : 'Choose the sports being played. Each gets its first division straight away; add more for age groups.',
      },
      entrants: {
        status: entrantCount > 0 ? 'done' : 'todo',
        detail:
          [
            invitedCount > 0 ? `${invitedCount} invited` : undefined,
            entrantCount > 0 ? `${entrantCount} entered` : undefined,
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
        hint:
          entrantCount > 0
            ? undefined
            : 'Invite the organisations coming, then enter teams by division or a school at a time.',
      },
      /**
       * `default` rather than `todo` when nothing has been chosen (U49).
       *
       * The row used to say "Using the default 3 / 1 / 0" and carry the word **To do** beside it,
       * which is a contradiction: it reported the competition as already scored and unscored at
       * once. It is neither — 3 / 1 / 0 is what the server will use (D17), so nothing is blocked,
       * but nobody has agreed to it, so it is not done either.
       */
      scoring: {
        status: scoring ? 'done' : 'default',
        detail: scoring ? scoringDetail : undefined,
        hint: 'Points default to 3 / 1 / 0 for a win, draw and loss. Open to confirm or change them.',
      },
      fixtures: {
        status: fixtureCount > 0 ? 'done' : 'todo',
        detail: fixtureCount > 0 ? `${fixtureCount} added` : undefined,
        hint:
          fixtureCount > 0
            ? undefined
            : entrantCount >= 2
            ? 'A draw can be generated for you, or add fixtures by hand.'
            : 'Fixtures follow entrants — or add them by hand at any time.',
      },
    };

    return SETUP_STEPS.map(step => ({
      key: step.key,
      label: step.label,
      purpose: step.purpose,
      icon: step.icon,
      dismissible: step.dismissible,
      ...state[step.key],
    }));
  }, [
    orderedDivisions,
    effectiveSportIds,
    divisionsWithoutSport,
    sports,
    sites,
    organizers.length,
    savedFacilityIds.length,
    games.length,
    entrantCount,
    event?.siteId,
    event?.startDate,
    event?.endDate,
    event?.participatingOrgs,
    event?.settings?.scoring,
    orgId,
    eventId,
  ]);

  const visibleSteps = setupSteps.filter(step => !dismissedSteps.includes(step.key));
  const hiddenSteps = setupSteps.filter(step => dismissedSteps.includes(step.key));
  const setupComplete = visibleSteps.every(step => step.status === 'done');
  const openStep = (key: string) => {
    const href = SETUP_STEPS.find(s => s.key === key)?.href(orgId, eventId);
    if (href) router.push(href as any);
  };

  /**
   * Land an organiser on Setup while there is setup to do, once, when we first learn they may
   * edit. Not re-evaluated afterwards: a step completing under them must not yank the tab.
   */
  useEffect(() => {
    if (defaultTabApplied.current || !event || !capabilities) return;
    defaultTabApplied.current = true;
    if (canEdit && !setupComplete) setActiveTab('setup');
  }, [event, capabilities, canEdit, setupComplete]);

  // ------------------------------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------------------------------

  const handleCancelEvent = () => {
    setIsProcessing(true);
    // `orgId`: as in `saveDismissed`. The status follows the event room; a refusal is toasted.
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
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950 justify-center items-center px-8">
        <Ionicons name="lock-closed-outline" size={44} color={COLORS.dark.textSecondary} style={{ opacity: 0.3 }} />
        <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300 mt-4">No Access</Text>
        <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 text-center mt-1">
          You do not have permission to view this event.
        </Text>
      </SafeAreaView>
    );
  }

  if (eventLoading || !event) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950 justify-center items-center">
        <ActivityIndicator size="large" color={COLORS.brand.orange} />
        <Text className="font-orbitron text-xs text-slate-500 mt-4 uppercase tracking-widest">
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
  const subjectNoun = resolved.kind === 'SingleMatch' ? 'match' : 'tournament';

  const header = (
    <>
      {/* One of the thirty-four screens `UI-10` is about, converted here because U49 was rewriting
          this header anyway and the menu it gained is exactly what the `right` prop is for. */}
      <ScreenHeader
        title={event.name}
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
                {
                  label: 'Cancel event',
                  description: `Marks the ${subjectNoun} as cancelled. Nothing is deleted.`,
                  icon: 'ban-outline',
                  disabled: event.status === 'Cancelled',
                  onPress: () => setIsCancelling(true),
                },
                {
                  label: 'Delete event',
                  description:
                    resolved.kind === 'SingleMatch'
                      ? 'Permanently deletes the match and everything recorded against it.'
                      : 'Permanently deletes the tournament, its divisions and its fixtures.',
                  icon: 'trash-outline',
                  destructive: true,
                  onPress: () => setIsDeleting(true),
                },
              ]}
            />
          ) : undefined
        }
      />

      <View className="bg-white dark:bg-slate-900 px-6 py-2.5 flex-row justify-between items-center gap-3 border-b border-slate-100 dark:border-white/5">
        <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
          <Ionicons name="calendar-outline" size={16} color={COLORS.brand.orange} />
          <View className="flex-1 min-w-0">
            <Text className="font-inter-bold text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {dateLabel ? (isMultiDay ? 'Runs' : 'Takes place') : 'When'}
            </Text>
            <Text
              className="font-inter-bold text-xs text-slate-700 dark:text-slate-200"
              numberOfLines={1}
            >
              {dateLabel || 'No date set yet'}
              {!!countdown && (
                <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
                  {`  ·  ${countdown}`}
                </Text>
              )}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <EventRoleChips roles={roles} />
          <View className="bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded">
            <Text className="font-orbitron-bold text-[9px] text-slate-700 dark:text-slate-400 uppercase tracking-widest">
              {/* A tournament is described by its format, which is also its label (U34). */}
              {resolved.kind === 'Tournament' ? tournamentFormatLabel(event) : resolved.label}
            </Text>
          </View>
        </View>
      </View>
    </>
  );

  // U39 — an event whose type we cannot name is an error state, never a Tournament by default.
  if (resolved.kind === 'Unknown') {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
        {header}
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="alert-circle-outline" size={44} color={COLORS.brand.red} style={{ opacity: 0.7 }} />
          <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300 mt-4 text-center">
            We cannot show this event
          </Text>
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 text-center mt-2 leading-relaxed">
            {unknownEventTypeMessage(resolved)}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------- single match ---
  if (resolved.kind === 'SingleMatch') {
    const game = games[0];
    const perms = getMatchPermissions({
      game: game || null,
      event,
      currentOrgId: orgId,
      user,
      orgMemberships,
      teamMemberships,
      capabilities,
    });
    const home = game?.participants?.[0];
    const away = game?.participants?.[1];

    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
        {header}
        <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 60 }}>
          <View className="space-y-6">
            <GlassCard className="border border-slate-200 dark:border-white/5 p-5">
              <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
                Single Match Details
              </Text>

              {game ? (
                <View className="space-y-6 items-center">
                  <View className="flex-row justify-between items-center w-full">
                    <View className="flex-1 items-center">
                      <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white text-center">
                        {participantLabel(home) || 'TBD'}
                      </Text>
                      {hasLiveScore(game) && (
                        <Text className="font-orbitron-bold text-4xl text-brand-orange mt-2">
                          {game.scores?.[home?.id || ''] ?? 0}
                        </Text>
                      )}
                    </View>
                    <View className="px-4">
                      <Text className="font-inter-bold text-xs text-slate-400 uppercase tracking-wider">VS</Text>
                    </View>
                    <View className="flex-1 items-center">
                      <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white text-center">
                        {participantLabel(away) || 'TBD'}
                      </Text>
                      {hasLiveScore(game) && (
                        <Text className="font-orbitron-bold text-4xl text-brand-orange mt-2">
                          {game.scores?.[away?.id || ''] ?? 0}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View className="bg-slate-100 dark:bg-white/5 px-4 py-2 rounded-xl border border-slate-200/50 dark:border-white/5 w-full flex-row justify-around">
                    <View className="items-center">
                      <Text className="font-inter text-[10px] text-slate-500 uppercase">Status</Text>
                      <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white mt-0.5">
                        {game.status}
                      </Text>
                    </View>
                    <View className="items-center">
                      <Text className="font-inter text-[10px] text-slate-500 uppercase">Venue</Text>
                      <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white mt-0.5">
                        {getVenueLabel(game.siteId, game.facilityId) || 'Default Site'}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row gap-2 w-full">
                    <Button
                      title="View Match"
                      variant="secondary"
                      onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/${game.id}/view`)}
                      className="flex-1 py-2.5 rounded-lg shadow-sm"
                    />
                    {perms.canSelectLineup && (
                      <Button
                        title="Lineup"
                        variant="secondary"
                        onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/${game.id}/selection`)}
                        className="flex-1 py-2.5 rounded-lg shadow-sm"
                      />
                    )}
                    {perms.canEdit && (
                      <Button
                        title="Edit Match"
                        variant="secondary"
                        onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/${game.id}/edit`)}
                        className="flex-1 py-2.5 rounded-lg shadow-sm"
                      />
                    )}
                    {perms.canScore && (
                      <Button
                        title="Score Match"
                        onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/${game.id}/score`)}
                        className="flex-1 py-2.5 rounded-lg"
                      />
                    )}
                  </View>
                </View>
              ) : (
                <View className="items-center py-6">
                  <Text className="font-inter text-xs text-slate-400 italic">
                    No game configured for this match.
                  </Text>
                </View>
              )}
            </GlassCard>

            {!canEdit && (
              <GlassCard className="border border-brand-orange/20 bg-brand-orange/5 p-4 flex-row items-center gap-3">
                <Ionicons name="information-circle-outline" size={20} color={COLORS.brand.orange} />
                <Text className="font-inter text-xs text-slate-600 dark:text-slate-400 flex-1 leading-relaxed">
                  You are viewing this event in read-only mode.
                </Text>
              </GlassCard>
            )}

          </View>
        </ScrollView>

        <ConfirmationModal
          isOpen={isCancelling}
          title="Cancel this event?"
          description="The match will be marked as cancelled. Nothing is deleted."
          confirmText="Cancel Event"
          cancelText="Keep it"
          onConfirm={handleCancelEvent}
          onClose={() => setIsCancelling(false)}
          isProcessing={isProcessing}
        />
        <ConfirmationModal
          isOpen={isDeleting}
          title="Delete this event?"
          description="This permanently deletes the match and everything recorded against it."
          confirmText="Delete Event"
          cancelText="Cancel"
          onConfirm={handleDeleteEvent}
          onClose={() => setIsDeleting(false)}
          isProcessing={isProcessing}
        />
      </SafeAreaView>
    );
  }



  // ------------------------------------------------------------------------------ tournament ---
  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {header}

      <View className="bg-white dark:bg-slate-900">
        <Tabs
          items={
            canEdit
              ? [
                  {
                    /**
                     * A dot, not a count (U49). The badge read `2` — outstanding steps, counting
                     * down — directly above a progress bar counting *done* steps up, and a bare
                     * number beside a tab label is read as unread items anyway. The dot says
                     * there is work here; the page behind it says how much, in words.
                     */
                    key: 'setup',
                    label: 'Setup',
                    dot: !setupComplete,
                  },
                  { key: 'schedule', label: 'Schedule' },
                  { key: 'standings', label: 'Standings' },
                ]
              : [
                  { key: 'schedule', label: 'Schedule' },
                  { key: 'standings', label: 'Standings' },
                ]
          }
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as typeof activeTab)}
        />
      </View>

      {/* One scroll for all three tabs. Setup needed its own while it was an accordion, because
          `stickyHeaderIndices` addresses a scroll's children by position and a `false` sibling is
          stripped on native but kept on web — so the pinned row differed between platforms. With
          the steps on their own screens there is nothing to pin and nothing to index (U48). */}
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 60 }}>
        {/* The checklist (U48): where every step stands, and the way in to each one. There is no
            save bar here — a step is saved on its own screen, so this tab can never be dirty. */}
        {activeTab === 'setup' && canEdit && (
          <View className="gap-3">
            {/* What the list is, and how far through it this tournament is. The rows below say
                where each step stands; nothing but this says what they add up to, or that none of
                it has to be done today — which is the thing an organiser opening a half-finished
                tournament in March actually wants to be told. */}
            <View className="pb-1">
              <SetupChecklistIntro steps={visibleSteps} />
            </View>

            {/* Outstanding steps are tinted, done ones are not, so where the work is left reads
                off the shape of the list before a word of it is (U49). No separate "next up" card:
                that put a summary back above the list, which is the shape this page has failed as
                twice before. */}
            {visibleSteps.map(step => (
              <SetupChecklistRow key={step.key} step={step} onPress={() => openStep(step.key)} />
            ))}

            <View className="pt-2">
              <SetupDismissedSteps
                steps={hiddenSteps}
                onRestore={key => saveDismissed(dismissedSteps.filter(k => k !== key))}
              />
            </View>
          </View>
        )}
        {activeTab === 'schedule' && (
          <View className="space-y-6">
            {/* THE COLLAPSE RULE (U15).
                One division and its panel is shown here directly — no list of one to click through.
                Several, and each is listed and opens its own screen. Setup names the division
                either way (U50); this is a shortcut, not a secret. */}
            {onlyDivision ? (
              <DivisionPanel
                orgId={orgId}
                eventId={eventId}
                divisionId={onlyDivision.id}
                canEdit={canEdit || capabilities?.convenesDivisionIds.includes(onlyDivision.id) === true}
                collapsed
              />
            ) : orderedDivisions.length > 1 ? (
              <View className="space-y-3">
                <Text className="font-orbitron-bold text-[10px] text-slate-500 uppercase tracking-widest pl-1">
                  Divisions
                </Text>
                {orderedDivisions.map(division => (
                    <TouchableOpacity
                      key={division.id}
                      onPress={() =>
                        router.push(`/admin/${orgId}/events/${eventId}/divisions/${division.id}`)
                      }
                      activeOpacity={0.85}
                    >
                      <GlassCard className="border border-slate-200 dark:border-white/5 p-4 flex-row items-center justify-between">
                        <View className="flex-1 min-w-0">
                          <Text
                            className="font-orbitron-bold text-sm text-slate-800 dark:text-white"
                            numberOfLines={1}
                          >
                            {division.name}
                          </Text>
                          <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {[
                              sports.find(s => s.id === division.sportId)?.name,
                              division.ageGroup,
                              capabilities?.convenesDivisionIds.includes(division.id)
                                ? 'You run this'
                                : undefined,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'No sport set'}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={secondary} />
                      </GlassCard>
                    </TouchableOpacity>
                ))}
              </View>
            ) : (
              <GlassCard className="border border-dashed border-slate-200 dark:border-white/10 p-6 items-center">
                <Ionicons name="git-branch-outline" size={36} color={secondary} style={{ opacity: 0.3 }} />
                <Text className="font-orbitron text-[10px] text-slate-500 uppercase tracking-widest mt-2">
                  Nothing set up yet
                </Text>
                <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 text-center mt-2">
                  No divisions yet. Choose the tournament's sports under Setup, Sports & Divisions —
                  each sport gets its first division as soon as it is chosen.
                </Text>
              </GlassCard>
            )}

            {/* Fixtures that belong to no division at all. They exist on events built before this
                release, and they would otherwise be invisible on a multi-division tournament. */}
            {orderedDivisions.length > 1 && games.some(g => !g.stageId) && (
              <GlassCard className="border border-slate-200 dark:border-white/5 p-5">
                <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
                  Not in a division
                </Text>
                <View className="space-y-2">
                  {games
                    .filter(g => !g.stageId)
                    .map(game => (
                      <TouchableOpacity
                        key={game.id}
                        onPress={() =>
                          router.push(`/admin/${orgId}/events/${eventId}/games/${game.id}/view`)
                        }
                        className="flex-row items-center justify-between bg-slate-50 dark:bg-white/5 rounded-xl px-3 py-3 active:opacity-85"
                      >
                        <Text
                          className="font-inter-bold text-xs text-slate-800 dark:text-white flex-1"
                          numberOfLines={1}
                        >
                          {participantLabel(game.participants?.[0]) || 'TBD'} vs{' '}
                          {participantLabel(game.participants?.[1]) || 'TBD'}
                        </Text>
                        <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 pl-2">
                          {game.status}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>
              </GlassCard>
            )}

            {canEdit && (
              <Button
                title="Add a fixture"
                variant="secondary"
                onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/new`)}
                className="py-2.5 rounded-lg"
              />
            )}
          </View>
        )}

        {activeTab === 'standings' && (
          <View className="space-y-4">
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
              <View className="space-y-2">
                <Text className="font-orbitron-bold text-[10px] text-slate-500 uppercase tracking-widest pl-1">
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
          </View>
        )}

      </ScrollView>

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
