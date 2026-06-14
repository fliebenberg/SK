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
  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null); // null means adding a new site
  const [siteForm, setSiteForm] = useState({
    name: '',
    isActive: true,
    address: {
      id: '',
      fullAddress: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      province: '',
      postalCode: '',
      country: '',
      latitude: undefined,
      longitude: undefined,
    } as Address
  });

  // Nominatim geocoding autocomplete state
  const [addressSearchQuery, setAddressSearchQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);

  // Facility Sub-form State (nested inside Edit Site)
  const [isFacilityModalOpen, setIsFacilityModalOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null); // null means adding new facility
  const [facilityForm, setFacilityForm] = useState({
    name: '',
    surfaceType: '',
    supportedSportIds: [] as string[],
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    isActive: true
  });

  // Check map availability
  const isMapAvailable = MapView && Marker && Platform.OS !== 'web';

  // Load Initial Data
  useEffect(() => {
    if (!isConnected || !orgId) return;

    setIsLoading(true);

    // Fetch Sites
    wsService.emit('get_data', { type: 'sites', orgId }, (res: any) => {
      if (Array.isArray(res)) {
        setSites(res);
      }
      setIsLoading(false);
    });

    // Fetch Sports
    wsService.emit('get_data', { type: 'sports' }, (res: any) => {
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
      if (!event) return;

      if (event.type === 'SITES_SYNC' || event.type === 'SITE_ADDED' || event.type === 'SITE_UPDATED' || event.type === 'SITE_DELETED') {
        wsService.emit('get_data', { type: 'sites', orgId }, (res: any) => {
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

  // Nominatim Address Lookup
  const searchAddress = async (queryText: string) => {
    if (!queryText.trim()) {
      setAddressSuggestions([]);
      return;
    }
    setIsSearchingAddress(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryText)}&format=json&addressdetails=1&limit=5`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'ScoreKeeper-MobileApp/1.0'
        }
      });
      const data = await response.json();
      if (Array.isArray(data)) {
        setAddressSuggestions(data);
      }
    } catch (e) {
      console.error('Nominatim lookup failed:', e);
    } finally {
      setIsSearchingAddress(false);
    }
  };

  const handleSelectAddress = (item: any) => {
    const addr = item.address || {};
    const cityVal = addr.city || addr.town || addr.village || addr.suburb || '';
    const provinceVal = addr.state || addr.region || '';
    const countryVal = addr.country || '';
    const postalVal = addr.postcode || '';
    const line1 = addr.road ? `${addr.house_number || ''} ${addr.road}`.trim() : item.display_name.split(',')[0];

    setSiteForm(prev => ({
      ...prev,
      address: {
        id: prev.address?.id || '',
        fullAddress: item.display_name,
        addressLine1: line1,
        addressLine2: '',
        city: cityVal,
        province: provinceVal,
        postalCode: postalVal,
        country: countryVal,
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
      }
    }));
    setAddressSearchQuery(item.display_name);
    setAddressSuggestions([]);
  };

  // Open Site Editor
  const handleOpenSiteModal = (site: Site | null) => {
    if (site) {
      setEditingSite(site);
      setSiteForm({
        name: site.name,
        isActive: site.isActive !== false,
        address: site.address || {
          id: '',
          fullAddress: '',
          addressLine1: '',
          addressLine2: '',
          city: '',
          province: '',
          postalCode: '',
          country: '',
          latitude: undefined,
          longitude: undefined,
        } as Address
      });
      setAddressSearchQuery(site.address?.fullAddress || '');
    } else {
      setEditingSite(null);
      setSiteForm({
        name: '',
        isActive: true,
        address: {
          id: '',
          fullAddress: '',
          addressLine1: '',
          addressLine2: '',
          city: '',
          province: '',
          postalCode: '',
          country: '',
          latitude: undefined,
          longitude: undefined,
        } as Address
      });
      setAddressSearchQuery('');
    }
    setAddressSuggestions([]);
    setIsSiteModalOpen(true);
  };

  // Save Site Details
  const handleSaveSite = () => {
    if (!siteForm.name.trim()) {
      Alert.alert('Validation Error', 'Site Name is required');
      return;
    }
    setIsProcessing(true);

    const payload = {
      name: siteForm.name,
      isActive: siteForm.isActive,
      address: siteForm.address.fullAddress ? siteForm.address : undefined,
    };

    if (editingSite) {
      wsService.emit('action', {
        type: SocketAction.UPDATE_SITE,
        payload: { id: editingSite.id, data: payload }
      }, (res: any) => {
        setIsProcessing(false);
        if (res.status === 'ok') {
          setIsSiteModalOpen(false);
        } else {
          Alert.alert('Save Failed', res.message || 'Could not update site');
        }
      });
    } else {
      wsService.emit('action', {
        type: SocketAction.ADD_SITE,
        payload: { ...payload, orgId }
      }, (res: any) => {
        setIsProcessing(false);
        if (res.status === 'ok') {
          setIsSiteModalOpen(false);
        } else {
          Alert.alert('Save Failed', res.message || 'Could not create site');
        }
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

  // Open Facility Editor
  const handleOpenFacilityModal = (facility: Facility | null) => {
    if (facility) {
      setEditingFacility(facility);
      setFacilityForm({
        name: facility.name,
        surfaceType: facility.surfaceType || '',
        supportedSportIds: facility.supportedSportIds || [],
        latitude: facility.latitude ?? siteForm.address.latitude,
        longitude: facility.longitude ?? siteForm.address.longitude,
        isActive: facility.isActive !== false
      });
    } else {
      setEditingFacility(null);
      setFacilityForm({
        name: '',
        surfaceType: '',
        supportedSportIds: [],
        latitude: siteForm.address.latitude,
        longitude: siteForm.address.longitude,
        isActive: true
      });
    }
    setIsFacilityModalOpen(true);
  };

  // Save Facility
  const handleSaveFacility = () => {
    if (!facilityForm.name.trim()) {
      Alert.alert('Validation Error', 'Facility Name is required');
      return;
    }
    if (!editingSite) return;

    setIsProcessing(true);
    const payload = {
      name: facilityForm.name,
      siteId: editingSite.id,
      surfaceType: facilityForm.surfaceType || undefined,
      supportedSportIds: facilityForm.supportedSportIds,
      latitude: facilityForm.latitude,
      longitude: facilityForm.longitude,
      isActive: facilityForm.isActive
    };

    if (editingFacility) {
      wsService.emit('action', {
        type: SocketAction.UPDATE_FACILITY,
        payload: { id: editingFacility.id, data: payload }
      }, (res: any) => {
        setIsProcessing(false);
        if (res.status === 'ok') {
          setIsFacilityModalOpen(false);
        } else {
          Alert.alert('Save Failed', res.message || 'Could not update facility');
        }
      });
    } else {
      wsService.emit('action', {
        type: SocketAction.ADD_FACILITY,
        payload: payload
      }, (res: any) => {
        setIsProcessing(false);
        if (res.status === 'ok') {
          setIsFacilityModalOpen(false);
        } else {
          Alert.alert('Save Failed', res.message || 'Could not create facility');
        }
      });
    }
  };

  // Delete Facility Confirmation
  const handleDeleteFacility = (facility: Facility) => {
    Alert.alert(
      'Delete Facility',
      `Are you sure you want to delete "${facility.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            setIsProcessing(true);
            wsService.emit('action', {
              type: SocketAction.DELETE_FACILITY,
              payload: { id: facility.id }
            }, (res: any) => {
              setIsProcessing(false);
              if (res.status !== 'ok') {
                Alert.alert('Delete Failed', res.message || 'Facility is used in games and cannot be deleted.');
              }
            });
          }
        }
      ]
    );
  };

  // Toggle Sport Selection
  const handleToggleSport = (sportId: string) => {
    setFacilityForm(prev => {
      const current = prev.supportedSportIds;
      if (current.includes(sportId)) {
        return { ...prev, supportedSportIds: current.filter(id => id !== sportId) };
      } else {
        return { ...prev, supportedSportIds: [...current, sportId] };
      }
    });
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
                        return (
                          <View 
                            key={fac.id} 
                            className={`flex-row items-center gap-1 bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-lg border border-slate-200/50 dark:border-white/5 ${fac.isActive === false ? 'opacity-50' : ''}`}
                          >
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

      {/* ADD / EDIT SITE MODAL */}
      {isSiteModalOpen && (
        <View className="absolute inset-0 bg-slate-950/80 items-center justify-center z-40 p-4">
          <View 
            className="w-full max-w-lg border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl"
            style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF', maxHeight: '90%' }}
          >
            {/* Modal Header */}
            <View className="flex-row items-center justify-between border-b border-slate-200 dark:border-white/5 px-5 pt-5 pb-4">
              <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white uppercase tracking-wider">
                {editingSite ? 'Edit Site Details' : 'Add New Site'}
              </Text>
              <TouchableOpacity onPress={() => setIsSiteModalOpen(false)}>
                <Ionicons name="close" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Scrollable Form Fields */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
            >
              <View className="space-y-4">
                {/* Site Name */}
                <View>
                  <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-1.5 tracking-wider">Site Name</Text>
                  <TextInput
                    value={siteForm.name}
                    onChangeText={(val) => setSiteForm(prev => ({ ...prev, name: val }))}
                    placeholder="e.g. Melkbos High Sports Grounds"
                    placeholderTextColor="#94A3B8"
                    className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white outline-none"
                  />
                </View>

                {/* Is Active Status Toggle */}
                <TouchableOpacity 
                  onPress={() => setSiteForm(prev => ({ ...prev, isActive: !prev.isActive }))}
                  className="flex-row items-center gap-2 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 bg-slate-50 dark:bg-slate-900 self-start"
                >
                  <Ionicons name={siteForm.isActive ? "checkbox" : "square-outline"} size={18} color={siteForm.isActive ? "#FF3E00" : "#94A3B8"} />
                  <Text className="font-inter text-sm text-slate-800 dark:text-white font-medium">Active Site</Text>
                </TouchableOpacity>

                {/* Address Autocomplete & Search */}
                <View className="border-t border-slate-200/50 dark:border-white/5 pt-4">
                  <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-1.5 tracking-wider">Physical Address</Text>
                  
                  <View className="flex-row gap-2 mb-2">
                    <View className="flex-1 flex-row items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5">
                      <TextInput
                        value={addressSearchQuery}
                        onChangeText={setAddressSearchQuery}
                        placeholder="Search address using OpenStreetMap..."
                        placeholderTextColor="#94A3B8"
                        className="flex-1 font-inter text-sm text-slate-800 dark:text-white outline-none"
                      />
                    </View>
                    <TouchableOpacity 
                      onPress={() => searchAddress(addressSearchQuery)}
                      disabled={isSearchingAddress}
                      className="bg-brand-orange px-4 rounded-xl items-center justify-center active:opacity-80"
                    >
                      {isSearchingAddress ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <Ionicons name="search" size={16} color="white" />
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Suggestions List */}
                  {addressSuggestions.length > 0 && (
                    <View className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden mb-4 shadow-lg">
                      {addressSuggestions.map((item, idx) => (
                        <TouchableOpacity 
                          key={idx}
                          onPress={() => handleSelectAddress(item)}
                          className="px-4 py-3 border-b border-slate-200/50 dark:border-white/5 hover:bg-slate-200 dark:hover:bg-white/5 active:bg-slate-200 dark:active:bg-white/5"
                        >
                          <Text className="font-inter text-xs text-slate-700 dark:text-slate-300">{item.display_name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Lat / Lng Coordinates Preview */}
                  {siteForm.address.latitude != null && siteForm.address.longitude != null && (
                    <View className="flex-row gap-3 mb-4 bg-slate-100 dark:bg-slate-900 p-3 rounded-xl border border-slate-200/50 dark:border-white/5">
                      <View className="flex-1">
                        <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Latitude</Text>
                        <Text className="font-inter text-xs text-slate-700 dark:text-slate-300 mt-0.5">{siteForm.address.latitude.toFixed(6)}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Longitude</Text>
                        <Text className="font-inter text-xs text-slate-700 dark:text-slate-300 mt-0.5">{siteForm.address.longitude.toFixed(6)}</Text>
                      </View>
                    </View>
                  )}

                  {/* Map Visualizer */}
                  {siteForm.address.latitude != null && siteForm.address.longitude != null && (
                    <View className="mb-2">
                      <Text className="font-inter-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase mb-2 tracking-wider">Map Preview (Tap to Pin Location)</Text>
                      {isMapAvailable ? (
                        <MapView
                          style={{ width: '100%', height: 160, borderRadius: 12, overflow: 'hidden' }}
                          initialRegion={{
                            latitude: siteForm.address.latitude,
                            longitude: siteForm.address.longitude,
                            latitudeDelta: 0.005,
                            longitudeDelta: 0.005
                          }}
                          region={{
                            latitude: siteForm.address.latitude,
                            longitude: siteForm.address.longitude,
                            latitudeDelta: 0.005,
                            longitudeDelta: 0.005
                          }}
                          onPress={(e: any) => {
                            const coords = e.nativeEvent.coordinate;
                            setSiteForm(prev => ({
                              ...prev,
                              address: {
                                ...prev.address,
                                latitude: coords.latitude,
                                longitude: coords.longitude
                              }
                            }));
                          }}
                        >
                          <Marker
                            coordinate={{
                              latitude: siteForm.address.latitude,
                              longitude: siteForm.address.longitude
                            }}
                            draggable
                            onDragEnd={(e: any) => {
                              const coords = e.nativeEvent.coordinate;
                              setSiteForm(prev => ({
                                ...prev,
                                address: {
                                  ...prev.address,
                                  latitude: coords.latitude,
                                  longitude: coords.longitude
                                }
                              }));
                            }}
                          />
                        </MapView>
                      ) : (
                        <View className="bg-slate-100 dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/5">
                          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 leading-normal">
                            Interactive maps are supported on mobile devices. You can edit the coordinates manually:
                          </Text>
                          <View className="flex-row gap-3 mt-3">
                            <View className="flex-1">
                              <Text className="font-inter-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase mb-1">Latitude</Text>
                              <TextInput
                                value={siteForm.address.latitude ? String(siteForm.address.latitude) : ''}
                                onChangeText={(val) => setSiteForm(prev => ({
                                  ...prev,
                                  address: { ...prev.address, latitude: parseFloat(val) || 0 }
                                }))}
                                keyboardType="numeric"
                                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-lg p-2 font-inter text-xs text-slate-800 dark:text-white"
                              />
                            </View>
                            <View className="flex-1">
                              <Text className="font-inter-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase mb-1">Longitude</Text>
                              <TextInput
                                value={siteForm.address.longitude ? String(siteForm.address.longitude) : ''}
                                onChangeText={(val) => setSiteForm(prev => ({
                                  ...prev,
                                  address: { ...prev.address, longitude: parseFloat(val) || 0 }
                                }))}
                                keyboardType="numeric"
                                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-lg p-2 font-inter text-xs text-slate-800 dark:text-white"
                              />
                            </View>
                          </View>
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {/* FACILITIES SECTION (ONLY WHEN EDITING EXISTING SITE) */}
                {editingSite && (
                  <View className="border-t border-slate-200/50 dark:border-white/5 pt-4">
                    <View className="flex-row justify-between items-center mb-3">
                      <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        Facilities ({facilities.filter(f => f.siteId === editingSite.id).length})
                      </Text>
                      <TouchableOpacity 
                        onPress={() => handleOpenFacilityModal(null)}
                        className="flex-row items-center gap-1 bg-brand-orange/10 border border-brand-orange/20 px-2 py-1 rounded"
                      >
                        <Ionicons name="add" size={10} color="#FF3E00" />
                        <Text className="text-[9px] font-bold text-brand-orange uppercase">Add Facility</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Facilities Table list */}
                    <View className="border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900">
                      {facilities.filter(f => f.siteId === editingSite.id).length === 0 ? (
                        <View className="p-4 items-center justify-center">
                          <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 italic">No facilities added yet.</Text>
                        </View>
                      ) : (
                        facilities.filter(f => f.siteId === editingSite.id).map((fac) => {
                          const term = getFacilityTerm(fac.supportedSportIds);
                          const activeSports = fac.supportedSportIds?.map(id => sports.find(s => s.id === id)?.name).filter(Boolean).join(', ') || 'None';
                          return (
                            <View 
                              key={fac.id}
                              className="flex-row justify-between items-center px-4 py-3 border-b border-slate-200/30 dark:border-white/5"
                            >
                              <View className="flex-1 mr-4">
                                <View className="flex-row items-center gap-1.5">
                                  <Text className="font-inter-bold text-xs text-slate-800 dark:text-white">{fac.name}</Text>
                                  <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 italic">({term})</Text>
                                  {fac.isActive === false && (
                                    <View className="bg-slate-200 dark:bg-slate-800 px-1 py-0.2 rounded">
                                      <Text className="text-[6px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Inactive</Text>
                                    </View>
                                  )}
                                </View>
                                <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                  Sports: {activeSports}
                                </Text>
                              </View>

                              <View className="flex-row gap-2">
                                <TouchableOpacity 
                                  onPress={() => handleOpenFacilityModal(fac)}
                                  className="w-6 h-6 rounded bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 items-center justify-center"
                                >
                                  <Ionicons name="pencil" size={10} color={isDark ? "#E2E8F0" : "#475569"} />
                                </TouchableOpacity>
                                <TouchableOpacity 
                                  onPress={() => handleDeleteFacility(fac)}
                                  className="w-6 h-6 rounded bg-red-500/10 border border-red-500/20 items-center justify-center"
                                >
                                  <Ionicons name="trash-outline" size={10} color="#EF4444" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })
                      )}
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Modal Footer Actions */}
            <View className="flex-row justify-end gap-3 border-t border-slate-200 dark:border-white/5 px-5 pt-4 pb-4 bg-slate-50 dark:bg-slate-900 rounded-b-2xl">
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setIsSiteModalOpen(false)}
                disabled={isProcessing}
                className="px-6 rounded-lg py-2"
              />
              <Button
                title={isProcessing ? "Saving..." : (editingSite ? "Save Changes" : "Create Site")}
                variant="primary"
                onPress={handleSaveSite}
                disabled={isProcessing || !siteForm.name.trim()}
                className="px-6 rounded-lg py-2"
              />
            </View>
          </View>
        </View>
      )}

      {/* ADD / EDIT FACILITY MODAL (NESTED SUB-MODAL) */}
      {isFacilityModalOpen && (
        <View className="absolute inset-0 bg-slate-950/90 items-center justify-center z-50 p-4">
          <View 
            className="w-full max-w-md border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl"
            style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF', maxHeight: '90%' }}
          >
            {/* Sub-Modal Header */}
            <View className="flex-row items-center justify-between border-b border-slate-200 dark:border-white/5 px-5 pt-5 pb-4">
              <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white uppercase tracking-wider">
                {editingFacility ? 'Edit Facility Details' : 'Add New Facility'}
              </Text>
              <TouchableOpacity onPress={() => setIsFacilityModalOpen(false)}>
                <Ionicons name="close" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Scrollable Form */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
            >
              <View className="space-y-4">
                {/* Facility Name */}
                <View>
                  <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-1.5 tracking-wider">Facility Name</Text>
                  <TextInput
                    value={facilityForm.name}
                    onChangeText={(val) => setFacilityForm(prev => ({ ...prev, name: val }))}
                    placeholder="e.g. Field A or Court 2"
                    placeholderTextColor="#94A3B8"
                    className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white outline-none"
                  />
                </View>

                {/* Surface Type */}
                <View>
                  <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-1.5 tracking-wider">Surface Type</Text>
                  <TextInput
                    value={facilityForm.surfaceType}
                    onChangeText={(val) => setFacilityForm(prev => ({ ...prev, surfaceType: val }))}
                    placeholder="e.g. Grass, Clay, Hardcourt, Indoor"
                    placeholderTextColor="#94A3B8"
                    className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white outline-none"
                  />
                </View>

                {/* Active Status */}
                <TouchableOpacity 
                  onPress={() => setFacilityForm(prev => ({ ...prev, isActive: !prev.isActive }))}
                  className="flex-row items-center gap-2 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 bg-slate-50 dark:bg-slate-900 self-start"
                >
                  <Ionicons name={facilityForm.isActive ? "checkbox" : "square-outline"} size={18} color={facilityForm.isActive ? "#FF3E00" : "#94A3B8"} />
                  <Text className="font-inter text-sm text-slate-800 dark:text-white font-medium">Active Facility</Text>
                </TouchableOpacity>

                {/* Supported Sports (Multiple Select) */}
                <View className="border-t border-slate-200/50 dark:border-white/5 pt-4">
                  <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-2 tracking-wider">Supported Sports (Select all that apply)</Text>
                  <View className="space-y-1.5">
                    {sports.map(s => {
                      const isSelected = facilityForm.supportedSportIds.includes(s.id);
                      return (
                        <TouchableOpacity
                          key={s.id}
                          onPress={() => handleToggleSport(s.id)}
                          className={`flex-row items-center justify-between px-4 py-2.5 border rounded-xl ${isSelected ? 'bg-brand-orange/5 border-brand-orange/30' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-white/5'}`}
                        >
                          <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-semibold' : 'text-slate-700 dark:text-slate-300'}`}>
                            {s.name}
                          </Text>
                          <Ionicons 
                            name={isSelected ? "checkmark-circle" : "ellipse-outline"} 
                            size={16} 
                            color={isSelected ? "#FF3E00" : "#94A3B8"} 
                          />
                        </TouchableOpacity>
                      );
                    })}
                    {sports.length === 0 && (
                      <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 italic">No sports registered on server.</Text>
                    )}
                  </View>
                </View>

                {/* Facility Specific Coordinate Pin Map */}
                <View className="border-t border-slate-200/50 dark:border-white/5 pt-4">
                  <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-2 tracking-wider">Facility Coordinates (Pin Specific Pitch)</Text>
                  
                  {isMapAvailable && facilityForm.latitude != null && facilityForm.longitude != null ? (
                    <MapView
                      style={{ width: '100%', height: 140, borderRadius: 12, overflow: 'hidden' }}
                      initialRegion={{
                        latitude: facilityForm.latitude,
                        longitude: facilityForm.longitude,
                        latitudeDelta: 0.002,
                        longitudeDelta: 0.002
                      }}
                      region={{
                        latitude: facilityForm.latitude,
                        longitude: facilityForm.longitude,
                        latitudeDelta: 0.002,
                        longitudeDelta: 0.002
                      }}
                      onPress={(e: any) => {
                        const coords = e.nativeEvent.coordinate;
                        setFacilityForm(prev => ({
                          ...prev,
                          latitude: coords.latitude,
                          longitude: coords.longitude
                        }));
                      }}
                    >
                      <Marker
                        coordinate={{
                          latitude: facilityForm.latitude,
                          longitude: facilityForm.longitude
                        }}
                        draggable
                        onDragEnd={(e: any) => {
                          const coords = e.nativeEvent.coordinate;
                          setFacilityForm(prev => ({
                            ...prev,
                            latitude: coords.latitude,
                            longitude: coords.longitude
                          }));
                        }}
                      />
                    </MapView>
                  ) : (
                    <View className="bg-slate-100 dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/5">
                      <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 leading-normal">
                        Pin coords manually:
                      </Text>
                      <View className="flex-row gap-3 mt-3">
                        <View className="flex-1">
                          <Text className="font-inter-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase mb-1">Latitude</Text>
                          <TextInput
                            value={facilityForm.latitude ? String(facilityForm.latitude) : ''}
                            onChangeText={(val) => setFacilityForm(prev => ({
                              ...prev,
                              latitude: parseFloat(val) || undefined
                            }))}
                            keyboardType="numeric"
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-lg p-2 font-inter text-xs text-slate-800 dark:text-white"
                          />
                        </View>
                        <View className="flex-1">
                          <Text className="font-inter-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase mb-1">Longitude</Text>
                          <TextInput
                            value={facilityForm.longitude ? String(facilityForm.longitude) : ''}
                            onChangeText={(val) => setFacilityForm(prev => ({
                              ...prev,
                              longitude: parseFloat(val) || undefined
                            }))}
                            keyboardType="numeric"
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-lg p-2 font-inter text-xs text-slate-800 dark:text-white"
                          />
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            </ScrollView>

            {/* Sub-Modal Footer */}
            <View className="flex-row justify-end gap-3 border-t border-slate-200 dark:border-white/5 px-5 pt-4 pb-4 bg-slate-50 dark:bg-slate-900 rounded-b-2xl">
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setIsFacilityModalOpen(false)}
                disabled={isProcessing}
                className="px-6 rounded-lg py-2"
              />
              <Button
                title={isProcessing ? "Saving..." : (editingFacility ? "Save Facility" : "Add Facility")}
                variant="primary"
                onPress={handleSaveFacility}
                disabled={isProcessing || !facilityForm.name.trim()}
                className="px-6 rounded-lg py-2"
              />
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
