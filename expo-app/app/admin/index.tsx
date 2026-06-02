import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { GlassCard } from '../../components/GlassCard';
import { Button } from '../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../store/settingsStore';

function PulsingDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [opacity]);

  return (
    <Animated.View
      style={{
        opacity,
      }}
      className="w-2 h-2 rounded-full bg-brand-orange"
    />
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';

  const activeGames = [
    {
      id: '1',
      homeTeam: 'Cape Town RFC',
      awayTeam: 'Durban Rovers',
      sport: 'Rugby Union',
      time: 'Today, 14:00',
    },
  ];

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* WELCOME BANNER */}
        <View className="mb-6 mt-2">
          <Text className="font-inter text-sm text-slate-500 dark:text-slate-400 leading-5">
            Select an administrative action below to schedule leagues, configure rosters, or enter the touch scoring sheet.
          </Text>
        </View>

        {/* QUICK ACTION BUTTONS */}
        <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
          Quick Actions
        </Text>
        <View className="space-y-4 mb-8">
          <GlassCard className="border border-slate-200 dark:border-white/5 p-4 flex-row items-center justify-between gap-4">
            <View className="flex-row items-center gap-3.5 flex-1">
              <View className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-brand-blue/10 border border-cyan-200 dark:border-brand-blue/20 items-center justify-center flex-shrink-0">
                <Ionicons name="globe-outline" size={18} color={isDark ? "#00E5FF" : "#155e75"} />
              </View>
              <View className="flex-1">
                <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white leading-tight">
                  System Directory
                </Text>
                <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Global directory of all platform tenants
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/admin/all-organizations' as any)}
              className="p-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-lg active:opacity-85"
            >
              <Ionicons name="arrow-forward" size={16} color="#FF3E00" />
            </TouchableOpacity>
          </GlassCard>

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

        {/* ACTIVE GAMES FOR SCORERS */}
        <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
          Games Ready to Score
        </Text>
        <View className="space-y-4 mb-8">
          {activeGames.map((game) => (
            <GlassCard key={game.id} className="border border-slate-200 dark:border-white/5 p-5">
              <View className="flex-row justify-between items-center mb-3">
                <View className="bg-slate-100 dark:bg-white/10 px-2.5 py-1 rounded-full border border-slate-200/50 dark:border-white/5">
                  <Text className="font-inter-bold text-[9px] text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    {game.sport} • {game.time}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <PulsingDot />
                  <Text className="font-orbitron-bold text-[10px] text-brand-orange">READY</Text>
                </View>
              </View>

              <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white mb-5">
                {game.homeTeam} vs {game.awayTeam}
              </Text>

              <Button
                title="Launch Scoring Console"
                variant="primary"
                onPress={() => {}}
                className="w-full shadow-md shadow-brand-orange/20"
              />
            </GlassCard>
          ))}
        </View>

        {/* BACK TO APP LINK */}
        <TouchableOpacity
          onPress={() => router.push('/(tabs)')}
          className="flex-row items-center justify-center gap-2 py-3 border border-dashed border-slate-300 dark:border-white/10 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 active:opacity-85"
        >
          <Ionicons name="exit-outline" size={16} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Exit Admin & Return to Live Feed
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
