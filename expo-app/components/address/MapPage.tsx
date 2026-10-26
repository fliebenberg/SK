import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Address, Facility } from '@sk/shared';
import { ScreenHeader } from '../ScreenHeader';
import { AddressMap } from './AddressMap';
import { AddressLines } from './AddressInput';
import { facilityMarkers } from './facilityMarker';
import { FacilityIcon } from '../sites/SiteBits';
import { hasPin } from '../../services/places';
import { copyText, openDirections as openDirectionsTo } from '../../utils/share';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

export interface MapPageProps {
  backLabel: string;
  onBack: () => void;
  /** Whose map it is, in the header — a tournament's name. */
  context?: string;
  isLoading: boolean;
  /** Shown in place of the map and card when there is nothing to show — no address, no facilities. */
  emptyText?: string | null;
  /** The place's name on the card: the organisation, or the tournament's base site. */
  name: string;
  address: Partial<Address> | null;
  /** Facilities to mark around the pin, each listed on the card; a tap on one goes to it. */
  facilities?: Facility[];
  sports?: { id: string; name?: string }[];
}

/**
 * A place on a full map the reader can pan and zoom, with a card over its foot: the name, the address,
 * the facilities marked (if any), **Directions** and **Copy address**. Opened from a map preview —
 * an organisation's (`OrgAddressMapPage`) or a tournament's *Where* and a division's site
 * (`events/[eventId]/map`); docs/org-profile.md §3.
 *
 * Inside the app first, so looking at where something is does not leave ScoreKeeper; Directions
 * then hands over to the phone's maps app. Copy address uses the browser's clipboard on web; on a
 * phone it is the share sheet, which offers Copy along with the apps the address can go to — the
 * app has no clipboard library, and the share sheet needs none.
 *
 * With facilities it opens zoomed to fit them all, and leaves the card's height clear of them.
 */
export function MapPage({ backLabel, onBack, context, isLoading, emptyText, name, address, facilities = NO_FACILITIES, sports = [] }: MapPageProps) {
  const isDark = useActiveTheme() === 'dark';
  const [cardHeight, setCardHeight] = useState(0);
  const [focus, setFocus] = useState<{ id: string; latitude: number; longitude: number; nonce: number } | null>(null);

  const pin = hasPin(address) ? address : null;
  const markers = useMemo(() => facilityMarkers(facilities, sports, isDark), [facilities, sports, isDark]);
  // Without a pin for the place itself, the map centres on its first marked facility and draws no pin.
  const centre = pin || markers[0] || null;
  const oneLine = address?.fullAddress || '';

  const goTo = (f: Facility) => {
    if (f.latitude == null || f.longitude == null) return;
    setFocus(prev => ({ id: f.id, latitude: f.latitude!, longitude: f.longitude!, nonce: (prev?.nonce || 0) + 1 }));
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader title="Map" context={context} backLabel={backLabel} onBack={onBack} />
      {isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={themeColor(isDark, 'primary')} /></View>
      ) : emptyText ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="font-inter text-sm text-ink-muted text-center">{emptyText}</Text>
        </View>
      ) : (
        <View className="flex-1">
          {centre ? (
            <View className="flex-1">
              <AddressMap
                latitude={centre.latitude}
                longitude={centre.longitude}
                title={name}
                height="100%"
                markers={markers}
                hidePin={!pin}
                fitToMarkers={markers.length > 0}
                insetBottom={cardHeight}
                focus={focus}
              />
            </View>
          ) : (
            <View className="flex-1 items-center justify-center p-6">
              <Text className="font-inter text-sm text-ink-muted text-center">This address has no pin on the map.</Text>
            </View>
          )}
          <View
            onLayout={e => setCardHeight(Math.round(e.nativeEvent.layout.height) + 16)}
            className="absolute left-3 right-3 bottom-4 rounded-2xl bg-card border border-line p-4 gap-3 self-center w-full"
            style={{ maxWidth: 560 }}
          >
            <View className="gap-1">
              <Text className="font-inter-bold text-base text-ink">{name}</Text>
              <AddressLines address={address} muted />
            </View>
            {facilities.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {facilities.map(f => {
                  const placed = f.latitude != null && f.longitude != null;
                  const selected = focus?.id === f.id;
                  return (
                    <TouchableOpacity
                      key={f.id}
                      onPress={() => goTo(f)}
                      disabled={!placed}
                      accessibilityRole="button"
                      accessibilityLabel={placed ? `Show ${f.name} on the map` : `${f.name}, not on the map`}
                      className={`flex-row items-center gap-1.5 rounded-full border pl-1 pr-2.5 py-0.5 ${selected ? 'border-primary bg-primary-soft' : 'border-line'}`}
                    >
                      <FacilityIcon facility={f} sports={sports} size={18} dim={!placed} />
                      <Text className={`font-inter text-xs ${placed ? 'text-ink-soft' : 'text-ink-muted'}`}>{f.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}
            {pin || oneLine ? (
              <View className="flex-row gap-2">
                <ActionButton icon="navigate" label="Directions" onPress={() => openDirectionsTo(pin, oneLine)} primary />
                {oneLine ? (
                  <ActionButton icon={Platform.OS === 'web' ? 'copy-outline' : 'share-outline'} label="Copy address" onPress={() => copyText(oneLine, 'The address')} />
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const NO_FACILITIES: Facility[] = [];

function ActionButton({ icon, label, onPress, primary }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; primary?: boolean }) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      className={`flex-1 flex-row items-center justify-center gap-2 min-h-[44px] rounded-xl border ${
        primary ? 'bg-primary border-primary' : 'border-line'
      }`}
    >
      <Ionicons name={icon} size={16} color={themeColor(isDark, primary ? 'on-primary' : 'primary')} />
      <Text className={`font-inter-bold text-sm ${primary ? 'text-on-primary' : 'text-ink-soft'}`}>{label}</Text>
    </TouchableOpacity>
  );
}
