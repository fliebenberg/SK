import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { GlassCard } from '../../components/GlassCard';
import { Button } from '../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../store/settingsStore';

export default function AllOrganizations() {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';
  const [searchQuery, setSearchQuery] = useState('');

  const allOrgs = [
    {
      id: 'org-1',
      name: 'Premier Rugby Union',
      sport: 'Rugby Union',
      primaryColor: '#FF3E00',
      teamsCount: 24,
      facilitiesCount: 3,
      membersCount: 1450,
      status: 'Active',
    },
    {
      id: 'org-2',
      name: 'Metro Football League',
      sport: 'Football',
      primaryColor: '#00E5FF',
      teamsCount: 48,
      facilitiesCount: 6,
      membersCount: 3200,
      status: 'Active',
    },
    {
      id: 'org-3',
      name: 'Cape Town Squash Club',
      sport: 'Squash',
      primaryColor: '#10B981',
      teamsCount: 8,
      facilitiesCount: 2,
      membersCount: 340,
      status: 'Pending Verification',
    },
    {
      id: 'org-4',
      name: 'Golden League Netball',
      sport: 'Netball',
      primaryColor: '#D97706',
      teamsCount: 16,
      facilitiesCount: 4,
      membersCount: 890,
      status: 'Active',
    },
  ];

  const filteredOrgs = allOrgs.filter(org => 
    org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    org.sport.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER SECTION */}
        <View className="mb-6">
          <Text className="font-inter text-sm text-slate-500 dark:text-slate-400">
            Global view of all registered tenant organizations, leagues, and clubs in ScoreKeeper.
          </Text>
        </View>

        {/* SEARCH BAR */}
        <View className="flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 mb-6 shadow-sm">
          <Ionicons name="search-outline" size={18} color="#94A3B8" />
          <TextInput
            placeholder="Search all organizations..."
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

        {/* LIST OF ORGANIZATIONS */}
        <View className="space-y-4 mb-8">
          {filteredOrgs.map((org) => (
            <GlassCard 
              key={org.id} 
              className="border border-slate-200 dark:border-white/5 shadow-sm p-5 relative overflow-hidden"
            >
              {/* Highlight strip based on org primary color */}
              <View 
                className="absolute left-0 top-0 bottom-0 w-1.5"
                style={{ backgroundColor: org.primaryColor }}
              />

              <View className="flex-row justify-between items-start mb-3 pl-1.5">
                <View className="flex-row items-center gap-2 bg-slate-100 dark:bg-white/10 px-2.5 py-1 rounded-full">
                  <Text className="font-inter-bold text-[9px] text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    {org.sport}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <View 
                    className={`w-1.5 h-1.5 rounded-full ${
                      org.status === 'Active' ? 'bg-emerald-500' : 'bg-amber-500'
                    }`} 
                  />
                  <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {org.status}
                  </Text>
                </View>
              </View>

              <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white mb-4 pl-1.5">
                {org.name}
              </Text>

              {/* STATS */}
              <View className="flex-row gap-6 mb-5 pl-1.5">
                <View>
                  <Text className="font-orbitron-bold text-sm text-slate-700 dark:text-slate-300 leading-none">
                    {org.membersCount}
                  </Text>
                  <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">
                    Members
                  </Text>
                </View>
                <View>
                  <Text className="font-orbitron-bold text-sm text-slate-700 dark:text-slate-300 leading-none">
                    {org.teamsCount}
                  </Text>
                  <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">
                    Teams
                  </Text>
                </View>
                <View>
                  <Text className="font-orbitron-bold text-sm text-slate-700 dark:text-slate-300 leading-none">
                    {org.facilitiesCount}
                  </Text>
                  <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">
                    Facilities
                  </Text>
                </View>
              </View>

              <View className="flex-row justify-end gap-3 pl-1.5">
                <Button
                  title="Enter Dashboard"
                  variant="primary"
                  onPress={() => router.push(`/admin/${org.id}` as any)}
                  className="px-6 py-2 rounded-lg"
                />
              </View>
            </GlassCard>
          ))}

          {filteredOrgs.length === 0 && (
            <View className="items-center justify-center py-12">
              <Ionicons name="search-outline" size={48} color="#94A3B8" className="opacity-40 mb-3" />
              <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300">
                No Results Found
              </Text>
              <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 text-center mt-1">
                Try refining your search keyword.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
