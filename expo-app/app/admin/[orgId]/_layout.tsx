import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Stack, useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import { useActiveTheme } from '../../../store/settingsStore';
import { useWindowDimensions, View, TouchableOpacity, Text, Alert } from 'react-native';
import { LeftNavigationRail } from '../../../components/LeftNavigationRail';
import { useAuthStore } from '../../../store/authStore';
import { wsService } from '../../../services/websocket';
import { useWsStore } from '../../../store/wsStore';
import { OrgLogo } from '../../../components/OrgLogo';
import { Ionicons } from '@expo/vector-icons';
import { useUnsavedChangesStore } from '../../../store/unsavedChangesStore';
import { BottomMenu } from '../../../components/BottomMenu';

export default function OrgAdminLayout() {
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const router = useRouter();
  const segments = useSegments();

  const { orgId } = useGlobalSearchParams<{ orgId?: string }>();
  const [orgData, setOrgData] = useState<any>(null);
  const [workspaceMenuVisible, setWorkspaceMenuVisible] = useState(false);
  const lastFetchedId = useRef<string | null>(null);
  const isConnected = useWsStore(state => state.isConnected);
  const { isDirty, onDiscard, clear, triggerDiscardPrompt } = useUnsavedChangesStore();

  const confirmThenNavigate = useCallback((action: () => void) => {
    setWorkspaceMenuVisible(false);
    triggerDiscardPrompt(action);
  }, [triggerDiscardPrompt]);

  useEffect(() => {
    if (!isConnected || !orgId) {
      setOrgData(null);
      lastFetchedId.current = null;
      setWorkspaceMenuVisible(false);
      return;
    }

    let active = true;

    if (lastFetchedId.current !== orgId) {
      wsService.emit('get_data', { type: 'organization', id: orgId }, (res: any) => {
        if (!active) return;
        if (res && !res.error) {
          setOrgData(res);
          lastFetchedId.current = orgId;
        }
      });
    }

    const room = `org:${orgId}:summary`;
    const unsubscribe = wsService.subscribeToRoom(room);

    const handleUpdate = (event: any) => {
      if (!active) return;
      if (event && event.type === 'ORGANIZATION_UPDATED') {
        if (event.data && event.data.id === orgId) {
          setOrgData((prev: any) => prev ? { ...prev, ...event.data } : event.data);
        }
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      active = false;
      unsubscribe();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId]);

  const getContrastColor = (hexColor: string) => {
    if (!hexColor) return '#FFFFFF';
    const color = hexColor.replace('#', '');
    if (color.length !== 6) return '#FFFFFF';
    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? '#0F172A' : '#FFFFFF';
  };

  const fabTextColor = orgData ? getContrastColor(orgData.primaryColor) : '#FFFFFF';

  const stackContent = (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="people" />
      <Stack.Screen name="people/[membershipId]" />
      <Stack.Screen name="people/[membershipId]/view" />
      <Stack.Screen name="teams" />
      <Stack.Screen name="teams/new" />
      <Stack.Screen name="teams/[teamId]" />
      <Stack.Screen name="teams/[teamId]/view" />
      <Stack.Screen name="sites" />
      <Stack.Screen name="sites/[siteId]" />
      <Stack.Screen name="sites/[siteId]/view" />
      <Stack.Screen name="sites/[siteId]/facilities/[facilityId]" />
      <Stack.Screen name="sites/[siteId]/facilities/[facilityId]/view" />
      <Stack.Screen name="events/index" />
      <Stack.Screen name="events/create" />
      <Stack.Screen name="events/[eventId]" />
    </Stack>
  );

  const mainView = (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950 relative">
      {stackContent}

      {/* Floating Workspace Hub Button (Mobile Only) - Positioned higher to clear the bottom menu */}
      {!isLargeScreen && orgId && (
        <TouchableOpacity
          onPress={() => setWorkspaceMenuVisible(!workspaceMenuVisible)}
          activeOpacity={0.8}
          className="absolute bottom-[75px] right-4 w-12 h-12 rounded-full items-center justify-center shadow-lg z-50 border overflow-hidden"
          style={{ 
            backgroundColor: orgData?.primaryColor || '#FF3E00',
            borderColor: orgData?.secondaryColor || '#00E5FF',
            borderWidth: 2,
          }}
        >
          {workspaceMenuVisible ? (
            <Ionicons name="close-outline" size={22} color={fabTextColor} />
          ) : (
            orgData?.logo ? (
              <OrgLogo logo={orgData.logo} settings={orgData.settings} size={44} />
            ) : (
              <Ionicons name="grid" size={22} color={fabTextColor} />
            )
          )}
        </TouchableOpacity>
      )}

      {/* Workspace Menu Overlay (Mobile Only) - Positioned higher to clear the bottom menu */}
      {workspaceMenuVisible && orgId && (
        <>
          {/* Backdrop Dimming */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setWorkspaceMenuVisible(false)}
            className="absolute inset-0 bg-slate-950/40 dark:bg-slate-950/60 z-40"
          />

          {/* Workspace Action Menu Sheet floating above FAB */}
          <View className="absolute bottom-[135px] right-4 z-50 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl shadow-lg overflow-hidden p-2.5">
            {/* Header section inside the menu */}
            {orgData && (
              <View className="mb-2.5">
                <Text className="font-inter-bold text-[8px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 px-1">
                  Active Workspace
                </Text>
                
                <View 
                  className="p-1.5 px-2.5 rounded-xl border flex-row items-center gap-2.5 relative overflow-hidden"
                  style={{ 
                    backgroundColor: orgData.primaryColor || '#FF3E00',
                    borderColor: orgData.secondaryColor || '#00E5FF',
                    borderWidth: 1.5,
                  }}
                >
                  <View 
                    className="absolute -right-8 -top-8 w-16 h-16 rounded-full blur-lg opacity-20"
                    style={{ backgroundColor: orgData.secondaryColor || '#00E5FF' }}
                  />

                  <View className="z-10 flex-shrink-0">
                    <OrgLogo 
                      logo={orgData.logo} 
                      settings={orgData.settings} 
                      size={32} 
                      className="bg-white/10 border border-white/20"
                      primaryColor="white"
                    />
                  </View>

                  <View className="flex-1 min-w-0 z-10 justify-center">
                    <Text 
                      numberOfLines={1}
                      className="font-orbitron-bold text-xs uppercase leading-tight"
                      style={{ color: fabTextColor }}
                    >
                      {orgData.shortName || orgData.name?.substring(0, 3) || 'ORG'}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* List of administration modules */}
            <View className="space-y-0.5">
              {[
                { label: 'Control Panel', icon: 'grid', route: `/admin/${orgId}` },
                { label: 'Org Settings', icon: 'settings', route: `/admin/${orgId}/settings` },
                { label: 'People & Roles', icon: 'people', route: `/admin/${orgId}/people` },
                { label: 'Teams & Divisions', icon: 'trophy', route: `/admin/${orgId}/teams` },
                { label: 'Sites and Facilities', icon: 'location', route: `/admin/${orgId}/sites` },
                { label: 'Fixtures & Events', icon: 'calendar', route: `/admin/${orgId}/events` },
                { label: 'Leagues & Seasons', icon: 'list', route: `/admin/${orgId}/leagues` },
              ].map((item) => (
                <TouchableOpacity
                  key={item.route}
                  onPress={() => {
                    confirmThenNavigate(() => router.push(item.route as any));
                  }}
                  activeOpacity={0.7}
                  className="flex-row items-center gap-3 px-3 py-2 rounded-lg"
                >
                  <Ionicons name={`${item.icon}-outline` as any} size={16} color={isDark ? '#94A3B8' : '#64748B'} />
                  <Text className="font-inter-bold text-sm text-slate-700 dark:text-slate-200">
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}

              <View className="h-[1px] bg-slate-100 dark:bg-white/5 my-1" />

              {/* Exit Workspace */}
              <TouchableOpacity
                onPress={() => {
                  confirmThenNavigate(() => router.replace('/(tabs)/organizations' as any));
                }}
                activeOpacity={0.7}
                className="flex-row items-center gap-3 px-3 py-2 rounded-lg"
              >
                <Ionicons name="arrow-back-outline" size={16} color="#EF4444" />
                <Text className="font-inter-bold text-sm text-red-500">
                  Exit Workspace
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {/* Bottom Menu (Mobile Only) */}
      {!isLargeScreen && (
        <BottomMenu confirmThenNavigate={confirmThenNavigate} />
      )}
    </View>
  );

  if (isLargeScreen) {
    return (
      <View className="flex-1 flex-row bg-slate-50 dark:bg-slate-950">
        <LeftNavigationRail />
        <View className="flex-1 h-full">
          {mainView}
        </View>
      </View>
    );
  }

  return mainView;
}
