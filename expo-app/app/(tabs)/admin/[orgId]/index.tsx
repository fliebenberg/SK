import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../../store/settingsStore';

export default function OrgControlDashboard() {
  const router = useRouter();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const isDark = useActiveTheme() === 'dark';

  // Mock organizations registry to resolve name & styling dynamically
  const orgRegistry: Record<string, { name: string; sport: string; primaryColor: string; teamsCount: number; facilitiesCount: number; membersCount: number }> = {
    'org-1': {
      name: 'Premier Rugby Union',
      sport: 'Rugby Union',
      primaryColor: '#FF3E00',
      teamsCount: 24,
      facilitiesCount: 3,
      membersCount: 1450,
    },
    'org-2': {
      name: 'Metro Football League',
      sport: 'Football',
      primaryColor: '#00E5FF',
      teamsCount: 48,
      facilitiesCount: 6,
      membersCount: 3200,
    },
    '1': { // Fallback standard id
      name: 'Premier Rugby Union',
      sport: 'Rugby Union',
      primaryColor: '#FF3E00',
      teamsCount: 24,
      facilitiesCount: 3,
      membersCount: 1450,
    },
  };

  const org = orgRegistry[orgId] || {
    name: 'Premier Rugby Union',
    sport: 'Rugby Union',
    primaryColor: '#FF3E00',
    teamsCount: 24,
    facilitiesCount: 3,
    membersCount: 1450,
  };

  const modules = [
    {
      title: 'Organization Settings',
      description: 'Configure colors, branding logo, details & rules',
      icon: 'settings-outline' as const,
      route: `/admin/${orgId}/settings` as const,
      color: '#FF3E00',
      bgColor: 'bg-brand-orange/10',
    },
    {
      title: 'People & Rosters',
      description: 'Manage coaches, team staff, and athletes',
      icon: 'people-outline' as const,
      route: `/admin/${orgId}/people` as const,
      color: '#10B981',
      bgColor: 'bg-emerald-500/10',
    },
    {
      title: 'Teams & Divisions',
      description: 'Create sports squads and assign managers',
      icon: 'trophy-outline' as const,
      route: `/admin/${orgId}/teams` as const,
      color: '#00E5FF',
      bgColor: 'bg-cyan-500/10',
    },
    {
      title: 'Sites & Courts',
      description: 'Configure facilities, playgrounds, and arenas',
      icon: 'location-outline' as const,
      route: `/admin/${orgId}/sites` as const,
      color: '#8B5CF6',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'Events & Fixtures',
      description: 'Generate schedules, pools, and score games',
      icon: 'calendar-outline' as const,
      route: `/admin/${orgId}/events` as const,
      color: '#F59E0B',
      bgColor: 'bg-amber-500/10',
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/organizations')}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-xs tracking-widest text-slate-800 dark:text-white uppercase">
          Org Control Panel
        </Text>
        <View className="w-10 h-2" />
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* BANNER WITH BACKGROUND ACCENT GLOW */}
        <GlassCard className="border border-slate-200 dark:border-white/5 p-6 mb-8 relative overflow-hidden bg-brand-orange/5">
          <View 
            className="absolute -right-24 -top-24 w-48 h-48 rounded-full blur-[60px] opacity-[0.05]"
            style={{ backgroundColor: org.primaryColor }}
          />

          <View className="flex-row items-center gap-2 bg-slate-100 dark:bg-white/10 px-2.5 py-1 rounded-full w-fit mb-3">
            <Ionicons name="shield-checkmark" size={12} color={org.primaryColor} />
            <Text className="font-inter-bold text-[9px] text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              {org.sport} WORKSPACE
            </Text>
          </View>

          <Text className="font-orbitron-bold text-xl text-slate-800 dark:text-white mb-2 uppercase tracking-wide">
            {org.name}
          </Text>
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mb-5 leading-4">
            Select an admin dashboard below to modify branding details, athlete registrations, or manage court fixture slots.
          </Text>

          {/* QUICK STATS ROW */}
          <View className="flex-row gap-6 border-t border-slate-200/50 dark:border-white/5 pt-4">
            <View>
              <Text className="font-orbitron-bold text-sm text-slate-700 dark:text-slate-300">
                {org.membersCount}
              </Text>
              <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                Roster
              </Text>
            </View>
            <View>
              <Text className="font-orbitron-bold text-sm text-slate-700 dark:text-slate-300">
                {org.teamsCount}
              </Text>
              <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                Teams
              </Text>
            </View>
            <View>
              <Text className="font-orbitron-bold text-sm text-slate-700 dark:text-slate-300">
                {org.facilitiesCount}
              </Text>
              <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                Sites
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* LIST OF MODULES */}
        <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
          Administration Modules
        </Text>
        <View className="space-y-4 mb-8">
          {modules.map((mod) => (
            <GlassCard 
              key={mod.title}
              className="border border-slate-200 dark:border-white/5 p-4 flex-row items-center justify-between gap-4"
            >
              <View className="flex-row items-center gap-3.5 flex-1">
                <View className={`w-10 h-10 rounded-xl ${mod.bgColor} items-center justify-center flex-shrink-0`}>
                  <Ionicons name={mod.icon} size={18} color={mod.color} />
                </View>
                <View className="flex-1">
                  <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white leading-tight">
                    {mod.title}
                  </Text>
                  <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-3">
                    {mod.description}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => router.push(mod.route as any)}
                className="p-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-lg active:opacity-85"
              >
                <Ionicons name="arrow-forward" size={16} color={org.primaryColor} />
              </TouchableOpacity>
            </GlassCard>
          ))}
        </View>

        {/* EXIT BUTTON */}
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/organizations' as any)}
          className="flex-row items-center justify-center gap-2 py-3 border border-dashed border-slate-300 dark:border-white/10 rounded-xl active:opacity-85"
        >
          <Ionicons name="chevron-back" size={16} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Exit Workspace & Select Other Org
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
