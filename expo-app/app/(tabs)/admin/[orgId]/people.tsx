import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../../store/settingsStore';

export default function OrgPeople() {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';
  const [searchQuery, setSearchQuery] = useState('');

  const members = [
    {
      id: 'usr-1',
      name: 'Fred Liebenberg',
      email: 'fred@scorekeeper.co.za',
      role: 'Owner',
      roleColor: '#FF3E00',
      roleBg: 'bg-brand-orange/10',
    },
    {
      id: 'usr-2',
      name: 'John Doe',
      email: 'john.doe@rugby.org',
      role: 'Coach',
      roleColor: '#00E5FF',
      roleBg: 'bg-cyan-500/10',
    },
    {
      id: 'usr-3',
      name: 'Sarah Connor',
      email: 'sarah@scorekeeper.co.za',
      role: 'Certified Scorer',
      roleColor: '#10B981',
      roleBg: 'bg-emerald-500/10',
    },
    {
      id: 'usr-4',
      name: 'James Smith',
      email: 'james.smith@athlete.net',
      role: 'Athlete',
      roleColor: '#8B5CF6',
      roleBg: 'bg-purple-500/10',
    },
  ];

  const filteredMembers = members.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.role.toLowerCase().includes(searchQuery.toLowerCase())
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
          People & Roles
        </Text>
        <TouchableOpacity 
          className="w-8 h-8 rounded-lg bg-brand-orange items-center justify-center shadow-md shadow-brand-orange/20 active:opacity-85"
          onPress={() => {}}
        >
          <Ionicons name="person-add-outline" size={16} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>

        {/* SEARCH BAR */}
        <View className="flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 mb-6 shadow-sm">
          <Ionicons name="search-outline" size={18} color="#94A3B8" />
          <TextInput
            placeholder="Search roster members..."
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

        {/* MEMBER LIST */}
        <View className="space-y-4">
          {filteredMembers.map((member) => (
            <GlassCard 
              key={member.id}
              className="border border-slate-200 dark:border-white/5 p-4 flex-row items-center justify-between"
            >
              <View className="flex-1 mr-4">
                <View className="flex-row items-center gap-2 mb-1 flex-wrap">
                  <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white">
                    {member.name}
                  </Text>
                  <View className={`px-2 py-0.5 rounded-full border border-slate-200 dark:border-white/5 ${member.roleBg}`}>
                    <Text 
                      className="font-inter-bold text-[8px] uppercase tracking-wider"
                      style={{ color: member.roleColor }}
                    >
                      {member.role}
                    </Text>
                  </View>
                </View>
                <Text className="font-inter text-xs text-slate-400 dark:text-slate-500">
                  {member.email}
                </Text>
              </View>

              <TouchableOpacity 
                className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg active:opacity-85"
                onPress={() => {}}
              >
                <Ionicons name="ellipsis-vertical" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </GlassCard>
          ))}

          {filteredMembers.length === 0 && (
            <View className="items-center justify-center py-12">
              <Ionicons name="people-outline" size={48} color="#94A3B8" className="opacity-40 mb-3" />
              <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300">
                No Members Found
              </Text>
              <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 text-center mt-1">
                Invite team personnel by tapping the add button at the top.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
