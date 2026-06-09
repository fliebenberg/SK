import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme, useSettingsStore } from '../store/settingsStore';

interface ResponsiveHeaderProps {
  currentPath?: string; // 'index' | 'settings' or undefined
  showNav?: boolean;
}

export function ResponsiveHeader({ currentPath, showNav = false }: ResponsiveHeaderProps) {
  const router = useRouter();
  const activeTheme = useActiveTheme();
  const setLocalOverride = useSettingsStore(state => state.setLocalOverride);
  const isDark = activeTheme === 'dark';
  const { width } = useWindowDimensions();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isLargeScreen = mounted && width >= 768;

  const toggleTheme = () => {
    setLocalOverride('theme', isDark ? 'light' : 'dark');
  };

  // Hide topbar completely on all mobile / small screen views
  if (!isLargeScreen) {
    return null;
  }

  return (
    <View className="flex-row justify-between items-center px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white/70 dark:bg-slate-950/70 backdrop-blur-md z-50">
      <TouchableOpacity 
        onPress={() => router.push('/')}
        className="flex-row items-center gap-2 active:opacity-80"
      >
        {/* Extruded SK Logo Container */}
        <View className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-brand-orange shadow-sm dark:shadow-brand-orange/20 flex items-center justify-center">
          <Text className="font-orbitron-bold text-base text-brand-orange mt-0.5">SK</Text>
        </View>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white">
          SCOREKEEPER
        </Text>
      </TouchableOpacity>
      
      {/* Responsive Navigation Links (only for large screens) */}
      {isLargeScreen && showNav && (
        <View className="flex-row items-center gap-8 ml-8">
          <TouchableOpacity 
            onPress={() => router.push('/(tabs)')}
            className="py-1"
          >
            <Text className={`font-orbitron-bold text-xs tracking-widest ${
              currentPath === 'index' 
                ? 'text-brand-orange' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}>
              LIVE FEED
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => router.push('/(tabs)/settings')}
            className="py-1"
          >
            <Text className={`font-orbitron-bold text-xs tracking-widest ${
              currentPath === 'settings' 
                ? 'text-brand-orange' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}>
              SETTINGS
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View className="flex-row items-center gap-4">
        {/* Theme Toggle Button */}
        <TouchableOpacity 
          onPress={toggleTheme}
          className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 items-center justify-center active:opacity-80"
          accessibilityLabel="Toggle Theme"
        >
          <Ionicons 
            name={isDark ? "sunny" : "moon"} 
            size={18} 
            color={isDark ? "#00E5FF" : "#FF3E00"} 
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}
