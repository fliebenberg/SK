import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../store/settingsStore';
import { getThemeColor } from '../../constants/Colors';
import { FieldLabel } from '../FieldLabel';
import { TEXT_INPUT } from '../formStyles';
import { AddressMap, MapMarker } from './AddressMap';
import { AddressDraft, PlaceSuggestion, PlacesSession, composeFullAddress, hasPin } from '../../services/places';

/**
 * The app's one way to enter an address (design_system.md, *Same data, same input*).
 *
 * Three states. **Search**: type, and Google's suggestions appear as you go — no separate search
 * button. **Picked**: the address shows as text with Change and Edit details, and a map whose pin
 * can be dragged onto the right spot. **Enter it yourself**: the fields, for an address Google does
 * not know — a farm school, a new development — and for adding a unit or building to a picked one.
 * A hand-typed address keeps whatever pin it already had and otherwise has none.
 *
 * Controlled: `value` is the address being edited (or `null` for none yet) and every change comes
 * back through `onChange`. Whether it is complete enough to save is `isAddressComplete`.
 *
 * Used by the org profile's address dialog and the site editor.
 */
export interface AddressInputProps {
  value: AddressDraft | null;
  onChange: (value: AddressDraft | null) => void;
  /** Shown on the map pin. */
  pinTitle?: string;
  /** The pin's help text: what the pin is for on this record. */
  pinHelp?: string;
  /** Other places to show on the map around the pin — a site's facilities. */
  markers?: MapMarker[];
}

type Mode = 'search' | 'picked' | 'manual';

const INPUT = TEXT_INPUT;

/** Enough to save: a street and a town, wherever they came from. */
export function isAddressComplete(a: AddressDraft | null): boolean {
  return !!a && !!a.addressLine1?.trim() && !!a.city?.trim() && !!a.country?.trim();
}

const DEFAULT_PIN_HELP = 'Drag the pin to the main entrance.';

