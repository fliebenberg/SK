import React from 'react';
import { ActivityIndicator, Linking, Platform, Share, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AddressMap } from '../../../components/address/AddressMap';
import { AddressLines } from '../../../components/address/AddressInput';
import { useOrgSummary } from '../../../hooks/useOrgSummary';
import { useSafeBack } from '../../../hooks/useSafeBack';
import { hasPin } from '../../../services/places';
import { useToastStore } from '../../../store/toastStore';
import { COLORS } from '../../../constants/Colors';

/**
 * The org's address on a map, opened from the map on its Profile (docs/org-profile.md §3).
 *
 * Inside the app first, so looking at where something is does not leave ScoreKeeper; Directions
 * then hands over to the phone's maps app. Copy address uses the browser's clipboard on web; on a
 * phone it is the share sheet, which offers Copy along with the apps the address can go to — the
 * app has no clipboard library, and the share sheet needs none.
 */
export default function OrgAddressMap() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const safeBack = useSafeBack();
  const { org, isLoading } = useOrgSummary(orgId);
  const address = org?.address || null;
  const pin = hasPin(address) ? address : null;
  const oneLine = address?.fullAddress || '';

  const openDirections = () => {
    const destination = pin ? `${pin.latitude},${pin.longitude}` : oneLine;
    const url = Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${encodeURIComponent(destination)}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
    Linking.openURL(url).catch(() => useToastStore.getState().showError('No maps app could open the address.', 'Directions'));
  };

  const copyAddress = async () => {
    if (Platform.OS === 'web') {
      try {
        await (navigator as any).clipboard.writeText(oneLine);
        useToastStore.getState().showSuccess('The address is on your clipboard.', 'Copied');
      } catch {
        useToastStore.getState().showError('The browser would not allow copying. Select the address and copy it instead.', 'Not Copied');
      }
      return;
    }
    Share.share({ message: oneLine }).catch(() => {});
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      <ScreenHeader title="Map" backLabel="Profile" onBack={() => safeBack(`/admin/${orgId}/profile`)} />
      {isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={COLORS.brand.orange} /></View>
      ) : !address ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="font-inter text-sm text-slate-500 dark:text-slate-400 text-center">This organisation has no address yet.</Text>
        </View>
      ) : (
        <View className="flex-1">
          {pin ? (
            <View className="flex-1">
              <AddressMap latitude={pin.latitude} longitude={pin.longitude} title={org?.name} height="100%" />
            </View>
          ) : (
            <View className="flex-1 items-center justify-center p-6">
              <Text className="font-inter text-sm text-slate-500 dark:text-slate-400 text-center">This address has no pin on the map.</Text>
            </View>
          )}
          <View className="absolute left-3 right-3 bottom-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-4 gap-3 self-center w-full" style={{ maxWidth: 560 }}>
            <View className="gap-1">
              <Text className="font-inter-bold text-base text-slate-900 dark:text-white">{org?.name}</Text>
              <AddressLines address={address} muted />
            </View>
            <View className="flex-row gap-2">
              <ActionButton icon="navigate" label="Directions" onPress={openDirections} primary />
              <ActionButton icon={Platform.OS === 'web' ? 'copy-outline' : 'share-outline'} label="Copy address" onPress={copyAddress} />
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function ActionButton({ icon, label, onPress, primary }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      className={`flex-1 flex-row items-center justify-center gap-2 min-h-[44px] rounded-xl border ${
        primary ? 'bg-brand-orange border-brand-orange' : 'border-slate-200 dark:border-white/10'
      }`}
    >
      <Ionicons name={icon} size={16} color={primary ? 'white' : COLORS.brand.orange} />
      <Text className={`font-inter-bold text-sm ${primary ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>{label}</Text>
    </TouchableOpacity>
  );
}
