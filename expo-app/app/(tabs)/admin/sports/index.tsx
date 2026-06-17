import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../../store/authStore';
import { useActiveTheme } from '../../../../store/settingsStore';
import { GlassCard } from '../../../../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import { apiService, Sport } from '../../../../services/api';

export default function SportsList() {
  const router = useRouter();
  const token = useAuthStore(state => state.token);
  const isDark = useActiveTheme() === 'dark';
  
  const [sports, setSports] = useState<Sport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSports() {
      if (!token) return;
      setIsLoading(true);
      setError(null);
      try {
        const data = await apiService.getAdminSports(token);
        setSports(data);
      } catch (err: any) {
        console.error('[SportsList] Failed to load sports:', err);
        setError(err.message || 'Failed to load sports configurations.');
      } finally {
        setIsLoading(false);
      }
    }
    loadSports();
  }, [token]);

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER SECTION */}
        <View className="mb-6">
          <Text className="font-inter text-sm text-slate-500 dark:text-slate-400">
            View and configure the rules, terminology, and default player positions for all active sports.
          </Text>
        </View>

        {isLoading ? (
          <View className="flex-1 justify-center items-center py-20">
            <ActivityIndicator size="large" color="#FF3E00" />
            <Text className="font-inter text-xs text-slate-400 mt-4">Loading sports configurations...</Text>
          </View>
        ) : error ? (
          <GlassCard className="border border-red-200 dark:border-red-950/20 bg-red-500/5 p-4 rounded-xl mb-6">
            <View className="flex-row items-center gap-3">
              <Ionicons name="alert-circle-outline" size={20} color="#EF4444" />
              <Text className="font-inter text-xs text-red-500 dark:text-red-400 flex-1">{error}</Text>
            </View>
          </GlassCard>
        ) : (
          <View className="space-y-4">
            {sports.map((sport) => {
              const positionsCount = sport.defaultSettings?.positions?.length || 0;
              const hasRegistry = sport.eventTemplates && sport.eventTemplates.length > 0;
              
              return (
                <GlassCard key={sport.id} className="border border-slate-200 dark:border-white/5 p-4 flex-row items-center justify-between gap-4">
                  <View className="flex-row items-center gap-3.5 flex-1">
                    <View className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-brand-orange/10 border border-orange-200 dark:border-brand-orange/20 items-center justify-center flex-shrink-0">
                      <Ionicons name="football" size={18} color={isDark ? "#FF3E00" : "#c2410c"} />
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white leading-tight">
                          {sport.name}
                        </Text>
                        {hasRegistry && (
                          <View className="bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/30 px-1.5 py-0.5 rounded">
                            <Text className="font-inter-bold text-[8px] text-emerald-600 dark:text-emerald-400 uppercase">
                              Rules Configured
                            </Text>
                          </View>
                        )}
                      </View>
                      
                      <View className="flex-row items-center gap-3 mt-1.5 flex-wrap">
                        <View className="flex-row items-center gap-1">
                          <Ionicons name="location-outline" size={10} color="#94A3B8" />
                          <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500">
                            {sport.facilityTerm || 'Facility'}
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-1">
                          <Ionicons name="time-outline" size={10} color="#94A3B8" />
                          <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500">
                            {sport.periodTerm || 'Period'}
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-1">
                          <Ionicons name="people-outline" size={10} color="#94A3B8" />
                          <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500">
                            {positionsCount} Positions
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  
                  <TouchableOpacity
                    onPress={() => router.push(`/admin/sports/${sport.id}` as any)}
                    className="p-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-lg active:opacity-85"
                  >
                    <Ionicons name="create-outline" size={16} color="#FF3E00" />
                  </TouchableOpacity>
                </GlassCard>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
