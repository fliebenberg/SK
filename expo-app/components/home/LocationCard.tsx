import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HOME_RADIUS_KM } from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import { TEXT_INPUT } from '../formStyles';
import { PlaceSuggestion, PlacesSession } from '../../services/places';
import { DevicePermission, canOpenSettings, openAppSettings } from '../../services/location';
import type { HomeLocation } from '../../hooks/useHome';

/**
 * *Your location* (`HOME-1`, mockups/home-near-you.html): two lines — the heading with where Home
 * is looking on the right, then how that was found with *Set my location* under it — and the
 * dialog that sets it.
 */
export function LocationCard({ location, resolving, onSet }: {
  location: HomeLocation | null;
  resolving: boolean;
  onSet: () => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const where = !location
    ? null
    : location.label
    ? `Near ${location.label}`
    : 'Your current location';
  const how = !location
    ? 'Set it to see what is on around you'
    : location.source === 'approximate'
    ? 'Approximate, from your connection'
    : location.source === 'device'
    ? `From this device · within ${HOME_RADIUS_KM} km`
    : `The place you chose · within ${HOME_RADIUS_KM} km`;
  const action = location && location.source !== 'approximate' ? 'Change location' : 'Set my location';

  return (
    <View className="rounded-2xl border border-line bg-card px-4 py-3.5">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="font-inter-bold text-lg text-ink">Your location</Text>
        {resolving && !location ? (
          <ActivityIndicator size="small" color={themeColor(isDark, 'ink-muted')} />
        ) : (
          <View className="flex-row items-center gap-1 flex-shrink min-w-0">
            <Ionicons name="location" size={15} color={themeColor(isDark, where ? 'primary' : 'ink-muted')} />
            <Text className={`flex-shrink text-right font-inter-bold text-[15px] ${where ? 'text-ink' : 'text-ink-muted'}`} numberOfLines={1}>
              {where || 'Not set'}
            </Text>
          </View>
        )}
      </View>
      <View className="flex-row items-center justify-between gap-3 mt-0.5">
        <Text className="flex-shrink font-inter text-[13px] text-ink-muted" numberOfLines={1}>{how}</Text>
        <TouchableOpacity onPress={onSet} accessibilityRole="button" hitSlop={8}>
          <Text className="font-inter-bold text-[13px] text-primary-ink">{action}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * *Set my location*: the device's position, or a town or address typed in. A typed place stays
 * until *Use my location* is chosen again, so it is never overwritten by the device moving.
 */
export function SetLocationDialog({ visible, onClose, location, permission, locating, onUseMyLocation, onChoosePlace }: {
  visible: boolean;
  onClose: () => void;
  location: HomeLocation | null;
  permission: DevicePermission | null;
  locating: boolean;
  onUseMyLocation: () => Promise<DevicePermission>;
  onChoosePlace: (near: { lat: number; lng: number }, label: string) => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [refused, setRefused] = useState<DevicePermission | null>(null);
  const session = useRef(new PlacesSession());

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setSuggestions([]);
      setProblem(null);
      setRefused(null);
    }
  }, [visible]);

  // Suggestions as you type, as the address input does, from three letters.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      setSearching(true);
      session.current.suggest(text)
        .then(found => { if (!cancelled) { setSuggestions(found); setProblem(null); } })
        .catch(() => { if (!cancelled) { setSuggestions([]); setProblem('The place search is not responding. Try again in a moment.'); } })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 400);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [query]);

  const pick = (s: PlaceSuggestion) => {
    setSearching(true);
    session.current.details(s.placeId)
      .then(place => {
        if (typeof place.latitude !== 'number' || typeof place.longitude !== 'number') {
          setProblem('That place has no position on the map. Try a town or a nearby street.');
          return;
        }
        onChoosePlace({ lat: place.latitude, lng: place.longitude }, s.main);
        onClose();
      })
      .catch(() => setProblem('That place could not be looked up. Try again.'))
      .finally(() => setSearching(false));
  };

  const useMine = async () => {
    const answer = await onUseMyLocation();
    if (answer === 'granted') onClose();
    else setRefused(answer);
  };

  const shownRefusal = refused ?? (permission === 'blocked' ? 'blocked' : null);
  const usingDevice = location?.source === 'device';

  return (
    <EditDialog visible={visible} title="Set my location" onClose={onClose}>
      <View className="gap-3">
        <Text className="font-inter text-sm text-ink-muted">
          Home shows games, tournaments and organisations within {HOME_RADIUS_KM} km of it. Your location stays on this device.
        </Text>

        <TouchableOpacity
          onPress={useMine}
          disabled={locating}
          accessibilityRole="button"
          className={`flex-row items-center gap-3 rounded-2xl border px-4 py-3 ${usingDevice ? 'border-primary-line bg-primary-soft' : 'border-line bg-card'}`}
        >
          <Ionicons name="navigate" size={18} color={themeColor(isDark, 'primary-ink')} />
          <View className="flex-1 min-w-0">
            <Text className="font-inter-bold text-[15px] text-ink">Use my location</Text>
            <Text className="font-inter text-xs text-ink-muted">Updated each time you open ScoreKeeper</Text>
          </View>
          {locating ? <ActivityIndicator size="small" color={themeColor(isDark, 'ink-muted')} /> : usingDevice ? <Ionicons name="checkmark" size={18} color={themeColor(isDark, 'primary-ink')} /> : null}
        </TouchableOpacity>

        {shownRefusal ? (
          <View className="rounded-xl bg-warning-soft px-3 py-2.5">
            <Text className="font-inter text-[13px] text-warning-ink leading-5">
              {shownRefusal === 'unavailable'
                ? 'This device could not say where it is. Type a town or address below instead.'
                : canOpenSettings
                ? 'Location is turned off for ScoreKeeper. Turn it on in Settings, or type a town or address below.'
                : 'Location is blocked for ScoreKeeper in this browser. Allow it in the site settings, or type a town or address below.'}
            </Text>
            {shownRefusal === 'blocked' && canOpenSettings ? (
              <TouchableOpacity onPress={openAppSettings} accessibilityRole="button" className="mt-1.5">
                <Text className="font-inter-bold text-[13px] text-warning-ink underline">Open Settings</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <View className="flex-row items-center gap-2.5">
          <View className="flex-1 h-px bg-line" />
          <Text className="font-inter text-xs text-ink-faint">or</Text>
          <View className="flex-1 h-px bg-line" />
        </View>

        <View className={`flex-row items-center gap-2 ${TEXT_INPUT}`}>
          <Ionicons name="search" size={16} color={themeColor(isDark, 'ink-muted')} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Type a town or address"
            placeholderTextColor={themeColor(isDark, 'ink-muted')}
            autoCorrect={false}
            className="flex-1 font-inter text-base text-ink outline-none"
            accessibilityLabel="Type a town or address"
          />
          {searching ? <ActivityIndicator size="small" color={themeColor(isDark, 'ink-muted')} /> : null}
        </View>
        {suggestions.length ? (
          <View className="rounded-xl border border-line overflow-hidden">
            {suggestions.map((s, i) => (
              <TouchableOpacity
                key={s.placeId}
                onPress={() => pick(s)}
                accessibilityRole="button"
                className={`px-3 py-2.5 bg-card ${i > 0 ? 'border-t border-line' : ''}`}
              >
                <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>{s.main}</Text>
                {s.secondary ? <Text className="font-inter text-xs text-ink-muted" numberOfLines={1}>{s.secondary}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {problem ? <Text className="font-inter text-[13px] text-danger-ink">{problem}</Text> : null}
      </View>
    </EditDialog>
  );
}
