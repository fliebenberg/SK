import { Tabs, useRouter, useSegments, useGlobalSearchParams } from 'expo-router';
import { useActiveTheme } from '../../store/settingsStore';
import { Ionicons } from '@expo/vector-icons';
import { useWindowDimensions, View, TouchableOpacity, Text, Image } from 'react-native';
import { LeftNavigationRail } from '../../components/LeftNavigationRail';
import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/authStore';
import { wsService } from '../../services/websocket';
import { useWsStore } from '../../store/wsStore';
import { getOrgLogoUrl } from '../../services/api';
import { OrgLogo } from '../../components/OrgLogo';

export default function TabLayout() {
  const router = useRouter();
  const segments = useSegments();
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const isSettingsActive = segments[1] === 'settings' || segments[1] === 'admin';
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const [menuVisible, setMenuVisible] = useState(false);
  const { user, isAuthenticated } = useAuthStore();
  const isConnected = useWsStore(state => state.isConnected);

  // Phase 2: Mobile Workspace Navigation
  const { orgId } = useGlobalSearchParams<{ orgId?: string }>();
  const [orgData, setOrgData] = useState<any>(null);
  const [workspaceMenuVisible, setWorkspaceMenuVisible] = useState(false);
  const lastFetchedId = useRef<string | null>(null);

  const isOrgAdmin = segments[0] === '(tabs)' && segments[1] === 'admin' && segments[2] === '[orgId]';

  useEffect(() => {
    if (!isConnected || !orgId || !isOrgAdmin) {
      setOrgData(null);
      lastFetchedId.current = null;
      setWorkspaceMenuVisible(false);
      return;
    }

    if (lastFetchedId.current !== orgId) {
      wsService.emit('get_data', { type: 'organization', id: orgId }, (res: any) => {
        if (res && !res.error) {
          setOrgData(res);
          lastFetchedId.current = orgId;
        }
      });
    }

    const room = `org:${orgId}:summary`;
    const unsubscribe = wsService.subscribeToRoom(room);

    const handleUpdate = (event: any) => {
      if (event && event.type === 'ORGANIZATION_UPDATED') {
        if (event.data && event.data.id === orgId) {
          setOrgData((prev: any) => prev ? { ...prev, ...event.data } : event.data);
        }
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      unsubscribe();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId, isOrgAdmin]);

  const showAdminPortal = isAuthenticated && user?.globalRole === 'admin';
  
  const content = (
    <Tabs screenOptions={{
      headerShown: !isLargeScreen, // Left rail handles navigation and branding on desktop
      tabBarStyle: {
        display: isLargeScreen ? 'none' : 'flex',
        backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
        borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
        height: 60,
        paddingBottom: 8,
        paddingTop: 8,
      },
      tabBarActiveTintColor: '#FF3E00',
      tabBarInactiveTintColor: isDark ? '#94A3B8' : '#64748B',
      headerStyle: {
        backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
        borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
        shadowOpacity: 0,
        elevation: 0,
      },
      headerTitleStyle: {
        color: isDark ? '#FFFFFF' : '#0F172A',
        fontFamily: 'Orbitron_700Bold',
        fontSize: 16,
      },
      headerTintColor: isDark ? '#FFFFFF' : '#0F172A',
    }}>
      <Tabs.Screen 
        name="index" 
        options={{ 
          headerTitle: 'LIVE FEED',
          tabBarLabel: 'Live',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "pulse" : "pulse-outline"} size={22} color={color} />
          )
        }} 
      />
      <Tabs.Screen 
        name="organizations" 
        options={{ 
          headerTitle: 'ORGANIZATIONS',
          tabBarLabel: 'Orgs',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "business" : "business-outline"} size={22} color={color} />
          )
        }} 
      />

      <Tabs.Screen 
        name="admin" 
        options={{ 
          href: null,
          headerShown: false,
        }} 
      />
      <Tabs.Screen 
        name="teams" 
        options={{ 
          headerTitle: 'TEAMS DIRECTORY',
          tabBarLabel: 'Teams',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "people" : "people-outline"} size={22} color={color} />
          )
        }} 
      />
      <Tabs.Screen 
        name="sites" 
        options={{ 
          headerTitle: 'SITES & VENUES',
          tabBarLabel: 'Sites',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "map" : "map-outline"} size={22} color={color} />
          )
        }} 
      />
      <Tabs.Screen 
        name="settings" 
        options={{ 
          headerTitle: 'ACCOUNT SETTINGS',
          tabBarLabel: 'Settings',
          tabBarIcon: () => (
            <Ionicons name={isSettingsActive ? "settings" : "settings-outline"} size={22} color={isSettingsActive ? '#FF3E00' : (isDark ? '#94A3B8' : '#64748B')} />
          ),
          tabBarLabelStyle: {
            color: isSettingsActive ? '#FF3E00' : (isDark ? '#94A3B8' : '#64748B')
          }
        }} 
        listeners={() => ({
          tabPress: (e) => {
            if (showAdminPortal) {
              e.preventDefault();
              setMenuVisible(!menuVisible);
            }
          }
        })}
      />
    </Tabs>
  );

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

  const mainView = (
    <View className="flex-grow h-full bg-slate-50 dark:bg-slate-950">
      {content}
      
      {/* Dynamic Popover Overlay Selector */}
      {menuVisible && showAdminPortal && (
        <>
          {/* Backdrop Dimming Button */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setMenuVisible(false)}
            className="absolute inset-0 bg-slate-950/40 dark:bg-slate-950/60 z-40"
          />

          {/* Vertical Stack Menu floating above Settings bottom tab icon */}
          <View className="absolute bottom-[75px] right-4 z-50 w-52 gap-2.5">
            {/* Launch Admin Portal card */}
            {showAdminPortal && (
              <TouchableOpacity
                onPress={() => {
                  setMenuVisible(false);
                  router.push('/admin' as any);
                }}
                className="bg-brand-orange border border-brand-orange/30 rounded-xl px-4 py-3.5 flex-row items-center gap-3 shadow-lg shadow-brand-orange/35 active:scale-95"
              >
                <View className="w-7 h-7 rounded-lg bg-white/20 items-center justify-center">
                  <Ionicons name="shield-checkmark" size={14} color="white" />
                </View>
                <Text className="font-orbitron-bold text-[10px] text-white uppercase tracking-widest mt-0.5">
                  Admin Portal
                </Text>
              </TouchableOpacity>
            )}

            {/* Launch Account Settings card */}
            <TouchableOpacity
              onPress={() => {
                setMenuVisible(false);
                router.push('/settings' as any);
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3.5 flex-row items-center gap-3 shadow-lg active:scale-95"
            >
              <View className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 items-center justify-center">
                <Ionicons name="person-outline" size={14} color={isDark ? "#FF3E00" : "#64748B"} />
              </View>
              <Text className="font-orbitron-bold text-[10px] text-slate-800 dark:text-white uppercase tracking-widest mt-0.5">
                My Account
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Floating Workspace Hub Button (Mobile Only) */}
      {!isLargeScreen && isOrgAdmin && orgId && (
        <TouchableOpacity
          onPress={() => setWorkspaceMenuVisible(!workspaceMenuVisible)}
          className="absolute bottom-[75px] right-4 w-12 h-12 rounded-full items-center justify-center shadow-lg z-50 border overflow-hidden active:scale-95"
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

      {/* Workspace Menu Overlay */}
      {workspaceMenuVisible && isOrgAdmin && orgId && (
        <>
          {/* Backdrop Dimming */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setWorkspaceMenuVisible(false)}
            className="absolute inset-0 bg-slate-950/40 dark:bg-slate-950/60 z-40"
          />

          {/* Workspace Action Menu Sheet floating above FAB */}
          <View className="absolute bottom-[140px] right-4 z-50 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl shadow-xl overflow-hidden p-2.5">
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
                  {/* Fallback color glow */}
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
                      className="font-orbitron-bold text-xs uppercase leading-tight truncate"
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
                { label: 'Facilities & Courts', icon: 'location', route: `/admin/${orgId}/sites` },
                { label: 'Fixtures & Events', icon: 'calendar', route: `/admin/${orgId}/events` },
              ].map((item) => (
                <TouchableOpacity
                  key={item.route}
                  onPress={() => {
                    setWorkspaceMenuVisible(false);
                    router.push(item.route as any);
                  }}
                  className="flex-row items-center gap-3 px-3 py-2 rounded-lg active:bg-slate-100 dark:active:bg-white/5"
                >
                  <Ionicons name={`${item.icon}-outline` as any} size={16} color={isDark ? '#94A3B8' : '#64748B'} />
                  <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-200">
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}

              <View className="h-[1px] bg-slate-100 dark:bg-white/5 my-1" />

              {/* Exit Workspace */}
              <TouchableOpacity
                onPress={() => {
                  setWorkspaceMenuVisible(false);
                  router.push('/(tabs)/organizations' as any);
                }}
                className="flex-row items-center gap-3 px-3 py-2 rounded-lg active:bg-red-50 dark:active:bg-red-950/25"
              >
                <Ionicons name="arrow-back-outline" size={16} color="#EF4444" />
                <Text className="font-inter-bold text-xs text-red-500">
                  Exit Workspace
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </View>
  );

  if (isLargeScreen) {
    return (
      <View className="flex-1 flex-row bg-slate-50 dark:bg-slate-950">
        <LeftNavigationRail />
        {mainView}
      </View>
    );
  }

  return mainView;
}
