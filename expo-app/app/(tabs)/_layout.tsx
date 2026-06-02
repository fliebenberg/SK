import { Tabs, useRouter } from 'expo-router';
import { useActiveTheme } from '../../store/settingsStore';
import { Ionicons } from '@expo/vector-icons';
import { useWindowDimensions, View, TouchableOpacity, Text } from 'react-native';
import { LeftNavigationRail } from '../../components/LeftNavigationRail';
import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';

export default function TabLayout() {
  const router = useRouter();
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const [menuVisible, setMenuVisible] = useState(false);
  const { user, isAuthenticated } = useAuthStore();

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
        name="admin/[orgId]" 
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
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "settings" : "settings-outline"} size={22} color={color} />
          )
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
