import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
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
  isScoreNotProvided,
} from '@sk/shared';

import { Tabs } from '../../../../components/Tabs';
import { OverflowMenu } from '../../../../components/OverflowMenu';
import { ScreenHeader } from '../../../../components/ScreenHeader';
import { formatDateRange, dateCountdown } from '../../../../utils/dates';
import { TournamentHome, useTournamentSteps } from '../../../../components/tournament/TournamentHome';
import { OrganizersDialog } from '../../../../components/tournament/TournamentDialogs';
import { useOrgSummary } from '../../../../hooks/useOrgSummary';
import { StandingsTable } from '../../../../components/tournament/StandingsTable';
import { DivisionStandings } from '../../../../components/tournament/DivisionStandings';
import { DivisionPanel } from '../../../../components/tournament/DivisionPanel';
import { EventRoleChips } from '../../../../components/EventRoleChips';
import { useLiveRoom } from '../../../../hooks/useLiveRoom';
import { useEventCapabilities, useMyEventGrants } from '../../../../hooks/useEventCapabilities';
import { useEventEntrants } from '../../../../hooks/useEventEntrants';
import { getMatchPermissions } from '../../../../utils/matchPermissions';
import { deriveEventRoles } from '@sk/shared';
import { resolveEventType, unknownEventTypeMessage } from '@sk/shared';
import { isCollapsed } from '@sk/shared';
import { themeColor } from '../../../../constants/Colors';

