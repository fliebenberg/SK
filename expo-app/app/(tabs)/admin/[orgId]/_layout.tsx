import React from 'react';
import { Stack } from 'expo-router';
import { useActiveTheme } from '../../../../store/settingsStore';

export default function OrgAdminLayout() {
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
          fontSize: 13,
        },
        headerTintColor: '#FF3E00', // Burnt Orange highlights
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: 'ORG PROFILE SETTINGS' }} />
      <Stack.Screen name="people" options={{ title: 'MANAGE PEOPLE & ROLES' }} />
      <Stack.Screen name="teams" options={{ title: 'MANAGE TEAMS' }} />
      <Stack.Screen name="sites" options={{ title: 'MANAGE FACILITIES' }} />
      <Stack.Screen name="events" options={{ title: 'MANAGE FIXTURES' }} />
    </Stack>
  );
}
