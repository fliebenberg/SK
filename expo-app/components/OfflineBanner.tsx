import React from 'react';
import { View, Text } from 'react-native';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useActiveTheme } from '../store/settingsStore';
import { themeColor } from '../constants/Colors';
export function OfflineBanner() {
  const isDark = useActiveTheme() === 'dark';
  const { isOffline, showOnlineAlert } = useOfflineStatus();

  if (!isOffline && !showOnlineAlert) {
    return null;
  }

  const isBackOnline = showOnlineAlert && !isOffline;
  const bannerBgClass = isBackOnline ? 'bg-success' : 'bg-warning';
  const iconName = isBackOnline ? 'wifi' : 'wifi-outline';
  const message = isBackOnline ? 'Back online' : 'No connection. Operating offline.';

  return (
    <SafeAreaView 
      edges={['top']} 
      className={`${bannerBgClass} z-[9999]`}
    >
      <View className="flex-row items-center justify-center py-2 px-4 space-x-2">
        <Ionicons name={iconName as any} size={16} color={themeColor(isDark, 'on-warning')} />
        <Text className="text-on-warning text-xs font-semibold tracking-wide text-center">
          {message}
        </Text>
      </View>
    </SafeAreaView>
  );
}
