import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { GlassCard } from '../../../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../store/settingsStore';
import { themeColor } from '../../../constants/Colors';

export default function AdminDashboard() {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* WELCOME BANNER */}
        <View className="mb-6 mt-2">
          <Text className="font-inter text-sm text-ink-muted leading-5">
            Select an administrative action below to schedule leagues, configure rosters, or manage system audits.
          </Text>
        </View>

        {/* QUICK ACTION BUTTONS */}
        <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-widest mb-4">
          Quick Actions
        </Text>
        <View className="space-y-4 mb-8">
          {/* USER MANAGEMENT CARD */}
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.85}
            onPress={() => router.push('/admin/users' as any)}
          >
            <GlassCard className="border border-line p-4 flex-row items-center gap-3.5">
              <View className="w-10 h-10 rounded-xl bg-primary-soft border border-primary-line items-center justify-center flex-shrink-0">
                <Ionicons name="people-outline" size={18} color={themeColor(isDark, 'primary-ink')} />
              </View>
              <View className="flex-1">
                <Text className="font-orbitron-bold text-sm text-ink leading-tight">
                  User Management
                </Text>
                <Text className="font-inter text-[10px] text-ink-muted mt-0.5">
                  Search and manage application users and members
                </Text>
              </View>
            </GlassCard>
          </TouchableOpacity>

          {/* SYSTEM AUDITS CARD */}
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.85}
            onPress={() => router.push('/admin/reports' as any)}
          >
            <GlassCard className="border border-line p-4 flex-row items-center gap-3.5">
              <View className="w-10 h-10 rounded-xl bg-special-soft border border-special-line items-center justify-center flex-shrink-0">
                <Ionicons name="shield-outline" size={18} color={themeColor(isDark, 'special-ink')} />
              </View>
              <View className="flex-1">
                <Text className="font-orbitron-bold text-sm text-ink leading-tight">
                  System Audits
                </Text>
                <Text className="font-inter text-[10px] text-ink-muted mt-0.5">
                  Monitor score conflicts and game disputes
                </Text>
              </View>
            </GlassCard>
          </TouchableOpacity>

          {/* SPORT MANAGEMENT CARD */}
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.85}
            onPress={() => router.push('/admin/sports' as any)}
          >
            <GlassCard className="border border-line p-4 flex-row items-center gap-3.5">
              <View className="w-10 h-10 rounded-xl bg-info-soft border border-info-line items-center justify-center flex-shrink-0">
                <Ionicons name="trophy-outline" size={18} color={themeColor(isDark, 'info-ink')} />
              </View>
              <View className="flex-1">
                <Text className="font-orbitron-bold text-sm text-ink leading-tight">
                  Sport Management
                </Text>
                <Text className="font-inter text-[10px] text-ink-muted mt-0.5">
                  View and edit sport rules, names, terms, and player positions
                </Text>
              </View>
            </GlassCard>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
