import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme, useSettingsStore } from '../store/settingsStore';
import { themeColor } from '../constants/Colors';


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
    <View className="flex-row justify-between items-center px-6 py-4 border-b border-line-soft bg-card/70 backdrop-blur-md z-50">
      <TouchableOpacity 
        onPress={() => router.push('/')}
        className="flex-row items-center gap-2 active:opacity-80"
      >
        {/* Extruded SK Logo Container */}
        <View className="w-8 h-8 rounded-lg bg-card border border-primary shadow-sm dark:shadow-primary/20 flex items-center justify-center">
          <Text className="font-orbitron-bold text-base text-primary-ink mt-0.5">SK</Text>
        </View>
        <Text className="font-orbitron-bold text-sm tracking-widest text-ink">
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
                ? 'text-primary-ink' 
                : 'text-ink-muted hover:text-ink'
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
                ? 'text-primary-ink' 
                : 'text-ink-muted hover:text-ink'
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
          className="w-10 h-10 rounded-full bg-sunken border border-line items-center justify-center active:opacity-80"
          accessibilityLabel="Toggle Theme"
        >
          <Ionicons 
            name={isDark ? "sunny" : "moon"} 
            size={18} 
            color={themeColor(isDark, isDark ? 'accent' : 'primary')} 
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}
