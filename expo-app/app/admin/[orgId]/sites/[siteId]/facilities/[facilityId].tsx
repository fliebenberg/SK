import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore, useActiveTheme } from '../../../../../../store/settingsStore';
import { wsService } from '../../../../../../services/websocket';
import { useWsStore } from '../../../../../../store/wsStore';
import { SocketAction, Facility, Site } from '@sk/types';
import { useSocketQuery } from '../../../../../../hooks/useSocketQuery';

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

// Google Maps Javascript API Loader for Web Platform
const loadGoogleMapsScript = (callback: () => void) => {
  if (typeof window === 'undefined') return;
  if ((window as any).google && (window as any).google.maps) {
    callback();
    return;
  }
  const scriptId = 'google-maps-js-sdk';
  let script = document.getElementById(scriptId) as HTMLScriptElement;
  if (script) {
    script.addEventListener('load', callback);
    return;
  }
  script = document.createElement('script');
  script.id = scriptId;
  script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.EXPO_PUBLIC_WEB_GOOGLE_MAPS_API_KEY || ''}`;
  script.async = true;
  script.defer = true;
  script.addEventListener('load', callback);
  document.head.appendChild(script);
};

// Interactive Web Map component rendering standard div via createElement
const InteractiveWebMap = ({ latitude, longitude, title, onChange, category, primarySportId, sports = [] }: { latitude: number; longitude: number; title?: string; onChange: (lat: number, lng: number) => void; category?: string; primarySportId?: string; sports?: any[] }) => {
  const containerRef = React.useRef<any>(null);
  const mapRef = React.useRef<any>(null);
  const markerRef = React.useRef<any>(null);
  const mapType = useSettingsStore((state: any) => state.getEffectivePreference('mapType') || 'standard');
  const isDark = useActiveTheme() === 'dark';

  // Helper to generate dynamic SVG Marker as data URL
  const getSvgMarker = (iconName: string, color: string, isDarkTheme: boolean) => {
    const bgColor = isDarkTheme ? '#1E293B' : '#FFFFFF';
    let innerSvg = '';
    switch (iconName) {
      case 'american-football':
        innerSvg = `<ellipse cx="16" cy="16" rx="8" ry="4.5" fill="none" stroke="${color}" stroke-width="1.8" transform="rotate(-45 16 16)"/><line x1="11" y1="21" x2="21" y2="11" stroke="${color}" stroke-width="1.5"/><line x1="13" y1="15" x2="17" y2="19" stroke="${color}" stroke-width="1"/><line x1="15" y1="13" x2="19" y2="17" stroke="${color}" stroke-width="1"/>`;
        break;
      case 'football':
        innerSvg = `<circle cx="16" cy="16" r="7" fill="none" stroke="${color}" stroke-width="1.8"/><path d="M16 9v14M9 16h14M11.5 11.5l9 9m0-9l-9 9" stroke="${color}" stroke-width="1" opacity="0.6"/>`;
        break;
      case 'tennisball':
      case 'tennisball-outline':
        innerSvg = `<circle cx="16" cy="16" r="7" fill="none" stroke="${color}" stroke-width="1.8"/><path d="M11.5 11.5a7 7 0 0 1 9 9M20.5 11.5a7 7 0 0 0-9 9" fill="none" stroke="${color}" stroke-width="1" opacity="0.8"/>`;
        break;
      case 'golf':
        innerSvg = `<path d="M13 8v16m0-16l8 4-8 4" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
        break;
      case 'baseball':
        innerSvg = `<line x1="10" y1="22" x2="20" y2="12" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/><circle cx="21" cy="11" r="2.5" fill="none" stroke="${color}" stroke-width="1.5"/>`;
        break;
      case 'trophy-outline':
      case 'ribbon-outline':
        innerSvg = `<path d="M11 9h10v5c0 2.5-2 4.5-4.5 4.5h-1C13 18.5 11 16.5 11 14V9zm2.5 9.5V22h-2v1h9v-1h-2v-3.5" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
        break;
      case 'home-outline':
        innerSvg = `<path d="M10 21v-7h12v7M8 12.5L16 6l8 6.5" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
        break;
      case 'cart-outline':
        innerSvg = `<path d="M9 10h14l-1.5 8h-10L9 10zm0 0L7.5 7H5" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="11" cy="21" r="1.5" fill="${color}"/><circle cx="20" cy="21" r="1.5" fill="${color}"/>`;
        break;
      case 'business-outline':
        innerSvg = `<path d="M9 22V8h14v14" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="11" x2="14" y2="11" stroke="${color}" stroke-width="1.5"/><line x1="12" y1="15" x2="14" y2="15" stroke="${color}" stroke-width="1.5"/><line x1="18" y1="11" x2="20" y2="11" stroke="${color}" stroke-width="1.5"/><line x1="18" y1="15" x2="20" y2="15" stroke="${color}" stroke-width="1.5"/>`;
        break;
      case 'car-outline':
        innerSvg = `<text x="16" y="16.5" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" font-size="12" fill="${color}" dominant-baseline="middle" text-anchor="middle">P</text>`;
        break;
      case 'water-outline':
        innerSvg = `<text x="16" y="16.5" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" font-size="9" fill="${color}" dominant-baseline="middle" text-anchor="middle">WC</text>`;
        break;
      default:
        innerSvg = `<circle cx="16" cy="16" r="3.5" fill="${color}"/>`;
        break;
    }
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="13" fill="${bgColor}" stroke="${color}" stroke-width="2" />
        ${innerSvg}
      </svg>
    `).trim()}`;
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    loadGoogleMapsScript(() => {
      if (!containerRef.current) return;
      const google = (window as any).google;
      const center = { lat: latitude, lng: longitude };
      const currentMapTypeId = mapType === 'satellite' ? google.maps.MapTypeId.HYBRID : google.maps.MapTypeId.ROADMAP;
      
      let markerColor = '#475569'; // Default other/gray
      if (primarySportId) {
        markerColor = '#FF3E00'; // Sport orange
      } else {
        switch (category) {
          case 'sport_field':
          case 'venue_hall': markerColor = '#FF8C00'; break;
          case 'clubhouse': markerColor = '#3B82F6'; break;
          case 'shop': markerColor = '#10B981'; break;
          case 'parking': markerColor = '#6B7280'; break;
          case 'restroom': markerColor = '#8B5CF6'; break;
        }
      }

      // Get matching clean vector icon name
      let iconName = 'location-outline';
      if (primarySportId) {
        const sport = sports.find(s => s.id === primarySportId);
        const sportNameLower = (sport?.name || '').toLowerCase();
        if (sportNameLower.includes('rugby')) iconName = 'american-football';
        else if (sportNameLower.includes('soccer') || sportNameLower.includes('football')) iconName = 'football';
        else if (sportNameLower.includes('tennis')) iconName = 'tennisball';
        else if (sportNameLower.includes('cricket')) iconName = 'baseball';
        else if (sportNameLower.includes('golf')) iconName = 'golf';
        else if (sportNameLower.includes('chess')) iconName = 'trophy-outline';
      } else {
        switch (category) {
          case 'sport_field': iconName = 'tennisball-outline'; break;
          case 'venue_hall': iconName = 'business-outline'; break;
          case 'clubhouse': iconName = 'home-outline'; break;
          case 'shop': iconName = 'cart-outline'; break;
          case 'parking': iconName = 'car-outline'; break;
          case 'restroom': iconName = 'water-outline'; break;
        }
      }

      const markerIcon = {
        url: getSvgMarker(iconName, markerColor, isDark),
        anchor: new google.maps.Point(16, 16),
        scaledSize: new google.maps.Size(32, 32)
      };

      if (!mapRef.current) {
        mapRef.current = new google.maps.Map(containerRef.current, {
          center,
          zoom: 16,
          mapTypeControl: true,
          mapTypeControlOptions: {
            style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
            position: google.maps.ControlPosition.TOP_RIGHT,
          },
          streetViewControl: false,
          mapTypeId: currentMapTypeId,
        });

        markerRef.current = new google.maps.Marker({
          position: center,
          map: mapRef.current,
          draggable: true,
          title: title,
          icon: markerIcon,
        });

        // Track drag movement
        markerRef.current.addListener('dragend', () => {
          const pos = markerRef.current.getPosition();
          onChange(pos.lat(), pos.lng());
        });

        // Track map type changes to persist user preference
        mapRef.current.addListener('maptypeid_changed', () => {
          const currentMapTypeId = mapRef.current.getMapTypeId();
          const newType = (currentMapTypeId === 'satellite' || currentMapTypeId === 'hybrid' || currentMapTypeId === google.maps.MapTypeId.SATELLITE || currentMapTypeId === google.maps.MapTypeId.HYBRID) ? 'satellite' : 'standard';
          if (useSettingsStore.getState().getEffectivePreference('mapType') !== newType) {
            useSettingsStore.getState().setLocalOverride('mapType', newType);
          }
        });
      } else {
        mapRef.current.setMapTypeId(currentMapTypeId);
        if (title) {
          markerRef.current.setTitle(title);
        }
        markerRef.current.setIcon(markerIcon);
        const currentPos = markerRef.current.getPosition();
        if (currentPos && (Math.abs(currentPos.lat() - latitude) > 0.0001 || Math.abs(currentPos.lng() - longitude) > 0.0001)) {
          const newPos = { lat: latitude, lng: longitude };
          markerRef.current.setPosition(newPos);
          mapRef.current.setCenter(newPos);
        }
      }
    });
  }, [latitude, longitude, title, onChange, mapType, category, primarySportId, sports, isDark]);

  return React.createElement('div', {
    ref: containerRef,
    style: { width: '100%', height: 200, borderRadius: 12, overflow: 'hidden', marginBottom: 12 }
  });
};

