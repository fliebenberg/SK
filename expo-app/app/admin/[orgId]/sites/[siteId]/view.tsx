import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../../../store/settingsStore';
import { wsService } from '../../../../../services/websocket';
import { useWsStore } from '../../../../../store/wsStore';
import { useAuthStore } from '../../../../../store/authStore';
import { Site, Facility, Sport, Organization } from '@sk/shared';
import { useSocketQuery } from '../../../../../hooks/useSocketQuery';
import { venueTimeZone } from '../../../../../utils/dates';
import { themeColor } from '../../../../../constants/Colors';

// Conditionally require react-native-maps to avoid breaking react-native-web
let MapView: any;
let Marker: any;
try {
  const MapsModule = require('react-native-maps');
  MapView = MapsModule.default;
  Marker = MapsModule.Marker;
} catch (e) {
  // Fallback on web/unsupported platforms
}

export default function SiteViewScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, siteId } = useLocalSearchParams<{ orgId: string; siteId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  // States
  const [isLoading, setIsLoading] = useState(true);
  const [site, setSite] = useState<Site | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const { data: sportsData } = useSocketQuery<Sport[]>('sports');
  const { data: org } = useSocketQuery<Organization>('organization', { orgId });

  // User & Permissions
  const user = useAuthStore(state => state.user);
  const orgMemberships = useAuthStore(state => state.orgMemberships || []);
  const userMembership = orgMemberships.find(m => m.orgId === orgId);
  const canEdit = Boolean(
    user?.globalRole === 'admin' ||
    (userMembership && (userMembership.roleId === 'role-org-admin' || userMembership.roleId === 'role-org-staff'))
  );

  const sports = sportsData || [];

  useEffect(() => {
    if (!isConnected || !orgId || !siteId) return;

    setIsLoading(true);

    // Get Site details
    wsService.emit('get_data', { type: 'site', id: siteId }, (res: any) => {
      if (res) {
        setSite(res);
      }
    });

    // Get Facilities directory
    wsService.emit('get_data', { type: 'facilities', siteId }, (res: any) => {
      if (Array.isArray(res)) {
        setFacilities(res);
      }
      setIsLoading(false);
    });

    const sitesRoom = `org:${orgId}:sites`;
    const unsubscribeSites = wsService.subscribeToRoom(sitesRoom);

    const handleUpdate = (event: any) => {
      if (!event) return;
      if (event.type === 'SITE_UPDATED' && event.data.id === siteId) {
        setSite(event.data);
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      unsubscribeSites();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId, siteId]);

  if (isLoading || !site) {
    return (
      <SafeAreaView className="flex-1 bg-canvas justify-center items-center">
        <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
        <Text className="font-orbitron text-xs text-ink-muted mt-3">Loading Site...</Text>
      </SafeAreaView>
    );
  }

  const getFacilityTerm = (sportIds?: string[]) => {
    if (!sportIds || sportIds.length === 0) return 'Non-Sport/General';
    const active = sportIds.map(id => sports.find(s => s.id === id)?.name).filter(Boolean);
    return active.join(', ');
  };

  const handleFacilityPress = (fac: Facility) => {
    if (canEdit) {
      router.push({
        pathname: '/admin/[orgId]/sites/[siteId]/facilities/[facilityId]',
        params: { orgId: orgId!, siteId: siteId!, facilityId: fac.id }
      });
    } else {
      router.push({
        pathname: '/admin/[orgId]/sites/[siteId]/facilities/[facilityId]/view',
        params: { orgId: orgId!, siteId: siteId!, facilityId: fac.id }
      });
    }
  };

  const lat = site.address?.latitude;
  const lng = site.address?.longitude;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      {/* HEADER */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-line-soft bg-card z-10">
        <TouchableOpacity
          onPress={() => safeBack(`/admin/${orgId}/sites`)}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color={themeColor(isDark, 'primary')} />
          <Text className="font-inter-bold text-xs text-ink-muted uppercase tracking-wider">
            Sites
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-ink uppercase">
          Site Details
        </Text>
        {canEdit ? (
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/admin/[orgId]/sites/[siteId]', params: { orgId: orgId!, siteId: site.id } })}
            className="w-8 h-8 rounded-lg bg-primary-soft border border-primary-line items-center justify-center active:opacity-85"
          >
            <Ionicons name="pencil" size={15} color={themeColor(isDark, 'primary')} />
          </TouchableOpacity>
        ) : (
          <View className="w-8" />
        )}
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* SITE DETAILS SUMMARY */}
        <GlassCard className="border border-line p-6 mb-6">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="font-orbitron-bold text-lg text-ink">
              {site.name}
            </Text>
            <View className={`px-2.5 py-0.5 rounded-full ${site.isActive !== false ? 'bg-success-soft border border-success-line' : 'bg-line'}`}>
              <Text className={`font-orbitron-bold text-[9px] uppercase tracking-wider ${site.isActive !== false ? 'text-success-ink' : 'text-ink-muted'}`}>
                {site.isActive !== false ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2 mt-1">
            <Ionicons name="map-outline" size={14} color={themeColor(isDark, 'ink-muted')} />
            <Text className="font-inter text-xs text-ink-muted">
              {site.address?.fullAddress || 'No Address registered'}
            </Text>
          </View>

          {/* Read-only: a venue's timezone comes from its pin, and moving the pin is how to change it (DATE-2). */}
          <View className="flex-row items-center gap-2 mt-1">
            <Ionicons name="time-outline" size={14} color={themeColor(isDark, 'ink-muted')} />
            <Text className="font-inter text-xs text-ink-muted">
              {site.timezone
                ? `Timezone: ${site.timezone}, from its location`
                : `Timezone: ${venueTimeZone(null, org)}, the organisation's — set a map pin to use the site's own`}
            </Text>
          </View>
        </GlassCard>

        {/* MAP VIEW */}
        <View className="mb-6">
          <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-wider mb-2">
            Site Location
          </Text>
          <View className="w-full h-48 rounded-2xl overflow-hidden border border-line bg-sunken">
            {MapView && lat && lng ? (
              <MapView
                style={{ width: '100%', height: '100%' }}
                initialRegion={{
                  latitude: lat,
                  longitude: lng,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
              >
                <Marker coordinate={{ latitude: lat, longitude: lng }} title={site.name} />
              </MapView>
            ) : (
              <View className="flex-1 items-center justify-center p-4">
                <Ionicons name="map-outline" size={32} color={themeColor(isDark, 'ink-muted')} />
                <Text className="font-inter text-xs text-ink-muted mt-2 text-center">
                  Map view not supported on this platform preview
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* FACILITIES DIRECTORY */}
        <View>
          <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-wider mb-3">
            Facilities Directory ({facilities.length})
          </Text>
          <View className="space-y-2">
            {facilities.map(fac => {
              const term = getFacilityTerm(fac.supportedSportIds);
              return (
                <TouchableOpacity
                  key={fac.id}
                  onPress={() => handleFacilityPress(fac)}
                  className="active:opacity-85"
                >
                  <GlassCard className="border border-line p-4 flex-row items-center justify-between">
                    <View className="flex-row items-center gap-3 flex-1 mr-4">
                      <View className="w-9 h-9 rounded-xl bg-primary-soft items-center justify-center border border-primary-line">
                        <Ionicons name="location" size={16} color={themeColor(isDark, 'primary')} />
                      </View>
                      <View className="flex-1">
                        <Text className="font-inter-bold text-sm text-ink leading-tight">{fac.name}</Text>
                        <Text className="font-inter text-[11px] text-ink-muted mt-0.5">
                          {term} {fac.category ? `• ${fac.category.replace('_', ' ')}` : ''}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row items-center gap-2">
                      <TouchableOpacity
                        onPress={() => router.push({
                          pathname: '/admin/[orgId]/sites/[siteId]/facilities/[facilityId]/view',
                          params: { orgId: orgId!, siteId: siteId!, facilityId: fac.id }
                        })}
                        className="w-7 h-7 rounded-lg bg-sunken items-center justify-center border border-line active:opacity-85"
                      >
                        <Ionicons name="eye-outline" size={13} color={themeColor(isDark, 'ink-muted')} />
                      </TouchableOpacity>
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              );
            })}
            {facilities.length === 0 && (
              <Text className="font-inter text-xs text-ink-muted italic text-center py-6">No facilities added</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
