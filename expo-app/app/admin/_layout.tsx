import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useActiveTheme } from '../../store/settingsStore';
import { useAuthStore } from '../../store/authStore';
import { useWindowDimensions, View } from 'react-native';
import { LeftNavigationRail } from '../../components/LeftNavigationRail';

export default function AdminLayout() {
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const user = useAuthStore(state => state.user);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/landing');
    } else if (user?.globalRole !== 'admin') {
      router.replace('/(tabs)/settings');
    }
  }, [isAuthenticated, user]);

  if (!isAuthenticated || user?.globalRole !== 'admin') {
    return null;
  }

  const stackContent = (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
        },
        headerTitleStyle: {
          color: isDark ? '#FFFFFF' : '#0F172A',
          fontFamily: 'Orbitron_700Bold',
          fontSize: 14,
        },
        headerTintColor: '#FF3E00', // Highlight back button in Burnt Orange
      }}
    >
      <Stack.Screen name="index" options={{ title: 'ADMIN PORTAL' }} />
      <Stack.Screen name="all-organizations" options={{ title: 'ALL ORGANIZATIONS' }} />
      <Stack.Screen name="reports" options={{ title: 'SYSTEM AUDITS' }} />
      <Stack.Screen name="[orgId]" options={{ headerShown: false }} />
    </Stack>
  );

  if (isLargeScreen) {
    return (
      <View className="flex-1 flex-row bg-slate-50 dark:bg-slate-950">
        <LeftNavigationRail />
        <View className="flex-grow h-full bg-slate-50 dark:bg-slate-950">
          {stackContent}
        </View>
      </View>
    );
  }

  return stackContent;
}

