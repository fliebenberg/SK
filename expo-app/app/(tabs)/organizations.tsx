import React from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { GlassCard } from '../../components/GlassCard';
import { Button } from '../../components/Button';
import { Ionicons } from '@expo/vector-icons';

export default function OrganizationsPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;

  const orgs = [
    {
      id: '1',
      name: 'Premier Rugby Union',
      sport: 'Rugby Union',
      icon: 'trophy-outline' as const,
      teamsCount: 24,
      eventsCount: 3,
      membersCount: '1,450',
    },
    {
      id: '2',
      name: 'Metro Football League',
      sport: 'Football',
      icon: 'football-outline' as const,
      teamsCount: 48,
      eventsCount: 6,
      membersCount: '3,200',
    },
  ];

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER SECTION */}
        <View className="mb-6">
          {isLargeScreen && (
            <Text className="font-orbitron-bold text-2xl tracking-widest text-slate-800 dark:text-white uppercase mb-2">
              Organizations
            </Text>
          )}
          <Text className="font-inter text-sm text-slate-500 dark:text-slate-400">
            Browse and search active sports clubs, schools, and leagues on ScoreKeeper.
          </Text>
        </View>

        {/* SEARCH BAR PLACEHOLDER */}
        <View className="flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 mb-6 shadow-sm">
          <Ionicons name="search-outline" size={18} color="#94A3B8" />
          <TextInput
            placeholder="Search organizations..."
            placeholderTextColor="#94A3B8"
            className="flex-1 font-inter text-slate-800 dark:text-white text-sm ml-2.5 outline-none"
            editable={false}
          />
        </View>

        {/* LIST OF ORGANIZATIONS */}
        <View className="space-y-4 mb-8">
          {orgs.map((org) => (
            <GlassCard key={org.id} className="border border-slate-200 dark:border-white/5 shadow-sm p-5">
              <View className="flex-row justify-between items-start mb-3">
                <View className="flex-row items-center gap-2 bg-slate-100 dark:bg-white/10 px-2.5 py-1 rounded-full">
                  <Ionicons name={org.icon} size={12} color="#FF3E00" />
                  <Text className="font-inter-bold text-[10px] text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    {org.sport}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Ionicons name="people-outline" size={12} color="#94A3B8" />
                  <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400">
                    {org.membersCount} Members
                  </Text>
                </View>
              </View>

              <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white mb-4">
                {org.name}
              </Text>

              {/* STATS BLOCKS */}
              <View className="flex-row gap-6 mb-4">
                <View>
                  <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300 leading-none">
                    {org.teamsCount}
                  </Text>
                  <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">
                    Teams
                  </Text>
                </View>
                <View>
                  <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300 leading-none">
                    {org.eventsCount}
                  </Text>
                  <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">
                    Events
                  </Text>
                </View>
              </View>

              <Button
                title="View Profile"
                variant="secondary"
                onPress={() => {}}
                className="w-full shadow-sm"
              />
            </GlassCard>
          ))}
        </View>

        {/* BOTTOM CALL TO ACTION CARD */}
        <GlassCard className="bg-brand-orange/5 border border-brand-orange/20 p-5 items-center">
          <Ionicons name="business-outline" size={24} color="#FF3E00" className="mb-2" />
          <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white text-center mb-1 uppercase tracking-wide">
            OWN AN ORGANIZATION?
          </Text>
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 text-center mb-4 leading-4">
            Create a workspace to manage rosters, event fixtures, and certified scorekeepers.
          </Text>
          <Button
            title="Manage Organizations"
            variant="primary"
            onPress={() => router.push('/admin/organizations')}
            className="w-full max-w-xs"
          />
        </GlassCard>
      </ScrollView>
    </View>
  );
}
