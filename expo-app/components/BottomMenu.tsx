import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { useActiveTheme } from '../store/settingsStore';

interface BottomMenuProps {
  onSettingsPress?: () => void;
  confirmThenNavigate?: (action: () => void) => void;
}

export function BottomMenu({ onSettingsPress, confirmThenNavigate }: BottomMenuProps) {
  const router = useRouter();
  const segments = useSegments() as string[];
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';

  // Determine active tab based on router segments
  const getActiveTab = () => {
    // segments might look like: ["(tabs)", "index"] or ["admin", "[orgId]"]
    if (segments.includes('organizations') || segments.includes('admin')) {
      return 'orgs';
    }
    if (segments.includes('teams')) {
      return 'teams';
    }
    if (segments.includes('sites')) {
      return 'sites';
    }
    if (segments.includes('settings')) {
      return 'settings';
    }
    return 'live'; // Default to Live feed
  };

  const activeTab = getActiveTab();

  const handleNavigate = (route: string, tabName: string) => {
    const action = () => {
      if (tabName === 'settings' && onSettingsPress) {
        onSettingsPress();
      } else {
        router.push(route as any);
      }
    };

    if (confirmThenNavigate) {
      confirmThenNavigate(action);
    } else {
      action();
    }
  };

  const getIconColor = (tabName: string) => {
    if (activeTab === tabName) return '#FF3E00';
    return isDark ? '#94A3B8' : '#64748B';
  };

  const getTextColor = (tabName: string) => {
    if (activeTab === tabName) return '#FF3E00';
    return isDark ? '#94A3B8' : '#64748B';
  };

  return (
    <View 
      className="flex-row border-t h-[60px] pb-2 pt-2 items-center justify-around"
      style={{
        backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
        borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
      }}
    >
      <TouchableOpacity 
        onPress={() => handleNavigate('/(tabs)', 'live')}
        className="items-center justify-center flex-1"
      >
        <Ionicons 
          name={activeTab === 'live' ? "pulse" : "pulse-outline"} 
          size={22} 
          color={getIconColor('live')} 
        />
        <Text 
          style={{ fontSize: 10, color: getTextColor('live'), fontFamily: 'Orbitron_700Bold' }} 
          className="mt-1"
        >
          Live
        </Text>
      </TouchableOpacity>

      <TouchableOpacity 
        onPress={() => handleNavigate('/(tabs)/organizations', 'orgs')}
        className="items-center justify-center flex-1"
      >
        <Ionicons 
          name={activeTab === 'orgs' ? "business" : "business-outline"} 
          size={22} 
          color={getIconColor('orgs')} 
        />
        <Text 
          style={{ fontSize: 10, color: getTextColor('orgs'), fontFamily: 'Orbitron_700Bold' }} 
          className="mt-1"
        >
          Orgs
        </Text>
      </TouchableOpacity>

      <TouchableOpacity 
        onPress={() => handleNavigate('/(tabs)/teams', 'teams')}
        className="items-center justify-center flex-1"
      >
        <Ionicons 
          name={activeTab === 'teams' ? "people" : "people-outline"} 
          size={22} 
          color={getIconColor('teams')} 
        />
        <Text 
          style={{ fontSize: 10, color: getTextColor('teams'), fontFamily: 'Orbitron_700Bold' }} 
          className="mt-1"
        >
          Teams
        </Text>
      </TouchableOpacity>

      <TouchableOpacity 
        onPress={() => handleNavigate('/(tabs)/sites', 'sites')}
        className="items-center justify-center flex-1"
      >
        <Ionicons 
          name={activeTab === 'sites' ? "map" : "map-outline"} 
          size={22} 
          color={getIconColor('sites')} 
        />
        <Text 
          style={{ fontSize: 10, color: getTextColor('sites'), fontFamily: 'Orbitron_700Bold' }} 
          className="mt-1"
        >
          Sites
        </Text>
      </TouchableOpacity>

      <TouchableOpacity 
        onPress={() => handleNavigate('/(tabs)/settings', 'settings')}
        className="items-center justify-center flex-1"
      >
        <Ionicons 
          name={activeTab === 'settings' ? "settings" : "settings-outline"} 
          size={22} 
          color={getIconColor('settings')} 
        />
        <Text 
          style={{ fontSize: 10, color: getTextColor('settings'), fontFamily: 'Orbitron_700Bold' }} 
          className="mt-1"
        >
          Settings
        </Text>
      </TouchableOpacity>
    </View>
  );
}
