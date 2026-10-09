import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../../store/authStore';
import { useActiveTheme } from '../../../../store/settingsStore';
import { GlassCard } from '../../../../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import { apiService, Sport } from '../../../../services/api';
import { themeColor } from '../../../../constants/Colors';

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
    <View className="flex-1 bg-canvas">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER SECTION */}
        <View className="flex-row items-center justify-between gap-4 mb-6">
          <View className="flex-1">
            <Text className="font-inter text-xs text-ink-muted leading-normal">
              View and configure the rules, terminology, and default player positions for all active sports.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/admin/sports/new' as any)}
            className="bg-primary px-3.5 py-2 rounded-xl flex-row items-center gap-1.5 active:scale-95 shadow-md shadow-primary/20 flex-shrink-0"
          >
            <Ionicons name="add-circle" size={14} color={themeColor(isDark, 'on-primary')} />
            <Text className="font-orbitron-bold text-[9px] text-on-primary uppercase tracking-wider mt-0.5">
              Add Sport
            </Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View className="flex-1 justify-center items-center py-20">
            <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
            <Text className="font-inter text-xs text-ink-muted mt-4">Loading sports configurations...</Text>
          </View>
        ) : error ? (
          <GlassCard className="border border-danger-line bg-danger-soft p-4 rounded-xl mb-6">
            <View className="flex-row items-center gap-3">
              <Ionicons name="alert-circle-outline" size={20} color={themeColor(isDark, 'danger')} />
              <Text className="font-inter text-xs text-danger-ink flex-1">{error}</Text>
            </View>
          </GlassCard>
        ) : (
          <View className="gap-4">
            {sports.map((sport) => {
              const positionsCount = sport.defaultSettings?.positions?.length || 0;
              const hasRegistry = sport.eventTemplates && sport.eventTemplates.length > 0;
              
              return (
                <TouchableOpacity
                  key={sport.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${sport.name}`}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/admin/sports/${sport.id}` as any)}
                >
                <GlassCard className="border border-line p-4 flex-row items-center justify-between gap-4">
                  <View className="flex-row items-center gap-3.5 flex-1">
                    <View className="w-10 h-10 rounded-xl bg-primary-soft border border-primary-line items-center justify-center flex-shrink-0">
                      <Ionicons name="football" size={18} color={themeColor(isDark, 'primary-ink')} />
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="font-orbitron-bold text-sm text-ink leading-tight">
                          {sport.name}
                        </Text>
                        {hasRegistry && (
                          <View className="bg-success-soft border border-success-line px-1.5 py-0.5 rounded">
                            <Text className="font-inter-bold text-[8px] text-success-ink uppercase">
                              Rules Configured
                            </Text>
                          </View>
                        )}
                      </View>
                      
                      <View className="flex-row items-center gap-3 mt-1.5 flex-wrap">
                        <View className="flex-row items-center gap-1">
                          <Ionicons name="location-outline" size={10} color={themeColor(isDark, 'ink-muted')} />
                          <Text className="font-inter text-[9px] text-ink-muted">
                            {sport.facilityTerm || 'Facility'}
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-1">
                          <Ionicons name="time-outline" size={10} color={themeColor(isDark, 'ink-muted')} />
                          <Text className="font-inter text-[9px] text-ink-muted">
                            {sport.periodTerm || 'Period'}
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-1">
                          <Ionicons name="people-outline" size={10} color={themeColor(isDark, 'ink-muted')} />
                          <Text className="font-inter text-[9px] text-ink-muted">
                            {positionsCount} Positions
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  
                  <View className="p-2 bg-sunken border border-line rounded-lg">
                    <Ionicons name="create-outline" size={16} color={themeColor(isDark, 'primary')} />
                  </View>
                </GlassCard>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
