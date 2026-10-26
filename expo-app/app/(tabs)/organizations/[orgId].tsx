import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { League, Team } from '@sk/shared';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { Tabs } from '../../../components/Tabs';
import { PageBody } from '../../../components/PageBody';
import { OrgProfileBanner } from '../../../components/org/OrgProfileBanner';
import { TournamentCard } from '../../../components/tournament/TournamentBits';
import { AddressMap } from '../../../components/address/AddressMap';
import { MapOverlay } from '../../../components/address/MapOverlay';
import { AddressLines } from '../../../components/address/AddressInput';
import { OrgEventsListView } from '../../admin/[orgId]/events/index';
import { useOrgSummary } from '../../../hooks/useOrgSummary';
import { useOrgTeams } from '../../../hooks/useOrgTeams';
import { useOrgSites } from '../../../hooks/useOrgSites';
import { useSports } from '../../../hooks/useEventRooms';
import { useLiveRoom } from '../../../hooks/useLiveRoom';
import { useSafeBack } from '../../../hooks/useSafeBack';
import { useAuthStore } from '../../../store/authStore';
import { useActiveTheme } from '../../../store/settingsStore';
import { themeColor } from '../../../constants/Colors';
import { hasPin } from '../../../services/places';
import { orgAccess } from '../../../utils/orgAccess';
import { copyText, openDirections } from '../../../utils/share';

/**
 * An organisation as anyone sees it, from the Orgs tab (`UI-34`, agreed 2026-10-22 on
 * `mockups/org-public-page.html`, option A; docs/events.md §11).
 *
 * Read-first, like the workspace's Profile: its banner (logo, name and short code, type and town),
 * then the tournament page's tabs —
 * - **Overview**: *On now & next* (at most three, so the rest stays easy to find), About, Address
 *   and Sports;
 * - **Teams**, by sport, each with its head coach — named (decided 2026-10-22), players never;
 * - **Fixtures**, the organisation's Fixtures & Events list, read-only (`OrgEventsListView`);
 * - **Sites** and **Leagues**.
 * Everything on it is public: the summary, teams, sites, events and leagues rooms. A member sees the
 * same page with the way into the workspace at the end of the banner. Applying to join comes with
 * `MEMBER-1`, for an organisation that allows it; team and site rows open nothing until the public
 * team and site pages exist.
 */
type Tab = 'overview' | 'teams' | 'fixtures' | 'sites' | 'leagues';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'teams', label: 'Teams' },
  { key: 'fixtures', label: 'Fixtures' },
  { key: 'sites', label: 'Sites' },
  { key: 'leagues', label: 'Leagues' },
];

