import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, useWindowDimensions } from 'react-native';
import { GlassCard } from '../../components/GlassCard';
import { Button } from '../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';

import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
export default function TeamsPage() {
  const isDark = useActiveTheme() === 'dark';
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
      color: 'bg-primary',
      label: 'text-on-primary',
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
      color: 'bg-primary',
      label: 'text-on-primary',
    },
    {
      id: '2',
      name: 'Durban Rovers',
      sport: 'Rugby Union',
      record: '9-5-0',
      rank: '#3 in Western Cup',
      abbreviation: 'DB',
      color: 'bg-info',
      label: 'text-on-info',
    },
    {
      id: '3',
      name: 'Strykers FC',
      sport: 'Football',
      record: '18-3-2',
      rank: '#1 in Super League',
      abbreviation: 'ST',
      color: 'bg-danger',
      label: 'text-on-danger',
    },
  ];

  const toggleFollow = (id: string) => {
    setFollowedTeams((prev) =>
      prev.includes(id) ? prev.filter((tId) => tId !== id) : [...prev, id]
    );
  };

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER SECTION */}
        <View className="mb-6">
          {isLargeScreen && (
            <Text className="font-orbitron-bold text-2xl tracking-widest text-ink uppercase mb-2">
              Teams
            </Text>
          )}
          <Text className="font-inter text-sm text-ink-muted">
            Search active sports teams, check their records, and personalize your feed by following them.
          </Text>
        </View>

        {/* SEARCH BAR PLACEHOLDER */}
        <View className="flex-row items-center bg-card border border-line rounded-xl px-4 py-3 mb-6 shadow-sm">
          <Ionicons name="search-outline" size={18} color={themeColor(isDark, 'ink-muted')} />
          <TextInput
            placeholder="Search teams..."
            placeholderTextColor={themeColor(isDark, 'ink-muted')}
            className="flex-1 font-inter text-ink text-sm ml-2.5 outline-none"
            editable={false}
          />
        </View>

        {/* COACHED TEAMS SECTION */}
        {isAuthenticated && (user?.globalRole === 'admin' || user?.isAdminOrCoach) && (
          <View className="mb-8">
            <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-widest mb-4">
              My Coached Teams
            </Text>
            <View className="space-y-4">
              {coachedTeams.map((team) => (
                <GlassCard key={team.id} className="border border-line shadow-sm p-4 relative overflow-hidden">
                  {/* Premium glowing highlight line for coaching state */}
                  <View className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary" />

                  <View className="flex-row items-center justify-between pl-1.5">
                    <View className="flex-row items-center gap-3.5 flex-1">
                      <View className={`w-11 h-11 rounded-xl ${team.color} items-center justify-center shadow-inner`}>
                        <Text className="font-orbitron-bold text-sm text-on-primary">{team.abbreviation}</Text>
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text className="font-orbitron-bold text-base text-ink leading-tight">
                            {team.name}
                          </Text>
                          <View className="bg-accent-soft border border-accent-line px-2 py-0.5 rounded">
                            <Text className="font-orbitron-bold text-[8px] text-accent-ink uppercase tracking-wider">
                              {team.role}
                            </Text>
                          </View>
                        </View>
                        <Text className="font-inter text-[11px] text-ink-muted mt-1 uppercase tracking-wider">
                          {team.sport} • {team.record} ({team.rank})
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => {}}
                      className="px-4 py-2.5 rounded-xl bg-sunken border border-line active:opacity-85 shadow-sm"
                    >
                      <Text className="font-inter-bold text-xs text-ink-soft">
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
        <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-widest mb-4">
          All Teams
        </Text>
        <View className="space-y-4">
          {teams.map((team) => {
            const isFollowing = followedTeams.includes(team.id);
            return (
              <GlassCard key={team.id} className="border border-line shadow-sm p-4 flex-row items-center justify-between gap-4">
                <View className="flex-row items-center gap-3.5 flex-1">
                  {/* Team Logo Emblem Placeholder */}
                  <View className={`w-11 h-11 rounded-xl ${team.color} items-center justify-center shadow-inner`}>
                    <Text className={`font-orbitron-bold text-sm ${team.label}`}>{team.abbreviation}</Text>
                  </View>

                  <View className="flex-1">
                    <Text className="font-orbitron-bold text-base text-ink leading-tight">
                      {team.name}
                    </Text>
                    <Text className="font-inter text-[11px] text-ink-muted mt-1 uppercase tracking-wider">
                      {team.sport} • {team.record} ({team.rank})
                    </Text>
                  </View>
                </View>

                {/* Follow Button */}
                <TouchableOpacity
                  onPress={() => toggleFollow(team.id)}
                  className={`px-4 py-2.5 rounded-xl flex-row items-center gap-1.5 border active:opacity-85 ${
                    isFollowing
                      ? 'bg-sunken border-line shadow-none'
                      : 'bg-primary border-primary shadow-sm shadow-primary/20'
                  }`}
                >
                  <Ionicons 
                    name={isFollowing ? "star" : "star-outline"} 
                    size={14} 
                    color={isFollowing ? themeColor(isDark, 'primary') : themeColor(isDark, 'on-primary')} 
                  />
                  <Text 
                    className={`font-inter-bold text-xs ${
                      isFollowing ? 'text-ink-soft' : 'text-on-primary'
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
