import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { GlassCard } from '../../../components/GlassCard';
import { Button } from '../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../store/settingsStore';

export default function OrgSites() {
  const isDark = useActiveTheme() === 'dark';
  const [searchQuery, setSearchQuery] = useState('');

  const sites = [
    {
      id: 'site-1',
      name: 'Main Stadium Complex',
      location: '12 Sports Ave, Cape Town',
      courtsCount: 3,
      sports: ['Rugby Union', 'Football'],
    },
    {
      id: 'site-2',
      name: 'Seapoint Sports Gym',
      location: 'Beach Road, Seapoint',
      courtsCount: 1,
      sports: ['Netball', 'Squash'],
    },
    {
      id: 'site-3',
      name: 'Rovers Training Turf',
      location: ' Durban North Rd, Durban',
      courtsCount: 2,
      sports: ['Football', 'Rugby Union'],
    },
  ];

  const filteredSites = sites.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER SECTION */}
        <View className="mb-6 flex-row justify-between items-center">
          <View className="flex-1 mr-4">
            <Text className="font-orbitron-bold text-xl text-slate-800 dark:text-white uppercase mb-1">
              Facilities & Sites
            </Text>
            <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
              Manage court slots, fields, and stadium facilities used by this organization for matches.
            </Text>
          </View>
          <TouchableOpacity 
            className="w-10 h-10 rounded-xl bg-brand-orange items-center justify-center shadow-md shadow-brand-orange/20 active:opacity-85"
            onPress={() => {}}
          >
            <Ionicons name="location-outline" size={20} color="white" />
          </TouchableOpacity>
        </View>

        {/* SEARCH BAR */}
        <View className="flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 mb-6 shadow-sm">
          <Ionicons name="search-outline" size={18} color="#94A3B8" />
          <TextInput
            placeholder="Search facilities or venues..."
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

        {/* SITES LIST */}
        <View className="space-y-4">
          {filteredSites.map((site) => (
            <GlassCard 
              key={site.id}
              className="border border-slate-200 dark:border-white/5 p-5"
            >
              <View className="flex-row justify-between items-start mb-3">
                <View className="flex-row items-center gap-1.5 bg-slate-100 dark:bg-white/10 px-2.5 py-1 rounded-full">
                  <Ionicons name="business" size={10} color="#FF3E00" />
                  <Text className="font-inter-bold text-[9px] text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    {site.courtsCount} Court / Field Zones
                  </Text>
                </View>
              </View>

              <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white mb-2">
                {site.name}
              </Text>

              {/* LOCATION */}
              <View className="flex-row items-center gap-2 mb-4">
                <Ionicons name="map-outline" size={14} color="#94A3B8" />
                <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
                  {site.location}
                </Text>
              </View>

              {/* SPORTS SUPPORTED */}
              <View className="flex-row gap-1.5 flex-wrap mb-4">
                {site.sports.map(s => (
                  <View key={s} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5">
                    <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 uppercase font-semibold">
                      {s}
                    </Text>
                  </View>
                ))}
              </View>

              <View className="flex-row gap-3">
                <Button
                  title="Configure Courts"
                  variant="secondary"
                  onPress={() => {}}
                  className="flex-grow shadow-sm py-2 rounded-lg"
                />
              </View>
            </GlassCard>
          ))}

          {filteredSites.length === 0 && (
            <View className="items-center justify-center py-12">
              <Ionicons name="location-outline" size={48} color="#94A3B8" className="opacity-40 mb-3" />
              <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300">
                No Sites Registered
              </Text>
              <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 text-center mt-1">
                Register training venues and sports fields to schedule fixtures.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