/**
 * One event, at whichever of its two altitudes applies.
 *
 * A `SingleMatch` is one game and shows it. A `Tournament` is a structure — divisions, stages and
 * the fixtures under them — and shows that, with the collapse rule (U15) hiding every level that
 * has only one child. A tournament's first tab is read-first (stage 2, docs/events.md): *Setting up*
 * — five step cards, the setup itself — while there is setup to do, and the *Overview* after and
 * for everyone else ([TournamentHome](../../../../components/tournament/TournamentHome.tsx)). It
 * replaced the U48 checklist, whose rows each opened a step screen of their own (closes `UI-11`).
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
  const { orgId, eventId, tab: tabParam } = useLocalSearchParams<{
    orgId: string;
    eventId: string;
    tab?: string;
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
  const { entrants, byDivision: entrantsByDivision } = useEventEntrants(eventId, canEdit);
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
   * The first tab, then `Schedule / Standings` (docs/events.md, stage 2).
   *
   * The first tab is *Setting up* for an organiser while the tournament is being set up — the setup
   * itself, five step cards — and *Overview* once it is set up, and for everyone else: the
   * tournament as everyone sees it. Its key stays `setup`, so `?tab=setup` from a division or
   * entrants screen still lands on it. It is the default tab in every phase.
   */
  const [activeTab, setActiveTab] = useState<'setup' | 'schedule' | 'standings'>(
    () => (tabParam === 'schedule' || tabParam === 'standings' ? tabParam : 'setup')
  );
  const [organizersOpen, setOrganizersOpen] = useState(false);
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

  /** Where each setup step stands, and the tournament's host for the Schools list. */
  const { steps: setupSteps, complete: setupComplete, nextIndex } = useTournamentSteps({
    event,
    divisions: orderedDivisions,
    games,
    entrants,
    entrantsByDivision,
    facilityIds: savedFacilityIds,
    sports,
    sites,
  });
  const { org: hostOrg } = useOrgSummary(event?.orgId);

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
  const subjectNoun = resolved.kind === 'SingleMatch' ? 'match' : 'tournament';

  const resultsRecorded = games.filter(g => g.status === 'Finished').length;
  const header = (
    <>
      {/* One of the thirty-four screens `UI-10` is about, converted here because U49 was rewriting
          this header anyway and the menu it gained is exactly what the `right` prop is for. */}
      <ScreenHeader
        /* A tournament's name is its banner's (stage 2), so the bar names what the page is. */
        title={resolved.kind === 'Tournament' ? 'Tournament' : event.name}
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
                      : 'Permanently deletes the tournament, its divisions and its fixtures.',
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
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        {header}
        <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 60 }}>
          <View className="gap-6">
            <GlassCard className="border border-line p-5">
              <Text className="font-orbitron-bold text-[9px] text-ink-muted uppercase tracking-widest mb-4">
                Single Match Details
              </Text>

              {game ? (
                <View className="gap-6 items-center">
                  <View className="flex-row justify-between items-center w-full">
                    <View className="flex-1 items-center">
                      <Text className="font-orbitron-bold text-base text-ink text-center">
                        {participantLabel(home) || 'TBD'}
                      </Text>
                      {hasLiveScore(game) && (
                        <Text className="font-orbitron-bold text-4xl text-primary-ink mt-2">
                          {game.scores?.[home?.id || ''] ?? 0}
                        </Text>
                      )}
                    </View>
                    <View className="px-4 items-center">
                      <Text className="font-inter-bold text-xs text-ink-muted uppercase tracking-wider">VS</Text>
                      {isScoreNotProvided(game) && (
                        <Text className="font-inter text-[10px] text-ink-muted mt-2 text-center">
                          Score not provided
                        </Text>
                      )}
                    </View>
                    <View className="flex-1 items-center">
                      <Text className="font-orbitron-bold text-base text-ink text-center">
                        {participantLabel(away) || 'TBD'}
                      </Text>
                      {hasLiveScore(game) && (
                        <Text className="font-orbitron-bold text-4xl text-primary-ink mt-2">
                          {game.scores?.[away?.id || ''] ?? 0}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View className="bg-sunken px-4 py-2 rounded-xl border border-line-soft w-full flex-row justify-around">
                    <View className="items-center">
                      <Text className="font-inter text-[10px] text-ink-muted uppercase">Status</Text>
                      <Text className="font-orbitron-bold text-xs text-ink mt-0.5">
                        {game.status}
                      </Text>
                    </View>
                    <View className="items-center">
                      <Text className="font-inter text-[10px] text-ink-muted uppercase">Where</Text>
                      <Text className="font-orbitron-bold text-xs text-ink mt-0.5">
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
                  <Text className="font-inter text-xs text-ink-muted italic">
                    No game configured for this match.
                  </Text>
                </View>
              )}
            </GlassCard>

            {!canEdit && (
              <GlassCard className="border border-primary-line bg-primary-soft p-4 flex-row items-center gap-3">
                <Ionicons name="information-circle-outline" size={20} color={themeColor(isDark, 'primary')} />
                <Text className="font-inter text-xs text-ink-muted flex-1 leading-relaxed">
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
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      {header}

      <View className="bg-card">
        <Tabs
          items={[
            { key: 'setup', label: canEdit && !setupComplete ? 'Setting up' : 'Overview' },
            { key: 'schedule', label: 'Schedule' },
            { key: 'standings', label: 'Standings' },
          ]}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as typeof activeTab)}
        />
      </View>

      {/* One scroll for all three tabs. Setup needed its own while it was an accordion, because
          `stickyHeaderIndices` addresses a scroll's children by position and a `false` sibling is
          stripped on native but kept on web — so the pinned row differed between platforms. With
          the steps on their own screens there is nothing to pin and nothing to index (U48). */}
      <ScrollView className="flex-1" contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 60 }}>
        {/* The first tab (stage 2): Setting up while there is setup to do, the Overview after. Each
            card saves itself through its own dialog, so the tab is never dirty. */}
        {activeTab === 'setup' && (
          <View className="w-full self-center" style={{ maxWidth: canEdit && !setupComplete ? 780 : 960 }}>
            <TournamentHome
              event={event}
              orgId={orgId}
              canEdit={canEdit}
              isWide={isWide}
              steps={setupSteps}
              nextIndex={nextIndex}
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
            />
          </View>
        )}
        {activeTab === 'schedule' && (
          <View className="gap-6">
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
              <View className="gap-3">
                <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-widest pl-1">
                  Divisions
                </Text>
                {orderedDivisions.map(division => (
                    <TouchableOpacity
                      key={division.id}
                      onPress={() =>
                        router.push(`/admin/${orgId}/events/${eventId}/divisions/${division.id}/schedule`)
                      }
                      activeOpacity={0.85}
                    >
                      <GlassCard className="border border-line p-4 flex-row items-center justify-between">
                        <View className="flex-1 min-w-0">
                          <Text
                            className="font-orbitron-bold text-sm text-ink"
                            numberOfLines={1}
                          >
                            {division.name}
                          </Text>
                          <Text className="font-inter text-[10px] text-ink-muted mt-0.5">
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
              <GlassCard className="border border-dashed border-line p-6 items-center">
                <Ionicons name="git-branch-outline" size={36} color={secondary} style={{ opacity: 0.3 }} />
                <Text className="font-orbitron text-[10px] text-ink-muted uppercase tracking-widest mt-2">
                  Nothing set up yet
                </Text>
                <Text className="font-inter text-xs text-ink-muted text-center mt-2">
                  No divisions yet. Choose the tournament's sports under Setup, Sports & Divisions —
                  each sport gets its first division as soon as it is chosen.
                </Text>
              </GlassCard>
            )}

            {/* Fixtures that belong to no division at all. They exist on events built before this
                release, and they would otherwise be invisible on a multi-division tournament. */}
            {orderedDivisions.length > 1 && games.some(g => !g.stageId) && (
              <GlassCard className="border border-line p-5">
                <Text className="font-orbitron-bold text-[9px] text-ink-muted uppercase tracking-widest mb-3">
                  Not in a division
                </Text>
                <View className="gap-2">
                  {games
                    .filter(g => !g.stageId)
                    .map(game => (
                      <TouchableOpacity
                        key={game.id}
                        onPress={() =>
                          router.push(`/admin/${orgId}/events/${eventId}/games/${game.id}/view`)
                        }
                        className="flex-row items-center justify-between bg-sunken rounded-xl px-3 py-3 active:opacity-85"
                      >
                        <Text
                          className="font-inter-bold text-xs text-ink flex-1"
                          numberOfLines={1}
                        >
                          {participantLabel(game.participants?.[0]) || 'TBD'} vs{' '}
                          {participantLabel(game.participants?.[1]) || 'TBD'}
                        </Text>
                        <Text className="font-inter text-[10px] text-ink-muted pl-2">
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
          <View className="gap-4">
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
          </View>
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
