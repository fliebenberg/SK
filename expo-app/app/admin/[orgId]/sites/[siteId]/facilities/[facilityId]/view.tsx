import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../../../../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../../../../../store/settingsStore';
import { wsService } from '../../../../../../../services/websocket';
import { useWsStore } from '../../../../../../../store/wsStore';
import { useAuthStore } from '../../../../../../../store/authStore';
import { Facility, Site, Sport, Organization } from '@sk/shared';
import { useSocketQuery } from '../../../../../../../hooks/useSocketQuery';

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

export default function FacilityViewScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, siteId, facilityId } = useLocalSearchParams<{ orgId: string; siteId: string; facilityId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  // States
  const [isLoading, setIsLoading] = useState(true);
  const [facility, setFacility] = useState<Facility | null>(null);
  const [parentSite, setParentSite] = useState<Site | null>(null);
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
    if (!isConnected || !orgId || !siteId || !facilityId) return;

    setIsLoading(true);

    // Get Facility details
    wsService.emit('get_data', { type: 'facility', id: facilityId }, (res: any) => {
      if (res) {
        setFacility(res);
      }
    });

    // Get Parent Site details
    wsService.emit('get_data', { type: 'site', id: siteId }, (res: any) => {
      if (res) {
        setParentSite(res);
      }
      setIsLoading(false);
    });
  }, [isConnected, orgId, siteId, facilityId]);

  if (isLoading || !facility) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950 justify-center items-center">
        <ActivityIndicator size="large" color="#FF3E00" />
        <Text className="font-orbitron text-xs text-slate-500 dark:text-slate-400 mt-3">Loading Facility View...</Text>
      </SafeAreaView>
    );
  }

  const primarySportName = sports.find(s => s.id === facility.primarySportId)?.name || 'None';
  const supportedSportNames = (facility.supportedSportIds || [])
    .map(id => sports.find(s => s.id === id)?.name)
    .filter(Boolean)
    .join(', ') || 'None';

  const lat = (parentSite?.address as any)?.lat;
  const lng = (parentSite?.address as any)?.lng;

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => safeBack(`/admin/${orgId}/sites/${siteId}/view`)}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Site View
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase">
          Facility Details
        </Text>
        {canEdit ? (
          <TouchableOpacity
            onPress={() => router.push({
              pathname: '/admin/[orgId]/sites/[siteId]/facilities/[facilityId]',
              params: { orgId: orgId!, siteId: siteId!, facilityId: facility.id }
            })}
            className="w-8 h-8 rounded-lg bg-brand-orange/10 border border-brand-orange/20 items-center justify-center active:opacity-85"
          >
            <Ionicons name="pencil" size={15} color="#FF3E00" />
          </TouchableOpacity>
        ) : (
          <View className="w-8" />
        )}
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* FACILITY TITLE CARD */}
        <GlassCard className="border border-slate-200 dark:border-white/5 p-6 mb-6">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-1 mr-3">
              <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white">
                {facility.name}
              </Text>
              {parentSite && (
                <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-0.5">
                  Venue: {parentSite.name}
                </Text>
              )}
            </View>
            <View className={`px-2.5 py-0.5 rounded-full ${facility.isActive !== false ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-slate-200 dark:bg-slate-800'}`}>
              <Text className={`font-orbitron-bold text-[9px] uppercase tracking-wider ${facility.isActive !== false ? 'text-emerald-500' : 'text-slate-500'}`}>
                {facility.isActive !== false ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* SPECIFICATIONS CARD */}
        <GlassCard className="border border-slate-200 dark:border-white/5 p-6 mb-6 space-y-4">
          <Text className="font-orbitron-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            Specifications & Capabilities
          </Text>

          <View className="flex-row justify-between py-2 border-b border-slate-100 dark:border-white/5">
            <Text className="font-inter text-xs text-slate-500">Category Type</Text>
            <Text className="font-inter-bold text-xs text-slate-800 dark:text-white capitalize">
              {facility.category ? facility.category.replace('_', ' ') : 'General'}
            </Text>
          </View>

          <View className="flex-row justify-between py-2 border-b border-slate-100 dark:border-white/5">
            <Text className="font-inter text-xs text-slate-500">Primary Sport</Text>
            <Text className="font-inter-bold text-xs text-brand-orange">{primarySportName}</Text>
          </View>

          <View className="flex-row justify-between py-2">
            <Text className="font-inter text-xs text-slate-500">Supported Sports</Text>
            <Text className="font-inter-bold text-xs text-slate-800 dark:text-white text-right max-w-[60%]">
              {supportedSportNames}
            </Text>
          </View>
        </GlassCard>

        {/* LOCATION MAP */}
        {parentSite && (
          <View>
            <Text className="font-orbitron-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Facility Map Location
            </Text>
            <View className="w-full h-48 rounded-2xl overflow-hidden border border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-900">
              {MapView && lat && lng ? (
                <MapView
                  style={{ width: '100%', height: '100%' }}
                  initialRegion={{
                    latitude: lat,
                    longitude: lng,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                  }}
                >
                  <Marker coordinate={{ latitude: lat, longitude: lng }} title={facility.name} description={parentSite.name} />
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
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
