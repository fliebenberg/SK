import { View, Text, ScrollView, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../components/Button';
import { GlassCard } from '../components/GlassCard';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore, useActiveTheme } from '../store/settingsStore';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ResponsiveHeader } from '../components/ResponsiveHeader';

export default function LandingPage() {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const router = useRouter();
  const activeTheme = useActiveTheme();
  const setLocalOverride = useSettingsStore(state => state.setLocalOverride);
  const isDark = activeTheme === 'dark';

  // State-based pulse animation for the live red dot
  const [pulse, setPulse] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => {
      setPulse(prev => !prev);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated]);

  const toggleTheme = () => {
    setLocalOverride('theme', isDark ? 'light' : 'dark');
  };

  return (
    <SafeAreaView style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column' }} className="bg-slate-50 dark:bg-slate-950">
      {/* Responsive Top Header Navigation */}
      <ResponsiveHeader showNav={true} />

      <ScrollView 
        style={{ flex: 1 }}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO SECTION */}
        <View className="items-center px-6 pt-12 pb-16 text-center">
          <View className="w-20 h-20 rounded-2xl bg-white dark:bg-slate-900 border-2 border-brand-orange shadow-lg dark:shadow-brand-orange/30 items-center justify-center mb-6">
            <Text className="font-orbitron-bold text-3xl text-brand-orange mt-1">SK</Text>
          </View>
          
          <Text className="font-orbitron-bold text-4xl sm:text-5xl text-slate-900 dark:text-white tracking-widest text-center mb-4">
            SCOREKEEPER
          </Text>
          
          <Text className="font-inter-medium text-slate-600 dark:text-slate-400 text-base sm:text-lg text-center max-w-lg mb-10 leading-6">
            Real-time sports management and viewer experience, built to feel alive.
          </Text>

          {/* Double CTAs */}
          <View className="w-full max-w-sm gap-4">
            <Button 
              title="Create Organization" 
              variant="primary" 
              onPress={() => router.push('/(auth)/signup')} 
              className="shadow-md shadow-brand-orange/20"
            />
            <Button 
              title="Explore Live Games" 
              variant="secondary" 
              onPress={() => router.push('/(tabs)')} 
              className="mt-3 shadow-md shadow-brand-blue/10"
            />
          </View>
          
          <TouchableOpacity 
            onPress={() => router.push('/(auth)/login')}
            className="mt-6 p-2 active:opacity-60"
          >
            <Text className="font-inter-medium text-sm text-slate-500 dark:text-slate-400">
              Already have an account? <Text className="text-brand-orange dark:text-brand-blue font-inter-bold">Log In</Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* LIVE GAMES NEAR YOU SECTION */}
        <View className="px-6 mb-12">
          <View className="flex-row items-center gap-2 mb-6">
            <View className="w-2.5 h-2.5 rounded-full bg-brand-red shadow-lg shadow-brand-red/50" />
            <Text className="font-orbitron-bold text-lg tracking-wider text-slate-900 dark:text-white">
              LIVE GAMES NEAR YOU
            </Text>
          </View>

          <View className="gap-4">
            {/* Game 1: Rugby Match */}
            <GlassCard className="border border-slate-200 dark:border-white/5 shadow-sm">
              <View className="flex-row justify-between items-center mb-3">
                <View className="flex-row items-center gap-2 bg-slate-100 dark:bg-white/10 px-2.5 py-1 rounded-full">
                  <Ionicons name="trophy-outline" size={12} color={isDark ? "#00E5FF" : "#FF3E00"} />
                  <Text className="font-inter-bold text-[10px] text-slate-700 dark:text-slate-300 uppercase tracking-wider">Rugby Union</Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <View className={`w-2 h-2 rounded-full bg-brand-red ${pulse ? 'opacity-100' : 'opacity-30'}`} />
                  <Text className="font-orbitron-bold text-xs text-brand-red">LIVE</Text>
                </View>
              </View>
              
              <View className="flex-row items-center justify-between py-2">
                <View className="flex-1 gap-3">
                  <View className="flex-row items-center gap-3">
                    <View className="w-5 h-5 rounded bg-orange-500 items-center justify-center">
                      <Text className="text-[10px] font-inter-bold text-white">CT</Text>
                    </View>
                    <Text className="font-inter-bold text-slate-800 dark:text-white text-base">Cape Town RFC</Text>
                  </View>
                  <View className="flex-row items-center gap-3">
                    <View className="w-5 h-5 rounded bg-blue-600 items-center justify-center">
                      <Text className="text-[10px] font-inter-bold text-white">DB</Text>
                    </View>
                    <Text className="font-inter-bold text-slate-800 dark:text-white text-base">Durban Rovers</Text>
                  </View>
                </View>
                
                <View className="flex-row items-center gap-4 bg-slate-100 dark:bg-black/40 px-4 py-2.5 rounded-xl border border-slate-200/50 dark:border-white/5">
                  <View className="items-center">
                    <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white leading-none">24</Text>
                    <Text className="font-orbitron text-[9px] text-slate-400 dark:text-slate-500 uppercase mt-1">H2</Text>
                  </View>
                  <Text className="font-orbitron text-slate-300 dark:text-slate-600 text-lg leading-none">-</Text>
                  <View className="items-center">
                    <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white leading-none">17</Text>
                    <Text className="font-orbitron text-xs text-brand-orange dark:text-brand-blue mt-1">62'</Text>
                  </View>
                </View>
              </View>
            </GlassCard>

            {/* Game 2: Football Match */}
            <GlassCard className="border border-slate-200 dark:border-white/5 shadow-sm">
              <View className="flex-row justify-between items-center mb-3">
                <View className="flex-row items-center gap-2 bg-slate-100 dark:bg-white/10 px-2.5 py-1 rounded-full">
                  <Ionicons name="football-outline" size={12} color={isDark ? "#00E5FF" : "#FF3E00"} />
                  <Text className="font-inter-bold text-[10px] text-slate-700 dark:text-slate-300 uppercase tracking-wider">Football</Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <View className={`w-2 h-2 rounded-full bg-brand-red ${pulse ? 'opacity-100' : 'opacity-30'}`} />
                  <Text className="font-orbitron-bold text-xs text-brand-red">LIVE</Text>
                </View>
              </View>
              
              <View className="flex-row items-center justify-between py-2">
                <View className="flex-1 gap-3">
                  <View className="flex-row items-center gap-3">
                    <View className="w-5 h-5 rounded bg-red-600 items-center justify-center">
                      <Text className="text-[10px] font-inter-bold text-white">ST</Text>
                    </View>
                    <Text className="font-inter-bold text-slate-800 dark:text-white text-base">Strykers FC</Text>
                  </View>
                  <View className="flex-row items-center gap-3">
                    <View className="w-5 h-5 rounded bg-yellow-500 items-center justify-center">
                      <Text className="text-[10px] font-inter-bold text-white">AP</Text>
                    </View>
                    <Text className="font-inter-bold text-slate-800 dark:text-white text-base">Apex United</Text>
                  </View>
                </View>
                
                <View className="flex-row items-center gap-4 bg-slate-100 dark:bg-black/40 px-4 py-2.5 rounded-xl border border-slate-200/50 dark:border-white/5">
                  <View className="items-center">
                    <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white leading-none">2</Text>
                    <Text className="font-orbitron text-[9px] text-slate-400 dark:text-slate-500 uppercase mt-1">H2</Text>
                  </View>
                  <Text className="font-orbitron text-slate-300 dark:text-slate-600 text-lg leading-none">-</Text>
                  <View className="items-center">
                    <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white leading-none">1</Text>
                    <Text className="font-orbitron text-xs text-brand-orange dark:text-brand-blue mt-1">88'</Text>
                  </View>
                </View>
              </View>
            </GlassCard>
          </View>
        </View>

        {/* FEATURE HIGHLIGHTS */}
        <View className="px-6 mb-12">
          <Text className="font-orbitron-bold text-lg tracking-wider text-slate-900 dark:text-white mb-6 uppercase">
            WHY SCOREKEEPER?
          </Text>

          <View className={Platform.OS === 'web' ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'gap-4'}>
            {/* Feature 1: Instant Updates */}
            <GlassCard className="border border-slate-200 dark:border-white/5 flex-row items-start gap-4">
              <View className="w-10 h-10 rounded-xl bg-brand-orange/10 border border-brand-orange/30 items-center justify-center flex-shrink-0">
                <Ionicons name="pulse" size={20} color="#FF3E00" />
              </View>
              <View className="flex-1">
                <Text className="font-inter-bold text-base text-slate-800 dark:text-white mb-1">
                  Instant Live Updates
                </Text>
                <Text className="font-inter text-sm text-slate-500 dark:text-slate-400 leading-5">
                  Follow live plays, scores, and events instantly as they happen with zero delay or manual refreshing.
                </Text>
              </View>
            </GlassCard>

            {/* Feature 2: Pro-level Admin Tools */}
            <GlassCard className="border border-slate-200 dark:border-white/5 flex-row items-start gap-4">
              <View className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-brand-blue/10 border border-cyan-200 dark:border-brand-blue/30 items-center justify-center flex-shrink-0">
                <Ionicons name="shield-checkmark-outline" size={20} color={isDark ? "#00E5FF" : "#155e75"} />
              </View>
              <View className="flex-1">
                <Text className="font-inter-bold text-base text-slate-800 dark:text-white mb-1">
                  Pro-Level Scoring Sheets
                </Text>
                <Text className="font-inter text-sm text-slate-500 dark:text-slate-400 leading-5">
                  Uncluttered scoring UI built specifically for officials to manage high-stress match events quickly and accurately.
                </Text>
              </View>
            </GlassCard>

            {/* Feature 3: Universal Access */}
            <GlassCard className="border border-slate-200 dark:border-white/5 flex-row items-start gap-4">
              <View className="w-10 h-10 rounded-xl bg-brand-orange/10 border border-brand-orange/30 items-center justify-center flex-shrink-0">
                <Ionicons name="phone-portrait-outline" size={20} color="#FF3E00" />
              </View>
              <View className="flex-1">
                <Text className="font-inter-bold text-base text-slate-800 dark:text-white mb-1">
                  Universal Cross-Platform
                </Text>
                <Text className="font-inter text-sm text-slate-500 dark:text-slate-400 leading-5">
                  Use one single account to access all your fixtures, stats, and standings seamlessly across Web, iOS, and Android.
                </Text>
              </View>
            </GlassCard>

            {/* Feature 4: Multi-Sport Modularity */}
            <GlassCard className="border border-slate-200 dark:border-white/5 flex-row items-start gap-4">
              <View className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-brand-blue/10 border border-cyan-200 dark:border-brand-blue/30 items-center justify-center flex-shrink-0">
                <Ionicons name="grid-outline" size={20} color={isDark ? "#00E5FF" : "#155e75"} />
              </View>
              <View className="flex-1">
                <Text className="font-inter-bold text-base text-slate-800 dark:text-white mb-1">
                  Multi-Sport Modularity
                </Text>
                <Text className="font-inter text-sm text-slate-500 dark:text-slate-400 leading-5">
                  Layouts and event tracking adapt automatically to Rugby, Soccer, Tennis, and custom formats.
                </Text>
              </View>
            </GlassCard>
          </View>
        </View>

        {/* BOTTOM RECRUITMENT BANNER */}
        <View className="px-6 mb-8">
          <GlassCard className="bg-brand-orange/5 dark:bg-brand-orange/5 border border-brand-orange/30 p-6 items-center">
            <Ionicons name="megaphone-outline" size={28} color="#FF3E00" className="mb-3" />
            <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white text-center mb-2 uppercase tracking-wide">
              MANAGE A CLUB OR TOURNAMENT?
            </Text>
            <Text className="font-inter text-sm text-slate-600 dark:text-slate-400 text-center max-w-sm mb-6 leading-5">
              Set up organizations, schedule fixtures, register players, and assign certified scorekeepers in minutes.
            </Text>
            <Button 
              title="Get Started as Admin" 
              variant="primary" 
              onPress={() => router.push('/(auth)/signup')} 
              className="w-full max-w-xs"
            />
          </GlassCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
