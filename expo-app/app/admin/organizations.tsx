import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { GlassCard } from '../../components/GlassCard';
import { Button } from '../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../store/settingsStore';

export default function AdminOrganizations() {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';
  const managedOrgs = [
    {
      id: 'org-1',
      name: 'Premier Rugby Union',
      sport: 'Rugby Union',
      role: 'Owner',
      teamsCount: 24,
      facilitiesCount: 3,
    },
    {
      id: 'org-2',
      name: 'Metro Football League',
      sport: 'Football',
      role: 'Owner',
      teamsCount: 48,
      facilitiesCount: 6,
    },
  ];

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER */}
        <View className="mb-6 mt-2">
          <Text className="font-inter text-sm text-slate-500 dark:text-slate-400 leading-5">
            Configure rosters, view registered players, manage game scheduling, and verify club settings.
          </Text>
        </View>

        {/* MANAGED ORGANIZATIONS LIST */}
        <View className="space-y-4 mb-8">
          {managedOrgs.map((org) => (
            <GlassCard key={org.id} className="border border-slate-200 dark:border-white/5 p-5">
              <View className="flex-row justify-between items-center mb-3">
                <View className="bg-slate-100 dark:bg-white/10 px-2.5 py-1 rounded-full border border-slate-200/50 dark:border-white/5">
                  <Text className="font-inter-bold text-[9px] text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    {org.sport}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Ionicons name="shield-checkmark" size={12} color={isDark ? "#00E5FF" : "#155e75"} />
                  <Text className="font-inter-bold text-[10px] text-cyan-800 dark:text-brand-blue uppercase tracking-wider">
                    {org.role}
                  </Text>
                </View>
              </View>

              <View className="flex-row justify-between items-center mb-4">
                <TouchableOpacity 
                  onPress={() => router.push(`/admin/${org.id}` as any)}
                  className="flex-1 mr-2"
                >
                  <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white uppercase tracking-wide">
                    {org.name}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.push(`/admin/${org.id}` as any)}
                  className="p-2 bg-brand-orange/10 dark:bg-brand-orange/20 rounded-lg active:opacity-85"
                >
                  <Ionicons name="arrow-forward" size={16} color="#FF3E00" />
                </TouchableOpacity>
              </View>

              {/* DETAILS */}
              <View className="flex-row gap-8 mb-5">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="people-outline" size={16} color="#FF3E00" />
                  <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
                    {org.teamsCount} Teams
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <Ionicons name="location-outline" size={16} color="#FF3E00" />
                  <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
                    {org.facilitiesCount} Facilities
                  </Text>
                </View>
              </View>

              <View className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  title="Configure Roster"
                  variant="secondary"
                  onPress={() => router.push(`/admin/${org.id}/people` as any)}
                  className="shadow-sm"
                />
                <Button
                  title="Manage Schedule"
                  variant="secondary"
                  onPress={() => router.push(`/admin/${org.id}/events` as any)}
                  className="shadow-sm"
                />
              </View>
            </GlassCard>
          ))}
        </View>

        {/* REGISTER NEW ORG ACTION */}
        <Button
          title="Register New Organization"
          variant="primary"
          onPress={() => {}}
          className="w-full shadow-md shadow-brand-orange/20"
        />
      </ScrollView>
    </View>
  );
}
