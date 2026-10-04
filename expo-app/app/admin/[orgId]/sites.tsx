import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Facility, Site, Sport } from '@sk/shared';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AmenityIcons, SiteAddressLine, SiteMark, addressText, siteAmenities, siteSports } from '../../../components/sites/SiteBits';
import { SiteDialog } from '../../../components/sites/SiteDialogs';
import { useOrgSites } from '../../../hooks/useOrgSites';
import { useSocketQuery } from '../../../hooks/useSocketQuery';
import { useSafeBack } from '../../../hooks/useSafeBack';
import { useAuthStore } from '../../../store/authStore';
import { useActiveTheme } from '../../../store/settingsStore';
import { themeColor } from '../../../constants/Colors';

/**
 * The organisation's sites (docs/sites.md). A row is the site at a glance — its name, its street
 * (then suburb and town while there is room), the sports it can host and its other facilities as
 * icons — and opens the site page, the same page for everyone.
 *
 * Inactive sites are in a collapsed section at the bottom, which is why the main list needs no
 * Inactive badge. No filters: an organisation has a handful of sites. Add site is shown to Admin
 * and Staff only.
 */
export default function OrgSites() {
  const isDark = useActiveTheme() === 'dark';
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const user = useAuthStore(state => state.user);
  const viewerRole = useAuthStore(state => state.orgMemberships.find((m: any) => m.orgId === orgId)?.roleId);
  const canEdit = user?.globalRole === 'admin' || viewerRole === 'role-org-admin' || viewerRole === 'role-org-staff';

  const { sites, facilities, isLoading } = useOrgSites(orgId);
  const { data: sportsData } = useSocketQuery<Sport[]>('sports');
  const sports = sportsData || [];

  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const facilitiesBySite = useMemo(() => {
    const map = new Map<string, Facility[]>();
    for (const f of facilities) map.set(f.siteId, [...(map.get(f.siteId) || []), f]);
    return map;
  }, [facilities]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (site: Site) => {
      if (!q) return true;
      const own = facilitiesBySite.get(site.id) || [];
      const words = [
        site.name,
        addressText(site.address),
        ...own.map(f => f.name),
        ...own.flatMap(f => (f.supportedSportIds || []).map(id => sports.find(s => s.id === id)?.name || '')),
      ];
      return words.some(w => (w || '').toLowerCase().includes(q));
    };
    return sites.filter(matches).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [sites, search, facilitiesBySite, sports]);

  const shownActive = shown.filter(s => s.isActive !== false);
  const shownInactive = shown.filter(s => s.isActive === false);
  const activeCount = sites.filter(s => s.isActive !== false).length;

  const open = (site: Site) => router.push({ pathname: '/admin/[orgId]/sites/[siteId]', params: { orgId: orgId!, siteId: site.id } });

  const headerRight = canEdit ? (
    <TouchableOpacity
      onPress={() => setIsAdding(true)}
      accessibilityRole="button"
      accessibilityLabel="Add site"
      className={`flex-row items-center gap-1.5 rounded-xl bg-primary ${isWide ? 'px-3.5 py-2' : 'w-9 h-9 justify-center'}`}
    >
      <Ionicons name="add" size={18} color={themeColor(isDark, 'on-primary')} />
      {isWide ? <Text className="font-inter-bold text-sm text-on-primary">Add site</Text> : null}
    </TouchableOpacity>
  ) : undefined;

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Sites" onBack={() => safeBack(`/admin/${orgId}`)} />
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={themeColor(isDark, 'primary')} /></View>
      </SafeAreaView>
    );
  }

  const list = (items: Site[]) => (
    <View className="rounded-2xl border border-line bg-card overflow-hidden">
      {items.map((site, i) => (
        <SiteRow key={site.id} site={site} facilities={facilitiesBySite.get(site.id) || []} sports={sports} isWide={isWide} first={i === 0} onPress={() => open(site)} />
      ))}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader title="Sites" onBack={() => safeBack(`/admin/${orgId}`)} right={headerRight} />
      <ScrollView contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View className="w-full gap-3 self-center" style={{ maxWidth: 960 }}>
          <View className="flex-row items-center gap-2 bg-card border border-line rounded-xl px-3">
            <Ionicons name="search-outline" size={16} color={themeColor(isDark, 'ink-muted')} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name, address or facility"
              placeholderTextColor={themeColor(isDark, 'ink-muted')}
              accessibilityLabel="Search sites"
              className="flex-1 font-inter text-base text-ink py-2.5 outline-none"
            />
          </View>

          <Text className="font-inter text-sm text-ink-muted px-1">
            {shownActive.length === 1 ? '1 site' : `${shownActive.length} sites`}
          </Text>

          {shownActive.length ? list(shownActive) : (
            <View className="items-center justify-center py-12 gap-2">
              <Ionicons name="location-outline" size={40} color={themeColor(isDark, 'ink-muted')} />
              <Text className="font-inter text-sm text-ink-muted text-center">
                {activeCount ? 'No site matches.' : canEdit ? 'No sites yet. Add where your games are played with Add site.' : 'No sites yet.'}
              </Text>
            </View>
          )}

          {shownInactive.length ? (
            <View className="gap-2 mt-2">
              <TouchableOpacity
                onPress={() => setShowInactive(v => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showInactive }}
                className="flex-row items-center justify-between rounded-2xl border border-line bg-card px-4 py-3"
              >
                <Text className="font-inter-semibold text-sm text-ink-soft">Inactive sites · {shownInactive.length}</Text>
                <View className="flex-row items-center gap-1">
                  <Text className="font-inter text-sm text-ink-muted">{showInactive ? 'Hide' : 'Show'}</Text>
                  <Ionicons name={showInactive ? 'chevron-up' : 'chevron-down'} size={14} color={themeColor(isDark, 'ink-muted')} />
                </View>
              </TouchableOpacity>
              {showInactive ? list(shownInactive) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {canEdit ? <SiteDialog visible={isAdding} onClose={() => setIsAdding(false)} orgId={orgId!} onAdded={open} /> : null}
    </SafeAreaView>
  );
}

function SiteRow({ site, facilities, sports, isWide, first, onPress }: {
  site: Site;
  facilities: Facility[];
  sports: Sport[];
  isWide: boolean;
  first: boolean;
  onPress: () => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const inactive = site.isActive === false;
  const sportNames = siteSports(facilities, sports).join(', ');
  const amenities = siteAmenities(facilities);
  const border = first ? '' : 'border-t border-line-soft';
  const chevron = <Ionicons name="chevron-forward" size={16} color={themeColor(isDark, 'ink-muted')} />;

  if (!isWide) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="link" accessibilityLabel={`${site.name}, ${addressText(site.address) || 'no address yet'}`} className={`flex-row items-center gap-3 px-3 py-2.5 ${border}`}>
        <SiteMark size={40} dim={inactive} />
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2">
            <Text className="font-inter-semibold text-[15px] text-ink flex-shrink" numberOfLines={1}>{site.name}</Text>
            <View className="ml-auto pl-2 flex-shrink-0"><AmenityIcons categories={amenities} dim={inactive} /></View>
          </View>
          <View className="flex-row items-center gap-2.5 mt-0.5">
            <SiteAddressLine address={site.address} />
            {sportNames ? <Text className="font-inter text-xs text-ink-muted flex-shrink-0" style={{ maxWidth: '45%' }} numberOfLines={1}>{sportNames}</Text> : null}
          </View>
        </View>
        {chevron}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="link" className={`flex-row items-center gap-3 px-4 py-3 ${border}`}>
      <SiteMark size={40} dim={inactive} />
      <View className="flex-1 min-w-0">
        <Text className="font-inter-semibold text-[15px] text-ink" numberOfLines={1}>{site.name}</Text>
        <View className="flex-row mt-0.5"><SiteAddressLine address={site.address} /></View>
      </View>
      <View style={{ width: 340 }} className="gap-1">
        <Text className={`font-inter text-sm ${sportNames ? 'text-ink-soft' : 'text-ink-muted'}`} numberOfLines={1}>
          {sportNames || (facilities.length ? 'No sports set' : 'No facilities yet')}
        </Text>
        <AmenityIcons categories={amenities} dim={inactive} />
      </View>
      {chevron}
    </TouchableOpacity>
  );
}
