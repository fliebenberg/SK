import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import DatePicker from '../../../../components/DatePicker';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { useActiveTheme } from '../../../../store/settingsStore';
import { wsService } from '../../../../services/websocket';
import { useWsStore } from '../../../../store/wsStore';
import { useAuthStore } from '../../../../store/authStore';
import {
  SocketAction,
  Event,
  GameSummary,
  Sport,
  Site,
  Facility,
  Organization,
  TournamentDivision,
  TournamentOrganizer,
  LeagueStandingRow,
  participantLabel,
  hasLiveScore,
} from '@sk/shared';
import { COLORS, getThemeColor } from '../../../../constants/Colors';
import CustomSelect from '../../../../components/CustomSelect';
import { Tabs } from '../../../../components/Tabs';
import { OrganizerPicker } from '../../../../components/OrganizerPicker';
import { SetupChecklist, SetupStep } from '../../../../components/SetupChecklist';
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
import { isCollapsed, structureAnnouncement } from '@sk/shared';

/**
 * One event, at whichever of its two altitudes applies.
 *
 * A `SingleMatch` is one game and shows it. A `Tournament` is a structure — divisions, stages and
 * the fixtures under them — and shows that, with the collapse rule (U15) hiding every level that
 * has only one child. A type we cannot name shows an error rather than guessing at Tournament,
 * which is `FIX-1` / U39.
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
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);
  const secondary = getThemeColor(isDark, 'textSecondary');

  const user = useAuthStore((state: any) => state.user);
  const orgMemberships = useAuthStore((state: any) => state.orgMemberships);
  const teamMemberships = useAuthStore((state: any) => state.teamMemberships);

  // ------------------------------------------------------------------------------------------
  // Live data — one room for the event, and the org's own reference data for venue names
  // ------------------------------------------------------------------------------------------

  const eventRoom = eventId ? `event:${eventId}` : null;

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

  const { items: games } = useLiveRoom<GameSummary>(eventRoom, {
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

  // The event room hands these over on join, so the screen never has to join a division's own room
  // just to learn that it exists.
  const { items: divisions } = useLiveRoom<TournamentDivision>(eventRoom, {
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

  const { items: serverStandings } = useLiveRoom<LeagueStandingRow>(eventRoom, {
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

  const [activeTab, setActiveTab] = useState<'schedule' | 'standings' | 'settings'>('schedule');
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
  const [isAddingDivision, setIsAddingDivision] = useState(false);

  const [editName, setEditName] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [editEndDate, setEditEndDate] = useState('');
  const [editSiteId, setEditSiteId] = useState('');
  const [editSportIds, setEditSportIds] = useState<string[]>([]);
  const [editParticipatingOrgs, setEditParticipatingOrgs] = useState<
    Array<{ id: string; name: string; shortName?: string }>
  >([]);
  const [orgSearchText, setOrgSearchText] = useState('');
  const [searchedOrgs, setSearchedOrgs] = useState<Organization[]>([]);
  const [isSearchingOrgs, setIsSearchingOrgs] = useState(false);
  const [organizers, setOrganizers] = useState<TournamentOrganizer[]>([]);

  // Seed the settings form from the event, and re-seed when it changes underneath us.
  useEffect(() => {
    if (!event) return;
    setEditName(event.name);
    setEditStartDate(event.startDate?.split('T')[0] || '');
    setIsMultiDay(!!event.endDate);
    setEditEndDate(event.endDate?.split('T')[0] || '');
    setEditSiteId(event.siteId || '');
    setEditSportIds(event.sportIds || []);
    // Names travel with the event now, so the chips resolve without a lookup (`FIX-2`).
    setEditParticipatingOrgs(event.participatingOrgs || []);
  }, [event?.id, event?.name, event?.startDate, event?.endDate, event?.siteId, event?.participatingOrgs]);

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

  /**
   * The invite picker: a search, not a list of every organisation.
   *
   * "Orgs not yet related to this event" is a set no room owns, so this is a legitimate one-shot
   * read — the other half of `FIX-2`, and the same shape as `PersonnelAutocomplete`.
   */
  useEffect(() => {
    const query = orgSearchText.trim();
    if (!query) {
      setSearchedOrgs([]);
      return;
    }

    setIsSearchingOrgs(true);
    const timer = setTimeout(() => {
      wsService.emit('get_data', { type: 'search_similar_orgs', name: query }, (res: any) => {
        setIsSearchingOrgs(false);
        if (Array.isArray(res)) {
          setSearchedOrgs(
            res.filter(o => o.id !== orgId && !editParticipatingOrgs.some(p => p.id === o.id))
          );
        }
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [orgSearchText, editParticipatingOrgs, orgId]);

  // ------------------------------------------------------------------------------------------
  // Derived
  // ------------------------------------------------------------------------------------------

  const resolved = resolveEventType(event);
  const orderedDivisions = useMemo(
    () => [...divisions].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [divisions]
  );
  // One division renders inline and the word never appears; the concept arrives with the second.
  const divisionsCollapsed = isCollapsed(orderedDivisions.length);
  const onlyDivision = divisionsCollapsed ? orderedDivisions[0] : undefined;

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
    wsService.emit('action', {
      type: SocketAction.UPDATE_EVENT,
      payload: {
        id: eventId,
        userId: user?.id,
        orgId,
        data: { settings: { ...(event.settings || {}), dismissedSetupSteps: next } },
      },
    });
  };

  /**
   * The checklist's steps for Phase 5.
   *
   * Only the steps whose work exists are actionable; the rest say so plainly rather than offering
   * a button that does nothing. Entrants and fixtures became actionable in Phase 6; the schedule
   * grid is Phase 7 and still says what it is waiting for.
   *
   * The entrant count comes from the roster room this screen already holds, not from a count
   * query: a checklist that fetched to render a number would fetch on every broadcast.
   */
  const setupSteps: SetupStep[] = useMemo(() => {
    const fixtureCount = games.length;
    return [
      {
        key: 'structure',
        label: 'Structure',
        status: orderedDivisions.length > 0 ? 'done' : 'todo',
        detail:
          orderedDivisions.length > 1
            ? `${orderedDivisions.length} divisions`
            : orderedDivisions.length === 1
            ? 'Set up'
            : 'Nothing set up yet',
        dismissible: false,
      },
      {
        key: 'organisers',
        label: 'People running it',
        status: organizers.length > 0 ? 'done' : 'todo',
        detail: organizers.length > 0 ? `${organizers.length} appointed` : 'Only your organisation',
        actionLabel: 'Appoint',
        onAction: () => setActiveTab('settings'),
      },
      {
        key: 'entrants',
        label: 'Entrants',
        status: entrantCount > 0 ? 'done' : 'todo',
        detail: entrantCount > 0 ? `${entrantCount} entered` : undefined,
        hint:
          entrantCount > 0
            ? undefined
            : 'Enter teams by division, or a school at a time — both work on the same screen.',
        actionLabel: 'Enter teams',
        onAction: () => router.push(`/admin/${orgId}/events/${eventId}/entrants`),
      },
      {
        key: 'fixtures',
        label: 'Fixtures',
        status: fixtureCount > 0 ? 'done' : 'todo',
        detail: fixtureCount > 0 ? `${fixtureCount} added` : undefined,
        hint:
          fixtureCount > 0
            ? undefined
            : entrantCount >= 2
            ? 'A draw can be generated for you, or add fixtures by hand.'
            : 'Fixtures follow entrants — or add them by hand at any time.',
        actionLabel: 'Add',
        onAction: () => router.push(`/admin/${orgId}/events/${eventId}/games/new`),
      },
      {
        key: 'schedule',
        label: 'Schedule',
        status: 'todo',
        hint: 'Times and fields are entered on each fixture until the schedule grid arrives.',
      },
      {
        key: 'scoring',
        label: 'Scoring',
        status: event?.settings?.pointsPerWin !== undefined ? 'done' : 'todo',
        detail:
          event?.settings?.pointsPerWin !== undefined
            ? `${event.settings.pointsPerWin} for a win`
            : 'Using the default 3 / 1 / 0',
      },
    ];
  }, [
    orderedDivisions.length,
    organizers.length,
    games.length,
    entrantCount,
    event?.settings,
    orgId,
    eventId,
  ]);

  // ------------------------------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------------------------------

  const handleAddDivision = () => {
    setIsProcessing(true);
    wsService.emit(
      'action',
      {
        type: SocketAction.ADD_DIVISION,
        payload: {
          eventId,
          orgId,
          name: `Division ${orderedDivisions.length + 1}`,
          // Every division has at least one stage (D11), and the caller that knows the format says
          // so in the same call rather than making a second round trip.
          stage: { name: 'Fixtures', format: 'Festival', sequence: 1 },
        },
      },
      (res: any) => {
        setIsProcessing(false);
        setIsAddingDivision(false);
        const addedId = res?.data?.id;
        if (addedId) router.push(`/admin/${orgId}/events/${eventId}/divisions/${addedId}`);
      }
    );
  };

  const handleSaveSettings = () => {
    if (!editName.trim()) return;
    setIsProcessing(true);

    wsService.emit(
      'action',
      {
        type: SocketAction.UPDATE_EVENT,
        payload: {
          id: eventId,
          userId: user?.id,
          orgId,
          data: {
            name: editName.trim(),
            startDate: `${editStartDate}T12:00:00.000Z`,
            endDate: isMultiDay && editEndDate ? `${editEndDate}T12:00:00.000Z` : null,
            siteId: editSiteId || null,
            sportIds: editSportIds,
            participatingOrgIds: editParticipatingOrgs.map(o => o.id),
          },
        },
      },
      () => {
        setIsProcessing(false);
        setActiveTab('schedule');
      }
    );
  };

  const handleCancelEvent = () => {
    setIsProcessing(true);
    wsService.emit(
      'action',
      {
        type: SocketAction.UPDATE_EVENT,
        payload: { id: eventId, userId: user?.id, orgId, data: { status: 'Cancelled' } },
      },
      () => {
        setIsProcessing(false);
        setIsCancelling(false);
      }
    );
  };

  const handleDeleteEvent = () => {
    setIsProcessing(true);
    wsService.emit(
      'action',
      { type: SocketAction.DELETE_EVENT, payload: { id: eventId, userId: user?.id, orgId } },
      () => {
        setIsProcessing(false);
        setIsDeleting(false);
        router.push(`/admin/${orgId}/events`);
      }
    );
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

  const header = (
    <>
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => safeBack(`/admin/${orgId}/events`)}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.brand.orange} />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text
          className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase flex-1 text-center px-4"
          numberOfLines={1}
        >
          {event.name}
        </Text>
        <View className="w-10" />
      </View>

      <View className="bg-white dark:bg-slate-900 px-6 py-3 flex-row justify-between items-center border-b border-slate-100 dark:border-white/5">
        <View className="flex-row items-center gap-2 flex-1">
          <Ionicons name="calendar-outline" size={14} color={COLORS.brand.orange} />
          <Text className="font-inter text-xs text-slate-600 dark:text-slate-400" numberOfLines={1}>
            {event.startDate?.split('T')[0]} {event.endDate ? `to ${event.endDate.split('T')[0]}` : ''}
          </Text>
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

            {canEdit && (
              <GlassCard className="border border-red-500/25 bg-red-500/5 p-5 space-y-4">
                <Text className="font-orbitron-bold text-xs text-brand-red uppercase tracking-wider">
                  Danger Zone
                </Text>
                <View className="flex-row justify-between items-center">
                  <View>
                    <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Cancel Event</Text>
                    <Text className="font-inter text-xs text-slate-500 mt-0.5">Marks the match as cancelled.</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setIsCancelling(true)}
                    disabled={event.status === 'Cancelled'}
                    className={`px-4 py-2 border border-brand-orange rounded-lg ${
                      event.status === 'Cancelled' ? 'opacity-40' : ''
                    }`}
                  >
                    <Text className="font-inter-bold text-xs text-brand-orange uppercase">Cancel Match</Text>
                  </TouchableOpacity>
                </View>

                <View className="flex-row justify-between items-center pt-4 border-t border-slate-100 dark:border-white/5">
                  <View>
                    <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Delete Event</Text>
                    <Text className="font-inter text-xs text-slate-500 mt-0.5">
                      Permanently deletes match records.
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setIsDeleting(true)}
                    className="px-4 py-2 border border-brand-red rounded-lg"
                  >
                    <Text className="font-inter-bold text-xs text-brand-red uppercase">Delete Match</Text>
                  </TouchableOpacity>
                </View>
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
  const divisionAnnouncement = structureAnnouncement({
    level: 'division',
    existingName: onlyDivision?.name,
  });

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {header}

      <View className="bg-white dark:bg-slate-900">
        <Tabs
          items={
            canEdit
              ? [
                  { key: 'schedule', label: 'Schedule' },
                  { key: 'standings', label: 'Standings' },
                  { key: 'settings', label: 'Settings' },
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

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 60 }}>
        {activeTab === 'schedule' && (
          <View className="space-y-6">
            {canEdit && (
              <SetupChecklist
                steps={setupSteps}
                dismissed={dismissedSteps}
                onDismiss={(key) => saveDismissed([...dismissedSteps, key])}
                onRestore={(key) => saveDismissed(dismissedSteps.filter(k => k !== key))}
                canEdit={canEdit}
              />
            )}

            {/* THE COLLAPSE RULE (U15).
                One division and the event screen *is* the division screen — no list, no picker,
                and the word never appears. Several, and each gets its own screen. */}
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
                  This tournament has no structure. Newer tournaments get theirs when they are
                  created.
                </Text>
              </GlassCard>
            )}

            {canEdit && (
              <TouchableOpacity
                onPress={() => setIsAddingDivision(true)}
                className="flex-row items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-slate-300 dark:border-white/10 active:opacity-80"
              >
                <Ionicons name="add-circle-outline" size={16} color={COLORS.brand.orange} />
                <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                  {divisionsCollapsed ? 'Split into divisions' : 'Add a division'}
                </Text>
              </TouchableOpacity>
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

        {activeTab === 'settings' && canEdit && (
          <View className="space-y-6">
            <GlassCard className="border border-slate-200 dark:border-white/5 p-5 space-y-4">
              <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Details
              </Text>

              <View className="space-y-1.5">
                <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Name
                </Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white"
                />
              </View>

              <View className="space-y-1.5">
                <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Starts
                </Text>
                <DatePicker value={editStartDate} onChange={setEditStartDate} />
              </View>

              <View className="flex-row items-center justify-between">
                <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
                  Runs over more than one day
                </Text>
                <Switch
                  value={isMultiDay}
                  onValueChange={setIsMultiDay}
                  trackColor={{ true: COLORS.brand.orange }}
                />
              </View>

              {isMultiDay && (
                <View className="space-y-1.5">
                  <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Ends
                  </Text>
                  <DatePicker value={editEndDate} onChange={setEditEndDate} />
                </View>
              )}

              <View className="space-y-1.5" style={{ zIndex: 30 }}>
                <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Venue
                </Text>
                <CustomSelect
                  options={sites.map(s => ({ label: s.name, value: s.id }))}
                  value={editSiteId}
                  onChange={setEditSiteId}
                  placeholder="Select a venue..."
                  clearable
                />
              </View>

              <View className="space-y-1.5">
                <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Sports
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {sports.map(sport => {
                    const isOn = editSportIds.includes(sport.id);
                    return (
                      <TouchableOpacity
                        key={sport.id}
                        onPress={() =>
                          setEditSportIds(prev =>
                            isOn ? prev.filter(id => id !== sport.id) : [...prev, sport.id]
                          )
                        }
                        className={`px-3 py-1.5 rounded-full border ${
                          isOn
                            ? 'bg-brand-orange/10 border-brand-orange/40'
                            : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5'
                        }`}
                      >
                        <Text
                          className={`font-inter text-xs ${
                            isOn ? 'text-brand-orange' : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {sport.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View className="space-y-1.5">
                <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Participating Organizations
                </Text>
                {editParticipatingOrgs.length > 0 && (
                  <View className="flex-row flex-wrap gap-2 mb-2">
                    {editParticipatingOrgs.map(o => (
                      <View
                        key={o.id}
                        className="flex-row items-center bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200/50 dark:border-white/5"
                      >
                        <Text className="font-inter text-xs text-slate-700 dark:text-slate-300 mr-1.5">
                          {o.name}
                        </Text>
                        <TouchableOpacity
                          onPress={() =>
                            setEditParticipatingOrgs(prev => prev.filter(p => p.id !== o.id))
                          }
                        >
                          <Ionicons name="close-circle" size={14} color={COLORS.brand.red} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                <TextInput
                  value={orgSearchText}
                  onChangeText={setOrgSearchText}
                  placeholder="Search for an organization to invite..."
                  placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white"
                />
                {isSearchingOrgs && (
                  <Text className="font-inter text-[10px] text-slate-400 mt-1">Searching...</Text>
                )}
                {searchedOrgs.map(o => (
                  <TouchableOpacity
                    key={o.id}
                    onPress={() => {
                      setEditParticipatingOrgs(prev => [
                        ...prev,
                        { id: o.id, name: o.name, shortName: o.shortName },
                      ]);
                      setOrgSearchText('');
                    }}
                    className="px-4 py-2.5 border-b border-slate-100 dark:border-white/5 active:opacity-80"
                  >
                    <Text className="font-inter text-sm text-slate-800 dark:text-white">{o.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Button
                title="Save Changes"
                onPress={handleSaveSettings}
                disabled={isProcessing || !editName.trim()}
                className="py-2.5 rounded-lg"
              />
            </GlassCard>

            {/* Appointing an organiser (D33). Built in Phase 4, mounted here. */}
            <GlassCard className="border border-slate-200 dark:border-white/5 p-5">
              <OrganizerPicker
                eventId={eventId}
                hostOrgId={event.orgId}
                actingOrgId={orgId}
                organizers={organizers}
                onChange={setOrganizers}
                canManage={canEdit}
                label="Tournament organisers"
              />
            </GlassCard>

            <GlassCard className="border border-red-500/25 bg-red-500/5 p-5 space-y-4">
              <Text className="font-orbitron-bold text-xs text-brand-red uppercase tracking-wider">
                Danger Zone
              </Text>
              <View className="flex-row justify-between items-center">
                <View className="flex-1 pr-3">
                  <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Cancel Event</Text>
                  <Text className="font-inter text-xs text-slate-500 mt-0.5">
                    Marks the tournament as cancelled. Nothing is deleted.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setIsCancelling(true)}
                  disabled={event.status === 'Cancelled'}
                  className={`px-4 py-2 border border-brand-orange rounded-lg ${
                    event.status === 'Cancelled' ? 'opacity-40' : ''
                  }`}
                >
                  <Text className="font-inter-bold text-xs text-brand-orange uppercase">Cancel</Text>
                </TouchableOpacity>
              </View>

              <View className="flex-row justify-between items-center pt-4 border-t border-slate-100 dark:border-white/5">
                <View className="flex-1 pr-3">
                  <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Delete Event</Text>
                  <Text className="font-inter text-xs text-slate-500 mt-0.5">
                    Permanently deletes the tournament, its divisions and its fixtures.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setIsDeleting(true)}
                  className="px-4 py-2 border border-brand-red rounded-lg"
                >
                  <Text className="font-inter-bold text-xs text-brand-red uppercase">Delete</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          </View>
        )}
      </ScrollView>

      {/* Say what will happen before the screen restructures itself (U15). */}
      <ConfirmationModal
        isOpen={isAddingDivision}
        title={divisionAnnouncement.title}
        description={divisionAnnouncement.description}
        confirmText={divisionAnnouncement.confirmText}
        cancelText="Cancel"
        variant="primary"
        isProcessing={isProcessing}
        onConfirm={handleAddDivision}
        onClose={() => setIsAddingDivision(false)}
      />
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
