import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { GlassCard } from '../../../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../store/settingsStore';

export default function AdminDashboard() {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* WELCOME BANNER */}
        <View className="mb-6 mt-2">
          <Text className="font-inter text-sm text-slate-500 dark:text-slate-400 leading-5">
            Select an administrative action below to schedule leagues, configure rosters, or manage system audits.
          </Text>
        </View>

        {/* QUICK ACTION BUTTONS */}
        <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
          Quick Actions
        </Text>
        <View className="space-y-4 mb-8">
          {/* USER MANAGEMENT CARD */}
          <GlassCard className="border border-slate-200 dark:border-white/5 p-4 flex-row items-center justify-between gap-4">
            <View className="flex-row items-center gap-3.5 flex-1">
              <View className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-brand-orange/10 border border-orange-200 dark:border-brand-orange/20 items-center justify-center flex-shrink-0">
                <Ionicons name="people-outline" size={18} color={isDark ? "#FF3E00" : "#c2410c"} />
              </View>
              <View className="flex-1">
                <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white leading-tight">
                  User Management
                </Text>
                <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Search and manage application users and members
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/admin/users' as any)}
              className="p-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-lg active:opacity-85"
            >
              <Ionicons name="arrow-forward" size={16} color="#FF3E00" />
            </TouchableOpacity>
          </GlassCard>

          {/* SYSTEM AUDITS CARD */}
          <GlassCard className="border border-slate-200 dark:border-white/5 p-4 flex-row items-center justify-between gap-4">
            <View className="flex-row items-center gap-3.5 flex-1">
              <View className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-850/20 items-center justify-center flex-shrink-0">
                <Ionicons name="shield-outline" size={18} color={isDark ? "#A78BFA" : "#6D28D9"} />
              </View>
              <View className="flex-1">
                <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white leading-tight">
                  System Audits
                </Text>
                <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Monitor score conflicts and game disputes
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/admin/reports' as any)}
              className="p-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-lg active:opacity-85"
            >
              <Ionicons name="arrow-forward" size={16} color="#FF3E00" />
            </TouchableOpacity>
          </GlassCard>
        </View>
      </ScrollView>
    </View>
  );
}
