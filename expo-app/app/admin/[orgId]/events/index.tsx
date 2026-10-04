import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Event,
  GameSummary,
  Sport,
  eventFormatLabel,
  isScoreNotProvided,
  resolveEventType,
  unknownEventTypeMessage,
} from '@sk/shared';
import { ScreenHeader } from '../../../../components/ScreenHeader';
import { SegmentedControl } from '../../../../components/SegmentedControl';
import { OverflowMenu } from '../../../../components/OverflowMenu';
import {
  DateTile,
  FixtureCrest,
  RowTag,
  TournamentMark,
  fixtureSideNames,
  sideScores,
} from '../../../../components/events/EventBits';
import {
  EventFiltersDialog,
  EventListFilters,
  EventListRole,
  NO_FILTERS,
  NewTournamentDialog,
  ROLE_OPTIONS,
} from '../../../../components/events/EventListDialogs';
import { useLiveRoom } from '../../../../hooks/useLiveRoom';
import { useOrgSites } from '../../../../hooks/useOrgSites';
import { useSocketQuery } from '../../../../hooks/useSocketQuery';
import { useMyEventGrants } from '../../../../hooks/useEventCapabilities';
import { useSafeBack } from '../../../../hooks/useSafeBack';
import { useAuthStore } from '../../../../store/authStore';
import { useActiveTheme, useSettingsStore } from '../../../../store/settingsStore';
import { getMatchPermissions } from '../../../../utils/matchPermissions';
import {
  calendarRangeStatus,
  calendarRangeTile,
  dayHeading,
  eventDayOfRange,
  formatKickoffTime,
  instantCalendarDate,
  instantTile,
  isCalendarDate,
  monthSection,
  startOfTodayMs,
  todayCalendarDate,
  upcomingSection,
  whenMs,
} from '../../../../utils/dates';
import { themeColor } from '../../../../constants/Colors';

/**
 * Fixtures & Events (docs/events.md). One row per event, and a row opens its page: a single match
 * its game, a tournament its event page. A match row is the fixture — both teams with their crests,
 * when and where; a tournament row is the event — name, format, sports, where and how many games.
 *
 * The toolbar holds what changes what someone sees most: search, **Mine / All**, Events / All games
 * and Upcoming / Past. Everything else narrows the list from behind one Filters button, and every
 * filter that is on shows as a chip right under the line that sets it, with how many of how many
 * are shown. On a phone Mine / All takes Upcoming / Past's place, which moves into Filters.
 *
 * Two live rooms, because they are two datasets: `org:{id}:events` holds the events and
 * `org:{id}:fixtures` the summary of every game under them. Joining either is the load.
 */

type When = 'upcoming' | 'past';
type View_ = 'events' | 'games';
type Scope = 'mine' | 'all';

const SCOPE_KEY = 'eventsListScope';
const VIEW_KEY = 'eventsListView';

const ADMIN_ROLES = ['role-org-admin', 'role-org-staff'];

/** The day a game is on: its kick-off's, or its event's first day while it has none. */
const gameDay = (game: GameSummary, event?: Event) =>
  instantCalendarDate(game.scheduledStartTime || game.startTime) || (event?.startDate ?? null);
const gameMs = (game: GameSummary, event?: Event) => {
  const ms = whenMs(game.scheduledStartTime || game.startTime || event?.startDate);
  return isNaN(ms) ? 0 : ms;
};

