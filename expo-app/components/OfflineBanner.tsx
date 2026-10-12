import React from 'react';
import { View, Text } from 'react-native';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useActiveTheme } from '../store/settingsStore';
import { themeColor } from '../constants/Colors';
import { useWaitingResultCount } from '../services/resultQueue';
export function OfflineBanner() {
  const isDark = useActiveTheme() === 'dark';
  const { isOffline, showOnlineAlert } = useOfflineStatus();
  const waiting = useWaitingResultCount();

  if (!isOffline && !showOnlineAlert) {
    return null;
  }

  const isBackOnline = showOnlineAlert && !isOffline;
  const bannerBgClass = isBackOnline ? 'bg-success' : 'bg-warning';
  const iconName = isBackOnline ? 'wifi' : 'wifi-outline';
  // Results entered offline (U20) are named, so nobody closes the app thinking they were sent.
  const queued = waiting ? ` ${waiting} ${waiting === 1 ? 'result' : 'results'} waiting to send.` : '';
  const message = isBackOnline ? `Back online.${waiting ? ' Sending results…' : ''}` : `No connection. Operating offline.${queued}`;

  return (
    <SafeAreaView 
      edges={['top']} 
      className={`${bannerBgClass} z-[9999]`}
    >
      <View className="flex-row items-center justify-center py-2 px-4 gap-2">
        <Ionicons name={iconName as any} size={16} color={themeColor(isDark, 'on-warning')} />
        <Text className="text-on-warning text-xs font-semibold tracking-wide text-center">
          {message}
        </Text>
      </View>
    </SafeAreaView>
  );
}
