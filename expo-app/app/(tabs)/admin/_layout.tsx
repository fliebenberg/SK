import React from 'react';
import { Stack } from 'expo-router';
import { useActiveTheme } from '../../../store/settingsStore';
import { AuthGuard } from '../../../components/AuthGuard';

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
    </Stack>
  );
}
