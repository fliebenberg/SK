import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../components/GlassCard';
import { Button } from '../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../store/settingsStore';

interface Team {
  id: string;
  name: string;
  sport: string;
  players: number;
  coach: string;
}

interface Fixture {
  id: string;
  title: string;
  sport: string;
  home: string;
  away: string;
  date: string;
  time: string;
  venue: string;
}

interface Facility {
  id: string;
  name: string;
  type: string;
  location: string;
}

interface OrgDetails {
  name: string;
  sports: string[];
  membersCount: string;
  teamsCount: number;
  eventsCount: number;
  facilitiesCount: number;
  primaryColor: string;
  secondaryColor: string;
  description: string;
  membershipStatus: string;
  registrationStatus: string;
  teams: Team[];
  fixtures: Fixture[];
  facilities: Facility[];
}

export default function PublicOrgDetail() {
  const router = useRouter();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;

  const [activeTab, setActiveTab] = useState<'overview' | 'teams' | 'fixtures' | 'facilities'>('overview');

  // Multi-sports registry to support rich details & customized branding colors per org
  const orgRegistry: Record<string, OrgDetails> = {
    'org-1': {
      name: 'Premier Rugby Union',
      sports: ['Rugby Union', 'Seven-a-Side'],
      membersCount: '1,450',
      teamsCount: 24,
      eventsCount: 3,
      facilitiesCount: 3,
      primaryColor: '#FF3E00', // Burnt Orange
      secondaryColor: '#F59E0B', // Amber
      description: 'Premier Rugby Union is the leading governing body and tournament organizer for rugby clubs across the western province. Established in 2012, we manage age-group leagues, professional development pathways, and local club fixtures. Our certified coaching programs have trained over 120 regional coaches.',
      membershipStatus: 'Active Member since Nov 2022',
      registrationStatus: 'Player Registrations Open for Winter League',
      teams: [
        { id: 't1', name: 'Cape Town RFC First XV', sport: 'Rugby Union', players: 32, coach: 'Hendrik van der Merwe' },
        { id: 't2', name: 'PRU Sevens Chiefs', sport: 'Seven-a-Side', players: 14, coach: 'Sipho Ndlovu' },
        { id: 't3', name: 'PRU Development Academy', sport: 'Rugby Union', players: 28, coach: 'Alan Shearer' }
      ],
      fixtures: [
        { id: 'f1', title: 'Season Grand Final', sport: 'Rugby Union', home: 'Cape Town RFC First XV', away: 'Durban Rovers', date: 'June 10, 2026', time: '15:00', venue: 'Green Point Arena' },
        { id: 'f2', title: 'Super Sevens Opener', sport: 'Seven-a-Side', home: 'PRU Sevens Chiefs', away: 'Boland Blitz', date: 'June 14, 2026', time: '10:30', venue: 'Coetzenburg Field' }
      ],
      facilities: [
        { id: 's1', name: 'Green Point Arena', type: 'Match Venue', location: 'Green Point, Cape Town' },
        { id: 's2', name: 'Coetzenburg Fields', type: 'Training Grounds', location: 'Stellenbosch' },
        { id: 's3', name: 'PRU Gymnasium', type: 'High Performance Centre', location: 'Newlands, Cape Town' }
      ]
    },
    'org-2': {
      name: 'Metro Football League',
      sports: ['Football', 'Futsal'],
      membersCount: '3,200',
      teamsCount: 48,
      eventsCount: 6,
      facilitiesCount: 6,
      primaryColor: '#00E5FF', // Cyan
      secondaryColor: '#10B981', // Emerald
      description: "Metro Football League coordinates premier and community association football divisions. Hosting 48 clubs across multiple youth, amateur, and veteran leagues, MFL operates the region's largest community sports roster. We utilize top-class turf grounds and state-of-the-art futsal facilities.",
      membershipStatus: 'Active Member since Jan 2021',
      registrationStatus: 'Futsal Registrations Open for Summer Cup',
      teams: [
        { id: 't4', name: 'Metro Athletic FC', sport: 'Football', players: 22, coach: 'Marco Silva' },
        { id: 't5', name: 'Metro City Futsal', sport: 'Futsal', players: 10, coach: 'Carlos Santos' },
        { id: 't6', name: 'Metro Juniors Academy', sport: 'Football', players: 25, coach: 'Sarah Jenkins' }
      ],
      fixtures: [
        { id: 'f3', title: 'Championship Cup Semi', sport: 'Football', home: 'Metro Athletic FC', away: 'Atlantic Coast FC', date: 'June 8, 2026', time: '19:30', venue: 'Champs Stadium' },
        { id: 'f4', title: 'Futsal Friday League', sport: 'Futsal', home: 'Metro City Futsal', away: 'Vasco Futsal', date: 'June 12, 2026', time: '20:00', venue: 'Metro Indoor Arena' }
      ],
      facilities: [
        { id: 's4', name: 'Champs Stadium', type: 'Grass Pitch', location: 'Green Point, Cape Town' },
        { id: 's5', name: 'Metro Indoor Arena', type: 'Hard Court', location: 'Maitland, Cape Town' },
        { id: 's6', name: 'City Astro Pitch', type: 'Artificial Turf', location: 'Rondebosch, Cape Town' }
      ]
    }
  };

  // Add fallbacks to allow resolving generic IDs '1' or '2'
  orgRegistry['1'] = orgRegistry['org-1'];
  orgRegistry['2'] = orgRegistry['org-2'];

  const org = orgRegistry[orgId || 'org-1'] || orgRegistry['org-1'];

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/organizations')}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-xs tracking-widest text-slate-800 dark:text-white uppercase">
          Organization Profile
        </Text>
        <View className="w-10 h-2" />
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* BRANDED HERO CARD WITH ACCENT GLOW */}
        <GlassCard className="border border-slate-200 dark:border-white/5 p-6 mb-6 relative overflow-hidden bg-slate-50/50 dark:bg-slate-900/50">
          <View
            className="absolute -right-24 -top-24 w-48 h-48 rounded-full blur-[60px] opacity-[0.08]"
            style={{ backgroundColor: org.primaryColor }}
          />

          {/* SPORTS BADGES ROW */}
          <View className="flex-row flex-wrap gap-2 mb-3">
            {org.sports.map((sport) => (
              <View
                key={sport}
                className="bg-slate-100 dark:bg-white/10 px-3 py-1 rounded-full border border-slate-200/50 dark:border-white/5"
              >
                <Text className="font-inter-bold text-[9px] text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  {sport}
                </Text>
              </View>
            ))}
          </View>

          <Text className="font-orbitron-bold text-2xl text-slate-800 dark:text-white mb-2 uppercase tracking-wide">
            {org.name}
          </Text>

          <View className="flex-row items-center gap-1.5 mb-5 bg-brand-orange/5 dark:bg-brand-orange/10 px-3 py-1 rounded-lg w-fit">
            <Ionicons name="ribbon-outline" size={14} color="#FF3E00" />
            <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
              {org.membershipStatus}
            </Text>
          </View>

          {/* QUICK METRICS GRID */}
          <View className="flex-row justify-between border-t border-slate-200/50 dark:border-white/5 pt-4">
            <View className="items-center flex-1">
              <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white">
                {org.membersCount}
              </Text>
              <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                Members
              </Text>
            </View>
            <View className="items-center flex-1 border-l border-slate-200/50 dark:border-white/5">
              <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white">
                {org.teamsCount}
              </Text>
              <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                Teams
              </Text>
            </View>
            <View className="items-center flex-1 border-l border-slate-200/50 dark:border-white/5">
              <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white">
                {org.eventsCount}
              </Text>
              <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                Fixtures
              </Text>
            </View>
            <View className="items-center flex-1 border-l border-slate-200/50 dark:border-white/5">
              <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white">
                {org.facilitiesCount}
              </Text>
              <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                Sites
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* INTERACTIVE NAVIGATION TABS */}
        <View className="flex-row bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-1 rounded-xl mb-6 gap-1">
          {(['overview', 'teams', 'fixtures', 'facilities'] as const).map((tab) => {
            const isTabActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 rounded-lg items-center active:opacity-85 ${
                  isTabActive
                    ? 'bg-slate-100 dark:bg-white/10'
                    : 'bg-transparent'
                }`}
              >
                <Text
                  className={`font-orbitron-bold text-[10px] uppercase tracking-wider ${
                    isTabActive
                      ? 'text-brand-orange'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* TAB CONTENTS */}
        <View className="mb-6">
          {activeTab === 'overview' && (
            <View className="space-y-4">
              <GlassCard className="border border-slate-200 dark:border-white/5 p-5">
                <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
                  About Organization
                </Text>
                <Text className="font-inter text-sm text-slate-700 dark:text-slate-300 leading-6">
                  {org.description}
                </Text>
              </GlassCard>

              <GlassCard className="border border-brand-orange/20 bg-brand-orange/5 p-5 flex-row items-center gap-3">
                <Ionicons name="information-circle-outline" size={22} color="#FF3E00" />
                <View className="flex-1">
                  <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white uppercase tracking-wider">
                    Registration Alert
                  </Text>
                  <Text className="font-inter text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    {org.registrationStatus}
                  </Text>
                </View>
              </GlassCard>
            </View>
          )}

          {activeTab === 'teams' && (
            <View className="space-y-4">
              {org.teams.map((team) => (
                <GlassCard key={team.id} className="border border-slate-200 dark:border-white/5 p-4 flex-row justify-between items-center">
                  <View className="flex-1 mr-3">
                    <View className="bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-full w-fit mb-2 border border-slate-200/50 dark:border-white/5">
                      <Text className="font-inter-bold text-[8px] text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        {team.sport}
                      </Text>
                    </View>
                    <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white uppercase tracking-wide">
                      {team.name}
                    </Text>
                    <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 mt-1">
                      Coach: {team.coach}
                    </Text>
                  </View>
                  <View className="items-end bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2">
                    <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white">
                      {team.players}
                    </Text>
                    <Text className="font-inter text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-0.5">
                      Players
                    </Text>
                  </View>
                </GlassCard>
              ))}
            </View>
          )}

          {activeTab === 'fixtures' && (
            <View className="space-y-4">
              {org.fixtures.map((fix) => (
                <GlassCard key={fix.id} className="border border-slate-200 dark:border-white/5 p-5">
                  <View className="flex-row justify-between items-center mb-3">
                    <View className="bg-brand-orange/10 px-2.5 py-0.5 rounded border border-brand-orange/20">
                      <Text className="font-orbitron-bold text-[8px] text-brand-orange uppercase tracking-wider">
                        {fix.title}
                      </Text>
                    </View>
                    <Text className="font-inter-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      {fix.sport}
                    </Text>
                  </View>

                  <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white text-center py-2 uppercase tracking-wide">
                    {fix.home} <Text className="text-brand-orange text-xs font-inter lowercase">vs</Text> {fix.away}
                  </Text>

                  <View className="flex-row justify-between border-t border-slate-100 dark:border-white/5 pt-3 mt-1">
                    <View className="flex-row items-center gap-1.5">
                      <Ionicons name="calendar-outline" size={13} color="#FF3E00" />
                      <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
                        {fix.date} @ {fix.time}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      <Ionicons name="location-outline" size={13} color="#FF3E00" />
                      <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
                        {fix.venue}
                      </Text>
                    </View>
                  </View>
                </GlassCard>
              ))}
            </View>
          )}

          {activeTab === 'facilities' && (
            <View className="space-y-4">
              {org.facilities.map((fac) => (
                <GlassCard key={fac.id} className="border border-slate-200 dark:border-white/5 p-4 flex-row items-center gap-3.5">
                  <View className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-850/20 items-center justify-center">
                    <Ionicons name="location-outline" size={18} color="#8B5CF6" />
                  </View>
                  <View className="flex-1">
                    <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white uppercase tracking-wide">
                      {fac.name}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-1">
                      <Text className="font-inter-bold text-[9px] text-purple-600 dark:text-purple-400 uppercase tracking-wide bg-purple-100 dark:bg-purple-950/40 px-2 py-0.5 rounded border border-purple-200/50 dark:border-purple-800/30">
                        {fac.type}
                      </Text>
                      <Text className="font-inter text-xs text-slate-400 dark:text-slate-500">
                        {fac.location}
                      </Text>
                    </View>
                  </View>
                </GlassCard>
              ))}
            </View>
          )}
        </View>

        {/* PREMIUM ACTION CTA CARD */}
        <GlassCard className="bg-brand-orange/5 border border-brand-orange/20 p-5 items-center">
          <Ionicons name="mail-unread-outline" size={24} color="#FF3E00" className="mb-2" />
          <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white text-center mb-1 uppercase tracking-wide">
            INTERESTED IN JOINING?
          </Text>
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 text-center mb-4 leading-4">
            Contact the organization administration team to enquire about league placements or roster registrations.
          </Text>
          <Button
            title="Inquire / Register as Athlete"
            variant="primary"
            onPress={() => {}}
            className="w-full max-w-xs"
          />
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  );
}
