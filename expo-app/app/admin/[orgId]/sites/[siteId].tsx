import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore, useActiveTheme } from '../../../../store/settingsStore';
import { wsService } from '../../../../services/websocket';
import { useWsStore } from '../../../../store/wsStore';
import { SocketAction, Site, Facility, Address } from '@sk/types';
import { useSocketQuery } from '../../../../hooks/useSocketQuery';

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
    // If script is already in document but not yet loaded, listen to load
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
const InteractiveWebMap = ({ latitude, longitude, title, onChange, facilities = [], sports = [] }: { latitude: number; longitude: number; title?: string; onChange: (lat: number, lng: number) => void; facilities?: Facility[]; sports?: any[] }) => {
  const containerRef = React.useRef<any>(null);
  const mapRef = React.useRef<any>(null);
  const mainMarkerRef = React.useRef<any>(null);
  const facilityMarkersRef = React.useRef<any[]>([]);
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

        mainMarkerRef.current = new google.maps.Marker({
          position: center,
          map: mapRef.current,
          draggable: true,
          title: title,
        });

        // Track drag movement
        mainMarkerRef.current.addListener('dragend', () => {
          const pos = mainMarkerRef.current.getPosition();
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
          mainMarkerRef.current.setTitle(title);
        }
        const currentPos = mainMarkerRef.current.getPosition();
        if (currentPos && (Math.abs(currentPos.lat() - latitude) > 0.0001 || Math.abs(currentPos.lng() - longitude) > 0.0001)) {
          const newPos = { lat: latitude, lng: longitude };
          mainMarkerRef.current.setPosition(newPos);
          mapRef.current.setCenter(newPos);
        }
      }

      // Clear existing facility markers
      facilityMarkersRef.current.forEach(m => m.setMap(null));
      facilityMarkersRef.current = [];

      // Add markers for all facilities
      facilities.forEach(fac => {
        if (fac.latitude == null || fac.longitude == null) return;
        
        let markerColor = '#475569'; // Default other/gray
        if (fac.primarySportId) {
          markerColor = '#FF3E00'; // Sport orange
        } else {
          switch (fac.category) {
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
          switch (fac.category) {
            case 'sport_field': iconName = 'tennisball-outline'; break;
            case 'venue_hall': iconName = 'business-outline'; break;
            case 'clubhouse': iconName = 'home-outline'; break;
            case 'shop': iconName = 'cart-outline'; break;
            case 'parking': iconName = 'car-outline'; break;
            case 'restroom': iconName = 'water-outline'; break;
          }
        }

        const facMarker = new google.maps.Marker({
          position: { lat: fac.latitude, lng: fac.longitude },
          map: mapRef.current,
          title: fac.name,
          icon: {
            url: getSvgMarker(iconName, markerColor, isDark),
            anchor: new google.maps.Point(16, 16),
            scaledSize: new google.maps.Size(32, 32)
          }
        });

        facilityMarkersRef.current.push(facMarker);
      });
    });
  }, [latitude, longitude, title, onChange, mapType, facilities, sports, isDark]);

  return React.createElement('div', {
    ref: containerRef,
    style: { width: '100%', height: 200, borderRadius: 12, overflow: 'hidden', marginBottom: 12 }
  });
};

