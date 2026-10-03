import { Tabs, useRouter, useSegments } from 'expo-router';
import { useActiveTheme } from '../../store/settingsStore';
import { Ionicons } from '@expo/vector-icons';
import { useWindowDimensions, View, TouchableOpacity, Text } from 'react-native';
import { LeftNavigationRail } from '../../components/LeftNavigationRail';
import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { BottomMenu } from '../../components/BottomMenu';
import { themeColor } from '../../constants/Colors';


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

  const showAdminPortal = isAuthenticated && user?.globalRole === 'admin';
  
  const shouldHideTabBar = (segments as string[]).includes('[siteId]');

  const content = (
    <Tabs 
      tabBar={() => !isLargeScreen && !shouldHideTabBar ? (
        <BottomMenu 
          onSettingsPress={() => {
            if (showAdminPortal) {
              setMenuVisible(!menuVisible);
            } else {
              router.push('/(tabs)/settings');
            }
          }}
        />
      ) : null}
      screenOptions={{
        headerShown: !isLargeScreen, // Left rail handles navigation and branding on desktop
        tabBarActiveTintColor: themeColor(isDark, 'primary'),
        tabBarInactiveTintColor: themeColor(isDark, 'ink-muted'),
        headerStyle: {
          backgroundColor: themeColor(isDark, 'card'),
          borderBottomColor: themeColor(isDark, 'line'),
          shadowOpacity: 0,
          elevation: 0,
        },
        headerTitleStyle: {
          color: themeColor(isDark, 'ink'),
          fontFamily: 'Orbitron_700Bold',
          fontSize: 16,
        },
        headerTintColor: themeColor(isDark, 'ink'),
      }}
    >
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
          // @ts-ignore
          unmountOnBlur: true,
        }} 
      />
      {/* My Family (`MEMBER-3`). Reached from the bottom menu and the rail, which show it only to a
          guardian; the tab bar itself is `BottomMenu`, so no tab button needs hiding here. */}
      <Tabs.Screen
        name="family"
        options={{
          headerTitle: 'MY FAMILY',
          tabBarLabel: 'Family',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "heart" : "heart-outline"} size={22} color={color} />
          )
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
          headerTitle: 'SITES & FACILITIES',
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
            <Ionicons name={isSettingsActive ? "settings" : "settings-outline"} size={22} color={isSettingsActive ? themeColor(isDark, 'primary') : (themeColor(isDark, 'ink-muted'))} />
          ),
          tabBarLabelStyle: {
            color: isSettingsActive ? themeColor(isDark, 'primary') : (themeColor(isDark, 'ink-muted'))
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

  const mainView = (
    <View className="flex-grow h-full bg-canvas">
      {content}
      
      {/* Dynamic Popover Overlay Selector */}
      {menuVisible && showAdminPortal && (
        <>
          {/* Backdrop Dimming Button */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setMenuVisible(false)}
            className="absolute inset-0 bg-overlay/40 z-40"
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
                activeOpacity={0.8}
                className="bg-primary border border-primary-line rounded-xl px-4 py-3.5 flex-row items-center gap-3 shadow-lg shadow-primary/35"
              >
                <View className="w-7 h-7 rounded-lg bg-on-fill/20 items-center justify-center">
                  <Ionicons name="shield-checkmark" size={14} color="white" />
                </View>
                <Text className="font-orbitron-bold text-[10px] text-on-fill uppercase tracking-widest mt-0.5">
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
              activeOpacity={0.8}
              className="bg-card border border-line rounded-xl px-4 py-3.5 flex-row items-center gap-3 shadow-lg"
            >
              <View className="w-7 h-7 rounded-lg bg-sunken items-center justify-center">
                <Ionicons name="person-outline" size={14} color={isDark ? themeColor(isDark, 'primary') : themeColor(isDark, 'ink-muted')} />
              </View>
              <Text className="font-orbitron-bold text-[10px] text-ink uppercase tracking-widest mt-0.5">
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
      <View className="flex-1 flex-row bg-canvas">
        <LeftNavigationRail />
        {mainView}
      </View>
    );
  }

  return mainView;
}
