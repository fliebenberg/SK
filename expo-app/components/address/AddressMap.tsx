import React, { useEffect, useRef } from 'react';
import { Platform, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme, useSettingsStore } from '../../store/settingsStore';
import { getThemeColor } from '../../constants/Colors';
import { loadGoogleMaps } from '../../services/places';

// react-native-maps has no web build; requiring it there breaks the bundle.
let MapView: any = null;
let Marker: any = null;
if (Platform.OS !== 'web') {
  try {
    const maps = require('react-native-maps');
    MapView = maps.default;
    Marker = maps.Marker;
  } catch {
    MapView = null;
  }
}

export interface AddressMapProps {
  latitude: number;
  longitude: number;
  /** Shown on the pin. */
  title?: string;
  /** Lets the pin be dragged; `onPinMoved` hears where it lands. */
  draggable?: boolean;
  onPinMoved?: (latitude: number, longitude: number) => void;
  /** Lets the map be panned and zoomed. Off for a preview, which is a picture of where the pin is. */
  interactive?: boolean;
  /** Pixels, or `'100%'` to fill a parent that has a size. */
  height?: number | '100%';
}

/**
 * A map with one pin — the shared address input's, the profile's preview and the address page's.
 *
 * Web draws it with the Maps JavaScript SDK (`services/places.ts` loads it), native with
 * react-native-maps. The map type follows the reader's saved preference, as the site editor's does.
 * Added with the org profile (2026-10-01); the site editor still has its own map until `VENUE-2`.
 */
export function AddressMap({ latitude, longitude, title, draggable = false, onPinMoved, interactive = true, height = 200 }: AddressMapProps) {
  const isDark = useActiveTheme() === 'dark';
  const mapType = useSettingsStore((state: any) => state.getEffectivePreference('mapType') || 'standard');

  if (Platform.OS === 'web') {
    return (
      <WebMap
        latitude={latitude}
        longitude={longitude}
        title={title}
        draggable={draggable}
        onPinMoved={onPinMoved}
        interactive={interactive}
        height={height}
        satellite={mapType === 'satellite'}
      />
    );
  }

  if (!MapView || !Marker) {
    return (
      <View style={{ height }} className="rounded-xl items-center justify-center bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/5">
        <Ionicons name="map-outline" size={24} color={getThemeColor(isDark, 'textSecondary')} />
        <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-1">The map is not available here.</Text>
      </View>
    );
  }

  return (
    <View style={{ height, borderRadius: 12, overflow: 'hidden' }}>
      <MapView
        style={{ width: '100%', height: '100%' }}
        mapType={mapType}
        region={{ latitude, longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 }}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        <Marker
          coordinate={{ latitude, longitude }}
          title={title}
          draggable={draggable}
          onDragEnd={(e: any) => {
            const c = e.nativeEvent.coordinate;
            onPinMoved?.(c.latitude, c.longitude);
          }}
        />
      </MapView>
    </View>
  );
}

function WebMap({
  latitude, longitude, title, draggable, onPinMoved, interactive, height, satellite,
}: Required<Pick<AddressMapProps, 'latitude' | 'longitude' | 'draggable' | 'interactive' | 'height'>> &
  Pick<AddressMapProps, 'title' | 'onPinMoved'> & { satellite: boolean }) {
  const containerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  // Read through a ref so a new callback each render does not rebuild the map.
  const onPinMovedRef = useRef(onPinMoved);
  onPinMovedRef.current = onPinMoved;

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(google => {
      if (cancelled || !containerRef.current) return;
      const center = { lat: latitude, lng: longitude };
      if (!mapRef.current) {
        mapRef.current = new google.maps.Map(containerRef.current, {
          center,
          zoom: 16,
          mapTypeId: satellite ? google.maps.MapTypeId.HYBRID : google.maps.MapTypeId.ROADMAP,
          disableDefaultUI: !interactive,
          gestureHandling: interactive ? 'cooperative' : 'none',
          clickableIcons: false,
        });
        markerRef.current = new google.maps.Marker({ position: center, map: mapRef.current, title, draggable });
        markerRef.current.addListener('dragend', (e: any) => {
          onPinMovedRef.current?.(e.latLng.lat(), e.latLng.lng());
        });
      } else {
        const current = markerRef.current.getPosition();
        if (!current || Math.abs(current.lat() - latitude) > 1e-7 || Math.abs(current.lng() - longitude) > 1e-7) {
          markerRef.current.setPosition(center);
          mapRef.current.setCenter(center);
        }
        markerRef.current.setDraggable(draggable);
      }
    }).catch(() => {
      // Leaves the empty box; the address text beside or below the map still says where it is.
    });
    return () => { cancelled = true; };
  }, [latitude, longitude, title, draggable, interactive, satellite]);

  return (
    <View style={{ height, borderRadius: 12, overflow: 'hidden' }} className="bg-slate-100 dark:bg-slate-900">
      {React.createElement('div', { ref: containerRef, style: { width: '100%', height: '100%' } })}
    </View>
  );
}
