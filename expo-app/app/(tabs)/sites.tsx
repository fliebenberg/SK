import React from 'react';
import { View, Text, ScrollView, TextInput, useWindowDimensions } from 'react-native';
import { GlassCard } from '../../components/GlassCard';
import { Button } from '../../components/Button';
import { Ionicons } from '@expo/vector-icons';

import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
export default function SitesPage() {
  const isDark = useActiveTheme() === 'dark';
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
    <View className="flex-1 bg-canvas">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER SECTION */}
        <View className="mb-6">
          {isLargeScreen && (
            <Text className="font-orbitron-bold text-2xl tracking-widest text-ink uppercase mb-2">
              Sites & Facilities
            </Text>
          )}
          <Text className="font-inter text-sm text-ink-muted">
            Browse match locations, view facility lists, and see where games are scheduled near you.
          </Text>
        </View>

        {/* SEARCH BAR PLACEHOLDER */}
        <View className="flex-row items-center bg-card border border-line rounded-xl px-4 py-3 mb-6 shadow-sm">
          <Ionicons name="search-outline" size={18} color={themeColor(isDark, 'ink-muted')} />
          <TextInput
            placeholder="Search sites..."
            placeholderTextColor={themeColor(isDark, 'ink-muted')}
            className="flex-1 font-inter text-ink text-sm ml-2.5 outline-none"
            editable={false}
          />
        </View>

        {/* LIST OF SITES */}
        <View className="space-y-4">
          {sites.map((site) => (
            <GlassCard key={site.id} className="border border-line shadow-sm p-5">
              <View className="flex-row justify-between items-start mb-3">
                <View className="flex-1">
                  <Text className="font-orbitron-bold text-lg text-ink mb-1">
                    {site.name}
                  </Text>
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="location-outline" size={12} color={themeColor(isDark, 'ink-muted')} />
                    <Text className="font-inter text-[11px] text-ink-muted">
                      {site.address}
                    </Text>
                  </View>
                </View>
                {site.gamesScheduled > 0 && (
                  <View className="bg-primary-soft px-2.5 py-1 rounded-full border border-primary-line">
                    <Text className="font-orbitron text-[9px] text-primary-ink uppercase">
                      {site.gamesScheduled} Games Scheduled
                    </Text>
                  </View>
                )}
              </View>

              {/* FACILITIES CONTAINER */}
              <View className="mt-4 mb-4">
                <Text className="font-inter-bold text-[10px] text-ink-muted uppercase tracking-widest mb-2">
                  Facilities Available
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {site.facilities.map((fac, idx) => (
                    <View 
                      key={idx} 
                      className="bg-sunken px-2.5 py-1.5 rounded-lg border border-line-soft"
                    >
                      <Text className="font-inter text-xs text-ink-soft">
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
