import React, { useEffect, useRef } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme, useSettingsStore } from '../../store/settingsStore';
import { getThemeColor } from '../../constants/Colors';
import { loadGoogleMaps } from '../../services/places';
import { markerSvgUrl } from './markerSvg';

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

/** A fixed marker drawn beside the pin — a site's facilities. Not draggable. */
export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
  /** An Ionicons name; web draws the ones `markerSvg.ts` knows and a dot for the rest. */
  icon: string;
  color: string;
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
  /** Other places to show around the pin. Pass a memoised array: a new one redraws them. */
  markers?: MapMarker[];
}

/**
 * A map with one pin — the shared address input's, the profile's preview and the address page's —
 * and optionally fixed markers around it, which the site editor uses for its facilities.
 *
 * Web draws it with the Maps JavaScript SDK (`services/places.ts` loads it), native with
 * react-native-maps. The map type follows the reader's saved preference.
 */
export function AddressMap({ latitude, longitude, title, draggable = false, onPinMoved, interactive = true, height = 200, markers = NO_MARKERS }: AddressMapProps) {
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
        markers={markers}
        isDark={isDark}
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
        {markers.map(m => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.latitude, longitude: m.longitude }}
            title={m.title}
            description={m.description}
            tracksViewChanges={false}
          >
            <View
              style={{
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                padding: 6,
                borderRadius: 20,
                borderWidth: 1.5,
                borderColor: m.color,
                alignItems: 'center',
                justifyContent: 'center',
                elevation: 5,
              }}
            >
              <Ionicons name={m.icon as any} size={14} color={m.color} />
            </View>
          </Marker>
        ))}
      </MapView>
      {interactive ? (
        <TouchableOpacity
          onPress={() => setMapType(mapType === 'satellite' ? 'standard' : 'satellite')}
          accessibilityRole="button"
          style={{ position: 'absolute', top: 8, right: 8 }}
          className="flex-row items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 px-2.5 py-1.5 rounded-lg"
        >
          <Ionicons name={mapType === 'satellite' ? 'map' : 'earth'} size={12} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300">{mapType === 'satellite' ? 'Map' : 'Satellite'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Saved as this device's preference, so every map opens the way the reader last left one. */
function setMapType(value: 'standard' | 'satellite') {
  if (useSettingsStore.getState().getEffectivePreference('mapType') !== value) {
    useSettingsStore.getState().setLocalOverride('mapType', value);
  }
}

const NO_MARKERS: MapMarker[] = [];

function WebMap({
  latitude, longitude, title, draggable, onPinMoved, interactive, height, satellite, markers, isDark,
}: Required<Pick<AddressMapProps, 'latitude' | 'longitude' | 'draggable' | 'interactive' | 'height' | 'markers'>> &
  Pick<AddressMapProps, 'title' | 'onPinMoved'> & { satellite: boolean; isDark: boolean }) {
  const containerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const extraMarkersRef = useRef<any[]>([]);
  // The latest markers, for whichever of the two effects below gets the map first.
  const markersRef = useRef({ markers, isDark });
  markersRef.current = { markers, isDark };

  const drawMarkers = (google: any) => {
    extraMarkersRef.current.forEach(m => m.setMap(null));
    extraMarkersRef.current = markersRef.current.markers.map(m => new google.maps.Marker({
      position: { lat: m.latitude, lng: m.longitude },
      map: mapRef.current,
      title: m.title,
      icon: {
        url: markerSvgUrl(m.icon, m.color, markersRef.current.isDark),
        anchor: new google.maps.Point(16, 16),
        scaledSize: new google.maps.Size(32, 32),
      },
    }));
  };
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
          mapTypeControl: interactive,
          mapTypeControlOptions: { mapTypeIds: [google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.HYBRID] },
          streetViewControl: false,
          gestureHandling: interactive ? 'cooperative' : 'none',
          clickableIcons: false,
        });
        mapRef.current.addListener('maptypeid_changed', () => {
          const id = mapRef.current.getMapTypeId();
          setMapType(id === google.maps.MapTypeId.HYBRID || id === google.maps.MapTypeId.SATELLITE ? 'satellite' : 'standard');
        });
        markerRef.current = new google.maps.Marker({ position: center, map: mapRef.current, title, draggable });
        markerRef.current.addListener('dragend', (e: any) => {
          onPinMovedRef.current?.(e.latLng.lat(), e.latLng.lng());
        });
        drawMarkers(google);
      } else {
        const current = markerRef.current.getPosition();
        if (!current || Math.abs(current.lat() - latitude) > 1e-7 || Math.abs(current.lng() - longitude) > 1e-7) {
          markerRef.current.setPosition(center);
          mapRef.current.setCenter(center);
        }
        markerRef.current.setDraggable(draggable);
        const wanted = satellite ? google.maps.MapTypeId.HYBRID : google.maps.MapTypeId.ROADMAP;
        if (mapRef.current.getMapTypeId() !== wanted) mapRef.current.setMapTypeId(wanted);
      }
    }).catch(() => {
      // Leaves the empty box; the address text beside or below the map still says where it is.
    });
    return () => { cancelled = true; };
  }, [latitude, longitude, title, draggable, interactive, satellite]);

  // Redraws the markers when they change, once the map exists; until then the effect above draws them.
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(google => {
      if (!cancelled && mapRef.current) drawMarkers(google);
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, isDark]);

  return (
    <View style={{ height, borderRadius: 12, overflow: 'hidden' }} className="bg-slate-100 dark:bg-slate-900">
      {React.createElement('div', { ref: containerRef, style: { width: '100%', height: '100%' } })}
    </View>
  );
}