export default function OrgEventsList() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const user = useAuthStore((state: any) => state.user);
  const orgMemberships = useAuthStore((state: any) => state.orgMemberships);
  const teamMemberships = useAuthStore((state: any) => state.teamMemberships);
  const dependants = useAuthStore((state: any) => state.dependants);
  const viewerRole = (orgMemberships || []).find((m: any) => m.orgId === orgId)?.roleId;
  /** Creating an event is a manage-org action: Admin and Staff. */
  const canCreate = user?.globalRole === 'admin' || ADMIN_ROLES.includes(viewerRole);

  /* Mine / All and Events / All games are remembered on this device. Until someone chooses, Admin
     and Staff see everything the organisation has on, and everyone else what is theirs. */
  const savedScope = useSettingsStore(state => state.localOverrides[SCOPE_KEY]) as Scope | undefined;
  const savedView = useSettingsStore(state => state.localOverrides[VIEW_KEY]) as View_ | undefined;
  const setLocalOverride = useSettingsStore(state => state.setLocalOverride);
  const scope: Scope = savedScope ?? (canCreate ? 'all' : 'mine');
  const view: View_ = savedView ?? 'events';
  const setScope = (next: Scope) => setLocalOverride(SCOPE_KEY, next);
  const setView = (next: View_) => setLocalOverride(VIEW_KEY, next);

  const [search, setSearch] = useState('');
  const [when, setWhen] = useState<When>('upcoming');
  const [filters, setFilters] = useState<EventListFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [namingTournament, setNamingTournament] = useState(false);

  const { items: events, isLoading: eventsLoading, accessDenied } = useLiveRoom<Event>(orgId ? `org:${orgId}:events` : null, {
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

  const { items: games, isLoading: gamesLoading } = useLiveRoom<GameSummary>(orgId ? `org:${orgId}:fixtures` : null, {
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

  const { sites, facilities } = useOrgSites(orgId);
  const { data: sportsData } = useSocketQuery<Sport[]>('sports');
  const grants = useMyEventGrants();

  const sportName = (id?: string) => (sportsData || []).find(s => s.id === id)?.name || '';
  const siteName = (id?: string | null) => sites.find(s => s.id === id)?.name || '';
  const facilityName = (id?: string | null) => facilities.find(f => f.id === id)?.name || '';

  const eventsById = useMemo(() => new Map((events || []).filter(Boolean).map(e => [e.id, e])), [events]);
  const gamesByEvent = useMemo(() => {
    const map = new Map<string, GameSummary[]>();
    for (const game of games || []) {
      if (!game?.eventId) continue;
      map.set(game.eventId, [...(map.get(game.eventId) || []), game]);
    }
    return map;
  }, [games]);

  /* ---------------------------------------------------------------------------------------------
   * Mine: the games of the teams this person plays in, coaches or manages, their children's teams
   * (as a guardian), and the events they run or convene.
   * ------------------------------------------------------------------------------------------- */
  const ownTeamIds = useMemo(() => new Set<string>((teamMemberships || []).map((m: any) => m.teamId)), [teamMemberships]);
  const childTeamIds = useMemo(
    () => new Set<string>((dependants || []).flatMap((d: any) => (d.teams || []).map((t: any) => t.teamId))),
    [dependants]
  );
  const runEventIds = useMemo(() => new Set<string>([
    ...grants.eventIds,
    ...grants.divisions.map(d => d.eventId),
    ...(grants.sports || []).map(s => s.eventId),
  ]), [grants]);
  const conveneEventIds = useMemo(() => new Set<string>([
    ...grants.divisions.map(d => d.eventId),
    ...(grants.sports || []).map(s => s.eventId),
  ]), [grants]);

  const isMyGame = (game: GameSummary) =>
    runEventIds.has(game.eventId) ||
    (game.participants || []).some(p => !!p.teamId && (ownTeamIds.has(p.teamId) || childTeamIds.has(p.teamId)));
  const isMyEvent = (event: Event) => runEventIds.has(event.id) || (gamesByEvent.get(event.id) || []).some(isMyGame);

  /** What Mine covers, built from what applies to this person — each part only when they have it. */
  const mineScopeLine = (() => {
    const parts = [
      ownTeamIds.size > 0 && 'your teams',
      childTeamIds.size > 0 && "your children's teams",
      runEventIds.size > 0 && 'what you run',
    ].filter(Boolean) as string[];
    if (!parts.length) return 'You are on no team and run no events, so Mine is empty. All shows everything on.';
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
    return `Showing ${list}`;
  })();

  const rolesOf = (event: Event): Record<EventListRole, boolean> => ({
    hosting: event.orgId === orgId,
    convening: conveneEventIds.has(event.id),
    away: event.orgId !== orgId,
  });

  /* ---------------------------------------------------------------------------------------------
   * The list
   * ------------------------------------------------------------------------------------------- */
  const today = todayCalendarDate();
  const startOfToday = startOfTodayMs();

  const eventSportIds = (event: Event) => Array.from(new Set([
    ...(event.sportIds || []),
    ...(gamesByEvent.get(event.id) || []).map(g => g.sportId).filter(Boolean),
  ]));
  const isPastEvent = (event: Event) => calendarRangeStatus(event.startDate, event.endDate, today) === 'after';

  /** Events in scope and on the chosen side of today — what search and filters then narrow. */
  const baseEvents = useMemo(() => (events || []).filter(event => {
    if (!event || !isCalendarDate(event.startDate)) return false;
    if (scope === 'mine' && !isMyEvent(event)) return false;
    return when === 'past' ? isPastEvent(event) : !isPastEvent(event);
  }), [events, scope, when, gamesByEvent, ownTeamIds, childTeamIds, runEventIds, today]);

  const baseGames = useMemo(() => (games || []).filter(game => {
    if (!game) return false;
    if (scope === 'mine' && !isMyGame(game)) return false;
    const ms = gameMs(game, eventsById.get(game.eventId));
    if (!ms) return false;
    return when === 'past' ? ms < startOfToday : ms >= startOfToday;
  }), [games, scope, when, eventsById, ownTeamIds, childTeamIds, runEventIds, startOfToday]);

  const sideWords = (game: GameSummary) => (game.participants || []).flatMap(p => {
    const names = fixtureSideNames(p, orgId);
    return [names.full, names.short];
  });

  const q = search.trim().toLowerCase();
  const matchesSearch = (words: string[]) => !q || words.some(w => (w || '').toLowerCase().includes(q));

  const eventPasses = (event: Event) => {
    const type = resolveEventType(event);
    const own = gamesByEvent.get(event.id) || [];
    if (!matchesSearch([
      event.name,
      siteName(event.siteId),
      ...eventSportIds(event).map(sportName),
      ...own.flatMap(sideWords),
      ...own.map(g => siteName(g.siteId)),
      ...own.map(g => facilityName(g.facilityId)),
    ])) return false;
    if (filters.sportIds.length && !eventSportIds(event).some(id => filters.sportIds.includes(id))) return false;
    if (filters.kind === 'matches' && type.kind !== 'SingleMatch') return false;
    if (filters.kind === 'tournaments' && type.kind !== 'Tournament') return false;
    if (filters.roles.length) {
      const roles = rolesOf(event);
      if (!filters.roles.some(r => roles[r])) return false;
    }
    return true;
  };

  const gamePasses = (game: GameSummary) => {
    const event = eventsById.get(game.eventId);
    if (!matchesSearch([
      event?.name || '',
      sportName(game.sportId),
      siteName(game.siteId),
      facilityName(game.facilityId),
      ...sideWords(game),
    ])) return false;
    if (filters.sportIds.length && !filters.sportIds.includes(game.sportId)) return false;
    if (filters.roles.length) {
      if (!event) return false;
      const roles = rolesOf(event);
      if (!filters.roles.some(r => roles[r])) return false;
    }
    return true;
  };

  const shownEvents = baseEvents.filter(eventPasses);
  const shownGames = baseGames.filter(gamePasses);

  /** Sections of the Events view: On now, This week, later this month, then by month. */
  const eventSections = useMemo(() => {
    const primaryGame = (event: Event) => (resolveEventType(event).kind === 'SingleMatch' ? (gamesByEvent.get(event.id) || [])[0] : undefined);
    const dayOf = (event: Event) => {
      const game = primaryGame(event);
      return (game && gameDay(game, event)) || event.startDate;
    };
    const msOf = (event: Event) => {
      const game = primaryGame(event);
      return game ? gameMs(game, event) : whenMs(event.startDate);
    };
    const isOnNow = (event: Event) => {
      if (event.status === 'Cancelled') return false;
      const type = resolveEventType(event).kind;
      if (type === 'Tournament') return calendarRangeStatus(event.startDate, event.endDate, today) === 'during';
      return primaryGame(event)?.status === 'Live';
    };

    const sections = new Map<string, { key: string; label: string; isNow?: boolean; items: Event[] }>();
    const add = (key: string, label: string, event: Event, isNow?: boolean) => {
      if (!sections.has(key)) sections.set(key, { key, label, isNow, items: [] });
      sections.get(key)!.items.push(event);
    };
    for (const event of shownEvents) {
      if (when === 'upcoming' && isOnNow(event)) { add('0000-now', 'On now', event, true); continue; }
      const section = when === 'upcoming' ? upcomingSection(dayOf(event), today) : monthSection(event.endDate || event.startDate);
      add(section.key, section.label, event);
    }
    const ordered = Array.from(sections.values()).sort((a, b) => (when === 'upcoming' ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key)));
    for (const section of ordered) {
      section.items.sort((a, b) => (when === 'upcoming' ? msOf(a) - msOf(b) : msOf(b) - msOf(a)));
    }
    return ordered;
  }, [shownEvents, when, gamesByEvent, today]);

  /** Sections of the All games view: one per day. */
  const gameSections = useMemo(() => {
    const sections = new Map<string, { key: string; label: string; isNow?: boolean; items: GameSummary[] }>();
    for (const game of shownGames) {
      const day = gameDay(game, eventsById.get(game.eventId));
      const key = day || '0000';
      if (!sections.has(key)) sections.set(key, { key, label: day ? dayHeading(day, today) : 'Date to be set', isNow: day === today, items: [] });
      sections.get(key)!.items.push(game);
    }
    const ordered = Array.from(sections.values()).sort((a, b) => (when === 'upcoming' ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key)));
    for (const section of ordered) {
      section.items.sort((a, b) => {
        const diff = gameMs(a, eventsById.get(a.eventId)) - gameMs(b, eventsById.get(b.eventId));
        return when === 'upcoming' ? diff : -diff;
      });
    }
    return ordered;
  }, [shownGames, when, eventsById, today]);

  /* ---------------------------------------------------------------------------------------------
   * Filters: the options offered, and the chips for the ones that are on
   * ------------------------------------------------------------------------------------------- */
  const sportOptions = useMemo(() => {
    const counts = new Map<string, number>();
    if (view === 'events') baseEvents.forEach(e => eventSportIds(e).forEach(id => counts.set(id, (counts.get(id) || 0) + 1)));
    else baseGames.forEach(g => g.sportId && counts.set(g.sportId, (counts.get(g.sportId) || 0) + 1));
    return Array.from(counts.entries())
      .map(([id, count]) => ({ id, name: sportName(id) || 'Unknown sport', count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [view, baseEvents, baseGames, sportsData]);

  const roleCounts = useMemo(() => {
    const counts: Record<EventListRole, number> = { hosting: 0, convening: 0, away: 0 };
    const subjects = view === 'events' ? baseEvents : baseGames.map(g => eventsById.get(g.eventId)).filter(Boolean) as Event[];
    subjects.forEach(e => {
      const roles = rolesOf(e);
      (Object.keys(counts) as EventListRole[]).forEach(r => { if (roles[r]) counts[r] += 1; });
    });
    return counts;
  }, [view, baseEvents, baseGames, eventsById, conveneEventIds]);

  const chips: Array<{ key: string; label: string; remove: () => void }> = [];
  if (!isWide && when === 'past') chips.push({ key: 'past', label: 'Past', remove: () => setWhen('upcoming') });
  filters.sportIds.forEach(id => chips.push({
    key: `sport-${id}`, label: sportName(id) || 'Sport', remove: () => setFilters(f => ({ ...f, sportIds: f.sportIds.filter(s => s !== id) })),
  }));
  if (view === 'events' && filters.kind !== 'all') {
    chips.push({ key: 'kind', label: filters.kind === 'matches' ? 'Matches' : 'Tournaments', remove: () => setFilters(f => ({ ...f, kind: 'all' })) });
  }
  filters.roles.forEach(role => chips.push({
    key: `role-${role}`, label: ROLE_OPTIONS.find(r => r.key === role)!.label, remove: () => setFilters(f => ({ ...f, roles: f.roles.filter(r => r !== role) })),
  }));
  const filterCount = chips.length;
  const isNarrowed = !!q || filters.sportIds.length > 0 || (view === 'events' && filters.kind !== 'all') || filters.roles.length > 0;
  const noun = view === 'events' ? 'events' : 'games';
  const shownCount = view === 'events' ? shownEvents.length : shownGames.length;
  const baseCount = view === 'events' ? baseEvents.length : baseGames.length;
  const clearAll = () => {
    setSearch('');
    setFilters(NO_FILTERS);
    if (!isWide) setWhen('upcoming');
  };

  /* ---------------------------------------------------------------------------------------------
   * Navigation
   * ------------------------------------------------------------------------------------------- */
  /** A game opens its edit screen for someone who may edit it, its view otherwise — the game page is stage 3. */
  const openGame = (game: GameSummary, event?: Event) => {
    const perms = getMatchPermissions({ game, event: event || null, currentOrgId: orgId, user, orgMemberships, teamMemberships });
    router.push(`/admin/${orgId}/events/${game.eventId}/games/${game.id}/${perms.canEdit ? 'edit' : 'view'}`);
  };
  const openEvent = (event: Event) => {
    const single = resolveEventType(event).kind === 'SingleMatch' ? (gamesByEvent.get(event.id) || [])[0] : undefined;
    if (single) openGame(single, event);
    else router.push(`/admin/${orgId}/events/${event.id}`);
  };

  /* ---------------------------------------------------------------------------------------------
   * Rendering
   * ------------------------------------------------------------------------------------------- */
  const headerRight = canCreate ? (
    <OverflowMenu
      title="New event"
      items={[
        {
          label: 'Match',
          description: 'One game between two teams, set up in one go',
          icon: 'football-outline',
          onPress: () => router.push(`/admin/${orgId}/events/create`),
        },
        {
          label: 'Tournament',
          description: 'A festival, league or knockout. Name it and pick a date; the rest is set up on the tournament',
          icon: 'trophy-outline',
          onPress: () => setNamingTournament(true),
        },
      ]}
      renderTrigger={open => (
        <TouchableOpacity
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel="New event"
          className={`flex-row items-center gap-1.5 rounded-xl bg-primary ${isWide ? 'px-3.5 py-2' : 'w-9 h-9 justify-center'}`}
        >
          <Ionicons name="add" size={18} color={themeColor(isDark, 'on-primary')} />
          {isWide ? <Text className="font-inter-bold text-sm text-on-primary">New event</Text> : null}
        </TouchableOpacity>
      )}
    />
  ) : undefined;

  /* A search term narrows the list like a filter does, so while there is one the box wears the same
     "active" tint as the filter chips and the Filters button. */
  const searchBox = (
    <View
      className={`flex-1 flex-row items-center gap-2 border rounded-xl px-3 ${search ? 'bg-primary-soft border-primary-line' : 'bg-card border-line'}`}
      style={{ minWidth: isWide ? 220 : 0 }}
    >
      <Ionicons name="search-outline" size={16} color={themeColor(isDark, search ? 'primary-ink' : 'ink-muted')} />
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={isWide ? 'Search teams, events or venues' : 'Search'}
        placeholderTextColor={themeColor(isDark, 'ink-muted')}
        accessibilityLabel="Search events"
        className="flex-1 font-inter text-base text-ink py-2.5 outline-none"
      />
      {search ? (
        <TouchableOpacity onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={18} color={themeColor(isDark, 'ink-muted')} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const filtersButton = (
    <TouchableOpacity
      onPress={() => setFiltersOpen(true)}
      accessibilityRole="button"
      accessibilityLabel={filterCount ? `Filters, ${filterCount} on` : 'Filters'}
      className={`flex-row items-center gap-1.5 rounded-xl border px-3 py-2.5 ${filterCount ? 'border-primary-line bg-primary-soft' : 'border-line bg-card'}`}
    >
      <Ionicons name="options-outline" size={16} color={themeColor(isDark, filterCount ? 'primary-ink' : 'ink-soft')} />
      <Text className={`font-inter-semibold text-sm ${filterCount ? 'text-primary-ink' : 'text-ink-soft'}`}>Filters</Text>
      {filterCount ? (
        <View className="rounded-full bg-primary px-1.5 min-w-[18px] items-center">
          <Text className="font-inter-bold text-[11px] text-on-primary">{filterCount}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );

  const scopeSwitch = (
    <SegmentedControl<Scope>
      fit={isWide}
      value={scope}
      onChange={setScope}
      options={[{ key: 'mine', label: 'Mine' }, { key: 'all', label: 'All' }]}
    />
  );
  const viewSwitch = (
    <SegmentedControl<View_>
      fit={isWide}
      value={view}
      onChange={setView}
      options={[{ key: 'events', label: 'Events' }, { key: 'games', label: 'All games' }]}
    />
  );
  const whenSwitch = (
    <SegmentedControl<When>
      fit
      value={when}
      onChange={setWhen}
      options={[{ key: 'upcoming', label: 'Upcoming' }, { key: 'past', label: 'Past' }]}
    />
  );

  /* The chips sit right under the line that sets them. The count shares their line and, when there
     is no room, drops to the next line whole — it is never split. */
  const chipsRow = chips.length || isNarrowed ? (
    <View className="flex-row flex-wrap items-center gap-1.5">
      {chips.map(chip => (
        <TouchableOpacity
          key={chip.key}
          onPress={chip.remove}
          accessibilityRole="button"
          accessibilityLabel={`Remove filter ${chip.label}`}
          className="flex-row items-center gap-1.5 rounded-full border border-primary-line bg-primary-soft pl-2.5 pr-1.5 py-1"
        >
          <Text className="font-inter-semibold text-xs text-primary-ink">{chip.label}</Text>
          <Ionicons name="close" size={13} color={themeColor(isDark, 'primary-ink')} />
        </TouchableOpacity>
      ))}
      {chips.length ? (
        <TouchableOpacity onPress={clearAll} accessibilityRole="button" className="px-1.5 py-1">
          <Text className="font-inter-bold text-xs text-ink-muted">Clear all</Text>
        </TouchableOpacity>
      ) : null}
      {isNarrowed ? (
        <Text className="font-inter text-xs text-ink-muted ml-auto pl-2" numberOfLines={1} style={{ flexShrink: 0 }}>
          {shownCount}/{baseCount} {noun}
        </Text>
      ) : null}
    </View>
  ) : null;

  const scopeLine = scope === 'mine' ? (
    <Text className="font-inter text-xs text-ink-faint -mt-1 px-0.5">{mineScopeLine}</Text>
  ) : null;

  const toolbar = isWide ? (
    <>
      <View className="flex-row items-center gap-2.5">
        {searchBox}
        {scopeSwitch}
        {viewSwitch}
        {whenSwitch}
        {filtersButton}
      </View>
      {chipsRow}
      {scopeLine}
    </>
  ) : (
    <>
      <View className="flex-row items-center gap-2">
        {searchBox}
        {filtersButton}
      </View>
      {chipsRow}
      <View className="flex-row items-center gap-2">
        <View className="flex-1">{scopeSwitch}</View>
        <View className="flex-1">{viewSwitch}</View>
      </View>
      {scopeLine}
    </>
  );

  const sectionHeading = (label: string, count: number, isNow?: boolean) => (
    <View className="flex-row items-center gap-2.5 px-1 mt-1.5">
      <Text className={`font-orbitron-bold text-[11px] uppercase tracking-widest ${isNow ? 'text-danger-ink' : 'text-ink-muted'}`}>{label}</Text>
      <View className="flex-1 h-px bg-line" />
      <Text className="font-inter text-xs text-ink-muted">{count}</Text>
    </View>
  );

  const rowProps = { isWide, orgId: orgId!, canCreate, sportName, siteName, facilityName, today };

  const body = (() => {
    if (accessDenied) {
      return (
        <View className="items-center justify-center py-16 gap-2">
          <Ionicons name="lock-closed-outline" size={40} color={themeColor(isDark, 'ink-muted')} />
          <Text className="font-inter-semibold text-base text-ink-soft">No access</Text>
          <Text className="font-inter text-sm text-ink-muted text-center">You do not have permission to see this organisation's fixtures.</Text>
        </View>
      );
    }
    if (!(events || []).length) {
      return (
        <View className="rounded-2xl border border-line bg-card px-5 py-8 items-center gap-2">
          <Ionicons name="calendar-outline" size={32} color={themeColor(isDark, 'ink-faint')} />
          <Text className="font-inter-semibold text-base text-ink">No events yet</Text>
          <Text className="font-inter text-sm text-ink-muted text-center">
            {canCreate
              ? 'Schedule a match between two teams, or create a tournament and set it up over the coming weeks.'
              : 'Nothing has been scheduled yet.'}
          </Text>
          {canCreate ? (
            <View className="flex-row gap-2 mt-2">
              <TouchableOpacity onPress={() => router.push(`/admin/${orgId}/events/create`)} accessibilityRole="button" className="rounded-xl border border-line px-3.5 py-2">
                <Text className="font-inter-bold text-sm text-ink-soft">New match</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setNamingTournament(true)} accessibilityRole="button" className="rounded-xl bg-primary px-3.5 py-2">
                <Text className="font-inter-bold text-sm text-on-primary">New tournament</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      );
    }
    if (shownCount === 0) {
      const narrowedBy = isNarrowed || (!isWide && when === 'past');
      return (
        <View className="rounded-2xl border border-line bg-card px-5 py-8 items-center gap-2">
          <Text className="font-inter-semibold text-base text-ink">{narrowedBy ? 'Nothing matches' : `No ${when} ${noun}`}</Text>
          <Text className="font-inter text-sm text-ink-muted text-center">
            {narrowedBy
              ? `No ${when} ${noun}${scope === 'mine' ? ' of yours' : ''} match the search and filters.`
              : scope === 'mine'
              ? `None of yours. Switch to All to see everything on.`
              : `There are no ${when} ${noun}.`}
          </Text>
          {narrowedBy ? (
            <TouchableOpacity onPress={clearAll} accessibilityRole="button" className="mt-1">
              <Text className="font-inter-bold text-sm text-primary-ink">Clear search and filters</Text>
            </TouchableOpacity>
          ) : scope === 'mine' ? (
            <TouchableOpacity onPress={() => setScope('all')} accessibilityRole="button" className="mt-1">
              <Text className="font-inter-bold text-sm text-primary-ink">Show all</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }

    if (view === 'games') {
      return gameSections.map(section => (
        <View key={section.key} className="gap-2">
          {sectionHeading(section.label, section.items.length, section.isNow)}
          <View className="rounded-2xl border border-line bg-card overflow-hidden">
            {section.items.map((game, i) => {
              const event = eventsById.get(game.eventId);
              return (
                <MatchRow
                  key={game.id}
                  {...rowProps}
                  game={game}
                  event={event}
                  first={i === 0}
                  competition={event ? (resolveEventType(event).kind === 'SingleMatch' ? 'Single match' : event.name) : ''}
                  showDate={false}
                  away={!!event && event.orgId !== orgId}
                  convening={!!event && conveneEventIds.has(event.id)}
                  onPress={() => openGame(game, event)}
                />
              );
            })}
          </View>
        </View>
      ));
    }

    return eventSections.map(section => (
      <View key={section.key} className="gap-2">
        {sectionHeading(section.label, section.items.length, section.isNow)}
        <View className="rounded-2xl border border-line bg-card overflow-hidden">
          {section.items.map((event, i) => {
            const type = resolveEventType(event);
            const own = gamesByEvent.get(event.id) || [];
            const away = event.orgId !== orgId;
            const convening = conveneEventIds.has(event.id);
            if (type.kind === 'Unknown') {
              return <UnknownRow key={event.id} name={event.name} message={unknownEventTypeMessage(type)} first={i === 0} />;
            }
            if (type.kind === 'SingleMatch' && own[0]) {
              return (
                <MatchRow
                  key={event.id}
                  {...rowProps}
                  game={own[0]}
                  event={event}
                  first={i === 0}
                  showDate
                  away={away}
                  convening={convening}
                  onPress={() => openEvent(event)}
                />
              );
            }
            return (
              <TournamentRow
                key={event.id}
                {...rowProps}
                event={event}
                games={own}
                sportIds={eventSportIds(event)}
                first={i === 0}
                isPast={when === 'past'}
                away={away}
                convening={convening}
                onPress={() => openEvent(event)}
              />
            );
          })}
        </View>
      </View>
    ));
  })();

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader title="Fixtures & Events" onBack={() => safeBack(`/admin/${orgId}`)} right={headerRight} />
      {eventsLoading || gamesLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <View className="w-full gap-3 self-center" style={{ maxWidth: 960 }}>
            {toolbar}
            {body}
            {/* A phone has no Upcoming / Past switch in its toolbar, so the upcoming list ends with the way to the results. */}
            {!isWide && when === 'upcoming' && (events || []).length ? (
              <TouchableOpacity
                onPress={() => setWhen('past')}
                accessibilityRole="button"
                className="flex-row items-center justify-between rounded-2xl border border-line bg-card px-4 py-3 mt-1"
              >
                <Text className="font-inter-semibold text-sm text-ink-soft">Past events and results</Text>
                <Ionicons name="chevron-forward" size={16} color={themeColor(isDark, 'ink-muted')} />
              </TouchableOpacity>
            ) : null}
          </View>
        </ScrollView>
      )}

      <EventFiltersDialog
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        sportOptions={sportOptions}
        roleCounts={roleCounts}
        showKind={view === 'events'}
        when={isWide ? undefined : when}
        onWhenChange={isWide ? undefined : setWhen}
        shownLabel={`Show ${shownCount} ${shownCount === 1 ? noun.slice(0, -1) : noun}`}
      />
      {canCreate ? (
        <NewTournamentDialog
          visible={namingTournament}
          orgId={orgId!}
          onClose={() => setNamingTournament(false)}
          onCreated={id => {
            setNamingTournament(false);
            router.push(`/admin/${orgId}/events/${id}`);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

/* -----------------------------------------------------------------------------------------------
 * Rows
 * --------------------------------------------------------------------------------------------- */

interface RowBase {
  isWide: boolean;
  orgId: string;
  canCreate: boolean;
  sportName: (id?: string) => string;
  siteName: (id?: string | null) => string;
  facilityName: (id?: string | null) => string;
  today: string;
  first: boolean;
  away: boolean;
  convening: boolean;
  onPress: () => void;
}

function RoleTags({ away, convening }: { away: boolean; convening: boolean }) {
  if (!away && !convening) return null;
  return (
    <View className="flex-row gap-1">
      {away ? <RowTag tone="away" label="Away" /> : null}
      {convening ? <RowTag tone="convening" label="Convening" /> : null}
    </View>
  );
}

/**
 * A fixture: a single match in the Events view, any game in All games. Wide: the date, both teams
 * with their crests, the sport (and the competition in All games), where, and the time, score or
 * state. Phone: a scoreboard line — home, the time or score, away — in short codes, with where and
 * the sport underneath.
 */
function MatchRow({ game, event, competition, showDate, isWide, orgId, sportName, siteName, facilityName, first, away, convening, onPress }: RowBase & {
  game: GameSummary;
  event?: Event;
  competition?: string;
  showDate: boolean;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [home, visitor] = game.participants || [];
  const homeNames = fixtureSideNames(home, orgId);
  const awayNames = fixtureSideNames(visitor, orgId);
  const scores = sideScores(game);
  const isLive = game.status === 'Live';
  const isCancelled = game.status === 'Cancelled' || event?.status === 'Cancelled';
  const noScore = isScoreNotProvided(game);
  const kickoff = game.scheduledStartTime || game.startTime;
  const time = game.timeTbd || !kickoff ? null : formatKickoffTime(kickoff);
  const where = [siteName(game.siteId || event?.siteId), facilityName(game.facilityId || event?.facilityId)].filter(Boolean).join(' · ');
  const sport = sportName(game.sportId);
  const tile = showDate ? instantTile(kickoff) || calendarRangeTile(event?.startDate) : null;
  const border = first ? '' : 'border-t border-line-soft';
  const label = `${homeNames.full} against ${awayNames.full}`;
  const struck = isCancelled ? 'line-through text-ink-muted' : '';

  if (!isWide) {
    const middle = isLive && scores
      ? <Text className="font-orbitron-bold text-[15px] text-danger-ink">{scores[0]} – {scores[1]}</Text>
      : scores
      ? <Text className="font-orbitron-bold text-[15px] text-ink">{scores[0]} – {scores[1]}</Text>
      : noScore
      ? <Text className="font-inter text-xs text-ink-muted">No score</Text>
      : <Text className={`font-inter-bold text-sm ${time ? 'text-ink' : 'text-ink-muted'} ${struck}`}>{time || 'TBD'}</Text>;
    const line2 = competition ?? [where, sport].filter(Boolean).join(' · ');
    const right = isLive
      ? <Text className="font-inter-semibold text-xs text-danger-ink">● {game.periodLabel || 'Live'}</Text>
      : isCancelled
      ? <RowTag tone="cancelled" label="Cancelled" />
      : (away || convening)
      ? <RoleTags away={away} convening={convening} />
      : scores ? <Text className="font-inter text-[11px] text-ink-muted">Full time</Text> : null;
    const side = (names: typeof homeNames, participant: typeof home, align: 'left' | 'right') => (
      <View className={`flex-1 min-w-0 flex-row items-center gap-1.5 ${align === 'right' ? 'justify-end' : ''}`}>
        {align === 'left' ? <FixtureCrest participant={participant} size={24} placeholder={names.isPlaceholder} /> : null}
        <Text
          numberOfLines={1}
          className={`flex-shrink text-[13px] ${names.isPlaceholder ? 'font-inter italic text-ink-muted' : `font-inter-bold text-ink ${struck}`}`}
        >
          {names.short}
        </Text>
        {align === 'right' ? <FixtureCrest participant={participant} size={24} placeholder={names.isPlaceholder} /> : null}
      </View>
    );
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="link" accessibilityLabel={label} className={`flex-row items-center gap-2.5 px-3 py-2.5 ${border}`}>
        {showDate ? <DateTile tile={tile} width={34} /> : null}
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2">
            {side(homeNames, home, 'left')}
            <View className="items-center" style={{ minWidth: 44 }}>{middle}</View>
            {side(awayNames, visitor, 'right')}
          </View>
          <View className="flex-row items-center gap-2 mt-1">
            <Text className="flex-1 font-inter text-xs text-ink-muted" numberOfLines={1}>{line2}</Text>
            {right}
          </View>
          {competition !== undefined && where ? (
            <Text className="font-inter text-xs text-ink-muted" numberOfLines={1}>{where}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }

  const end = isLive ? (
    <>
      <RowTag tone="live" label="● Live" />
      {scores ? <Text className="font-orbitron-bold text-[15px] text-danger-ink">{scores[0]} – {scores[1]}</Text> : null}
      {game.periodLabel ? <Text className="font-inter-semibold text-[11px] text-danger-ink">{game.periodLabel}</Text> : null}
    </>
  ) : isCancelled ? (
    <RowTag tone="cancelled" label="Cancelled" />
  ) : scores ? (
    <>
      <Text className="font-orbitron-bold text-[15px] text-ink">{scores[0]} – {scores[1]}</Text>
      <Text className="font-inter text-[11px] text-ink-muted">Full time</Text>
    </>
  ) : noScore ? (
    <Text className="font-inter text-xs text-ink-muted">No score</Text>
  ) : (
    <Text className={`font-inter-bold text-sm ${time ? 'text-ink' : 'text-ink-muted'}`}>{time || 'Time TBD'}</Text>
  );
  const side = (names: typeof homeNames, participant: typeof home) => (
    <View className="flex-row items-center gap-2 min-w-0 flex-shrink">
      <FixtureCrest participant={participant} size={26} placeholder={names.isPlaceholder} />
      <Text
        numberOfLines={1}
        className={`flex-shrink text-[15px] ${names.isPlaceholder ? 'font-inter italic text-ink-muted' : `font-inter-semibold text-ink ${struck}`}`}
      >
        {names.full}
      </Text>
    </View>
  );

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="link" accessibilityLabel={label} className={`flex-row items-center gap-3 px-4 py-3 ${border}`}>
      {showDate ? <DateTile tile={tile} /> : null}
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-2 min-w-0">
          {side(homeNames, home)}
          <Text className="font-inter text-[13px] text-ink-muted">vs</Text>
          {side(awayNames, visitor)}
          <RoleTags away={away} convening={convening} />
        </View>
        <Text className="font-inter text-xs text-ink-muted mt-0.5" style={{ marginLeft: 34 }} numberOfLines={1}>
          {[competition, sport].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={{ width: 230 }}>
        <Text className="font-inter text-sm text-ink-soft" numberOfLines={1}>{siteName(game.siteId || event?.siteId) || ' '}</Text>
        {facilityName(game.facilityId || event?.facilityId) ? (
          <Text className="font-inter text-xs text-ink-muted" numberOfLines={1}>{facilityName(game.facilityId || event?.facilityId)}</Text>
        ) : null}
      </View>
      <View style={{ width: 112 }} className="items-end gap-0.5">{end}</View>
      <Ionicons name="chevron-forward" size={16} color={themeColor(isDark, 'ink-muted')} />
    </TouchableOpacity>
  );
}

/** A tournament: its name and format, the sports, where, and how many games — or that it is on now. */
function TournamentRow({ event, games, sportIds, isPast, isWide, canCreate, sportName, siteName, today, first, away, convening, onPress }: RowBase & {
  event: Event;
  games: GameSummary[];
  sportIds: string[];
  isPast: boolean;
}) {
  const isDark = useActiveTheme() === 'dark';
  const tile = calendarRangeTile(event.startDate, event.endDate);
  const liveCount = games.filter(g => g.status === 'Live').length;
  const dayOf = eventDayOfRange(event.startDate, event.endDate, today);
  const sports = sportIds.map(sportName).filter(Boolean).join(', ');
  const kind = [eventFormatLabel(event.format), sports].filter(Boolean).join(' · ');
  const where = siteName(event.siteId);
  const border = first ? '' : 'border-t border-line-soft';
  const isCancelled = event.status === 'Cancelled';
  const gamesLabel = `${games.length} ${games.length === 1 ? 'game' : 'games'}`;

  const end = isCancelled ? (
    <RowTag tone="cancelled" label="Cancelled" />
  ) : liveCount ? (
    <>
      <RowTag tone="live" label={`● ${liveCount} live`} />
      {dayOf ? <Text className="font-inter text-[11px] text-ink-muted">{dayOf}</Text> : null}
    </>
  ) : isPast ? (
    <>
      <Text className="font-inter-semibold text-[13px] text-ink">{gamesLabel}</Text>
      <Text className="font-inter text-[11px] text-ink-muted">Finished</Text>
    </>
  ) : !games.length ? (
    canCreate && !away ? <RowTag tone="setup" label="No fixtures yet" /> : <Text className="font-inter text-[11px] text-ink-muted">Fixtures to come</Text>
  ) : (
    <>
      <Text className="font-inter-semibold text-[13px] text-ink">{gamesLabel}</Text>
      {dayOf ? <Text className="font-inter text-[11px] text-ink-muted">{dayOf}</Text> : null}
    </>
  );
  const name = (
    <Text numberOfLines={1} className={`flex-shrink font-inter-semibold text-[15px] ${isCancelled ? 'line-through text-ink-muted' : 'text-ink'}`}>
      {event.name}
    </Text>
  );

  if (!isWide) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="link" accessibilityLabel={event.name} className={`flex-row items-center gap-2.5 px-3 py-2.5 ${border}`}>
        <DateTile tile={tile} width={34} />
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2 min-w-0">
            <TournamentMark size={24} />
            {name}
          </View>
          <View className="flex-row items-center gap-2 mt-1">
            <Text className="flex-1 font-inter text-xs text-ink-muted" numberOfLines={1}>{[kind, where].filter(Boolean).join(' · ')}</Text>
            <RoleTags away={away} convening={convening} />
          </View>
        </View>
        <View className="items-end gap-0.5 self-start">{end}</View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="link" accessibilityLabel={event.name} className={`flex-row items-center gap-3 px-4 py-3 ${border}`}>
      <DateTile tile={tile} />
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-2 min-w-0">
          <TournamentMark />
          {name}
          <RoleTags away={away} convening={convening} />
        </View>
        <Text className="font-inter text-xs text-ink-muted mt-0.5" style={{ marginLeft: 34 }} numberOfLines={1}>{kind}</Text>
      </View>
      <View style={{ width: 230 }}>
        <Text className="font-inter text-sm text-ink-soft" numberOfLines={1}>{where || ' '}</Text>
      </View>
      <View style={{ width: 112 }} className="items-end gap-0.5">{end}</View>
      <Ionicons name="chevron-forward" size={16} color={themeColor(isDark, 'ink-muted')} />
    </TouchableOpacity>
  );
}

/** An event whose type the app does not recognise is shown as an error rather than guessed at (FIX-1 / U39). */
function UnknownRow({ name, message, first }: { name: string; message: string; first: boolean }) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <View className={`flex-row items-start gap-3 px-4 py-3 bg-danger-soft ${first ? '' : 'border-t border-line-soft'}`}>
      <Ionicons name="alert-circle-outline" size={18} color={themeColor(isDark, 'danger-ink')} />
      <View className="flex-1 min-w-0">
        <Text className="font-inter-semibold text-[15px] text-ink">{name || 'Unnamed event'}</Text>
        <Text className="font-inter text-xs text-danger-ink mt-0.5">{message}</Text>
      </View>
    </View>
  );
}
