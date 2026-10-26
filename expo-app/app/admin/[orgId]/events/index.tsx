import { useTeamEntries } from '../../../../hooks/useTeamEntries';
import { useMineAll } from '../../../../hooks/useMineAll';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Event,
  EventOrgInvitation,
  GameSummary,
  Sport,
  resolveEventType,
  unknownEventTypeMessage,
} from '@sk/shared';
import { ScreenHeader } from '../../../../components/ScreenHeader';
import { SegmentedControl } from '../../../../components/SegmentedControl';
import { OverflowMenu } from '../../../../components/OverflowMenu';
import {
  fixtureSideNames,
} from '../../../../components/events/EventBits';
import {
  EventFiltersDialog,
  EventListFilters,
  EventListRole,
  NO_FILTERS,
  NewHeadToHeadDialog,
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
import {
  calendarRangeStatus,
  formatDateRange,
  dayHeading,
  instantCalendarDate,
  isCalendarDate,
  monthSection,
  startOfTodayMs,
  todayCalendarDate,
  upcomingSection,
  whenMs,
} from '../../../../utils/dates';
import { themeColor } from '../../../../constants/Colors';
import { PageBody } from '../../../../components/PageBody';
import { MatchRow, TournamentRow, UnknownRow } from '../../../../components/events/EventRows';
import { useOrgSummary } from '../../../../hooks/useOrgSummary';

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

const VIEW_KEY = 'eventsListView';
/** Per organisation, since the sports on offer differ between them. */
const filtersKey = (orgId?: string) => `eventsListFilters:${orgId}`;

const ADMIN_ROLES = ['role-org-admin', 'role-org-staff'];

/** The day a game is on: its kick-off's, or its event's first day while it has none. */
const gameDay = (game: GameSummary, event?: Event) =>
  instantCalendarDate(game.scheduledStartTime || game.startTime) || (event?.startDate ?? null);
const gameMs = (game: GameSummary, event?: Event) => {
  const ms = whenMs(game.scheduledStartTime || game.startTime || event?.startDate);
  return isNaN(ms) ? 0 : ms;
};

export default function OrgEventsList() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  return <OrgEventsListView orgId={orgId} />;
}

const NO_GRANTS = { eventIds: [] as string[], sports: [] as Array<{ eventId: string }>, divisions: [] as Array<{ eventId: string }> };

/**
 * The list itself, for the workspace page above and — with `publicView` — the public organisation
 * page's Fixtures tab (`UI-34`, docs/events.md §11): the same rows, sections, Events / All games,
 * Upcoming / Past, search and Filters, read-only. There is no "you" on the public page, so no
 * Mine / All, no New event, no invitations and no *Convening*; *Away* stays, being about the
 * organisation. Only what is public is in `org:{id}:events` to begin with, and a row opens the
 * tournament's public page. Embedded, it brings no header or scroll of its own.
 */
