import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../../store/settingsStore';
import { wsService } from '../../../../services/websocket';
import { useWsStore } from '../../../../store/wsStore';
import { SocketAction, Site, Facility, Address } from '@sk/types';

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

export default function OrgSites() {
  const router = useRouter();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore(state => state.isConnected);

  // Data State
  const [isLoading, setIsLoading] = useState(true);
  const [sites, setSites] = useState<Site[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [sports, setSports] = useState<any[]>([]);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Modals & Forms State
  const [isProcessing, setIsProcessing] = useState(false);

  // Load Initial Data
  useEffect(() => {
    if (!isConnected || !orgId) return;

    let active = true;
    setIsLoading(true);

    // Fetch Sites
    wsService.emit('get_data', { type: 'sites', orgId }, (res: any) => {
      if (!active) return;
      if (Array.isArray(res)) {
        setSites(res);
      }
      setIsLoading(false);
    });

    // Fetch Sports
    wsService.emit('get_data', { type: 'sports' }, (res: any) => {
      if (!active) return;
      if (Array.isArray(res)) {
        setSports(res);
      }
    });

    // Subscribe to updates for Sites & Facilities
    const sitesRoom = `org:${orgId}:sites`;
    const facilitiesRoom = `org:${orgId}:facilities`;
    
    const unsubscribeSites = wsService.subscribeToRoom(sitesRoom);
    const unsubscribeFacilities = wsService.subscribeToRoom(facilitiesRoom);

    const handleUpdate = (event: any) => {
      if (!active) return;
      if (!event) return;

      if (event.type === 'SITES_SYNC' || event.type === 'SITE_ADDED' || event.type === 'SITE_UPDATED' || event.type === 'SITE_DELETED') {
        wsService.emit('get_data', { type: 'sites', orgId }, (res: any) => {
          if (!active) return;
          if (Array.isArray(res)) setSites(res);
        });
      }
      
      if (event.type === 'FACILITIES_SYNC' || event.type === 'FACILITY_ADDED' || event.type === 'FACILITY_UPDATED' || event.type === 'FACILITY_DELETED') {
        if (event.type === 'FACILITIES_SYNC' && Array.isArray(event.data)) {
          setFacilities(event.data);
        } else {
          // Re-sync by room subscription trigger or read cache
          // If the event payload doesn't carry full data, we can get it from room broadcast
        }
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      active = false;
      unsubscribeSites();
      unsubscribeFacilities();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId]);

  // Sync facilities on connection room messages
  useEffect(() => {
    if (!isConnected || !orgId) return;
    // We register event update listener, but also query once to populate
    // Because facilities sync is room broadcast, we can trigger room query
    wsService.emit('join_room', `org:${orgId}:facilities`);
  }, [isConnected, orgId]);

  // Resolve Sport-Specific Facility Term
  const getFacilityTerm = (supportedSportIds?: string[]) => {
    if (!supportedSportIds || supportedSportIds.length === 0) return 'Facility';
    if (supportedSportIds.length === 1) {
      const sport = sports.find(s => s.id === supportedSportIds[0]);
      return sport?.facilityTerm || 'Facility';
    }
    const terms = supportedSportIds
      .map(id => sports.find(s => s.id === id)?.facilityTerm)
      .filter(Boolean) as string[];
    const uniqueTerms = Array.from(new Set(terms));
    if (uniqueTerms.length === 1) return uniqueTerms[0];
    return 'Field/Court';
  };

  // Open Site Editor
  const handleOpenSiteModal = (site: Site | null) => {
    if (site) {
      router.push({
        pathname: '/admin/[orgId]/sites/[siteId]',
        params: { orgId: orgId!, siteId: site.id }
      });
    }
  };

  // Delete Site Confirmation
  const handleDeleteSite = (site: Site) => {
    Alert.alert(
      'Delete Site',
      `Are you sure you want to delete "${site.name}"? This will also delete all facilities under this site.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            setIsProcessing(true);
            wsService.emit('action', {
              type: SocketAction.DELETE_SITE,
              payload: { id: site.id }
            }, (res: any) => {
              setIsProcessing(false);
              if (res.status !== 'ok') {
                Alert.alert('Delete Failed', res.message || 'Site is currently linked to events or games and cannot be deleted.');
              }
            });
          }
        }
      ]
    );
  };

  // Filter & Search Sites List
  const filteredSites = sites.filter(s => {
    if (!showInactive && s.isActive === false) return false;

    const siteFacilities = facilities.filter(f => f.siteId === s.id);
    const facilityMatch = siteFacilities.some(f => 
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.supportedSportIds || []).some(id => 
        (sports.find(sp => sp.id === id)?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    );

    return (
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.address?.fullAddress || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      facilityMatch
    );
  });

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase">
          Sites & Facilities
        </Text>
        <TouchableOpacity 
          className="w-8 h-8 rounded-lg bg-brand-orange items-center justify-center shadow-md shadow-brand-orange/20 active:opacity-85"
          onPress={() => handleOpenSiteModal(null)}
        >
          <Ionicons name="add" size={18} color="white" />
        </TouchableOpacity>
      </View>

      {/* BODY CONTENT */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FF3E00" />
          <Text className="font-orbitron text-xs text-slate-500 dark:text-slate-400 mt-3">Loading Sites...</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
          {/* SEARCH BAR & FILTER */}
          <View className="flex-row items-center gap-3 mb-6">
            <View className="flex-1 flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 shadow-sm">
              <Ionicons name="search-outline" size={18} color="#94A3B8" />
              <TextInput
                placeholder="Search sites, addresses, or facilities..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                className="flex-1 font-inter text-slate-800 dark:text-white text-sm ml-2.5 outline-none"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity 
              onPress={() => setShowInactive(!showInactive)}
              className={`p-3 rounded-xl border items-center justify-center ${showInactive ? 'bg-brand-orange/10 border-brand-orange/30' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5'}`}
            >
              <Ionicons name={showInactive ? "eye" : "eye-off"} size={16} color={showInactive ? "#FF3E00" : "#94A3B8"} />
            </TouchableOpacity>
          </View>

          {/* SITES LIST */}
          <View className="space-y-4">
            {filteredSites.map((site) => {
              const siteFacilities = facilities.filter(f => f.siteId === site.id);
              return (
                <GlassCard 
                  key={site.id}
                  className={`border border-slate-200 dark:border-white/5 p-5 ${site.isActive === false ? 'opacity-60' : ''}`}
                >
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white">
                          {site.name}
                        </Text>
                        {site.isActive === false && (
                          <View className="bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">
                            <Text className="text-[8px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Inactive</Text>
                          </View>
                        )}
                      </View>

                      <View className="flex-row items-center gap-1.5 mt-1">
                        <Ionicons name="map-outline" size={12} color="#94A3B8" />
                        <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
                          {site.address?.fullAddress || 'No address registered'}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row items-center gap-2">
                      <TouchableOpacity 
                        onPress={() => handleOpenSiteModal(site)}
                        className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/5 items-center justify-center border border-slate-200/50 dark:border-white/5 active:opacity-80"
                      >
                        <Ionicons name="pencil" size={12} color={isDark ? "#E2E8F0" : "#475569"} />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={() => handleDeleteSite(site)}
                        className="w-7 h-7 rounded-lg bg-red-500/10 items-center justify-center border border-red-500/20 active:opacity-80"
                      >
                        <Ionicons name="trash-outline" size={12} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* FACILITIES LIST UNDER SITE */}
                  <View className="mt-4 pt-3 border-t border-slate-200/50 dark:border-white/5">
                    <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                      Facilities ({siteFacilities.length})
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      {siteFacilities.map((fac) => {
                        const term = getFacilityTerm(fac.supportedSportIds);
                        
                        // Map category / sport to an icon name
                        let iconName: any = "location-outline";
                        if (fac.primarySportId) {
                          const sport = sports.find(s => s.id === fac.primarySportId);
                          const sportNameLower = (sport?.name || '').toLowerCase();
                          if (sportNameLower.includes('rugby')) iconName = 'american-football';
                          else if (sportNameLower.includes('soccer') || sportNameLower.includes('football')) iconName = 'football';
                          else if (sportNameLower.includes('tennis')) iconName = 'tennisball';
                          else if (sportNameLower.includes('cricket')) iconName = 'baseball';
                          else if (sportNameLower.includes('golf')) iconName = 'golf';
                          else if (sportNameLower.includes('chess')) iconName = 'trophy-outline';
                        } else {
                          switch(fac.category) {
                            case 'sport_field': iconName = 'tennisball-outline'; break;
                            case 'venue_hall': iconName = 'business-outline'; break;
                            case 'clubhouse': iconName = 'home-outline'; break;
                            case 'shop': iconName = 'cart-outline'; break;
                            case 'parking': iconName = 'car-outline'; break;
                            case 'restroom': iconName = 'water-outline'; break;
                            default: iconName = 'location-outline';
                          }
                        }

                        return (
                          <View 
                            key={fac.id} 
                            className={`flex-row items-center gap-1.5 bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-lg border border-slate-200/50 dark:border-white/5 ${fac.isActive === false ? 'opacity-50' : ''}`}
                          >
                            <Ionicons name={iconName} size={12} color="#FF3E00" />
                            <Text className="font-inter text-xs text-slate-700 dark:text-slate-300">
                              {fac.name}
                            </Text>
                            <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 lowercase italic">
                              ({term})
                            </Text>
                          </View>
                        );
                      })}
                      {siteFacilities.length === 0 && (
                        <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 italic">No facilities registered. Edit site to configure.</Text>
                      )}
                    </View>
                  </View>
                </GlassCard>
              );
            })}

            {filteredSites.length === 0 && (
              <View className="items-center justify-center py-12">
                <Ionicons name="location-outline" size={48} color="#94A3B8" className="opacity-40 mb-3" />
                <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300">
                  No Sites Registered
                </Text>
                <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 text-center mt-1">
                  Click the "+" button in the header to register training complexes and playing fields.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

    </SafeAreaView>
  );
}
