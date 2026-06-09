import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, useWindowDimensions, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../components/GlassCard';
import { Button } from '../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../store/settingsStore';
import { wsService } from '../../../services/websocket';
import { useWsStore } from '../../../store/wsStore';
import { OrgBrandedCard } from '@/components/OrgBrandedCard';
import { OrgLogo } from '@/components/OrgLogo';
import { getContrastColor } from '@/utils/colorUtils';
import { useAuthStore } from '@/store/authStore';

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
  const isConnected = useWsStore(state => state.isConnected);
  const { isAuthenticated, user, orgMemberships } = useAuthStore();

  const [orgData, setOrgData] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [sportsMap, setSportsMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isConnected || !orgId) return;

    setIsLoading(true);
    let loadedCount = 0;
    const checkDone = () => {
      loadedCount++;
      if (loadedCount === 5) setIsLoading(false);
    };

    wsService.emit('get_data', { type: 'sports' }, (res: any) => {
      const map: Record<string, string> = {};
      if (Array.isArray(res)) res.forEach((s: any) => { map[s.id] = s.name; });
      setSportsMap(map);
      checkDone();
    });

    wsService.emit('get_data', { type: 'organization', id: orgId }, (res: any) => {
      setOrgData(res);
      checkDone();
    });

    wsService.emit('get_data', { type: 'teams', orgId }, (res: any) => {
      setTeams(Array.isArray(res) ? res : []);
      checkDone();
    });

    wsService.emit('get_data', { type: 'games', orgId }, (res: any) => {
      setGames(Array.isArray(res) ? res : []);
      checkDone();
    });

    wsService.emit('get_data', { type: 'sites', orgId }, (res: any) => {
      setSites(Array.isArray(res) ? res : []);
      checkDone();
    });

    const room = `org:${orgId}:summary`;
    const unsubscribe = wsService.subscribeToRoom(room);

    const handleUpdate = (event: any) => {
      if (event && event.type === 'ORGANIZATION_UPDATED') {
        if (event.data && event.data.id === orgId) {
          setOrgData((prev: any) => prev ? { ...prev, ...event.data } : event.data);
        }
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      unsubscribe();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId]);

  if (isLoading || !orgData) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950 items-center justify-center" edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color="#FF3E00" />
      </SafeAreaView>
    );
  }

  const primaryColor = orgData.primaryColor || '#FF3E00';
  const secondaryColor = orgData.secondaryColor || '#00E5FF';
  const mappedSports = orgData.supportedSportIds?.map((id: string) => sportsMap[id] || id) || ['General'];

  const contrastColor = getContrastColor(primaryColor);
  const isLightBg = contrastColor === '#000000';
  const textColor = contrastColor;
  const subtextColor = isLightBg ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.7)';
  const borderColor = isLightBg ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.15)';

  const userMembership = orgMemberships.find(m => m.orgId === orgId);
  const isOwner = orgData.creatorId === user?.id;

  let membershipStatus: string | null = null;
  if (isAuthenticated) {
    if (isOwner) {
      membershipStatus = 'Owner';
    } else if (userMembership) {
      if (userMembership.roleId === 'role-org-admin') membershipStatus = 'Admin';
      else if (userMembership.roleId === 'role-org-staff') membershipStatus = 'Staff';
      else if (userMembership.roleId === 'role-org-member') membershipStatus = 'Member';
    } else if (user?.globalRole === 'admin') {
      membershipStatus = 'Admin';
    }
  }

  const getTeamName = (teamId: string) => {
    const t = teams.find(t => t.id === teamId);
    return t ? t.name : 'Unknown Team';
  };
  const getSiteName = (siteId: string) => {
    const s = sites.find(s => s.id === siteId);
    return s ? s.name : 'Unknown Venue';
  };

  const mappedTeams = teams.map(t => ({
    id: t.id,
    name: t.name,
    sport: sportsMap[t.sportId] || t.sportId || 'Sport',
    players: t.playerCount || 0,
    coach: 'TBD'
  }));

  const mappedFixtures = games.map(g => {
    const dateObj = g.startTime ? new Date(g.startTime) : new Date();
    return {
      id: g.id,
      title: g.name || 'Match',
      sport: sportsMap[g.sportId] || 'Sport',
      home: getTeamName(g.homeTeamId),
      away: getTeamName(g.awayTeamId),
      date: dateObj.toLocaleDateString(),
      time: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      venue: getSiteName(g.siteId)
    };
  });

  const mappedFacilities = sites.map(s => ({
    id: s.id,
    name: s.name,
    type: s.type || 'Venue',
    location: s.address?.city || 'Location TBD'
  }));

  const org: OrgDetails = {
    name: orgData.name || 'Unknown Organization',
    sports: mappedSports,
    membersCount: String(orgData.memberCount || 0),
    teamsCount: orgData.teamCount || 0,
    eventsCount: orgData.eventCount || 0,
    facilitiesCount: orgData.siteCount || 0,
    primaryColor: primaryColor,
    secondaryColor: secondaryColor,
    description: orgData.description || 'No description available for this organization.',
    membershipStatus: membershipStatus || '',
    registrationStatus: 'Registrations Open',
    teams: mappedTeams,
    fixtures: mappedFixtures,
    facilities: mappedFacilities,
  };

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
        <OrgBrandedCard
          primaryColor={org.primaryColor}
          secondaryColor={org.secondaryColor}
          className="p-6 mb-6"
        >
          <View className="flex-row justify-between items-center gap-3 mb-4">
            <View className="flex-row items-center gap-3 flex-1">
              <OrgLogo 
                logo={orgData.logo} 
                settings={orgData.settings} 
                size={40} 
                className="border bg-white rounded-full" 
                style={{ borderColor: borderColor }}
              />
              <Text style={{ color: textColor }} className="flex-1 font-orbitron-bold text-xl uppercase tracking-wide leading-tight flex-shrink">
                {org.name}
              </Text>
            </View>
            {org.membershipStatus ? (
              <View style={{ backgroundColor: isLightBg ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.25)', borderColor: borderColor }} className="flex-row items-center gap-1 border px-2.5 py-1 rounded-lg">
                <Ionicons name="ribbon-outline" size={12} color={textColor} />
                <Text style={{ color: textColor }} className="font-orbitron-bold text-[9px] uppercase tracking-widest">
                  {org.membershipStatus}
                </Text>
              </View>
            ) : null}
          </View>

          {/* QUICK METRICS GRID */}
          <View style={{ borderTopColor: borderColor }} className="flex-row justify-between border-t pt-4">
            <View className="items-center flex-1">
              <Text style={{ color: textColor }} className="font-orbitron-bold text-base">
                {org.sports.length}
              </Text>
              <Text style={{ color: subtextColor }} className="font-inter text-[9px] uppercase tracking-widest mt-0.5">
                {org.sports.length === 1 ? 'Sport' : 'Sports'}
              </Text>
            </View>
            <View style={{ borderLeftColor: borderColor }} className="items-center flex-1 border-l">
              <Text style={{ color: textColor }} className="font-orbitron-bold text-base">
                {org.membersCount}
              </Text>
              <Text style={{ color: subtextColor }} className="font-inter text-[9px] uppercase tracking-widest mt-0.5">
                Members
              </Text>
            </View>
            <View style={{ borderLeftColor: borderColor }} className="items-center flex-1 border-l">
              <Text style={{ color: textColor }} className="font-orbitron-bold text-base">
                {org.teamsCount}
              </Text>
              <Text style={{ color: subtextColor }} className="font-inter text-[9px] uppercase tracking-widest mt-0.5">
                Teams
              </Text>
            </View>
            <View style={{ borderLeftColor: borderColor }} className="items-center flex-1 border-l">
              <Text style={{ color: textColor }} className="font-orbitron-bold text-base">
                {org.facilitiesCount}
              </Text>
              <Text style={{ color: subtextColor }} className="font-inter text-[9px] uppercase tracking-widest mt-0.5">
                Facilities
              </Text>
            </View>
          </View>
        </OrgBrandedCard>

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
