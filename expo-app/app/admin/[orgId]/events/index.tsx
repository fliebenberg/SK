import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import DatePicker from '../../../../components/DatePicker';
import { useActiveTheme } from '../../../../store/settingsStore';
import { wsService } from '../../../../services/websocket';
import { sendAction } from '../../../../services/actions';
import { useAuthStore } from '../../../../store/authStore';
import {
  SocketAction,
  Event,
  Site,
  Facility,
  GameSummary,
  participantLabel,
  hasLiveScore,
  isScoreNotProvided,
} from '@sk/shared';
import { COLORS, getThemeColor } from '../../../../constants/Colors';
import {
  calendarRangeStatus,
  formatDateRange,
  formatFixtureWhen,
  isCalendarDate,
  startOfTodayMs,
  todayCalendarDate,
  whenMs,
} from '../../../../utils/dates';
import { getMatchPermissions } from '../../../../utils/matchPermissions';
import { useLiveRoom } from '../../../../hooks/useLiveRoom';
import { useMyEventGrants } from '../../../../hooks/useEventCapabilities';
import { deriveEventRoles, EventRole } from '@sk/shared';
import { EventRoleChips, EventRoleFilter } from '../../../../components/EventRoleChips';
import { resolveEventType, unknownEventTypeMessage } from '@sk/shared';
import { Tabs } from '../../../../components/Tabs';

class EventsErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[EventsErrorBoundary] Render error caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View className="p-6 bg-red-500/10 border border-red-500/20 rounded-xl my-4">
          <Text className="font-orbitron-bold text-red-500 text-sm mb-2">Render Error in Events List</Text>
          <Text className="font-inter text-xs text-slate-300 mb-4">{this.state.error?.toString()}</Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false, error: null })}
            className="bg-brand-orange px-4 py-2 rounded-lg self-start"
          >
            <Text className="font-inter-bold text-xs text-white uppercase">Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function OrgEventsList() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const isDark = useActiveTheme() === 'dark';

  const user = useAuthStore((state: any) => state.user);
  const orgMemberships = useAuthStore((state: any) => state.orgMemberships);
  const teamMemberships = useAuthStore((state: any) => state.teamMemberships);

  // UI States
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'upcoming' | 'past'>('upcoming');
  /**
   * Events and games are two altitudes of one list, not two subjects (U2).
   *
   * The events tab asks what we are involved in and in what capacity; the games tab drills to the
   * actual fixtures. Both are already delivered by the one room below — `EVENTS_SYNC` and
   * `GAME_SUMMARIES_SYNC` both arrive on join — so this is a presentation split over data the
   * screen already has, with no new fetch. Named after the entities (U36).
   */
  const [listTab, setListTab] = useState<'events' | 'games'>('events');
  /** Multi-select, because a viewer can hold several roles in one event at once (U5). */
  const [roleFilter, setRoleFilter] = useState<EventRole[]>([]);
  const [isAddMenuVisible, setIsAddMenuVisible] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  /*
    Creating a tournament (U45).

    There is no wizard. A tournament is not built in one sitting — the name and the date are known
    in March and everything else lands over the following weeks — so the only thing asked here is
    what the list has to show, and the Setup screen is the form for the rest. The old create screen
    demanded a venue, a facility and a sport before it would write anything, which is more than an
    organiser knows on the day they decide to run it.
  */
  const [isNamingTournament, setIsNamingTournament] = useState(false);
  const [newTournamentName, setNewTournamentName] = useState('');
  const [newTournamentDate, setNewTournamentDate] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const openTournamentPrompt = () => {
    setNewTournamentName('');
    setNewTournamentDate(todayCalendarDate());
    setIsNamingTournament(true);
  };

  /**
   * Write the shell and go straight to it.
   *
   * `Festival` is the format that assumes least about structure (D1) and the Setup screen changes
   * it; the server creates the first division and its stages from it (U16), so a tournament is
   * never in a state where a fixture has nowhere to live. Landing on the new tournament rather
   * than back on this list is half the point of the change — the old screen made you find what
   * you had just created.
   */
  const handleCreateTournament = () => {
    const name = newTournamentName.trim();
    if (!name || !isCalendarDate(newTournamentDate)) return;
    setIsProcessing(true);
    sendAction(SocketAction.ADD_EVENT, {
      name,
      type: 'Tournament',
      format: 'Festival',
      startDate: newTournamentDate,
      orgId,
      status: 'Scheduled',
    }).then(result => {
      setIsProcessing(false);
      // A refusal is already toasted; the naming dialog stays open with what was typed.
      if (!result.ok) return;
      setIsNamingTournament(false);
      router.push(`/admin/${orgId}/events/${result.data.id}`);
    });
  };

  /**
   * Two rooms, because they are two datasets (rule 4): `org:{id}:events` holds the `Event` records
   * and `org:{id}:fixtures` the `GameSummary` of every game under them. They were one room until
   * 2026-09-11, which meant an events list that never rendered a score still paid for every game
   * in the org on join. Joining either IS the load - there is no `get_data` here at all, and every
   * later change arrives carrying its own data rather than as a nudge to re-read.
   *
   * The audience is the hosting org plus every org playing in it, so a visiting school sees the
   * same live fixture the host does.
   */
  const eventsRoom = orgId ? `org:${orgId}:events` : null;
  const fixturesRoom = orgId ? `org:${orgId}:fixtures` : null;

  const { items: events, isLoading: eventsLoading, accessDenied } = useLiveRoom<Event>(eventsRoom, {
    reduce: (message) => {
      switch (message.type) {
        case 'EVENTS_SYNC':
          return { kind: 'replace', items: message.data || [] };
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

  const { items: gameSummaries, isLoading: gamesLoading } = useLiveRoom<GameSummary>(fixturesRoom, {
    reduce: (message) => {
      switch (message.type) {
        case 'GAME_SUMMARIES_SYNC':
          return { kind: 'replace', items: message.data || [] };
        case 'GAME_SUMMARY_UPDATED':
          return { kind: 'upsert', item: message.data };
        case 'GAME_SUMMARY_REMOVED':
          return { kind: 'remove', id: message.data?.id };
        default:
          return { kind: 'ignore' };
      }
    },
  });

  const isLoading = eventsLoading || gamesLoading;

  // Venue names are the one thing a fixture summary does not carry, since a
  // site and facility are the org's own reference data rather than the game's.
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

  /**
   * The one thing about a viewer's relationship to an event that the client cannot work out.
   *
   * Hosting and attending are derived from what this screen already holds — the user's
   * memberships, each event's own org, its participating orgs, and the fixtures themselves. A
   * division-organiser assignment appears on no payload the client holds, so it is read once for
   * every event rather than per card (UI doc §4).
   */
  const grants = useMyEventGrants();

  const rolesFor = (event: Event): EventRole[] =>
    deriveEventRoles({
      event,
      grants,
      orgMemberships,
      teamMemberships,
      games: (gameSummaries || []).filter(g => g && g.eventId === event.id),
    });

  // Handle Deleting an Event
  const handleDeleteEvent = async () => {
    if (!eventToDelete) return;
    setIsProcessing(true);
    await sendAction(SocketAction.DELETE_EVENT, {
      id: eventToDelete.id,
      orgId,
    });
    setIsProcessing(false);
    setEventToDelete(null);
  };

  /**
   * A fixture's teams, straight off the summary the server published. The
   * summary carries each participant's team name and org short name, so this
   * needs no teams or organizations lookup of its own - and cannot go stale
   * while the screen is open, because a rename republishes the summary.
   */
  const getMatchupLabel = (game?: GameSummary): string | undefined => {
    if (!game) return undefined;
    const home = participantLabel(game.participants?.[0]);
    const away = participantLabel(game.participants?.[1]);
    if (!home && !away) return undefined;
    return `${home || 'TBD'} vs ${away || 'TBD'}`;
  };

  /** "12 - 7", in the same participant order as the matchup line — or "No score", when finished without one. */
  const getScoreLabel = (game?: GameSummary): string | undefined => {
    if (isScoreNotProvided(game)) return 'No score';
    if (!game || !hasLiveScore(game)) return undefined;
    const [home, away] = game.participants || [];
    if (!home || !away) return undefined;
    return `${game.scores?.[home.id] ?? 0} - ${game.scores?.[away.id] ?? 0}`;
  };

  // "<site> · <facility>", dropping whichever half we cannot resolve
  const getVenueLabel = (siteId?: string | null, facilityId?: string | null): string | undefined => {
    const site = sites.find(s => s.id === siteId)?.name;
    const facility = facilities.find(f => f.id === facilityId)?.name;
    const parts = [site, facility].filter(Boolean);
    return parts.length ? parts.join(' · ') : undefined;
  };

  /**
   * Date (and kick-off time, where the game carries one) shown on the card's top line.
   *
   * The **event** branch goes through the shared formatter (U49) so this card and the event screen
   * behind it say the same thing — they did not: this built its own range out of
   * `toLocaleDateString` and read `19 Sep 2026 – 21 Sep 2026` while the detail header one tap away
   * printed the raw `2026-09-19`. A range now collapses what its ends share, and `compact` drops
   * the weekday that the detail header shows, because this line already carries a venue and a
   * status beside it.
   *
   * The **game** branch stays an instant with a time of day, which is a different question — hence
   * `formatFixtureWhen` rather than the range formatter. Its `·` separator is preserved exactly as
   * it was; `UI-13` covers the app disagreeing with the league screens' `@`.
   */
  const getWhenLabel = (event: Event, game?: GameSummary): string => {
    const gameTime = game?.scheduledStartTime || game?.startTime;
    if (gameTime) {
      return formatFixtureWhen(gameTime, { timeTbd: game?.timeTbd, separator: '·' });
    }
    return formatDateRange(event?.startDate, event?.endDate, { compact: true }) || 'Date TBD';
  };

  // Helper to determine display name for event
  const getEventName = (event: Event) => {
    if (!event) return 'Unnamed Event';

    const eventGames = (gameSummaries || []).filter(g => g && g.eventId === event.id);
    if (event.type === 'SingleMatch' && eventGames.length === 1) {
      const matchup = getMatchupLabel(eventGames[0]);
      if (matchup) return matchup;
    }
    return event.name || 'Unnamed Event';
  };

  // Filter & Sort Events
  const today = todayCalendarDate();
  const lastDayOf = (e?: Event) => e?.endDate || e?.startDate || '';
  const startOfToday = startOfTodayMs();

  const filteredEvents = (events || [])
    .filter(e => {
      if (!e) return false;
      // A single match now displays its resolved matchup rather than its stored name,
      // so search has to cover both or a custom name becomes unfindable.
      const haystack = `${getEventName(e)} ${e.name || ''}`.toLowerCase();
      const matchesSearch = searchQuery ? haystack.includes(searchQuery.toLowerCase()) : true;
      if (!matchesSearch) return false;

      // Nothing selected means no narrowing. Selecting several widens rather than narrows, because
      // the chips are alternatives — "show me the ones I host **or** convene" (U5).
      if (roleFilter.length > 0) {
        const roles = rolesFor(e);
        if (!roleFilter.some(role => roles.includes(role))) return false;
      }

      if (!e.startDate) {
        console.warn('[OrgEventsList] Event missing startDate:', e);
        return false;
      }

      if (!isCalendarDate(e.startDate)) {
        console.warn('[OrgEventsList] Invalid startDate for event:', e.id, e.startDate);
        return false;
      }

      // An event is past only once its last day is (FIX-22): a tournament still running stays
      // under Upcoming, rather than moving to Past on its second day.
      const finished = calendarRangeStatus(e.startDate, e.endDate, today) === 'after';
      return viewMode === 'upcoming' ? !finished : finished;
    })
    .sort((a, b) =>
      // Upcoming soonest first; Past most recently finished first.
      viewMode === 'upcoming'
        ? (a?.startDate || '').localeCompare(b?.startDate || '')
        : lastDayOf(b).localeCompare(lastDayOf(a))
    );

  const eventsById: Record<string, Event> = (events || []).reduce((acc, e) => {
    if (e?.id) acc[e.id] = e;
    return acc;
  }, {} as Record<string, Event>);

  /**
   * The games tab, over the same room and the same two controls.
   *
   * A fixture's date is its own where it has one and its event's otherwise, so a game with no
   * kick-off yet still sorts and filters with the day it belongs to rather than falling out of
   * both halves of the Upcoming / Past split.
   */
  const gameWhen = (game: GameSummary): number => {
    const when = whenMs(game.scheduledStartTime || game.startTime || eventsById[game.eventId || '']?.startDate);
    return isNaN(when) ? 0 : when;
  };

  const filteredGames = (gameSummaries || [])
    .filter(game => {
      if (!game) return false;
      const parentEvent = eventsById[game.eventId || ''];

      const haystack = `${getMatchupLabel(game) || ''} ${parentEvent ? getEventName(parentEvent) : ''}`.toLowerCase();
      if (searchQuery && !haystack.includes(searchQuery.toLowerCase())) return false;

      // A fixture inherits its event's roles: you convene the netball, so the netball fixtures are
      // yours. Deriving it per game would ask the same question sixty times for one answer.
      if (roleFilter.length > 0) {
        if (!parentEvent) return false;
        const roles = rolesFor(parentEvent);
        if (!roleFilter.some(role => roles.includes(role))) return false;
      }

      const when = gameWhen(game);
      if (!when) return false;
      return viewMode === 'upcoming' ? when >= startOfToday : when < startOfToday;
    })
    .sort((a, b) => (viewMode === 'upcoming' ? gameWhen(a) - gameWhen(b) : gameWhen(b) - gameWhen(a)));

  console.log('[OrgEventsList] viewMode:', viewMode, 'Total events:', events.length, 'Filtered count:', filteredEvents.length);

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => safeBack(`/admin/${orgId}`)}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.brand.orange} />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase">
          Fixtures & Events
        </Text>
        <TouchableOpacity 
          className="w-8 h-8 rounded-lg bg-brand-orange items-center justify-center shadow-md shadow-brand-orange/20 active:opacity-85"
          onPress={() => setIsAddMenuVisible(true)}
        >
          <Ionicons name="add" size={20} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 100 }}>
        {/* SEARCH BAR */}
        <View className="flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 mb-4 shadow-sm">
          <Ionicons name="search-outline" size={18} color={COLORS.dark.placeholder} />
          <TextInput
            placeholder="Search events by name..."
            placeholderTextColor={getThemeColor(isDark, 'placeholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 font-inter text-slate-800 dark:text-white text-sm ml-2.5 outline-none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={COLORS.dark.placeholder} />
            </TouchableOpacity>
          )}
        </View>

        {/* UPCOMING / PAST VIEW SELECTOR */}
        <View className="flex-row bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl border border-slate-200/50 dark:border-white/5 mb-6">
          <TouchableOpacity
            onPress={() => setViewMode('upcoming')}
            className="flex-1 flex-row items-center justify-center py-2.5 rounded-lg"
            style={{
              backgroundColor: viewMode === 'upcoming' ? getThemeColor(isDark, 'surface') : 'transparent',
            }}
          >
            <Ionicons
              name="calendar"
              size={14}
              color={viewMode === 'upcoming' ? COLORS.brand.orange : getThemeColor(isDark, 'textSecondary')}
              style={{ marginRight: 6 }}
            />
            <Text
              className="font-orbitron-bold text-xs uppercase tracking-widest"
              style={{
                color: viewMode === 'upcoming' ? COLORS.brand.orange : getThemeColor(isDark, 'textSecondary'),
              }}
            >
              Upcoming
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewMode('past')}
            className="flex-1 flex-row items-center justify-center py-2.5 rounded-lg"
            style={{
              backgroundColor: viewMode === 'past' ? getThemeColor(isDark, 'surface') : 'transparent',
            }}
          >
            <Ionicons
              name="time"
              size={14}
              color={viewMode === 'past' ? COLORS.brand.orange : getThemeColor(isDark, 'textSecondary')}
              style={{ marginRight: 6 }}
            />
            <Text
              className="font-orbitron-bold text-xs uppercase tracking-widest"
              style={{
                color: viewMode === 'past' ? COLORS.brand.orange : getThemeColor(isDark, 'textSecondary'),
              }}
            >
              Past
            </Text>
          </TouchableOpacity>
        </View>

        {/* EVENTS / GAMES — two altitudes of one list, over one room (U2, U36) */}
        <Tabs
          items={[
            { key: 'events', label: 'Events', icon: 'calendar-outline' },
            { key: 'games', label: 'Games', icon: 'football-outline' },
          ]}
          activeKey={listTab}
          onChange={(key) => setListTab(key as 'events' | 'games')}
          className="mb-4"
        />

        {/* SCOPE CHIPS — beside the Upcoming / Past toggle rather than competing with it (U5) */}
        <View className="mb-6">
          <EventRoleFilter selected={roleFilter} onChange={setRoleFilter} />
        </View>

        {isLoading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color={COLORS.brand.orange} />
            <Text className="font-orbitron text-xs text-slate-500 dark:text-slate-400 mt-4 uppercase tracking-widest">
              Loading events...
            </Text>
          </View>
        ) : (
          <EventsErrorBoundary>
            <View className="space-y-3">
              {listTab === 'events' && filteredEvents.map(event => {
                const eventGames = (gameSummaries || []).filter(g => g && g.eventId === event.id);

                /**
                 * `FIX-1` / U39 — three branches, and the third is an error rather than a guess.
                 *
                 * Every consumer used to test `=== 'SingleMatch'` and fall through to Tournament,
                 * so an event with no type quietly got the Tournament badge, Tournament navigation
                 * and the wrong actions. The schema half was closed in Phase 1; this is the client
                 * half, and it fails loudly instead of falling back.
                 */
                const resolved = resolveEventType(event);
                const roles = rolesFor(event);

                if (resolved.kind === 'Unknown') {
                  return (
                    <GlassCard
                      key={event.id}
                      className="border border-red-500/25 bg-red-500/5 p-4"
                    >
                      <View className="flex-row items-center gap-2 mb-1">
                        <Ionicons name="alert-circle-outline" size={16} color={COLORS.brand.red} />
                        <Text className="font-inter-bold text-[9px] text-brand-red uppercase tracking-widest">
                          Cannot display
                        </Text>
                      </View>
                      <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white leading-tight">
                        {event.name || 'Unnamed Event'}
                      </Text>
                      <Text className="font-inter text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                        {unknownEventTypeMessage(resolved)}
                      </Text>
                    </GlassCard>
                  );
                }

                const isSingleMatch = resolved.kind === 'SingleMatch';
                const isEventOwner = event.orgId === orgId;

                // An event fully described by one game borrows that game's kick-off time and
                // venue, and needs no separate details block repeating them below the card.
                const primaryGame = isSingleMatch && eventGames.length === 1 ? eventGames[0] : undefined;
                const whenLabel = getWhenLabel(event, primaryGame);
                const scoreLabel = getScoreLabel(primaryGame);
                const isLive = primaryGame?.status === 'Live';
                const venueLabel = getVenueLabel(
                  primaryGame?.siteId || event.siteId,
                  primaryGame?.facilityId || event.facilityId
                );

                return (
                <TouchableOpacity
                  key={event.id}
                  onPress={() => {
                    if (isSingleMatch && eventGames.length > 0) {
                      router.push(`/admin/${orgId}/events/${event.id}/games/${eventGames[0].id}/${isEventOwner ? 'edit' : 'view'}`);
                    } else {
                      router.push(`/admin/${orgId}/events/${event.id}`);
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <GlassCard className="border border-slate-200 dark:border-white/5 p-4">
                    {/* TOP LINE: when -> type -> status -> actions */}
                    <View className="flex-row items-center gap-2 mb-2">
                      <Text
                        numberOfLines={1}
                        className="font-inter-bold text-[11px] text-slate-600 dark:text-slate-400 flex-shrink"
                      >
                        {whenLabel}
                      </Text>
                      <View className="bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-md flex-shrink-0">
                        <Text className="font-inter-bold text-[9px] text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                          {resolved.label}
                        </Text>
                      </View>
                      {isLive && (
                        <View className="bg-brand-orange/15 px-2 py-0.5 rounded-md flex-shrink-0">
                          <Text className="font-inter-bold text-[9px] text-brand-orange uppercase tracking-widest">
                            Live
                          </Text>
                        </View>
                      )}
                      {event.status === 'Cancelled' && (
                        <View className="bg-red-500/10 px-2 py-0.5 rounded-md flex-shrink-0">
                          <Text className="font-inter-bold text-[9px] text-brand-red uppercase tracking-widest">
                            Cancelled
                          </Text>
                        </View>
                      )}
                      <View className="flex-1" />
                      <View className="flex-row items-center gap-1.5 flex-shrink-0">
                      {isSingleMatch && eventGames.length > 0 ? (() => {
                        const singleGame = eventGames[0];
                        const perms = getMatchPermissions({
                          game: singleGame,
                          event,
                          currentOrgId: orgId,
                          user,
                          orgMemberships,
                          teamMemberships
                        });
                        return (
                          <>
                            <TouchableOpacity
                              onPress={(e: any) => {
                                if (e && e.stopPropagation) e.stopPropagation();
                                router.push(`/admin/${orgId}/events/${event.id}/games/${singleGame.id}/view`);
                              }}
                              className="w-7 h-7 bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 rounded-lg items-center justify-center active:opacity-80"
                            >
                              <Ionicons name="eye-outline" size={13} color={getThemeColor(isDark, 'textSecondary')} />
                            </TouchableOpacity>
                            {perms.canEdit && (
                              <TouchableOpacity
                                onPress={(e: any) => {
                                  if (e && e.stopPropagation) e.stopPropagation();
                                  router.push(`/admin/${orgId}/events/${event.id}/games/${singleGame.id}/edit`);
                                }}
                                className="w-7 h-7 bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 rounded-lg items-center justify-center active:opacity-80"
                              >
                                <Ionicons name="pencil-outline" size={13} color={getThemeColor(isDark, 'textSecondary')} />
                              </TouchableOpacity>
                            )}
                            {perms.canSelectLineup && (
                              <TouchableOpacity
                                onPress={(e: any) => {
                                  if (e && e.stopPropagation) e.stopPropagation();
                                  router.push(`/admin/${orgId}/events/${event.id}/games/${singleGame.id}/selection`);
                                }}
                                className="w-7 h-7 bg-brand-orange/10 border border-brand-orange/30 rounded-lg items-center justify-center active:opacity-80"
                              >
                                <Ionicons name="people-outline" size={13} color={COLORS.brand.orange} />
                              </TouchableOpacity>
                            )}
                            {perms.canScore && (
                              <TouchableOpacity
                                onPress={(e: any) => {
                                  if (e && e.stopPropagation) e.stopPropagation();
                                  router.push(`/admin/${orgId}/events/${event.id}/games/${singleGame.id}/score`);
                                }}
                                className="w-7 h-7 bg-brand-orange/10 border border-brand-orange/30 rounded-lg items-center justify-center active:opacity-80"
                              >
                                <Ionicons name="trophy-outline" size={13} color={COLORS.brand.orange} />
                              </TouchableOpacity>
                            )}
                          </>
                        );
                      })() : (
                        <TouchableOpacity
                          onPress={(e: any) => {
                            if (e && e.stopPropagation) e.stopPropagation();
                            router.push(`/admin/${orgId}/events/${event.id}`);
                          }}
                          className="w-7 h-7 bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 rounded-lg items-center justify-center active:opacity-80"
                        >
                          <Ionicons name="eye-outline" size={13} color={getThemeColor(isDark, 'textSecondary')} />
                        </TouchableOpacity>
                      )}
                      </View>
                    </View>

                    {/* MAIN LINE: "A vs B" on the left, where it is played on the right */}
                    <View className="flex-row items-center justify-between gap-3">
                      <Text
                        numberOfLines={1}
                        className="font-orbitron-bold text-sm text-slate-800 dark:text-white leading-tight flex-1"
                      >
                        {getEventName(event)}
                      </Text>
                      {scoreLabel ? (
                        <Text
                          className={`font-orbitron-bold text-sm flex-shrink-0 ${isLive ? 'text-brand-orange' : 'text-slate-800 dark:text-white'}`}
                        >
                          {scoreLabel}
                        </Text>
                      ) : null}
                      {venueLabel ? (
                        <View className="flex-row items-center gap-1 flex-shrink-0 max-w-[45%]">
                          <Ionicons name="location-outline" size={12} color={COLORS.dark.textSecondary} />
                          <Text
                            numberOfLines={1}
                            className="font-inter text-[11px] text-slate-600 dark:text-slate-400 flex-shrink"
                          >
                            {venueLabel}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Every role this viewer holds here, not the most senior one (U4). */}
                    {roles.length > 0 && (
                      <View className="mt-2">
                        <EventRoleChips roles={roles} />
                      </View>
                    )}

                    {/* Nested game summaries - only where the header line does not already say it all */}
                    {!primaryGame && eventGames.length > 0 && (
                      <View className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 space-y-2">
                        <Text className="font-orbitron text-[9px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
                          {eventGames.length} Scheduled Games
                        </Text>
                        {eventGames.slice(0, 3).map(game => (
                          <View key={game.id} className="flex-row justify-between items-center bg-slate-50 dark:bg-white/5 p-2 rounded-lg">
                            <Text className="font-inter text-[11px] text-slate-800 dark:text-white flex-1" numberOfLines={1}>
                              {getMatchupLabel(game) || 'TBD vs TBD'}
                            </Text>
                            <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 pl-2">
                              {getScoreLabel(game) || game.status}
                            </Text>
                          </View>
                        ))}
                        {eventGames.length > 3 && (
                          <Text className="font-inter text-[10px] text-brand-orange text-center mt-1">
                            + {eventGames.length - 3} more games
                          </Text>
                        )}
                      </View>
                    )}
                  </GlassCard>
                </TouchableOpacity>
              );
              })}
              {/* GAMES TAB — the lower altitude: the fixtures themselves, across every event */}
              {listTab === 'games' && filteredGames.map(game => {
                const parentEvent = eventsById[game.eventId || ''];
                const perms = getMatchPermissions({
                  game,
                  event: parentEvent || null,
                  currentOrgId: orgId,
                  user,
                  orgMemberships,
                  teamMemberships,
                });
                const isLive = game.status === 'Live';
                const venueLabel = getVenueLabel(game.siteId, game.facilityId);
                const scoreLabel = getScoreLabel(game);

                return (
                  <TouchableOpacity
                    key={game.id}
                    onPress={() =>
                      router.push(
                        `/admin/${orgId}/events/${game.eventId}/games/${game.id}/${perms.canEdit ? 'edit' : 'view'}`
                      )
                    }
                    activeOpacity={0.85}
                  >
                    <GlassCard className="border border-slate-200 dark:border-white/5 p-4">
                      <View className="flex-row items-center gap-2 mb-2">
                        <Text
                          numberOfLines={1}
                          className="font-inter-bold text-[11px] text-slate-600 dark:text-slate-400 flex-shrink"
                        >
                          {parentEvent ? getWhenLabel(parentEvent, game) : 'Date TBD'}
                        </Text>
                        {isLive && (
                          <View className="bg-brand-orange/15 px-2 py-0.5 rounded-md flex-shrink-0">
                            <Text className="font-inter-bold text-[9px] text-brand-orange uppercase tracking-widest">
                              Live
                            </Text>
                          </View>
                        )}
                        <View className="flex-1" />
                        <View className="flex-row items-center gap-1.5 flex-shrink-0">
                          <TouchableOpacity
                            onPress={(e: any) => {
                              if (e && e.stopPropagation) e.stopPropagation();
                              router.push(`/admin/${orgId}/events/${game.eventId}/games/${game.id}/view`);
                            }}
                            className="w-7 h-7 bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 rounded-lg items-center justify-center active:opacity-80"
                          >
                            <Ionicons name="eye-outline" size={13} color={getThemeColor(isDark, 'textSecondary')} />
                          </TouchableOpacity>
                          {perms.canSelectLineup && (
                            <TouchableOpacity
                              onPress={(e: any) => {
                                if (e && e.stopPropagation) e.stopPropagation();
                                router.push(`/admin/${orgId}/events/${game.eventId}/games/${game.id}/selection`);
                              }}
                              className="w-7 h-7 bg-brand-orange/10 border border-brand-orange/30 rounded-lg items-center justify-center active:opacity-80"
                            >
                              <Ionicons name="people-outline" size={13} color={COLORS.brand.orange} />
                            </TouchableOpacity>
                          )}
                          {perms.canScore && (
                            <TouchableOpacity
                              onPress={(e: any) => {
                                if (e && e.stopPropagation) e.stopPropagation();
                                router.push(`/admin/${orgId}/events/${game.eventId}/games/${game.id}/score`);
                              }}
                              className="w-7 h-7 bg-brand-orange/10 border border-brand-orange/30 rounded-lg items-center justify-center active:opacity-80"
                            >
                              <Ionicons name="trophy-outline" size={13} color={COLORS.brand.orange} />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>

                      <View className="flex-row items-center justify-between gap-3">
                        <Text
                          numberOfLines={1}
                          className="font-orbitron-bold text-sm text-slate-800 dark:text-white leading-tight flex-1"
                        >
                          {getMatchupLabel(game) || 'TBD vs TBD'}
                        </Text>
                        {scoreLabel ? (
                          <Text
                            className={`font-orbitron-bold text-sm flex-shrink-0 ${
                              isLive ? 'text-brand-orange' : 'text-slate-800 dark:text-white'
                            }`}
                          >
                            {scoreLabel}
                          </Text>
                        ) : (
                          <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 flex-shrink-0 uppercase tracking-wider">
                            {game.status}
                          </Text>
                        )}
                      </View>

                      {/* Which event this fixture belongs to, and where it is played. A game row has
                          to name its parent, or a flat list of sixty fixtures is unreadable. */}
                      <View className="flex-row items-center gap-2 mt-1">
                        <Text
                          numberOfLines={1}
                          className="font-inter text-[10px] text-slate-500 dark:text-slate-400 flex-1"
                        >
                          {parentEvent ? getEventName(parentEvent) : 'Unknown event'}
                        </Text>
                        {venueLabel ? (
                          <View className="flex-row items-center gap-1 flex-shrink-0 max-w-[45%]">
                            <Ionicons name="location-outline" size={11} color={COLORS.dark.textSecondary} />
                            <Text
                              numberOfLines={1}
                              className="font-inter text-[10px] text-slate-600 dark:text-slate-400 flex-shrink"
                            >
                              {venueLabel}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </GlassCard>
                  </TouchableOpacity>
                );
              })}

              {/* An empty list and no permission to see one are different answers. */}
              {accessDenied ? (
                <View className="items-center justify-center py-16">
                  <Ionicons name="lock-closed-outline" size={48} color={COLORS.dark.textSecondary} style={{ opacity: 0.3, marginBottom: 12 }} />
                  <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300">
                    No Access
                  </Text>
                  <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 text-center mt-1">
                    You do not have permission to view this organization's fixtures.
                  </Text>
                </View>
              ) : (listTab === 'events' ? filteredEvents.length === 0 : filteredGames.length === 0) && (
                <View className="items-center justify-center py-16">
                  <Ionicons name="calendar-outline" size={48} color={COLORS.dark.textSecondary} style={{ opacity: 0.3, marginBottom: 12 }} />
                  <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300">
                    No {viewMode} {listTab === 'events' ? 'Events' : 'Games'}
                  </Text>
                  <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 text-center mt-1">
                    {roleFilter.length > 0
                      ? 'Nothing matches the roles you have selected. Clear them to see everything.'
                      : 'Click the plus icon in the header to schedule a single match or create a tournament.'}
                  </Text>
                </View>
              )}
            </View>
          </EventsErrorBoundary>
        )}
      </ScrollView>

      {/* Floating Action Button Popover Modal */}
      <Modal
        visible={isAddMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsAddMenuVisible(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/60 justify-end"
          activeOpacity={1}
          onPress={() => setIsAddMenuVisible(false)}
        >
          <View className="bg-white dark:bg-slate-900 rounded-t-3xl p-6 border-t border-slate-200 dark:border-white/5">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white uppercase tracking-wider">
                Create Event
              </Text>
              <TouchableOpacity onPress={() => setIsAddMenuVisible(false)}>
                <Ionicons name="close" size={24} color={getThemeColor(isDark, 'textPrimary')} />
              </TouchableOpacity>
            </View>

            <View className="space-y-3">
              <TouchableOpacity
                className="flex-row items-center p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 active:bg-slate-100 dark:active:bg-white/10"
                onPress={() => {
                  setIsAddMenuVisible(false);
                  router.push(`/admin/${orgId}/events/create`);
                }}
              >
                <View className="w-10 h-10 rounded-full bg-brand-orange/15 items-center justify-center mr-4">
                  <Ionicons name="trophy" size={20} color={COLORS.brand.orange} />
                </View>
                <View className="flex-1">
                  <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white">
                    Schedule Single Match
                  </Text>
                  <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Standard head-to-head game between two teams
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                className="flex-row items-center p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 active:bg-slate-100 dark:active:bg-white/10"
                onPress={() => {
                  setIsAddMenuVisible(false);
                  openTournamentPrompt();
                }}
              >
                <View className="w-10 h-10 rounded-full bg-brand-green/15 items-center justify-center mr-4">
                  <Ionicons name="ribbon" size={20} color={COLORS.brand.green} />
                </View>
                <View className="flex-1">
                  <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white">
                    Create Tournament
                  </Text>
                  <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Name it and pick a date — everything else is set up on the tournament itself
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* NAME A NEW TOURNAMENT (U45) — the whole of creation. */}
      <Modal
        visible={isNamingTournament}
        transparent
        animationType="fade"
        onRequestClose={() => setIsNamingTournament(false)}
      >
        <View className="flex-1 bg-black/60 justify-center px-6">
          <View className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-white/5 shadow-xl space-y-4">
            <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white uppercase tracking-wider">
              New Tournament
            </Text>

            <View className="space-y-1.5">
              <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Name
              </Text>
              <TextInput
                value={newTournamentName}
                onChangeText={setNewTournamentName}
                autoFocus
                placeholder="e.g. Winter Sevens 2026"
                placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white"
              />
            </View>

            <View className="space-y-1.5">
              <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Starts
              </Text>
              <DatePicker value={newTournamentDate} onChange={setNewTournamentDate} />
            </View>

            <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
              Venues, sports, divisions and entrants are all set up on the tournament itself, in
              whatever order they are settled.
            </Text>

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setIsNamingTournament(false)}
                className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 items-center active:opacity-80"
              >
                <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateTournament}
                disabled={!newTournamentName.trim() || !isCalendarDate(newTournamentDate) || isProcessing}
                className={`flex-1 py-2.5 rounded-lg bg-brand-orange items-center active:opacity-85 ${
                  !newTournamentName.trim() || !isCalendarDate(newTournamentDate) || isProcessing ? 'opacity-40' : ''
                }`}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="font-inter-bold text-xs text-white uppercase">Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmation Modal for Deleting Events */}
      <ConfirmationModal
        isOpen={eventToDelete !== null}
        title="Delete Event?"
        description={`Are you sure you want to permanently delete "${
          eventToDelete ? getEventName(eventToDelete) : ''
        }"? All scheduled games and standings associated with this event will be deleted.`}
        confirmText="Delete Event"
        cancelText="Cancel"
        onConfirm={handleDeleteEvent}
        onClose={() => setEventToDelete(null)}
        isProcessing={isProcessing}
      />
    </SafeAreaView>
  );
}
