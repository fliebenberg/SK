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
import { Site, Facility, Sport, Organization } from '@sk/types';
import { useSocketQuery } from '../../../../../hooks/useSocketQuery';

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
  const isOwner = org?.creatorId === user?.id;
  const canEdit = Boolean(
    user?.globalRole === 'admin' ||
    isOwner ||
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
    wsService.emit('get_data', { type: 'site_facilities', siteId }, (res: any) => {
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
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950 justify-center items-center">
        <ActivityIndicator size="large" color="#FF3E00" />
        <Text className="font-orbitron text-xs text-slate-500 dark:text-slate-400 mt-3">Loading Venue View...</Text>
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

  const lat = (site.address as any)?.lat;
  const lng = (site.address as any)?.lng;

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => safeBack(`/admin/${orgId}/sites`)}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Venues
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase">
          Venue Details
        </Text>
        {canEdit ? (
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/admin/[orgId]/sites/[siteId]', params: { orgId: orgId!, siteId: site.id } })}
            className="w-8 h-8 rounded-lg bg-brand-orange/10 border border-brand-orange/20 items-center justify-center active:opacity-85"
          >
            <Ionicons name="pencil" size={15} color="#FF3E00" />
          </TouchableOpacity>
        ) : (
          <View className="w-8" />
        )}
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* SITE DETAILS SUMMARY */}
        <GlassCard className="border border-slate-200 dark:border-white/5 p-6 mb-6">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white">
              {site.name}
            </Text>
            <View className={`px-2.5 py-0.5 rounded-full ${site.isActive !== false ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-slate-200 dark:bg-slate-800'}`}>
              <Text className={`font-orbitron-bold text-[9px] uppercase tracking-wider ${site.isActive !== false ? 'text-emerald-500' : 'text-slate-500'}`}>
                {site.isActive !== false ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2 mt-1">
            <Ionicons name="map-outline" size={14} color="#94A3B8" />
            <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
              {site.address?.fullAddress || 'No Address registered'}
            </Text>
          </View>
        </GlassCard>

        {/* MAP VIEW */}
        <View className="mb-6">
          <Text className="font-orbitron-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            Venue Location
          </Text>
          <View className="w-full h-48 rounded-2xl overflow-hidden border border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-900">
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
                <Ionicons name="map-outline" size={32} color="#94A3B8" />
                <Text className="font-inter text-xs text-slate-400 mt-2 text-center">
                  Map view not supported on this platform preview
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* FACILITIES DIRECTORY */}
        <View>
          <Text className="font-orbitron-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
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
                  <GlassCard className="border border-slate-200 dark:border-white/5 p-4 flex-row items-center justify-between">
                    <View className="flex-row items-center gap-3 flex-1 mr-4">
                      <View className="w-9 h-9 rounded-xl bg-brand-orange/10 items-center justify-center border border-brand-orange/20">
                        <Ionicons name="location" size={16} color="#FF3E00" />
                      </View>
                      <View className="flex-1">
                        <Text className="font-inter-bold text-sm text-slate-800 dark:text-white leading-tight">{fac.name}</Text>
                        <Text className="font-inter text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
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
                        className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/5 items-center justify-center border border-slate-200 dark:border-white/5 active:opacity-85"
                      >
                        <Ionicons name="eye-outline" size={13} color={isDark ? '#94A3B8' : '#475569'} />
                      </TouchableOpacity>
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              );
            })}
            {facilities.length === 0 && (
              <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 italic text-center py-6">No facilities added</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