export default function PublicOrgPage() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, tab: tabParam } = useLocalSearchParams<{ orgId: string; tab?: string }>();
  const isDark = useActiveTheme() === 'dark';
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const [tab, setTab] = useState<Tab>(() => (TABS.some(t => t.key === tabParam) ? (tabParam as Tab) : 'overview'));
  const [aboutOpen, setAboutOpen] = useState(false);

  const { org, isLoading } = useOrgSummary(orgId);
  const { teams } = useOrgTeams(orgId);
  const { sites, facilities } = useOrgSites(orgId);
  const sports = useSports();
  const { items: leagues } = useLiveRoom<League>(orgId ? `org:${orgId}:leagues` : null, {
    reduce: message => {
      switch (message.type) {
        case 'LEAGUES_SYNC': return { kind: 'replace', items: Array.isArray(message.data) ? message.data : [] };
        case 'LEAGUE_ADDED':
        case 'LEAGUE_UPDATED': return message.data?.id ? { kind: 'upsert', item: message.data } : { kind: 'ignore' };
        case 'LEAGUE_DELETED': return message.data?.id ? { kind: 'remove', id: message.data.id } : { kind: 'ignore' };
        default: return { kind: 'ignore' };
      }
    },
  });

  // A member's way into the workspace: Admin and Staff manage it; a Member — a coach — opens it for what is theirs.
  const { isAuthenticated, user, orgMemberships, teamMemberships } = useAuthStore();
  const access = orgAccess(orgId, user?.globalRole === 'admin', orgMemberships, teamMemberships);
  const workspaceLabel = !isAuthenticated ? null : access.canManage ? 'Manage Workspace' : access.canOpenWorkspace ? 'Open Workspace' : null;

  const sportName = (id?: string | null) => sports.find(s => s.id === id)?.name || 'Other';
  const activeTeams = useMemo(() => teams.filter(t => t.isActive !== false), [teams]);
  const teamsBySport = useMemo(() => {
    const groups = new Map<string, Team[]>();
    for (const t of activeTeams) groups.set(t.sportId || '', [...(groups.get(t.sportId || '') || []), t]);
    return Array.from(groups.entries()).map(([sportId, list]) => ({ sportId, list: list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) }));
  }, [activeTeams]);
  const activeSites = sites.filter(s => s.isActive !== false);

  if (isLoading || !org) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Organisation" onBack={() => safeBack('/(tabs)/organizations')} />
        <View className="flex-1 items-center justify-center p-6">
          {isLoading ? <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} /> : (
            <Text className="font-inter text-sm text-ink-muted">This organisation could not be found.</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const muted = themeColor(isDark, 'ink-muted');
  const link = (label: string, onPress: () => void) => (
    <TouchableOpacity onPress={onPress} accessibilityRole="link" hitSlop={8}>
      <Text className="font-inter-bold text-sm text-primary-ink">{label}</Text>
    </TouchableOpacity>
  );
  const row = (key: string, first: boolean, children: React.ReactNode, onPress?: () => void) => {
    const body = <View className={`flex-row items-center gap-3 py-2.5 ${first ? '' : 'border-t border-line-soft'}`}>{children}</View>;
    return onPress ? <TouchableOpacity key={key} onPress={onPress} accessibilityRole="link">{body}</TouchableOpacity> : <View key={key}>{body}</View>;
  };
  const groupHeading = (label: string, count: number, first: boolean) => (
    <Text className={`font-orbitron-bold text-[9px] text-ink-muted uppercase tracking-widest pb-1 ${first ? '' : 'pt-3'}`}>{label}  {count}</Text>
  );

  /* -- Overview -- */
  const nowNextCard = (
    <TournamentCard title="On now & next" right={link('All fixtures ›', () => setTab('fixtures'))}>
      <OrgEventsListView orgId={orgId} publicView nowNext={3} />
    </TournamentCard>
  );
  const description = org.description?.trim() || '';
  const longAbout = description.length > 160;
  const aboutCard = description ? (
    <TournamentCard title="About">
      <Text className="font-inter text-sm text-ink-soft leading-6" numberOfLines={longAbout && !aboutOpen ? 2 : undefined}>{description}</Text>
      {longAbout ? link(aboutOpen ? 'Show less' : 'Show more', () => setAboutOpen(o => !o)) : null}
    </TournamentCard>
  ) : null;
  const pin = hasPin(org.address) ? org.address : null;
  const addressCard = org.address ? (
    <TournamentCard title="Address">
      {pin ? (
        <View>
          <AddressMap latitude={pin.latitude} longitude={pin.longitude} title={org.name} interactive={false} height={isWide ? 150 : 120} />
          <MapOverlay onPress={() => router.push(`/(tabs)/organizations/${orgId}/map` as any)} label="Open map" />
        </View>
      ) : null}
      <AddressLines address={org.address} />
      <View className="flex-row gap-2">
        <TouchableOpacity onPress={() => openDirections(pin, org.address?.fullAddress || '')} accessibilityRole="button" className="rounded-xl border border-line px-3.5 py-2">
          <Text className="font-inter-bold text-sm text-ink">Directions</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => copyText(org.address?.fullAddress || '', 'The address')} accessibilityRole="button" className="rounded-xl border border-line px-3.5 py-2">
          <Text className="font-inter-bold text-sm text-ink">Copy address</Text>
        </TouchableOpacity>
      </View>
    </TournamentCard>
  ) : null;
  const sportIds = org.supportedSportIds || [];
  const sportsCard = sportIds.length ? (
    <TournamentCard title="Sports">
      <View className="flex-row flex-wrap gap-1.5">
        {sportIds.map(id => (
          <View key={id} className="rounded-full bg-sunken px-3 py-1"><Text className="font-inter-semibold text-[13px] text-ink-soft">{sportName(id)}</Text></View>
        ))}
      </View>
    </TournamentCard>
  ) : null;
  const overview = isWide ? (
    <View className="flex-row gap-4 items-start">
      <View className="gap-4 min-w-0" style={{ flex: 1.2 }}>{nowNextCard}{aboutCard}</View>
      <View className="gap-4 min-w-0" style={{ flex: 1 }}>{addressCard}{sportsCard}</View>
    </View>
  ) : (
    <View className="gap-3">{nowNextCard}{aboutCard}{addressCard}{sportsCard}</View>
  );

  /* -- Teams: by sport, each with its head coach -- */
  const teamsTab = (
    <TournamentCard title="Teams" count={activeTeams.length}>
      {activeTeams.length ? (
        <View>
          {teamsBySport.map((group, g) => (
            <View key={group.sportId}>
              {teamsBySport.length > 1 ? groupHeading(sportName(group.sportId), group.list.length, g === 0) : null}
              {group.list.map((t, i) => row(t.id, i === 0, (
                <>
                  <View className="flex-1 min-w-0">
                    <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>{t.name}</Text>
                    <Text className="font-inter text-xs text-ink-muted" numberOfLines={1}>{t.coachName ? `Coach ${t.coachName}` : 'No coach yet'}</Text>
                  </View>
                  <Text className="font-inter text-xs text-ink-muted">{t.playerCount ?? 0} {t.playerCount === 1 ? 'player' : 'players'}</Text>
                  <Ionicons name="chevron-forward" size={14} color={themeColor(isDark, 'ink-faint')} />
                </>
              ), () => router.push(`/teams/${t.id}` as any)))}
            </View>
          ))}
        </View>
      ) : <Text className="font-inter text-sm text-ink-muted">No teams yet.</Text>}
    </TournamentCard>
  );

  /* -- Sites -- */
  const sitesTab = (
    <TournamentCard title="Sites" count={activeSites.length}>
      {activeSites.length ? (
        <View>
          {activeSites.map((s, i) => {
            const own = facilities.filter(f => f.siteId === s.id && f.isActive !== false);
            return row(s.id, i === 0, (
              <>
                <Ionicons name="location-outline" size={18} color={muted} />
                <View className="flex-1 min-w-0">
                  <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>{s.name}</Text>
                  {s.address?.fullAddress ? <Text className="font-inter text-xs text-ink-muted" numberOfLines={2}>{s.address.fullAddress}</Text> : null}
                </View>
                <Text className="font-inter text-xs text-ink-muted">{own.length} {own.length === 1 ? 'facility' : 'facilities'}</Text>
                <Ionicons name="chevron-forward" size={14} color={themeColor(isDark, 'ink-faint')} />
              </>
            ), () => router.push(`/sites/${s.id}` as any));
          })}
        </View>
      ) : <Text className="font-inter text-sm text-ink-muted">No sites yet.</Text>}
    </TournamentCard>
  );

  /* -- Leagues: each opens its public page -- */
  const leaguesTab = (
    <TournamentCard title="Leagues" count={leagues.length}>
      {leagues.length ? (
        <View>
          {leagues.map((l: any, i) => row(l.id, i === 0, (
            <>
              <Ionicons name="trophy-outline" size={18} color={muted} />
              <View className="flex-1 min-w-0">
                <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>{l.name}</Text>
                <Text className="font-inter text-xs text-ink-muted" numberOfLines={1}>{[sportName(l.sportId), l.ageGroup].filter(Boolean).join(' · ')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={themeColor(isDark, 'ink-faint')} />
            </>
          ), () => router.push(`/leagues/${l.id}` as any)))}
        </View>
      ) : <Text className="font-inter text-sm text-ink-muted">No leagues yet.</Text>}
    </TournamentCard>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader title="Organisation" onBack={() => safeBack('/(tabs)/organizations')} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={{ padding: isWide ? 24 : 12, paddingBottom: 0 }}>
          <PageBody>
            <OrgProfileBanner org={org} action={workspaceLabel ? { label: workspaceLabel, onPress: () => router.push(`/admin/${orgId}` as any) } : undefined} />
          </PageBody>
        </View>
        <View className="bg-card mt-4 border-y border-line">
          <PageBody>
            <Tabs items={TABS} activeKey={tab} onChange={setTab} />
          </PageBody>
        </View>
        <View style={{ padding: isWide ? 24 : 12 }}>
          <PageBody className="gap-3">
            {tab === 'overview' ? overview : null}
            {tab === 'teams' ? teamsTab : null}
            {tab === 'fixtures' ? <OrgEventsListView orgId={orgId} publicView /> : null}
            {tab === 'sites' ? sitesTab : null}
            {tab === 'leagues' ? leaguesTab : null}
          </PageBody>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
