import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';

export function LeftNavigationRail() {
  const router = useRouter();
  const segments = useSegments();
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';

  // Extract current tab name based on active segment: segments = ["(tabs)", "organizations"]
  const activeTab = segments[0] === '(tabs)' ? (segments[1] || 'index') : '';

  const navItems = [
    { name: 'index', label: 'Live Feed', icon: 'pulse' as const },
    { name: 'organizations', label: 'Organizations', icon: 'business' as const },
    { name: 'teams', label: 'Teams', icon: 'people' as const },
    { name: 'sites', label: 'Sites', icon: 'map' as const },
    { name: 'settings', label: 'Settings', icon: 'settings' as const },
  ];

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

      {/* ADMIN CONTROLS SECTION */}
      <View className="pt-4 border-t border-slate-200 dark:border-white/5">
        <TouchableOpacity
          onPress={() => router.push('/admin' as any)}
          className="flex-row items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 active:opacity-85"
        >
          <View className="w-8 h-8 rounded-lg bg-brand-orange/10 dark:bg-brand-orange/20 items-center justify-center flex-shrink-0">
            <Ionicons 
              name="shield-checkmark-outline" 
              size={16} 
              color="#FF3E00" 
            />
          </View>
          <View>
            <Text className="font-inter-bold text-xs text-slate-800 dark:text-white uppercase tracking-wider">
              Admin Portal
            </Text>
            <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500">
              Manage Orgs & fixtures
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}
