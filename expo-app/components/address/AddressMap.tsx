import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme, useSettingsStore } from '../../store/settingsStore';

import { loadGoogleMaps } from '../../services/places';
import { markerSvgUrl } from './markerSvg';
import { themeColor } from '../../constants/Colors';

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
  /**
   * Draw the pin itself as a marker with this icon and colour rather than the plain pin — a
   * facility's pin, which shows what the facility is while it is dragged (`VENUE-3`).
   */
  pinIcon?: { icon: string; color: string };
  /** Draws no pin, only the markers — a tournament's facilities when its base site has no pin. */
  hidePin?: boolean;
  /**
   * Opens zoomed to fit the pin and every marker rather than close in on the pin, so a large ground
   * does not cut off its outer fields. Refits when the markers change, not when the reader pans.
   */
  fitToMarkers?: boolean;
  /** Pixels at the bottom that something laid over the map covers — a card — kept clear when fitting. */
  insetBottom?: number;
  /** Pans and zooms to this point. A new `nonce` goes there again, after the reader has panned away. */
  focus?: { latitude: number; longitude: number; nonce: number } | null;
}

/** The closest a fit or a focus zooms in, so one facility beside the pin is not a field of grass. */
const MAX_FIT_ZOOM = 18;
const FOCUS_DELTA = 0.0015;

/** The margin a fit leaves around the markers: 48px on a full map, less on a small preview. */
function fitPadding(mapHeight: number, insetBottom: number) {
  const pad = Math.min(48, Math.round(mapHeight * 0.1));
  return { top: pad, right: pad, bottom: insetBottom + pad, left: pad };
}

/**
 * A map with one pin — the shared address input's, the profile's preview and the address page's —
 * and optionally fixed markers around it, which the site editor uses for its facilities.
 *
 * Web draws it with the Maps JavaScript SDK (`services/places.ts` loads it), native with
 * react-native-maps. The map type follows the reader's saved preference.
 */
export function AddressMap({
  latitude, longitude, title, draggable = false, onPinMoved, interactive = true, height = 200, markers = NO_MARKERS, pinIcon,
  hidePin = false, fitToMarkers = false, insetBottom = 0, focus = null,
}: AddressMapProps) {
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
        pinIcon={pinIcon}
        isDark={isDark}
        hidePin={hidePin}
        fitToMarkers={fitToMarkers}
        insetBottom={insetBottom}
        focus={focus}
      />
    );
  }

  return (
    <NativeMap
      latitude={latitude} longitude={longitude} title={title} draggable={draggable} onPinMoved={onPinMoved}
      interactive={interactive} height={height} markers={markers} pinIcon={pinIcon} hidePin={hidePin}
      fitToMarkers={fitToMarkers} insetBottom={insetBottom} focus={focus} mapType={mapType} isDark={isDark}
    />
  );
}

