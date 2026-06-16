import React from 'react';
import { Stack } from 'expo-router';
import { useActiveTheme } from '../../../../store/settingsStore';

export default function OrgAdminLayout() {
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="people" />
      <Stack.Screen name="teams" />
      <Stack.Screen name="sites" />
      <Stack.Screen name="sites/[siteId]" />
      <Stack.Screen name="sites/[siteId]/facilities/[facilityId]" />
      <Stack.Screen name="events" />
    </Stack>
  );
}
