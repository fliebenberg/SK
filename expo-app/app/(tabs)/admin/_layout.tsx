import React from 'react';
import { Stack } from 'expo-router';
import { useActiveTheme } from '../../../store/settingsStore';
import { AuthGuard } from '../../../components/AuthGuard';
import { themeColor } from '../../../constants/Colors';

export default function AdminLayout() {
  return (
    <AuthGuard requireGlobalAdmin>
      <AdminPortalStack />
    </AuthGuard>
  );
}

function AdminPortalStack() {
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: themeColor(isDark, 'card'),
        },
        headerTitleStyle: {
          color: themeColor(isDark, 'ink'),
          fontFamily: 'Orbitron_700Bold',
          fontSize: 14,
        },
        headerTintColor: themeColor(isDark, 'primary'), // Highlight back button in Burnt Orange
      }}
    >
      <Stack.Screen name="index" options={{ title: 'ADMIN PORTAL' }} />
      <Stack.Screen name="reports" options={{ title: 'SYSTEM AUDITS' }} />
      <Stack.Screen name="users" options={{ title: 'USER MANAGEMENT' }} />
      <Stack.Screen name="sports/index" options={{ title: 'SPORT MANAGEMENT' }} />
      <Stack.Screen name="sports/[sportId]" options={{ title: 'EDIT SPORT' }} />
    </Stack>
  );
}
