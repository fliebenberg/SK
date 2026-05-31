import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform, Image } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { API_BASE_URL } from '../services/api';

export function LeftNavigationRail() {
  const router = useRouter();
  const segments = useSegments();
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const { user, isAuthenticated } = useAuthStore();

  // Determine if Admin Portal option should be displayed
  const showAdminPortal = isAuthenticated && (user?.globalRole === 'admin' || user?.isAdminOrCoach);

  // Extract current tab name based on active segment: segments = ["(tabs)", "organizations"]
  const activeTab = segments[0] === '(tabs)' 
    ? (segments[1] || 'index') 
    : (segments[0] === 'landing' ? 'index' : (segments[0] === 'admin' ? 'admin' : ''));

  const navItems = [];
  
  if (showAdminPortal) {
    navItems.push({ name: 'admin', label: 'Admin Portal', icon: 'shield-checkmark' as const });
  }

  navItems.push(
    { name: 'index', label: 'Live Feed', icon: 'pulse' as const },
    { name: 'organizations', label: 'Organizations', icon: 'business' as const },
    { name: 'teams', label: 'Teams', icon: 'people' as const },
    { name: 'sites', label: 'Sites', icon: 'map' as const },
    { name: 'settings', label: 'Settings', icon: 'settings' as const },
  );

  const getInitials = (userName: string) => {
    if (!userName) return "U";
    return userName
      .split(" ")
      .map((part) => part[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  const getAvatarUri = () => {
    if (!user) return null;
    if (user.avatarSource === "custom" && user.customImage) {
      return `${API_BASE_URL}/uploads/profiles/${user.customImage}_medium.webp`;
    }
    if (user.picture) return user.picture;
    return null;
  };

  return (
    <View className="w-64 h-full border-r bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 py-6 px-4 flex flex-col justify-between z-40">
      <View className="flex-1">
        {/* BRAND LOGO AND NAME */}
        <TouchableOpacity 
          onPress={() => router.push('/')}
          className="flex-row items-center gap-3 px-2 mb-8 active:opacity-85"
        >
          <View className="w-9 h-9 rounded-xl bg-white dark:bg-slate-950 border border-brand-orange shadow-md dark:shadow-brand-orange/20 flex items-center justify-center">
            <Text className="font-orbitron-bold text-lg text-brand-orange mt-0.5">SK</Text>
          </View>
          <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white mt-1">
            SCOREKEEPER
          </Text>
        </TouchableOpacity>

        {/* NAVIGATION LINKS */}
        <ScrollView className="flex-1 space-y-1.5" showsVerticalScrollIndicator={false}>
          {navItems.map((item) => {
            const isActive = activeTab === item.name;
            return (
              <TouchableOpacity
                key={item.name}
                onPress={() => router.push((item.name === 'index' ? '/' : `/${item.name}`) as any)}
                className={`flex-row items-center gap-3.5 px-3 py-3 rounded-xl transition-all ${
                  isActive 
                    ? 'bg-brand-orange/10 dark:bg-brand-orange/15 border-l-4 border-brand-orange'
                    : 'hover:bg-slate-100 dark:hover:bg-white/5 border-l-4 border-transparent'
                }`}
              >
                <Ionicons 
                  name={isActive ? item.icon : (`${item.icon}-outline` as any)} 
                  size={20} 
                  color={isActive ? '#FF3E00' : (isDark ? '#94A3B8' : '#64748B')} 
                />
                <Text 
                  className={`font-inter-bold text-sm tracking-wide ${
                    isActive 
                      ? 'text-brand-orange' 
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* USER PROFILE / LOGIN SECTION */}
      <View className="pt-4 border-t border-slate-200 dark:border-white/5">
        {isAuthenticated && user ? (
          <TouchableOpacity
            onPress={() => router.push('/settings' as any)}
            className="flex-row items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 active:opacity-85"
          >
            <View className="w-10 h-10 rounded-full border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-800 items-center justify-center overflow-hidden flex-shrink-0">
              {getAvatarUri() ? (
                <Image
                  source={{ uri: getAvatarUri()! }}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Text className="font-orbitron-bold text-sm text-slate-700 dark:text-slate-200">
                  {getInitials(user.name)}
                </Text>
              )}
            </View>
            <View className="flex-1 min-w-0">
              <Text className="font-inter-bold text-sm text-slate-800 dark:text-white truncate">
                {user.name}
              </Text>
              <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-0.5">
                {user.globalRole === 'admin' ? 'System Admin' : (user.isAdminOrCoach ? 'Coach/Admin' : 'Member')}
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => router.push('/(auth)/login' as any)}
            className="flex-row items-center justify-center gap-2 py-3 bg-brand-orange/10 dark:bg-brand-orange/20 border border-brand-orange/20 rounded-xl hover:bg-brand-orange/15 active:opacity-85"
          >
            <Ionicons name="log-in-outline" size={16} color="#FF3E00" />
            <Text className="font-inter-bold text-xs text-brand-orange uppercase tracking-wider">
              Log In / Sign Up
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

