import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApproximateLocation, HomeNearby, HomeNearbyOrganizations, HomeSearchResult, MyHome, ViewerPosition } from '@sk/shared';
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

/**
 * How often Home reads its list again while it is on screen, to pick up what has been added or has
 * dropped off. Scores do not wait for this: they come through the rows' rooms (`useListRows`). It
 * varies so that clients which connected together, as after a server restart, do not stay in step.
 */
const refreshDelayMs = () => 4 * 60_000 + Math.random() * 2 * 60_000;
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
 * by the time the answer comes. Without one the card says *Your current location*.
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
    })();
    return () => { cancelled = true; };
  }, []);

  // The device's position gets its name on its own, so the cards do not wait for it — and once the
  // connection is up, since the position is often read before it is.
  const unnamed = isConnected && chosen?.source === 'device' && !chosen.label ? chosen.near : null;
  useEffect(() => {
    if (unnamed) nameDevicePosition(unnamed);
  }, [unnamed?.lat, unnamed?.lng]);

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
  return !!value && Array.isArray(value.games) && Array.isArray(value.tournaments);
}

/**
 * Read again every few minutes while `onScreen`. Coming back to a read that has gone stale reads at
 * once. `refetch` changes when the connection or the question does, and the query reads then by
 * itself, so that counts as a read.
 */
function useRefresh(refetch: () => void, onScreen: boolean) {
  const lastRead = useRef(0);
  useEffect(() => { lastRead.current = Date.now(); }, [refetch]);
  useEffect(() => {
    if (!onScreen) return;
    let handle: ReturnType<typeof setTimeout>;
    const after = (delay: number) => {
      handle = setTimeout(() => {
        lastRead.current = Date.now();
        refetch();
        after(refreshDelayMs());
      }, delay);
    };
    after(Math.max(0, lastRead.current + refreshDelayMs() - Date.now()));
    return () => clearTimeout(handle);
  }, [refetch, onScreen]);
}

/** What is on near a position — or, with none, across the country by time. */
export function useHomeNearby(near: ViewerPosition | null, enabled: boolean, onScreen: boolean) {
  const { data, isLoading, refetch } = useSocketQuery<HomeNearby>('home_nearby', { near }, { enabled, suppressToast: true });
  useRefresh(refetch, enabled && onScreen);
  const nearby = isHomeNearby(data) ? data : null;
  return { nearby, isLoading: isLoading && !nearby };
}

function isNearbyOrganizations(value: any): value is HomeNearbyOrganizations {
  return !!value && Array.isArray(value.organizations);
}

/** Organisations near a position, read once a visit: they do not change from one minute to the next. */
export function useHomeNearbyOrgs(near: ViewerPosition | null, enabled: boolean) {
  const { data, isLoading } = useSocketQuery<HomeNearbyOrganizations>('home_nearby_orgs', { near }, { enabled, suppressToast: true });
  const nearbyOrgs = isNearbyOrganizations(data) ? data : null;
  return { nearbyOrgs, isLoading: isLoading && !nearbyOrgs };
}

function isMyHome(value: any): value is MyHome {
  return !!value && Array.isArray(value.organizations) && Array.isArray(value.teams);
}

/** The signed-in viewer's organisations and teams. */
export function useMyHome(onScreen: boolean) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const { data, isLoading, refetch } = useSocketQuery<MyHome>('home_mine', {}, { enabled: isAuthenticated, suppressToast: true });
  useRefresh(refetch, isAuthenticated && onScreen);
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