export function AddressInput({ value, onChange, pinTitle, pinHelp = DEFAULT_PIN_HELP, markers }: AddressInputProps) {
  const isDark = useActiveTheme() === 'dark';
  const [mode, setMode] = useState<Mode>(value ? 'picked' : 'search');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const sessionRef = useRef(new PlacesSession());

  // Suggestions as you type, half a second after the last keystroke.
  useEffect(() => {
    if (mode !== 'search') return;
    const text = query.trim();
    if (text.length < 3) {
      setSuggestions([]);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      setIsSearching(true);
      sessionRef.current.suggest(text)
        .then(found => { if (!cancelled) { setSuggestions(found); setSearchError(null); } })
        .catch(() => { if (!cancelled) { setSuggestions([]); setSearchError('The address search is not responding. You can enter the address yourself.'); } })
        .finally(() => { if (!cancelled) setIsSearching(false); });
    }, 500);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [query, mode]);

  const pick = (s: PlaceSuggestion) => {
    setIsSearching(true);
    sessionRef.current.details(s.placeId)
      .then(address => {
        onChange(address);
        setMode('picked');
        setQuery('');
        setSuggestions([]);
        setSearchError(null);
      })
      .catch(() => setSearchError('That address could not be looked up. Try again, or enter it yourself.'))
      .finally(() => setIsSearching(false));
  };

  const startManual = () => {
    // Carries over whatever there is — a picked address being corrected keeps its pin.
    if (!value) onChange({ fullAddress: '', building: '', addressLine1: query.trim(), addressLine2: '', city: '', province: '', postalCode: '', country: 'South Africa' });
    setMode('manual');
  };

  const setField = (field: keyof AddressDraft, text: string) => {
    const next = { ...(value || { fullAddress: '' }), [field]: text } as AddressDraft;
    next.fullAddress = composeFullAddress(next);
    onChange(next);
  };

  const movePin = (latitude: number, longitude: number) => {
    if (value) onChange({ ...value, latitude, longitude });
  };

  if (mode === 'search') {
    return (
      <View className="gap-2">
        <FieldLabel label="Address" />
        <View className={`flex-row items-center gap-2 ${INPUT}`}>
          <Ionicons name="search" size={16} color={getThemeColor(isDark, 'textSecondary')} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Start typing the address"
            placeholderTextColor={getThemeColor(isDark, 'textSecondary')}
            autoFocus
            autoCorrect={false}
            className="flex-1 font-inter text-base text-slate-800 dark:text-white outline-none"
            accessibilityLabel="Search for the address"
          />
          {isSearching ? <ActivityIndicator size="small" color={getThemeColor(isDark, 'textSecondary')} /> : null}
        </View>

        {suggestions.length > 0 ? (
          <View className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
            {suggestions.map((s, i) => (
              <TouchableOpacity
                key={s.placeId}
                onPress={() => pick(s)}
                accessibilityRole="button"
                className={`px-3 py-2.5 bg-white dark:bg-slate-900 ${i > 0 ? 'border-t border-slate-200 dark:border-white/5' : ''}`}
              >
                <Text className="font-inter-semibold text-sm text-slate-800 dark:text-white">{s.main}</Text>
                {s.secondary ? <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">{s.secondary}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {searchError ? <Text className="font-inter text-xs text-amber-800 dark:text-amber-300">{searchError}</Text> : null}

        <View className="flex-row flex-wrap gap-x-4 gap-y-1">
          <LinkText label="Can't find it? Enter it yourself" onPress={startManual} />
          {value ? <LinkText label="Keep the current address" onPress={() => setMode('picked')} /> : null}
        </View>
      </View>
    );
  }

  if (mode === 'manual') {
    const v = value || ({} as AddressDraft);
    return (
      <View className="gap-3.5">
        <Field label="Unit or building" optional value={v.building} onChange={t => setField('building', t)} placeholder="e.g. Unit 16, The Waves" />
        <Field label="Street address" value={v.addressLine1} onChange={t => setField('addressLine1', t)} autoFocus />
        <Field label="Suburb or area" optional value={v.addressLine2} onChange={t => setField('addressLine2', t)} />
        <View className="flex-row gap-3">
          <View className="flex-1"><Field label="Town or city" value={v.city} onChange={t => setField('city', t)} /></View>
          <View className="flex-1"><Field label="Postal code" optional value={v.postalCode} onChange={t => setField('postalCode', t)} /></View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1"><Field label="Province" optional value={v.province} onChange={t => setField('province', t)} /></View>
          <View className="flex-1"><Field label="Country" value={v.country} onChange={t => setField('country', t)} /></View>
        </View>
        {hasPin(value) ? (
          <View className="gap-1.5">
            <FieldLabel label="Pin" help={pinHelp} />
            <AddressMap latitude={value.latitude} longitude={value.longitude} title={pinTitle} draggable onPinMoved={movePin} height={160} markers={markers} />
          </View>
        ) : null}
        <LinkText label="Search for the address instead" onPress={() => setMode('search')} />
      </View>
    );
  }

  // Picked
  return (
    <View className="gap-3">
      <View className="gap-1.5">
        <FieldLabel label="Address" />
        <View className="flex-row items-start gap-2.5 rounded-xl bg-slate-100 dark:bg-white/5 px-3 py-2.5">
          <Ionicons name="location-outline" size={16} color={getThemeColor(isDark, 'textSecondary')} style={{ marginTop: 2 }} />
          <View className="flex-1 min-w-0">
            <AddressLines address={value} />
          </View>
        </View>
        <View className="flex-row flex-wrap gap-x-4 gap-y-1">
          <LinkText label="Change" onPress={() => setMode('search')} />
          <LinkText label="Edit details" onPress={() => setMode('manual')} />
        </View>
      </View>
      {hasPin(value) ? (
        <View className="gap-1.5">
          <FieldLabel label="Pin" help={pinHelp} />
          <AddressMap latitude={value.latitude} longitude={value.longitude} title={pinTitle} draggable onPinMoved={movePin} height={170} markers={markers} />
        </View>
      ) : null}
    </View>
  );
}

/** An address as lines: unit or building, street, suburb, then town and postal code with the province. */
export function AddressLines({ address, muted = false }: { address: Partial<AddressDraft> | null | undefined; muted?: boolean }) {
  if (!address) return null;
  const townLine = [[address.city, address.postalCode].filter(Boolean).join(', '), address.province].filter(Boolean).join(' · ');
  const lines = [address.building, address.addressLine1, address.addressLine2].filter(Boolean) as string[];
  // An old address with only the one-line form (the server had no separate lines before 2026-10-01).
  if (lines.length === 0 && !townLine) lines.push(address.fullAddress || '');
  return (
    <View>
      {lines.map((line, i) => (
        <Text key={i} className={`font-inter text-sm ${muted ? 'text-slate-600 dark:text-slate-300' : 'text-slate-800 dark:text-white'}`}>{line}</Text>
      ))}
      {townLine ? <Text className="font-inter text-sm text-slate-500 dark:text-slate-400">{townLine}</Text> : null}
    </View>
  );
}

function Field({ label, value, onChange, optional, autoFocus, placeholder }: { label: string; value?: string; onChange: (t: string) => void; optional?: boolean; autoFocus?: boolean; placeholder?: string }) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <View className="gap-1.5">
      <FieldLabel label={label} optional={optional} />
      <TextInput value={value || ''} onChangeText={onChange} autoFocus={autoFocus} placeholder={placeholder} placeholderTextColor={getThemeColor(isDark, 'textSecondary')} className={INPUT} accessibilityLabel={label} />
    </View>
  );
}

function LinkText({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={8} accessibilityRole="button">
      <Text className="font-inter-bold text-sm text-orange-700 dark:text-brand-orange">{label}</Text>
    </TouchableOpacity>
  );
}