const CATEGORIES = [
  { key: 'sport_field', label: 'Sport Field / Court', icon: 'tennisball-outline' },
  { key: 'venue_hall', label: 'Venue / Indoor Hall', icon: 'business-outline' },
  { key: 'clubhouse', label: 'Clubhouse', icon: 'home-outline' },
  { key: 'shop', label: 'Shop / Tuck Shop', icon: 'cart-outline' },
  { key: 'parking', label: 'Parking Area', icon: 'car-outline' },
  { key: 'restroom', label: 'Restrooms', icon: 'water-outline' },
  { key: 'other', label: 'Other', icon: 'location-outline' }
];

export default function FacilityDetails() {
  const router = useRouter();
  const { orgId, siteId, facilityId } = useLocalSearchParams<{ orgId: string; siteId: string; facilityId: string }>();
  const isNew = facilityId === 'new';
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  // Loading States
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const mapType = useSettingsStore((state: any) => state.getEffectivePreference('mapType') || 'standard');
  const setMapType = (val: 'standard' | 'satellite') => {
    useSettingsStore.getState().setLocalOverride('mapType', val);
  };

  // Data State
  const { data: sportsData } = useSocketQuery<any[]>('sports');
  const { data: sitesData } = useSocketQuery<Site[]>('sites', { orgId });
  const { data: facilitiesData, isLoading: isFacilitiesLoading, refetch: refetchFacilities } = useSocketQuery<Facility[]>('facilities', { siteId });

  const sports = sportsData || [];
  const sites = sitesData || [];
  const [facilityForm, setFacilityForm] = useState({
    name: '',
    surfaceType: '',
    supportedSportIds: [] as string[],
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    category: 'other',
    primarySportId: '' as string | undefined
  });

  const [originalData, setOriginalData] = useState<{
    name: string;
    surfaceType: string;
    supportedSportIds: string[];
    latitude?: number;
    longitude?: number;
    category: string;
    primarySportId?: string;
  } | null>(isNew ? {
    name: '',
    surfaceType: '',
    supportedSportIds: [],
    latitude: undefined,
    longitude: undefined,
    category: 'other',
    primarySportId: ''
  } : null);

  const isMapAvailable = MapView && Marker && Platform.OS !== 'web';

  // Check Changes
  const hasChanges = originalData ? (
    facilityForm.name.trim() !== originalData.name ||
    facilityForm.surfaceType.trim() !== originalData.surfaceType ||
    JSON.stringify([...facilityForm.supportedSportIds].sort()) !== JSON.stringify([...originalData.supportedSportIds].sort()) ||
    facilityForm.latitude !== originalData.latitude ||
    facilityForm.longitude !== originalData.longitude ||
    facilityForm.category !== originalData.category ||
    facilityForm.primarySportId !== originalData.primarySportId
  ) : false;

  const handleCancel = () => {
    if (isNew) {
      router.back();
    } else if (originalData) {
      setFacilityForm({
        name: originalData.name,
        surfaceType: originalData.surfaceType,
        supportedSportIds: [...originalData.supportedSportIds],
        latitude: originalData.latitude,
        longitude: originalData.longitude,
        category: originalData.category,
        primarySportId: originalData.primarySportId
      });
    }
  };

  // Populate facility form
  useEffect(() => {
    if (!isNew) {
      if (facilitiesData) {
        const fac = facilitiesData.find(f => f.id === facilityId);
        if (fac) {
          const data = {
            name: fac.name || '',
            surfaceType: fac.surfaceType || '',
            supportedSportIds: fac.supportedSportIds || [],
            latitude: fac.latitude,
            longitude: fac.longitude,
            category: fac.category || 'other',
            primarySportId: fac.primarySportId || ''
          };
          setFacilityForm(prev => {
            if (prev.name === '' && prev.category === 'other') {
              return data;
            }
            return prev;
          });
          setOriginalData({ ...data, supportedSportIds: [...data.supportedSportIds] });
        }
      }
    } else {
      // For a new facility, default to parent site coordinates if available
      if (sitesData) {
        const site = sitesData.find(s => s.id === siteId);
        if (site && site.address) {
          setFacilityForm(prev => {
            if (prev.latitude === undefined && prev.longitude === undefined) {
              return {
                ...prev,
                latitude: site.address?.latitude,
                longitude: site.address?.longitude
              };
            }
            return prev;
          });
          setOriginalData(prev => prev ? {
            ...prev,
            latitude: site.address?.latitude,
            longitude: site.address?.longitude
          } : {
            name: '',
            surfaceType: '',
            supportedSportIds: [],
            latitude: site.address?.latitude,
            longitude: site.address?.longitude,
            category: 'other',
            primarySportId: ''
          });
        }
      }
    }
  }, [facilitiesData, sitesData, facilityId, isNew, siteId]);

  // Subscribe to updates for facilities room
  useEffect(() => {
    if (!isConnected || !orgId) return;

    const facilitiesRoom = `org:${orgId}:facilities`;
    const unsubscribeFacilities = wsService.subscribeToRoom(facilitiesRoom);

    const handleUpdate = (event: any) => {
      if (!event) return;
      if (event.type === 'FACILITIES_SYNC' || event.type === 'FACILITY_ADDED' || event.type === 'FACILITY_UPDATED' || event.type === 'FACILITY_DELETED') {
        refetchFacilities();
      }
    };

    wsService.on('update', handleUpdate);
    wsService.emit('join_room', `org:${orgId}:facilities`);

    return () => {
      unsubscribeFacilities();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId, refetchFacilities]);

  const isLoading = !isNew && (isFacilitiesLoading || !sportsData || !originalData);

  // Save Facility
  const handleSaveFacility = () => {
    if (!facilityForm.name.trim()) {
      Alert.alert('Validation Error', 'Facility Name is required');
      return;
    }

    setIsProcessing(true);
    const payload = {
      name: facilityForm.name,
      siteId: siteId,
      surfaceType: facilityForm.surfaceType || undefined,
      supportedSportIds: facilityForm.supportedSportIds,
      latitude: facilityForm.latitude,
      longitude: facilityForm.longitude,
      isActive: true,
      category: facilityForm.category,
      primarySportId: facilityForm.primarySportId || undefined
    };

    if (!isNew) {
      wsService.emit('action', {
        type: SocketAction.UPDATE_FACILITY,
        payload: { id: facilityId, data: payload }
      }, (res: any) => {
        setIsProcessing(false);
        if (res.status === 'ok') {
          router.back();
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
          router.back();
        } else {
          Alert.alert('Save Failed', res.message || 'Could not create facility');
        }
      });
    }
  };

  // Delete Facility
  const handleDeleteFacility = () => {
    setIsProcessing(true);
    wsService.emit('action', {
      type: SocketAction.DELETE_FACILITY,
      payload: { id: facilityId }
    }, (res: any) => {
      setIsProcessing(false);
      setIsDeleteModalOpen(false);
      if (res.status === 'ok') {
        router.back();
      } else {
        Alert.alert('Delete Failed', res.message || 'Facility is used in games and cannot be deleted.');
      }
    });
  };

  const handleToggleSport = (sportId: string) => {
    setFacilityForm(prev => {
      const idx = prev.supportedSportIds.indexOf(sportId);
      const updated = [...prev.supportedSportIds];
      if (idx > -1) {
        updated.splice(idx, 1);
        // Clear primary sport if it was removed
        if (prev.primarySportId === sportId) {
          return { ...prev, supportedSportIds: updated, primarySportId: '' };
        }
      } else {
        updated.push(sportId);
      }
      return { ...prev, supportedSportIds: updated };
    });
  };

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
          {isNew ? 'Add Facility' : 'Edit Facility'}
        </Text>
        <View className="w-8" />
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FF3E00" />
          <Text className="font-orbitron text-xs text-slate-500 dark:text-slate-400 mt-3">Loading details...</Text>
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          className="flex-1 px-6 py-6"
          contentContainerStyle={{ paddingBottom: hasChanges ? 140 : 60 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="space-y-4">
            {/* Facility Name */}
            <View>
              <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
                Facility Name
              </Text>
              <TextInput
                value={facilityForm.name}
                onChangeText={(val) => setFacilityForm(prev => ({ ...prev, name: val }))}
                placeholder="e.g. Field A or Court 2"
                placeholderTextColor="#94A3B8"
                className="font-orbitron-bold text-lg text-slate-800 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 outline-none"
              />
            </View>

            {/* Surface Type */}
            <View className="border-t border-slate-200/50 dark:border-white/5 pt-4">
              <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-1.5 tracking-wider">Surface Type</Text>
              <TextInput
                value={facilityForm.surfaceType}
                onChangeText={(val) => setFacilityForm(prev => ({ ...prev, surfaceType: val }))}
                placeholder="e.g. Grass, Clay, Hardcourt, Indoor"
                placeholderTextColor="#94A3B8"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white outline-none"
              />
            </View>

            {/* Facility Category Selection with Icons */}
            <View className="border-t border-slate-200/50 dark:border-white/5 pt-4">
              <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-2 tracking-wider">Facility Category</Text>
              <View className="flex-row flex-wrap gap-2">
                {CATEGORIES.map(cat => {
                  const isSelected = facilityForm.category === cat.key;
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      onPress={() => setFacilityForm(prev => ({ ...prev, category: cat.key }))}
                      className={`flex-row items-center gap-1.5 px-3 py-2 border rounded-xl ${isSelected ? 'bg-brand-orange/5 border-brand-orange/30' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5'}`}
                    >
                      <Ionicons name={cat.icon as any} size={14} color={isSelected ? "#FF3E00" : "#94A3B8"} />
                      <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-semibold' : 'text-slate-700 dark:text-slate-300'}`}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Supported Sports (Multiple Select) */}
            <View className="border-t border-slate-200/50 dark:border-white/5 pt-4">
              <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-2 tracking-wider">Supported Sports (Select all that apply)</Text>
              <View className="space-y-1.5">
                {sports.map(s => {
                  const isSelected = facilityForm.supportedSportIds.includes(s.id);
                  
                  // Map sport names to icons helper
                  let sportIcon: any = "trophy-outline";
                  const sNameLower = s.name.toLowerCase();
                  if (sNameLower.includes('rugby')) sportIcon = 'american-football';
                  else if (sNameLower.includes('soccer') || sNameLower.includes('football')) sportIcon = 'football';
                  else if (sNameLower.includes('tennis')) sportIcon = 'tennisball';
                  else if (sNameLower.includes('cricket')) sportIcon = 'baseball';
                  else if (sNameLower.includes('golf')) sportIcon = 'golf';
                  else if (sNameLower.includes('chess')) sportIcon = 'ribbon-outline';

                  return (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => handleToggleSport(s.id)}
                      className={`flex-row items-center justify-between px-4 py-2.5 border rounded-xl ${isSelected ? 'bg-brand-orange/5 border-brand-orange/30' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5'}`}
                    >
                      <View className="flex-row items-center gap-2">
                        <Ionicons name={sportIcon} size={14} color={isSelected ? "#FF3E00" : "#94A3B8"} />
                        <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-semibold' : 'text-slate-700 dark:text-slate-300'}`}>
                          {s.name}
                        </Text>
                      </View>
                      <Ionicons 
                        name={isSelected ? "checkmark-circle" : "ellipse-outline"} 
                        size={16} 
                        color={isSelected ? "#FF3E00" : "#94A3B8"} 
                      />
                    </TouchableOpacity>
                  );
                })}
                {sports.length === 0 && (
                  <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 italic">No sports registered.</Text>
                )}
              </View>
            </View>

            {/* Primary Sport Selector */}
            {facilityForm.supportedSportIds.length > 0 && (
              <View className="border-t border-slate-200/50 dark:border-white/5 pt-4">
                <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-1.5 tracking-wider">Primary Sport (Representing Marker Icon)</Text>
                <View className="flex-row flex-wrap gap-2">
                  <TouchableOpacity
                    onPress={() => setFacilityForm(prev => ({ ...prev, primarySportId: '' }))}
                    className={`px-3 py-2 border rounded-xl ${!facilityForm.primarySportId ? 'bg-brand-orange/5 border-brand-orange/30' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5'}`}
                  >
                    <Text className={`font-inter text-xs ${!facilityForm.primarySportId ? 'text-brand-orange font-semibold' : 'text-slate-700 dark:text-slate-300'}`}>
                      None (Use Category Default)
                    </Text>
                  </TouchableOpacity>
                  {facilityForm.supportedSportIds.map(sportId => {
                    const sport = sports.find(s => s.id === sportId);
                    if (!sport) return null;
                    const isSelected = facilityForm.primarySportId === sportId;
                    
                    let sportIcon: any = "trophy-outline";
                    const sNameLower = sport.name.toLowerCase();
                    if (sNameLower.includes('rugby')) sportIcon = 'american-football';
                    else if (sNameLower.includes('soccer') || sNameLower.includes('football')) sportIcon = 'football';
                    else if (sNameLower.includes('tennis')) sportIcon = 'tennisball';
                    else if (sNameLower.includes('cricket')) sportIcon = 'baseball';
                    else if (sNameLower.includes('golf')) sportIcon = 'golf';
                    else if (sNameLower.includes('chess')) sportIcon = 'ribbon-outline';

                    return (
                      <TouchableOpacity
                        key={sportId}
                        onPress={() => setFacilityForm(prev => ({ ...prev, primarySportId: sportId }))}
                        className={`flex-row items-center gap-1.5 px-3 py-2 border rounded-xl ${isSelected ? 'bg-brand-orange/5 border-brand-orange/30' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5'}`}
                      >
                        <Ionicons name={sportIcon} size={12} color={isSelected ? "#FF3E00" : "#94A3B8"} />
                        <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-semibold' : 'text-slate-700 dark:text-slate-300'}`}>
                          {sport.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Facility Location Coordinate Map */}
            {facilityForm.latitude != null && facilityForm.longitude != null && (
              <View className="border-t border-slate-200/50 dark:border-white/5 pt-4">
                <Text className="font-inter-bold text-[10px] text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Facility Location (Drag pin to position)
                </Text>
                
                {isMapAvailable ? (
                  <View style={{ position: 'relative', width: '100%', height: 200, borderRadius: 12, overflow: 'hidden' }}>
                    <MapView
                      mapType={mapType}
                      style={{ width: '100%', height: '100%' }}
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
                    >
                      {(() => {
                        let markerColor = '#475569'; // Default other/gray
                        if (facilityForm.primarySportId) {
                          markerColor = '#FF3E00'; // Sport orange
                        } else {
                          switch (facilityForm.category) {
                            case 'sport_field':
                            case 'venue_hall': markerColor = '#FF8C00'; break;
                            case 'clubhouse': markerColor = '#3B82F6'; break;
                            case 'shop': markerColor = '#10B981'; break;
                            case 'parking': markerColor = '#6B7280'; break;
                            case 'restroom': markerColor = '#8B5CF6'; break;
                          }
                        }

                        // Get Ionicons icon name for the custom view marker
                        let iconName: any = "location-outline";
                        if (facilityForm.primarySportId) {
                          const sport = sports.find(s => s.id === facilityForm.primarySportId);
                          const sportNameLower = (sport?.name || '').toLowerCase();
                          if (sportNameLower.includes('rugby')) iconName = 'american-football';
                          else if (sportNameLower.includes('soccer') || sportNameLower.includes('football')) iconName = 'football';
                          else if (sportNameLower.includes('tennis')) iconName = 'tennisball';
                          else if (sportNameLower.includes('cricket')) iconName = 'baseball';
                          else if (sportNameLower.includes('golf')) iconName = 'golf';
                          else if (sportNameLower.includes('chess')) iconName = 'trophy-outline';
                        } else {
                          switch (facilityForm.category) {
                            case 'sport_field': iconName = 'tennisball-outline'; break;
                            case 'venue_hall': iconName = 'business-outline'; break;
                            case 'clubhouse': iconName = 'home-outline'; break;
                            case 'shop': iconName = 'cart-outline'; break;
                            case 'parking': iconName = 'car-outline'; break;
                            case 'restroom': iconName = 'water-outline'; break;
                          }
                        }

                        return (
                          <Marker
                            coordinate={{
                              latitude: facilityForm.latitude,
                              longitude: facilityForm.longitude
                            }}
                            draggable
                            title={facilityForm.name || "Facility Location"}
                            tracksViewChanges={false}
                            onDragEnd={(e: any) => {
                              const coords = e.nativeEvent.coordinate;
                              setFacilityForm(prev => ({
                                ...prev,
                                latitude: coords.latitude,
                                longitude: coords.longitude
                              }));
                            }}
                          >
                            <View 
                              style={{
                                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                                padding: 6,
                                borderRadius: 20,
                                borderWidth: 1.5,
                                borderColor: markerColor,
                                alignItems: 'center',
                                justifyContent: 'center',
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.25,
                                shadowRadius: 3.84,
                                elevation: 5,
                              }}
                            >
                              <Ionicons name={iconName} size={14} color={markerColor} />
                            </View>
                          </Marker>
                        );
                      })()}
                    </MapView>
                    <TouchableOpacity
                      onPress={() => setMapType(mapType === 'standard' ? 'satellite' : 'standard')}
                      style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}
                      className="flex-row items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 px-2.5 py-1.5 rounded-lg shadow-md active:opacity-85"
                    >
                      <Ionicons name={mapType === 'satellite' ? "map" : "earth"} size={12} color="#FF3E00" />
                      <Text className="font-inter-bold text-[9px] text-slate-700 dark:text-slate-300 uppercase tracking-widest">{mapType === 'satellite' ? 'Map' : 'Satellite'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : Platform.OS === 'web' ? (
                  <InteractiveWebMap
                    latitude={facilityForm.latitude}
                    longitude={facilityForm.longitude}
                    title={facilityForm.name || "Facility Location"}
                    category={facilityForm.category}
                    primarySportId={facilityForm.primarySportId}
                    sports={sports}
                    onChange={(lat, lng) => {
                      setFacilityForm(prev => ({
                        ...prev,
                        latitude: lat,
                        longitude: lng
                      }));
                    }}
                  />
                ) : null}
              </View>
            )}

            {/* Danger Zone */}
            {!isNew && (
              <View className="border-t border-red-500/20 pt-6 mt-6">
                <Text className="font-orbitron-bold text-[9px] text-red-500/80 uppercase tracking-widest mb-3">
                  Danger Zone
                </Text>
                <View className="bg-red-500/5 border border-red-500/10 rounded-xl p-4 flex-row items-center justify-between">
                  <View className="flex-1 mr-4">
                    <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Delete Facility</Text>
                    <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Permanently delete this facility. This action is irreversible and cannot be performed if games are scheduled here.
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setIsDeleteModalOpen(true)}
                    className="bg-red-500 px-4 py-2.5 rounded-xl items-center justify-center active:opacity-85"
                  >
                    <Text className="font-inter-bold text-xs text-white uppercase tracking-wider">Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* FLOATING SAVE CHANGES BAR */}
      {hasChanges && (
        <View className="absolute bottom-6 left-6 right-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-4 rounded-2xl flex-row items-center justify-between shadow-xl z-40">
          <View className="flex-1 mr-4">
            <Text className="font-orbitron-bold text-[10px] text-slate-800 dark:text-white uppercase tracking-wider">
              {isNew ? "New Facility" : "Unsaved Changes"}
            </Text>
            <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
              {isNew ? "You are creating a new facility." : "You have modified this facility's details."}
            </Text>
          </View>
          <View className="flex-row items-center gap-2.5">
            <TouchableOpacity
              onPress={handleCancel}
              disabled={isProcessing}
              className="bg-slate-100 dark:bg-slate-800 px-4 py-2.5 rounded-xl active:scale-95 border border-slate-200 dark:border-white/5"
            >
              <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-300 uppercase tracking-widest">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSaveFacility}
              disabled={isProcessing || !facilityForm.name.trim()}
              className="bg-brand-orange px-5 py-2.5 rounded-xl flex-row items-center gap-2 active:scale-95 shadow-md shadow-brand-orange/30"
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={14} color="white" />
                  <Text className="font-orbitron-bold text-[9px] text-white uppercase tracking-widest mt-0.5">
                    {isNew ? "Create" : "Save"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen && (
        <View className="absolute inset-0 bg-slate-950/80 items-center justify-center z-50 p-4">
          <View 
            className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-2xl"
          >
            <Ionicons name="warning-outline" size={32} color="#EF4444" className="mb-3" />
            <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white uppercase mb-2">Confirm Delete</Text>
            <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mb-6 leading-5">
              Are you sure you want to delete this facility? This action cannot be undone and will fail if the facility is currently hosting scheduled matches.
            </Text>
            <View className="flex-row gap-3 justify-end">
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setIsDeleteModalOpen(false)}
                disabled={isProcessing}
                className="px-4 py-2"
              />
              <Button
                title={isProcessing ? "Deleting..." : "Delete Permanently"}
                variant="primary"
                onPress={handleDeleteFacility}
                disabled={isProcessing}
                className="bg-red-500 border-red-500 px-4 py-2"
              />
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