export function OrgEventsListView({ orgId, publicView = false, nowNext }: {
  orgId: string;
  publicView?: boolean;
  /**
   * Only the first this many upcoming events — what is on now first, then the soonest — as rows with
   * no toolbar or headings: the public organisation page's *On now & next* (`UI-34`). Saved filters
   * do not apply to it.
   */
  nowNext?: number;
}) {
  const router = useRouter();
  const safeBack = useSafeBack();
  const isDark = useActiveTheme() === 'dark';
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const user = useAuthStore((state: any) => state.user);
  const orgMemberships = useAuthStore((state: any) => state.orgMemberships);
  const teamMemberships = useAuthStore((state: any) => state.teamMemberships);
  const dependants = useAuthStore((state: any) => state.dependants);
  const viewerRole = (orgMemberships || []).find((m: any) => m.orgId === orgId)?.roleId;
  /** Creating an event is a manage-org action: Admin and Staff. */
  const canCreate = !publicView && (user?.globalRole === 'admin' || ADMIN_ROLES.includes(viewerRole));

  /* Mine / All and Events / All games are remembered on this device. Until someone chooses, Admin
     and Staff see everything the organisation has on, and everyone else what is theirs. */
  const savedView = useSettingsStore(state => state.localOverrides[VIEW_KEY]) as View_ | undefined;
  const setLocalOverride = useSettingsStore(state => state.setLocalOverride);
  // Shared with the tournament pages (`useMineAll`): one Mine / All everywhere.
  const [savedScope, setScope] = useMineAll(orgId);
  const scope: Scope = publicView ? 'all' : savedScope;
  const view: View_ = nowNext ? 'events' : savedView ?? 'events';
  const setView = (next: View_) => setLocalOverride(VIEW_KEY, next);

  const [search, setSearch] = useState('');
  const [when, setWhen] = useState<When>('upcoming');
  /* The filters are remembered on this device too (decided 2026-10-04): reselecting them on every
     visit was more irritating than a narrowed list is misleading, and a narrowed list says so — its
     chips and count sit right under the search. Search and Upcoming / Past are not remembered: a
     search is a one-off, and Past is a look back. */
  const savedFilters = useSettingsStore(state => state.localOverrides[filtersKey(orgId)]) as EventListFilters | undefined;
  const filters: EventListFilters = nowNext ? NO_FILTERS : { ...NO_FILTERS, ...(savedFilters || {}) };
  const setFilters = (next: EventListFilters | ((current: EventListFilters) => EventListFilters)) =>
    setLocalOverride(filtersKey(orgId), typeof next === 'function' ? next(filters) : next);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [namingTournament, setNamingTournament] = useState(false);
  const [namingHeadToHead, setNamingHeadToHead] = useState(false);
  // The organising organisation's name, for the name a new Head to Head is given.
  const { org: hostSummary } = useOrgSummary(canCreate ? orgId : null);

  const { items: listedEvents, isLoading: eventsLoading, accessDenied } = useLiveRoom<Event>(orgId ? `org:${orgId}:events` : null, {
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

  /*
   * Tournaments its members see here but its public lists do not (`FIX-30`): an invitation to
   * answer, and one it declined or withdrew from, kept as the record. A members' room — the
   * public `org:{id}:events` shows a tournament only once the organisation is in it.
   */
  const { items: invitedEvents } = useLiveRoom<Event>(orgId && !publicView ? `org:${orgId}:invitations` : null, {
    reduce: (message) =>
      message.type === 'EVENT_INVITATIONS_SYNC' ? { kind: 'replace', items: message.data || [] } : { kind: 'ignore' },
  });
  const events = useMemo(() => {
    const listed = (listedEvents || []).filter(Boolean);
    const seen = new Set(listed.map(e => e.id));
    return [...listed, ...(invitedEvents || []).filter(e => e && !seen.has(e.id))];
  }, [listedEvents, invitedEvents]);
  /** This organisation's invitation to a tournament it does not host. */
  const invitationTo = (event: Event): EventOrgInvitation | undefined =>
    event.orgId === orgId ? undefined : event.participatingOrgs?.find(o => o.id === orgId)?.invitation;

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
  const myGrants = useMyEventGrants();
  const grants = publicView ? NO_GRANTS : myGrants;

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
  /** A game opens its page, whoever is looking: what they may do there is the page's to show (stage 3). */
  const openGame = (game: GameSummary, _event?: Event) => {
    router.push((publicView ? `/events/${game.eventId}/games/${game.id}` : `/admin/${orgId}/events/${game.eventId}/games/${game.id}`) as any);
  };
  const openEvent = (event: Event) => {
    const single = resolveEventType(event).kind === 'SingleMatch' ? (gamesByEvent.get(event.id) || [])[0] : undefined;
    if (single) openGame(single, event);
    else router.push((publicView ? `/events/${event.id}` : `/admin/${orgId}/events/${event.id}`) as any);
  };

  /*
   * Invitations still to answer (`FIX-30`), at the top of the list whatever the filters: a
   * tournament months away sits far down it, and its *Answer needed* tag with it. Each opens the
   * tournament, where its card has Accept and Decline beside everything else about it.
   */
  const toAnswer = useMemo(
    () =>
      (events || [])
        .filter(event => invitationTo(event) === 'invited' && !isPastEvent(event))
        .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, orgId, today]
  );
  /*
   * Its teams still invited (`FIX-31`), naming each team: a coach's own teams — theirs to answer —
   * and, for an admin, teams of tournaments the organisation has already accepted (the organisation's
   * own invitation above covers the rest). A coach's line opens the team; an admin's, the
   * organisation's page in that tournament, where every team is answered.
   */
  const isAdmin = user?.globalRole === 'admin' || viewerRole === 'role-org-admin';
  const coachTeamIds = useMemo(
    () => new Set<string>((teamMemberships || []).filter((m: any) => m.roleId === 'role-coach' || m.roleId === 'role-assistant-coach').map((m: any) => m.teamId)),
    [teamMemberships]
  );
  const { entries: teamInvites } = useTeamEntries({ orgId: !publicView && (isAdmin || coachTeamIds.size) ? orgId : null });
  const teamToAnswer = teamInvites.filter(e =>
    isAdmin ? !toAnswer.some(ev => ev.id === e.eventId) : !!e.teamId && coachTeamIds.has(e.teamId));
  const invitationCount = (isAdmin || !coachTeamIds.size ? toAnswer.length : 0) + teamToAnswer.length;
  const orgLines = isAdmin || !coachTeamIds.size ? toAnswer : [];
  const invitationsBox = invitationCount && !publicView ? (
    <View className="rounded-2xl bg-warning-soft px-4 py-3 gap-1">
      <View className="flex-row items-center gap-2">
        <Ionicons name="mail-unread-outline" size={16} color={themeColor(isDark, 'warning-ink')} />
        <Text className="font-inter-bold text-sm text-warning-ink">
          {invitationCount === 1 ? '1 invitation to answer' : `${invitationCount} invitations to answer`}
        </Text>
      </View>
      {orgLines.map((event, i) => {
        const host = event.participatingOrgs?.find(o => o.id === event.orgId)?.name;
        return (
          <TouchableOpacity
            key={event.id}
            onPress={() => router.push(`/admin/${orgId}/events/${event.id}`)}
            accessibilityRole="link"
            accessibilityLabel={`Answer the invitation to ${event.name}`}
            className={`flex-row items-center gap-2 py-1.5 ${i ? 'border-t border-warning/30' : ''}`}
          >
            <View className="flex-1 min-w-0">
              <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>{event.name}</Text>
              <Text className="font-inter text-xs text-ink-soft" numberOfLines={1}>
                {[host ? `From ${host}` : '', formatDateRange(event.startDate, event.endDate, { compact: true })].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text className="font-inter-bold text-[13px] text-primary-ink">Answer ›</Text>
          </TouchableOpacity>
        );
      })}
      {teamToAnswer.map((entry, i) => (
        <TouchableOpacity
          key={entry.id}
          onPress={() => router.push((isAdmin ? `/admin/${orgId}/events/${entry.eventId}/organisations/${orgId}` : `/admin/${orgId}/teams/${entry.teamId}`) as any)}
          accessibilityRole="link"
          accessibilityLabel={`Answer for ${entry.name} in ${entry.eventName}`}
          className={`flex-row items-center gap-2 py-1.5 ${i || orgLines.length ? 'border-t border-warning/30' : ''}`}
        >
          <View className="flex-1 min-w-0">
            <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>
              {entry.eventName} <Text className="font-inter text-ink-soft">— for {entry.name}</Text>
            </Text>
            <Text className="font-inter text-xs text-ink-soft" numberOfLines={1}>
              {[entry.divisionName, entry.hostOrgName ? `From ${entry.hostOrgName}` : '', formatDateRange(entry.eventStartDate, entry.eventEndDate, { compact: true })].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Text className="font-inter-bold text-[13px] text-primary-ink">Answer ›</Text>
        </TouchableOpacity>
      ))}
    </View>
  ) : null;

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
          // Second: simpler than a tournament, which is the most involved and so comes last (`H2H-1`).
          label: 'Head to Head',
          description: "Your teams against one other organisation's, A v A, B v B, across one or more sports",
          icon: 'swap-horizontal-outline',
          onPress: () => setNamingHeadToHead(true),
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
        placeholder={width >= 1200 ? 'Search teams, events or venues' : 'Search'}
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
        {publicView ? null : scopeSwitch}
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
        {publicView ? null : <View className="flex-1">{scopeSwitch}</View>}
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

  // On now & next sits in a card a column wide, so its rows take the compact, phone layout.
  const rowProps = { isWide: isWide && !nowNext, orgId: orgId!, canCreate, sportName, siteName, facilityName, today };

  /** One event's row: a match, a tournament, or one whose type the app cannot name. */
  const eventRow = (event: Event, i: number) => {
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
        invitation={invitationTo(event)}
        away={away}
        convening={convening}
        onPress={() => openEvent(event)}
      />
    );
  };

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
          {section.items.map((event, i) => eventRow(event, i))}
        </View>
      </View>
    ));
  })();

  if (nowNext) {
    if (eventsLoading || gamesLoading) return <View className="items-center py-6"><ActivityIndicator color={themeColor(isDark, 'primary')} /></View>;
    const soonest = eventSections.flatMap(section => section.items).slice(0, nowNext);
    return soonest.length
      ? <View>{soonest.map((event, i) => eventRow(event, i))}</View>
      : <Text className="font-inter text-sm text-ink-muted py-2">Nothing coming up.</Text>;
  }

  const filtersDialog = (
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
  );
  const pastLink = !isWide && when === 'upcoming' && (events || []).length ? (
    <TouchableOpacity
      onPress={() => setWhen('past')}
      accessibilityRole="button"
      className="flex-row items-center justify-between rounded-2xl border border-line bg-card px-4 py-3 mt-1"
    >
      <Text className="font-inter-semibold text-sm text-ink-soft">Past events and results</Text>
      <Ionicons name="chevron-forward" size={16} color={themeColor(isDark, 'ink-muted')} />
    </TouchableOpacity>
  ) : null;

  if (publicView) {
    return eventsLoading || gamesLoading ? (
      <View className="items-center justify-center py-16"><ActivityIndicator size="large" color={themeColor(isDark, 'primary')} /></View>
    ) : (
      <View className="gap-3">
        {toolbar}
        {body}
        {pastLink}
        {filtersDialog}
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader title="Fixtures & Events" onBack={() => safeBack(`/admin/${orgId}`)} right={headerRight} />
      {eventsLoading || gamesLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <PageBody className="gap-3">
            {invitationsBox}
            {toolbar}
            {body}
            {/* A phone has no Upcoming / Past switch in its toolbar, so the upcoming list ends with the way to the results. */}
            {pastLink}
          </PageBody>
        </ScrollView>
      )}

      {filtersDialog}
      {canCreate ? (
        <NewHeadToHeadDialog
          visible={namingHeadToHead}
          orgId={orgId!}
          hostName={hostSummary?.name}
          onClose={() => setNamingHeadToHead(false)}
          onCreated={id => {
            setNamingHeadToHead(false);
            router.push(`/admin/${orgId}/events/${id}`);
          }}
        />
      ) : null}
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
