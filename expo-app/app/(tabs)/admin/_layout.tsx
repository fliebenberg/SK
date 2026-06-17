import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useActiveTheme } from '../../../store/settingsStore';
import { useAuthStore } from '../../../store/authStore';

export default function AdminLayout() {
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const user = useAuthStore(state => state.user);
  const router = useRouter();

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

  return (
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
      <Stack.Screen name="reports" options={{ title: 'SYSTEM AUDITS' }} />
      <Stack.Screen name="users" options={{ title: 'USER MANAGEMENT' }} />
      <Stack.Screen name="sports/index" options={{ title: 'SPORT MANAGEMENT' }} />
      <Stack.Screen name="sports/[sportId]" options={{ title: 'EDIT SPORT' }} />
      <Stack.Screen name="[orgId]" options={{ headerShown: false }} />
    </Stack>
  );
}
