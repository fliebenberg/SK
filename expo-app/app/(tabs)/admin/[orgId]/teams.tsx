import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../../store/settingsStore';

export default function OrgTeams() {
  const isDark = useActiveTheme() === 'dark';
  const [searchQuery, setSearchQuery] = useState('');

  const teams = [
    {
      id: 'team-1',
      name: 'Cape Town RFC 1st XV',
      sport: 'Rugby Union',
      division: '1st Division',
      coach: 'John Doe',
      athletesCount: 22,
    },
    {
      id: 'team-2',
      name: 'Cape Town RFC Under 19',
      sport: 'Rugby Union',
      division: 'U19 League',
      coach: 'Sarah Connor',
      athletesCount: 18,
    },
    {
      id: 'team-3',
      name: 'Seapoint Rovers FC',
      sport: 'Football',
      division: 'Premier Division',
      coach: 'James Smith',
      athletesCount: 16,
    },
  ];

  const filteredTeams = teams.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.sport.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.division.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER SECTION */}
        <View className="mb-6 flex-row justify-between items-center">
          <View className="flex-1 mr-4">
            <Text className="font-orbitron-bold text-xl text-slate-800 dark:text-white uppercase mb-1">
              Teams & Divisions
            </Text>
            <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
              Create club divisions, register sports squads, and assign managers to touch-scoring consoles.
            </Text>
          </View>
          <TouchableOpacity 
            className="w-10 h-10 rounded-xl bg-brand-orange items-center justify-center shadow-md shadow-brand-orange/20 active:opacity-85"
            onPress={() => {}}
          >
            <Ionicons name="add-outline" size={20} color="white" />
          </TouchableOpacity>
        </View>

        {/* SEARCH BAR */}
        <View className="flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 mb-6 shadow-sm">
          <Ionicons name="search-outline" size={18} color="#94A3B8" />
          <TextInput
            placeholder="Search teams or sports..."
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

        {/* TEAMS LIST */}
        <View className="space-y-4">
          {filteredTeams.map((team) => (
            <GlassCard 
              key={team.id}
              className="border border-slate-200 dark:border-white/5 p-5"
            >
              <View className="flex-row justify-between items-start mb-3">
                <View className="bg-slate-100 dark:bg-white/10 px-2.5 py-1 rounded-full">
                  <Text className="font-inter-bold text-[9px] text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    {team.division} • {team.sport}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Ionicons name="people" size={12} color="#FF3E00" />
                  <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400">
                    {team.athletesCount} Athletes
                  </Text>
                </View>
              </View>

              <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white mb-4">
                {team.name}
              </Text>

              {/* COACH / DETAILS */}
              <View className="flex-row items-center gap-2 mb-4">
                <Ionicons name="shield-checkmark" size={14} color="#94A3B8" />
                <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
                  Manager: <Text className="font-semibold">{team.coach}</Text>
                </Text>
              </View>

              <View className="flex-row gap-3">
                <Button
                  title="Configure Roster"
                  variant="secondary"
                  onPress={() => {}}
                  className="flex-1 shadow-sm py-2 rounded-lg"
                />
                <Button
                  title="Settings"
                  variant="secondary"
                  onPress={() => {}}
                  className="px-4 py-2 rounded-lg shadow-sm"
                />
              </View>
            </GlassCard>
          ))}

          {filteredTeams.length === 0 && (
            <View className="items-center justify-center py-12">
              <Ionicons name="trophy-outline" size={48} color="#94A3B8" className="opacity-40 mb-3" />
              <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300">
                No Teams Registered
              </Text>
              <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 text-center mt-1">
                Register club divisions and roster templates to get started.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
