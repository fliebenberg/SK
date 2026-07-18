import React from 'react';
import { View, Text } from 'react-native';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export function OfflineBanner() {
  const { isOffline, showOnlineAlert } = useOfflineStatus();

  if (!isOffline && !showOnlineAlert) {
    return null;
  }

  const isBackOnline = showOnlineAlert && !isOffline;
  const bannerBgClass = isBackOnline ? 'bg-emerald-600' : 'bg-amber-600';
  const iconName = isBackOnline ? 'wifi' : 'wifi-outline';
  const message = isBackOnline ? 'Back online' : 'No connection. Operating offline.';

  return (
    <SafeAreaView 
      edges={['top']} 
      className={`${bannerBgClass} z-[9999]`}
    >
      <View className="flex-row items-center justify-center py-2 px-4 space-x-2">
        <Ionicons name={iconName as any} size={16} color="#FFFFFF" />
        <Text className="text-white text-xs font-semibold tracking-wide text-center">
          {message}
        </Text>
      </View>
    </SafeAreaView>
  );
}
