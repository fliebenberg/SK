import React from 'react';
import { Stack } from 'expo-router';
import { useActiveTheme } from '../../store/settingsStore';

export default function AdminLayout() {
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';

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
      <Stack.Screen name="organizations" options={{ title: 'MANAGE ORGANIZATIONS' }} />
    </Stack>
  );
}
