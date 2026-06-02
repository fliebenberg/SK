import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, useWindowDimensions } from 'react-native';
import { GlassCard } from '../../components/GlassCard';
import { Button } from '../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';

export default function TeamsPage() {
  const [followedTeams, setFollowedTeams] = useState<string[]>([]);
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const { isAuthenticated, user } = useAuthStore();

  const coachedTeams = [
    {
      id: 'coached-1',
      name: 'Cape Town RFC (Development)',
      sport: 'Rugby Union',
      record: '6-2-1',
      rank: '#2 in Western Dev Cup',
      abbreviation: 'CTD',
      color: 'bg-orange-600',
      role: 'Head Coach',
    },
  ];

  const teams = [
    {
      id: '1',
      name: 'Cape Town RFC',
      sport: 'Rugby Union',
      record: '12-2-0',
      rank: '#1 in Western Cup',
      abbreviation: 'CT',
      color: 'bg-orange-500',
    },
    {
      id: '2',
      name: 'Durban Rovers',
      sport: 'Rugby Union',
      record: '9-5-0',
      rank: '#3 in Western Cup',
      abbreviation: 'DB',
      color: 'bg-blue-600',
    },
    {
      id: '3',
      name: 'Strykers FC',
      sport: 'Football',
      record: '18-3-2',
      rank: '#1 in Super League',
      abbreviation: 'ST',
      color: 'bg-red-600',
    },
  ];

  const toggleFollow = (id: string) => {
    setFollowedTeams((prev) =>
      prev.includes(id) ? prev.filter((tId) => tId !== id) : [...prev, id]
    );
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER SECTION */}
        <View className="mb-6">
          {isLargeScreen && (
            <Text className="font-orbitron-bold text-2xl tracking-widest text-slate-800 dark:text-white uppercase mb-2">
              Teams
            </Text>
          )}
          <Text className="font-inter text-sm text-slate-500 dark:text-slate-400">
            Search active sports teams, check their records, and personalize your feed by following them.
          </Text>
        </View>

        {/* SEARCH BAR PLACEHOLDER */}
        <View className="flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 mb-6 shadow-sm">
          <Ionicons name="search-outline" size={18} color="#94A3B8" />
          <TextInput
            placeholder="Search teams..."
            placeholderTextColor="#94A3B8"
            className="flex-1 font-inter text-slate-800 dark:text-white text-sm ml-2.5 outline-none"
            editable={false}
          />
        </View>

        {/* COACHED TEAMS SECTION */}
        {isAuthenticated && (user?.globalRole === 'admin' || user?.isAdminOrCoach) && (
          <View className="mb-8">
            <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
              My Coached Teams
            </Text>
            <View className="space-y-4">
              {coachedTeams.map((team) => (
                <GlassCard key={team.id} className="border border-slate-200 dark:border-white/5 shadow-sm p-4 relative overflow-hidden">
                  {/* Premium glowing highlight line for coaching state */}
                  <View className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-orange" />

                  <View className="flex-row items-center justify-between pl-1.5">
                    <View className="flex-row items-center gap-3.5 flex-1">
                      <View className={`w-11 h-11 rounded-xl ${team.color} items-center justify-center shadow-inner`}>
                        <Text className="font-orbitron-bold text-sm text-white">{team.abbreviation}</Text>
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white leading-tight">
                            {team.name}
                          </Text>
                          <View className="bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded">
                            <Text className="font-orbitron-bold text-[8px] text-brand-blue uppercase tracking-wider">
                              {team.role}
                            </Text>
                          </View>
                        </View>
                        <Text className="font-inter text-[11px] text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">
                          {team.sport} • {team.record} ({team.rank})
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => {}}
                      className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 active:opacity-85 shadow-sm"
                    >
                      <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300">
                        Manage Team
                      </Text>
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              ))}
            </View>
          </View>
        )}

        {/* LIST OF TEAMS */}
        <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
          All Teams
        </Text>
        <View className="space-y-4">
          {teams.map((team) => {
            const isFollowing = followedTeams.includes(team.id);
            return (
              <GlassCard key={team.id} className="border border-slate-200 dark:border-white/5 shadow-sm p-4 flex-row items-center justify-between gap-4">
                <View className="flex-row items-center gap-3.5 flex-1">
                  {/* Team Logo Emblem Placeholder */}
                  <View className={`w-11 h-11 rounded-xl ${team.color} items-center justify-center shadow-inner`}>
                    <Text className="font-orbitron-bold text-sm text-white">{team.abbreviation}</Text>
                  </View>

                  <View className="flex-1">
                    <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white leading-tight">
                      {team.name}
                    </Text>
                    <Text className="font-inter text-[11px] text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">
                      {team.sport} • {team.record} ({team.rank})
                    </Text>
                  </View>
                </View>

                {/* Follow Button */}
                <TouchableOpacity
                  onPress={() => toggleFollow(team.id)}
                  className={`px-4 py-2.5 rounded-xl flex-row items-center gap-1.5 border active:opacity-85 ${
                    isFollowing
                      ? 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'
                      : 'bg-brand-orange border-brand-orange shadow-sm shadow-brand-orange/20'
                  }`}
                >
                  <Ionicons 
                    name={isFollowing ? "star" : "star-outline"} 
                    size={14} 
                    color={isFollowing ? "#FF3E00" : "#FFFFFF"} 
                  />
                  <Text 
                    className={`font-inter-bold text-xs ${
                      isFollowing ? 'text-slate-700 dark:text-slate-300' : 'text-white'
                    }`}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
                </TouchableOpacity>
              </GlassCard>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
