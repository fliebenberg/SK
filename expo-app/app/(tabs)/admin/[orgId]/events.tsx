import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../../store/settingsStore';

export default function OrgEvents() {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';
  const [searchQuery, setSearchQuery] = useState('');

  const events = [
    {
      id: 'event-1',
      name: 'Autumn Club Championship',
      sport: 'Rugby Union',
      teamsCount: 8,
      status: 'Active',
      startDate: '2026-05-01',
    },
    {
      id: 'event-2',
      name: 'ScoreKeeper Winter League',
      sport: 'Football',
      teamsCount: 16,
      status: 'Scheduled',
      startDate: '2026-07-15',
    },
    {
      id: 'event-3',
      name: 'Cape Town Squash Cup',
      sport: 'Squash',
      teamsCount: 12,
      status: 'Completed',
      startDate: '2026-04-10',
    },
  ];

  const filteredEvents = events.filter(e =>
    e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.sport.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase">
          Events & Leagues
        </Text>
        <TouchableOpacity 
          className="w-8 h-8 rounded-lg bg-brand-orange items-center justify-center shadow-md shadow-brand-orange/20 active:opacity-85"
          onPress={() => {}}
        >
          <Ionicons name="calendar-outline" size={16} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>

        {/* SEARCH BAR */}
        <View className="flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 mb-6 shadow-sm">
          <Ionicons name="search-outline" size={18} color="#94A3B8" />
          <TextInput
            placeholder="Search active leagues or events..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 font-inter text-slate-800 dark:text-white text-sm ml-2.5 outline-none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* EVENTS LIST */}
        <View className="space-y-4">
          {filteredEvents.map((event) => (
            <GlassCard 
              key={event.id}
              className="border border-slate-200 dark:border-white/5 p-5"
            >
              <View className="flex-row justify-between items-start mb-3">
                <View className="bg-slate-100 dark:bg-white/10 px-2.5 py-1 rounded-full">
                  <Text className="font-inter-bold text-[9px] text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    {event.sport}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <View 
                    className={`w-1.5 h-1.5 rounded-full ${
                      event.status === 'Active' 
                        ? 'bg-brand-orange' 
                        : event.status === 'Scheduled' 
                        ? 'bg-cyan-500' 
                        : 'bg-slate-400'
                    }`} 
                  />
                  <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {event.status}
                  </Text>
                </View>
              </View>

              <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white mb-2">
                {event.name}
              </Text>

              {/* DATE & DETAILS */}
              <View className="flex-row items-center gap-6 mb-4">
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="people-outline" size={14} color="#94A3B8" />
                  <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
                    {event.teamsCount} Teams Registered
                  </Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="time-outline" size={14} color="#94A3B8" />
                  <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
                    Starts: {event.startDate}
                  </Text>
                </View>
              </View>

              <View className="flex-row gap-3">
                <Button
                  title="Configure Fixtures"
                  variant="secondary"
                  onPress={() => {}}
                  className="flex-1 shadow-sm py-2 rounded-lg"
                />
                <Button
                  title="Scoring"
                  variant="secondary"
                  onPress={() => {}}
                  className="px-4 py-2 rounded-lg shadow-sm"
                />
              </View>
            </GlassCard>
          ))}

          {filteredEvents.length === 0 && (
            <View className="items-center justify-center py-12">
              <Ionicons name="calendar-outline" size={48} color="#94A3B8" className="opacity-40 mb-3" />
              <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300">
                No Events Scheduled
              </Text>
              <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 text-center mt-1">
                Schedule leagues or tournaments to list fixtures here.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