export default function SiteDetails() {
  const router = useRouter();
  const { orgId, siteId } = useLocalSearchParams<{ orgId: string; siteId: string }>();
  const isNew = siteId === 'new';
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
  const { data: sitesData, isLoading: isSitesLoading, refetch: refetchSites } = useSocketQuery<Site[]>('sites', { orgId });
  const { data: sportsData } = useSocketQuery<any[]>('sports');

  const sports = sportsData || [];
  const sites = sitesData || [];

  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);

  // Site Form State
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

  const [originalData, setOriginalData] = useState<{
    name: string;
    isActive: boolean;
    address: Address;
  } | null>(isNew ? {
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
  } : null);

  const hasChanges = originalData ? (
    siteForm.name.trim() !== originalData.name ||
    siteForm.isActive !== originalData.isActive ||
    (siteForm.address?.fullAddress || '') !== (originalData.address?.fullAddress || '') ||
    (siteForm.address?.addressLine1 || '') !== (originalData.address?.addressLine1 || '') ||
    (siteForm.address?.addressLine2 || '') !== (originalData.address?.addressLine2 || '') ||
    (siteForm.address?.city || '') !== (originalData.address?.city || '') ||
    (siteForm.address?.province || '') !== (originalData.address?.province || '') ||
    (siteForm.address?.postalCode || '') !== (originalData.address?.postalCode || '') ||
    (siteForm.address?.country || '') !== (originalData.address?.country || '') ||
    siteForm.address?.latitude !== originalData.address?.latitude ||
    siteForm.address?.longitude !== originalData.address?.longitude
  ) : false;

  const handleCancel = () => {
    if (isNew) {
      router.back();
    } else if (originalData) {
      setSiteForm({
        name: originalData.name,
        isActive: originalData.isActive,
        address: { ...originalData.address }
      });
      setAddressSearchQuery(originalData.address?.fullAddress || '');
    }
  };

  // Nominatim geocoding autocomplete state
  const [addressSearchQuery, setAddressSearchQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);

  // Check map availability
  const isMapAvailable = MapView && Marker && Platform.OS !== 'web';

  // Map Ref for animation and control
  const mapRef = React.useRef<any>(null);

  // Animate map to new coordinates when address coordinates change
  useEffect(() => {
    if (siteForm.address.latitude != null && siteForm.address.longitude != null && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: siteForm.address.latitude,
        longitude: siteForm.address.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005
      }, 1000);
    }
  }, [siteForm.address.latitude, siteForm.address.longitude]);

  // Reactively populate editing site and form when sitesData loads
  useEffect(() => {
    if (sitesData && !isNew) {
      const site = sitesData.find(s => s.id === siteId);
      if (site) {
        setEditingSite(site);
        const initialAddress = site.address || {
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
        } as Address;
        setSiteForm(prev => {
          if (prev.name === '' && prev.address.fullAddress === '') {
            return {
              name: site.name,
              isActive: site.isActive !== false,
              address: initialAddress
            };
          }
          return prev;
        });
        setOriginalData({
          name: site.name,
          isActive: site.isActive !== false,
          address: { ...initialAddress }
        });
        setAddressSearchQuery(prev => prev === '' ? (site.address?.fullAddress || '') : prev);
      } else {
        Alert.alert('Error', 'Site not found');
        router.back();
      }
    }
  }, [sitesData, siteId, isNew]);

  // Subscribe to updates for Sites & Facilities rooms
  useEffect(() => {
    if (!isConnected || !orgId) return;

    const sitesRoom = `org:${orgId}:sites`;
    const facilitiesRoom = `org:${orgId}:facilities`;
    
    const unsubscribeSites = wsService.subscribeToRoom(sitesRoom);
    const unsubscribeFacilities = wsService.subscribeToRoom(facilitiesRoom);

    const handleUpdate = (event: any) => {
      if (!event) return;

      if (!isNew && (event.type === 'SITES_SYNC' || event.type === 'SITE_ADDED' || event.type === 'SITE_UPDATED' || event.type === 'SITE_DELETED')) {
        refetchSites();
      }
      
      if (event.type === 'FACILITIES_SYNC' || event.type === 'FACILITY_ADDED' || event.type === 'FACILITY_UPDATED' || event.type === 'FACILITY_DELETED') {
        if (event.type === 'FACILITIES_SYNC' && Array.isArray(event.data)) {
          setFacilities(event.data);
        } else {
          // Re-sync by triggering room broadcast
          wsService.emit('join_room', `org:${orgId}:facilities`);
        }
      }
    };

    wsService.on('update', handleUpdate);
    wsService.emit('join_room', `org:${orgId}:facilities`);

    return () => {
      unsubscribeSites();
      unsubscribeFacilities();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId, isNew, refetchSites]);

  const isLoading = !isNew && (isSitesLoading || !sportsData || !editingSite);

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
          'User-Agent': 'ScoreKeeper-MobileApp/1.0 (admin@scorekeeper.live)',
          'Accept': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        setAddressSuggestions(data);
      } else {
        setAddressSuggestions([]);
      }
    } catch (e) {
      console.warn('Nominatim lookup failed:', e);
      Alert.alert(
        'Search Failed',
        'Could not connect to the address search service. Please check your internet connection or try again later.'
      );
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
          router.back();
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
          router.back();
        } else {
          Alert.alert('Save Failed', res.message || 'Could not create site');
        }
      });
    }
  };

  // Delete Site
  const handleDeleteSite = () => {
    if (!editingSite) return;
    setIsProcessing(true);
    wsService.emit('action', {
      type: SocketAction.DELETE_SITE,
      payload: { id: editingSite.id }
    }, (res: any) => {
      setIsProcessing(false);
      setIsDeleteModalOpen(false);
      if (res.status === 'ok') {
        router.back();
      } else {
        Alert.alert('Delete Failed', res.message || 'Site is currently linked to events or games and cannot be deleted.');
      }
    });
  };

  // Open Facility Editor
  const handleOpenFacilityModal = (facility: Facility | null) => {
    if (facility) {
      router.push({
        pathname: '/admin/[orgId]/sites/[siteId]/facilities/[facilityId]',
        params: { orgId: orgId!, siteId: siteId!, facilityId: facility.id }
      });
    } else {
      router.push({
        pathname: '/admin/[orgId]/sites/[siteId]/facilities/[facilityId]',
        params: { orgId: orgId!, siteId: siteId!, facilityId: 'new' }
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
          {isNew ? 'Add New Site' : 'Edit Site Details'}
        </Text>
        <View className="w-8" />
      </View>

      {/* BODY CONTENT */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FF3E00" />
          <Text className="font-orbitron text-xs text-slate-500 dark:text-slate-400 mt-3">Loading site details...</Text>
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          className="flex-1 px-6 py-6"
          contentContainerStyle={{ paddingBottom: hasChanges ? 140 : 60 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="space-y-4">
            {/* Site Name */}
            <View>
              <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
                Site Name
              </Text>
              <TextInput
                value={siteForm.name}
                onChangeText={(val) => setSiteForm(prev => ({ ...prev, name: val }))}
                placeholder="e.g. Melkbos High Sports Grounds"
                placeholderTextColor="#94A3B8"
                className="font-orbitron-bold text-lg text-slate-800 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 outline-none"
              />
            </View>

            {/* Address Autocomplete & Search */}
            <View className="border-t border-slate-200/50 dark:border-white/5 pt-4">
              <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-1.5 tracking-wider">Physical Address</Text>
              
              <View className="flex-row gap-2 mb-2">
                <View className="flex-1 flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5">
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
                  className="bg-brand-orange px-4 rounded-xl items-center justify-center active:opacity-85"
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
                <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden mb-4 shadow-lg">
                  {addressSuggestions.map((item, idx) => (
                    <TouchableOpacity 
                      key={idx}
                      onPress={() => handleSelectAddress(item)}
                      className="px-4 py-3 border-b border-slate-200/50 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/5 active:bg-slate-100 dark:active:bg-white/5"
                    >
                      <Text className="font-inter text-xs text-slate-700 dark:text-slate-300">{item.display_name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Map Visualizer */}
              {siteForm.address.latitude != null && siteForm.address.longitude != null && (
                <View className="mb-2">
                  <View className="flex-row justify-between items-center mb-2">
                    <Text className="font-inter-bold text-[10px] text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      Map Preview (Drag pin to position)
                    </Text>
                  </View>
                  {isMapAvailable ? (
                    <View style={{ position: 'relative', width: '100%', height: 200, borderRadius: 12, overflow: 'hidden' }}>
                      <MapView
                        ref={mapRef}
                        mapType={mapType}
                        style={{ width: '100%', height: '100%' }}
                        initialRegion={{
                          latitude: siteForm.address.latitude,
                          longitude: siteForm.address.longitude,
                          latitudeDelta: 0.005,
                          longitudeDelta: 0.005
                        }}
                      >
                        <Marker
                          coordinate={{
                            latitude: siteForm.address.latitude,
                            longitude: siteForm.address.longitude
                          }}
                          draggable
                          title={siteForm.name || "Site Location"}
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

                        {facilities.filter(fac => fac.siteId === editingSite?.id).map((fac) => {
                          if (fac.latitude == null || fac.longitude == null) return null;

                          let markerColor = '#475569'; // Default other/gray
                          if (fac.primarySportId) {
                            markerColor = '#FF3E00'; // Sport orange
                          } else {
                            switch (fac.category) {
                              case 'sport_field':
                              case 'venue_hall': markerColor = '#FF8C00'; break;
                              case 'clubhouse': markerColor = '#3B82F6'; break;
                              case 'shop': markerColor = '#10B981'; break;
                              case 'parking': markerColor = '#6B7280'; break;
                              case 'restroom': markerColor = '#8B5CF6'; break;
                            }
                          }

                          // Get Ionicons icon name and color for the custom view marker
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
                            switch (fac.category) {
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
                              key={fac.id}
                              coordinate={{
                                latitude: fac.latitude,
                                longitude: fac.longitude
                              }}
                              title={fac.name}
                              description={fac.surfaceType || undefined}
                              tracksViewChanges={false}
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
                        })}
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
                      latitude={siteForm.address.latitude}
                      longitude={siteForm.address.longitude}
                      title={siteForm.name || "Site Location"}
                      facilities={facilities}
                      sports={sports}
                      onChange={(lat, lng) => {
                        setSiteForm(prev => ({
                          ...prev,
                          address: {
                            ...prev.address,
                            latitude: lat,
                            longitude: lng
                          }
                        }));
                      }}
                    />
                  ) : null}
                </View>
              )}
            </View>

            {/* FACILITIES SECTION (ONLY WHEN EDITING EXISTING SITE) */}
            {editingSite && (
              <View className="border-t border-slate-200/50 dark:border-white/5 pt-6">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Facilities ({facilities.filter(f => f.siteId === editingSite.id).length})
                  </Text>
                  <TouchableOpacity 
                    onPress={() => handleOpenFacilityModal(null)}
                    className="flex-row items-center gap-1 bg-brand-orange/10 border border-brand-orange/20 px-3 py-1.5 rounded-lg"
                  >
                    <Ionicons name="add" size={12} color="#FF3E00" />
                    <Text className="text-[10px] font-bold text-brand-orange uppercase">Add Facility</Text>
                  </TouchableOpacity>
                </View>

                {/* Facilities Table list */}
                <View className="border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                  {facilities.filter(f => f.siteId === editingSite.id).length === 0 ? (
                    <View className="p-6 items-center justify-center">
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
                            <View className="flex-row items-center gap-1.5 flex-wrap">
                              {(() => {
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
                                return <Ionicons name={iconName} size={12} color="#FF3E00" />;
                              })()}
                              <Text className="font-inter-bold text-xs text-slate-800 dark:text-white">{fac.name}</Text>
                              <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 italic">({term})</Text>
                              {fac.isActive === false && (
                                <View className="bg-slate-200 dark:bg-slate-800 px-1 py-0.2 rounded">
                                  <Text className="text-[6px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Inactive</Text>
                                </View>
                              )}
                            </View>
                            <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                              Sports: {activeSports}
                            </Text>
                          </View>

                          <View className="flex-row gap-2">
                            <TouchableOpacity 
                              onPress={() => handleOpenFacilityModal(fac)}
                              className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 items-center justify-center active:opacity-85"
                            >
                              <Ionicons name="pencil" size={12} color={isDark ? "#E2E8F0" : "#475569"} />
                            </TouchableOpacity>
                            <TouchableOpacity 
                              onPress={() => handleDeleteFacility(fac)}
                              className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 items-center justify-center active:opacity-85"
                            >
                              <Ionicons name="trash-outline" size={12} color="#EF4444" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>
            )}

            {/* Danger Zone */}
            {editingSite && (
              <View className="border-t border-red-500/20 pt-6 mt-6">
                <Text className="font-orbitron-bold text-[9px] text-red-500/80 uppercase tracking-widest mb-3">
                  Danger Zone
                </Text>
                <View className="bg-red-500/5 border border-red-500/10 rounded-xl p-4 flex-row items-center justify-between">
                  <View className="flex-1 mr-4">
                    <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Delete Site</Text>
                    <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Permanently delete this site and all associated facilities. This action is irreversible.
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
              {isNew ? "New Site" : "Unsaved Changes"}
            </Text>
            <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
              {isNew ? "You are creating a new site." : "You have modified this site's details."}
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
              onPress={handleSaveSite}
              disabled={isProcessing || !siteForm.name.trim()}
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
            className="w-full max-w-sm border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl p-6"
            style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }}
          >
            <View className="items-center justify-center mb-4">
              <View className="w-12 h-12 rounded-full bg-red-500/10 items-center justify-center mb-3">
                <Ionicons name="warning-outline" size={24} color="#EF4444" />
              </View>
              <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white uppercase tracking-wider text-center">
                Delete Site?
              </Text>
              <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 text-center mt-2 leading-relaxed">
                Are you sure you want to delete <Text className="font-semibold text-slate-700 dark:text-slate-300">"{editingSite?.name}"</Text>? This will permanently delete all associated facilities.
              </Text>
            </View>

            <View className="flex-row gap-3 mt-4">
              <TouchableOpacity
                onPress={() => setIsDeleteModalOpen(false)}
                className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/5 py-3 rounded-xl items-center justify-center active:opacity-85"
              >
                <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteSite}
                disabled={isProcessing}
                className="flex-1 bg-red-500 py-3 rounded-xl items-center justify-center active:opacity-85"
              >
                <Text className="font-inter-bold text-xs text-white uppercase tracking-wider">
                  {isProcessing ? "Deleting..." : "Delete"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