function NativeMap({
  latitude, longitude, title, draggable, onPinMoved, interactive, height, markers, pinIcon, hidePin, fitToMarkers, insetBottom, focus, mapType, isDark,
}: Required<Pick<AddressMapProps, 'latitude' | 'longitude' | 'draggable' | 'interactive' | 'height' | 'markers' | 'hidePin' | 'fitToMarkers' | 'insetBottom'>> &
  Pick<AddressMapProps, 'title' | 'onPinMoved' | 'pinIcon' | 'focus'> & { mapType: string; isDark: boolean }) {
  const mapRef = useRef<any>(null);
  const region = useMemo(() => ({ latitude, longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 }), [latitude, longitude]);

  // A fitted map is left to the reader once it opens: `initialRegion`, then moved only by a fit or a focus.
  const fit = () => {
    if (!fitToMarkers || !mapRef.current) return;
    const points = [...(hidePin ? [] : [{ latitude, longitude }]), ...markers.map(m => ({ latitude: m.latitude, longitude: m.longitude }))];
    if (points.length > 1) {
      mapRef.current.fitToCoordinates(points, { edgePadding: fitPadding(typeof height === 'number' ? height : 480, insetBottom), animated: false });
    }
  };
  useEffect(fit, [markers, insetBottom]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (focus && mapRef.current) {
      mapRef.current.animateToRegion({ latitude: focus.latitude, longitude: focus.longitude, latitudeDelta: FOCUS_DELTA, longitudeDelta: FOCUS_DELTA });
    }
  }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!MapView || !Marker) {
    return (
      <View style={{ height }} className="rounded-xl items-center justify-center bg-sunken border border-line">
        <Ionicons name="map-outline" size={24} color={themeColor(isDark, 'ink-muted')} />
        <Text className="font-inter text-xs text-ink-muted mt-1">The map is not available here.</Text>
      </View>
    );
  }

  return (
    <View style={{ height, borderRadius: 12, overflow: 'hidden' }}>
      <MapView
        ref={mapRef}
        style={{ width: '100%', height: '100%' }}
        mapType={mapType}
        {...(fitToMarkers ? { initialRegion: region, onMapReady: fit } : { region })}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {hidePin ? null : <Marker
          coordinate={{ latitude, longitude }}
          title={title}
          draggable={draggable}
          onDragEnd={(e: any) => {
            const c = e.nativeEvent.coordinate;
            onPinMoved?.(c.latitude, c.longitude);
          }}
        >
          {pinIcon ? <MarkerBadge icon={pinIcon.icon} color={pinIcon.color} isDark={isDark} size={18} /> : null}
        </Marker>}
        {markers.map(m => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.latitude, longitude: m.longitude }}
            title={m.title}
            description={m.description}
            tracksViewChanges={false}
          >
            <MarkerBadge icon={m.icon} color={m.color} isDark={isDark} size={14} />
          </Marker>
        ))}
      </MapView>
      {interactive ? (
        <TouchableOpacity
          onPress={() => setMapType(mapType === 'satellite' ? 'standard' : 'satellite')}
          accessibilityRole="button"
          style={{ position: 'absolute', top: 8, right: 8 }}
          className="flex-row items-center gap-1.5 bg-card border border-line px-2.5 py-1.5 rounded-lg"
        >
          <Ionicons name={mapType === 'satellite' ? 'map' : 'earth'} size={12} color={themeColor(isDark, 'primary')} />
          <Text className="font-inter-bold text-xs text-ink-soft">{mapType === 'satellite' ? 'Map' : 'Satellite'}</Text>
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

/** A round marker with an icon, for native maps — the web map draws the same from `markerSvgUrl`. */
function MarkerBadge({ icon, color, isDark, size }: { icon: string; color: string; isDark: boolean; size: number }) {
  return (
    <View
      style={{
        backgroundColor: themeColor(isDark, 'popover'),
        padding: Math.round(size * 0.43),
        borderRadius: 40,
        borderWidth: size > 14 ? 2 : 1.5,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 5,
      }}
    >
      <Ionicons name={icon as any} size={size} color={color} />
    </View>
  );
}

function WebMap({
  latitude, longitude, title, draggable, onPinMoved, interactive, height, satellite, markers, pinIcon, isDark, hidePin, fitToMarkers, insetBottom, focus,
}: Required<Pick<AddressMapProps, 'latitude' | 'longitude' | 'draggable' | 'interactive' | 'height' | 'markers' | 'hidePin' | 'fitToMarkers' | 'insetBottom'>> &
  Pick<AddressMapProps, 'title' | 'onPinMoved' | 'pinIcon' | 'focus'> & { satellite: boolean; isDark: boolean }) {
  const containerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const extraMarkersRef = useRef<any[]>([]);
  // The latest markers, for whichever of the two effects below gets the map first.
  const markersRef = useRef({ markers, isDark });
  markersRef.current = { markers, isDark };

  /** Zooms to the pin and every marker, no closer than `MAX_FIT_ZOOM`. */
  const fitBounds = (google: any) => {
    if (!fitToMarkers || !mapRef.current) return;
    const points = [...(hidePin ? [] : [{ lat: latitude, lng: longitude }]), ...markersRef.current.markers.map(m => ({ lat: m.latitude, lng: m.longitude }))];
    if (points.length < 2) return;
    const bounds = new google.maps.LatLngBounds();
    points.forEach(p => bounds.extend(p));
    google.maps.event.addListenerOnce(mapRef.current, 'idle', () => {
      if (mapRef.current.getZoom() > MAX_FIT_ZOOM) mapRef.current.setZoom(MAX_FIT_ZOOM);
    });
    mapRef.current.fitBounds(bounds, fitPadding(containerRef.current?.clientHeight || 480, insetBottom));
  };

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
  /** The pin's own icon, when it has one; `undefined` keeps Google's plain pin. */
  const pinIconOf = (google: any) => pinIcon ? {
    url: markerSvgUrl(pinIcon.icon, pinIcon.color, isDark),
    anchor: new google.maps.Point(20, 20),
    scaledSize: new google.maps.Size(40, 40),
  } : undefined;
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
        markerRef.current = new google.maps.Marker({ position: center, map: hidePin ? null : mapRef.current, title, draggable, icon: pinIconOf(google) });
        markerRef.current.addListener('dragend', (e: any) => {
          onPinMovedRef.current?.(e.latLng.lat(), e.latLng.lng());
        });
        drawMarkers(google);
        fitBounds(google);
      } else {
        const current = markerRef.current.getPosition();
        if (!current || Math.abs(current.lat() - latitude) > 1e-7 || Math.abs(current.lng() - longitude) > 1e-7) {
          markerRef.current.setPosition(center);
          mapRef.current.setCenter(center);
        }
        markerRef.current.setMap(hidePin ? null : mapRef.current);
        markerRef.current.setDraggable(draggable);
        markerRef.current.setIcon(pinIconOf(google) ?? null);
        const wanted = satellite ? google.maps.MapTypeId.HYBRID : google.maps.MapTypeId.ROADMAP;
        if (mapRef.current.getMapTypeId() !== wanted) mapRef.current.setMapTypeId(wanted);
      }
    }).catch(() => {
      // Leaves the empty box; the address text beside or below the map still says where it is.
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude, title, draggable, interactive, satellite, pinIcon?.icon, pinIcon?.color, isDark, hidePin]);

  // Redraws the markers when they change, once the map exists; until then the effect above draws them.
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(google => {
      if (!cancelled && mapRef.current) drawMarkers(google);
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, isDark]);

  // Refits when the set of markers changes — they often arrive after the map — but not on a recolour.
  const markerKey = markers.map(m => `${m.id}:${m.latitude},${m.longitude}`).join('|');
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(google => {
      if (!cancelled) fitBounds(google);
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerKey, insetBottom]);

  useEffect(() => {
    if (!focus || !mapRef.current) return;
    mapRef.current.setZoom(MAX_FIT_ZOOM);
    mapRef.current.setCenter({ lat: focus.latitude, lng: focus.longitude });
    // Into the middle of what the card leaves showing, not behind it.
    if (insetBottom) mapRef.current.panBy(0, insetBottom / 2);
  }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ height, borderRadius: 12, overflow: 'hidden' }} className="bg-sunken">
      {React.createElement('div', { ref: containerRef, style: { width: '100%', height: '100%' } })}
    </View>
  );
}
