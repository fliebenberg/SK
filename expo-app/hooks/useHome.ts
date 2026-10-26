import { useCallback, useEffect, useState } from 'react';
import type { ApproximateLocation, HomeNearby, HomeSearchResult, MyHome, ViewerPosition } from '@sk/shared';
import { roundViewerPosition } from '@sk/shared';
import { wsService } from '../services/websocket';
import { useWsStore } from '../store/wsStore';
import { useAuthStore } from '../store/authStore';
import { locationStoreHydrated, useLocationStore } from '../store/locationStore';
import { useSocketQuery } from './useSocketQuery';
import { DevicePermission, askDevicePosition, currentDevicePosition, devicePermission, placeNameAt } from '../services/location';
import { distanceKm } from '../utils/distance';

/**
 * Home's data (`HOME-1`, docs/home.md): where it looks, what is on near there, the search, and the
 * signed-in viewer's own organisations and teams.
 */

/** How often Home reads again while it is open, so a live score does not sit still. */
const REFRESH_MS = 60_000;
/** The device has to move this far before Home looks somewhere new. */
const MOVED_KM = 1;

export type HomeLocationSource = 'device' | 'typed' | 'approximate';

export interface HomeLocation {
  source: HomeLocationSource;
  near: ViewerPosition;
  label: string | null;
}

function isApproximateLocation(value: any): value is ApproximateLocation {
  return !!value && typeof value.label === 'string'
    && typeof value.near?.lat === 'number' && typeof value.near?.lng === 'number';
}

/**
 * Looks up the name of the device's position and adds it, if the position is still the one in use
 * by the time the answer comes. On web this needs the Geocoding API on the Maps key; without it
 * the card says *Your current location*.
 */
function nameDevicePosition(position: ViewerPosition) {
  void placeNameAt(position).then(label => {
    const { chosen, setChosen } = useLocationStore.getState();
    if (label && chosen?.source === 'device' && chosen.near.lat === position.lat && chosen.near.lng === position.lng) {
      setChosen({ ...chosen, label });
    }
  });
}

/**
 * Where Home looks: a place the viewer typed, else the device's position while location is allowed
 * (read again each time Home opens, and kept once it has moved a kilometre), else the server's
 * guess from the connection. `location` is `null` while none of those has an answer.
 */
export function useHomeLocation() {
  const chosen = useLocationStore(s => s.chosen);
  const approximate = useLocationStore(s => s.approximate);
  const isConnected = useWsStore(s => s.isConnected);
  const [permission, setPermission] = useState<DevicePermission | null>(null);
  const [resolving, setResolving] = useState(true);
  const [locating, setLocating] = useState(false);

  // Once per visit to Home: bring the device's position up to date, unless a place was typed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await locationStoreHydrated();
      const { chosen: remembered, setChosen } = useLocationStore.getState();
      const allowed = await devicePermission();
      if (cancelled) return;
      setPermission(allowed);
      if (remembered?.source === 'typed') return setResolving(false);
      if (allowed !== 'granted') {
        // Location was turned off since: the remembered position is not the viewer's to keep.
        if (remembered?.source === 'device') setChosen(null);
        return setResolving(false);
      }
      const position = await currentDevicePosition();
      if (cancelled) return;
      const moved = position && (!remembered || distanceKm(remembered.near, position) >= MOVED_KM);
      if (moved) setChosen({ source: 'device', near: position, label: null });
      setResolving(false);
      // The place's name follows on its own, so the cards do not wait for it.
      if (moved) nameDevicePosition(position);
    })();
    return () => { cancelled = true; };
  }, []);

  // The connection's rough location, asked once a visit, for a viewer who has set nothing.
  useEffect(() => {
    if (approximate !== undefined || !isConnected) return;
    wsService.emit('get_data', { type: 'approximate_location' }, (res: unknown) => {
      useLocationStore.getState().setApproximate(isApproximateLocation(res) ? res : null);
    }, undefined, { suppressToast: true });
  }, [approximate, isConnected]);

  /** *Use my location*. Resolves to the permission it ended with, so the dialog can say why not. */
  const locateMe = useCallback(async (): Promise<DevicePermission> => {
    setLocating(true);
    try {
      const { permission: answer, position } = await askDevicePosition();
      setPermission(answer);
      if (position) {
        useLocationStore.getState().setChosen({ source: 'device', near: position, label: null });
        nameDevicePosition(position);
      }
      return answer;
    } finally {
      setLocating(false);
    }
  }, []);

  /** A place the viewer typed. It stays until they choose *Use my location* again. */
  const setTypedPlace = useCallback((near: ViewerPosition, label: string) => {
    useLocationStore.getState().setChosen({ source: 'typed', near: roundViewerPosition(near), label });
  }, []);

  const location: HomeLocation | null = chosen
    ? { source: chosen.source, near: chosen.near, label: chosen.label }
    : approximate
    ? { source: 'approximate', near: approximate.near, label: approximate.label }
    : null;

  return {
    location,
    /** Still finding out — the page waits rather than showing *Not set* for a moment. */
    resolving: resolving || (!chosen && approximate === undefined && isConnected),
    permission,
    locating,
    locateMe,
    setTypedPlace,
  };
}

function isHomeNearby(value: any): value is HomeNearby {
  return !!value && Array.isArray(value.games) && Array.isArray(value.tournaments) && Array.isArray(value.organizations);
}

/** Read again every minute while mounted, so live scores move. */
function useRefresh(refetch: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const handle = setInterval(refetch, REFRESH_MS);
    return () => clearInterval(handle);
  }, [refetch, enabled]);
}

/** What is on near a position — or, with none, across the country by time. */
export function useHomeNearby(near: ViewerPosition | null, enabled: boolean) {
  const { data, isLoading, refetch } = useSocketQuery<HomeNearby>('home_nearby', { near }, { enabled, suppressToast: true });
  useRefresh(refetch, enabled);
  const nearby = isHomeNearby(data) ? data : null;
  return { nearby, isLoading: isLoading && !nearby };
}

function isMyHome(value: any): value is MyHome {
  return !!value && Array.isArray(value.organizations) && Array.isArray(value.teams);
}

/** The signed-in viewer's organisations and teams. */
export function useMyHome() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const { data, isLoading, refetch } = useSocketQuery<MyHome>('home_mine', {}, { enabled: isAuthenticated, suppressToast: true });
  useRefresh(refetch, isAuthenticated);
  const mine = isAuthenticated && isMyHome(data) ? data : null;
  return { mine, isLoading: isAuthenticated && isLoading && !mine };
}

function isSearchResult(value: any): value is HomeSearchResult {
  return !!value && Array.isArray(value.organizations) && Array.isArray(value.teams) && Array.isArray(value.sites);
}

/** The search, a quarter of a second after the last keystroke, from two letters. */
export function useHomeSearch(query: string, near: ViewerPosition | null) {
  const [settled, setSettled] = useState(query.trim());
  useEffect(() => {
    const handle = setTimeout(() => setSettled(query.trim()), 250);
    return () => clearTimeout(handle);
  }, [query]);
  const enabled = settled.length >= 2;
  const { data, isLoading } = useSocketQuery<HomeSearchResult>('home_search', { query: settled, near }, { enabled });
  const results = enabled && isSearchResult(data) ? data : null;
  return { results, isSearching: enabled && (isLoading || settled !== query.trim()) };
}
