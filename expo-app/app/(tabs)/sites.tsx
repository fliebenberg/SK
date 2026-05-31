import React from 'react';
import { View, Text, ScrollView, TextInput, useWindowDimensions } from 'react-native';
import { GlassCard } from '../../components/GlassCard';
import { Button } from '../../components/Button';
import { Ionicons } from '@expo/vector-icons';

export default function SitesPage() {
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;

  const sites = [
    {
      id: '1',
      name: 'Central Sports Complex',
      address: '100 Stadium Road, Cape Town',
      facilities: ['Rugby Field 1', 'Rugby Field 2', 'Athletic Track'],
      gamesScheduled: 4,
    },
    {
      id: '2',
      name: 'East Campus Fields',
      address: 'University Drive, Durban',
      facilities: ['Soccer Pitch A', 'Soccer Pitch B', 'Netball Court 1'],
      gamesScheduled: 2,
    },
  ];

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER SECTION */}
        <View className="mb-6">
          {isLargeScreen && (
            <Text className="font-orbitron-bold text-2xl tracking-widest text-slate-800 dark:text-white uppercase mb-2">
              Sites & Venues
            </Text>
          )}
          <Text className="font-inter text-sm text-slate-500 dark:text-slate-400">
            Browse match locations, view facility lists, and see where games are scheduled near you.
          </Text>
        </View>

        {/* SEARCH BAR PLACEHOLDER */}
        <View className="flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 mb-6 shadow-sm">
          <Ionicons name="search-outline" size={18} color="#94A3B8" />
          <TextInput
            placeholder="Search venues..."
            placeholderTextColor="#94A3B8"
            className="flex-1 font-inter text-slate-800 dark:text-white text-sm ml-2.5 outline-none"
            editable={false}
          />
        </View>

        {/* LIST OF SITES */}
        <View className="space-y-4">
          {sites.map((site) => (
            <GlassCard key={site.id} className="border border-slate-200 dark:border-white/5 shadow-sm p-5">
              <View className="flex-row justify-between items-start mb-3">
                <View className="flex-1">
                  <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white mb-1">
                    {site.name}
                  </Text>
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="location-outline" size={12} color="#94A3B8" />
                    <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400">
                      {site.address}
                    </Text>
                  </View>
                </View>
                {site.gamesScheduled > 0 && (
                  <View className="bg-brand-orange/10 px-2.5 py-1 rounded-full border border-brand-orange/20">
                    <Text className="font-orbitron text-[9px] text-brand-orange uppercase">
                      {site.gamesScheduled} Games Scheduled
                    </Text>
                  </View>
                )}
              </View>

              {/* FACILITIES CONTAINER */}
              <View className="mt-4 mb-4">
                <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                  Facilities Available
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {site.facilities.map((fac, idx) => (
                    <View 
                      key={idx} 
                      className="bg-slate-100 dark:bg-white/5 px-2.5 py-1.5 rounded-lg border border-slate-200/50 dark:border-white/5"
                    >
                      <Text className="font-inter text-xs text-slate-600 dark:text-slate-300">
                        {fac}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              <Button
                title="View Facility Layout"
                variant="secondary"
                onPress={() => {}}
                className="w-full shadow-sm"
              />
            </GlassCard>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
