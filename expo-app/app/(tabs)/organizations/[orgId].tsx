import React, { useState, useEffect } from 'react';
import { orgColors } from '@sk/shared';
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
import { inkOnBrand } from '@/utils/colorUtils';
import { useAuthStore } from '@/store/authStore';
import { formatInstantDate, formatKickoffTime } from '../../../utils/dates';
import { useOrgSummary } from '../../../hooks/useOrgSummary';
import { themeColor } from '../../../constants/Colors';

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

  const [activeTab, setActiveTab] = useState<'overview' | 'teams' | 'fixtures' | 'facilities' | 'leagues'>('overview');
  const isConnected = useWsStore(state => state.isConnected);
  const { isAuthenticated, user, orgMemberships } = useAuthStore();

  // The organisation itself comes from its summary room, not a query (`LIVE-12`).
  const { org: orgData, isLoading: isOrgLoading } = useOrgSummary(orgId);
  const [teams, setTeams] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [sportsMap, setSportsMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isConnected || !orgId) return;

    let active = true;
    setIsLoading(true);
    let loadedCount = 0;
    // Four queries: the leagues list is not read, it arrives on the `org:{id}:leagues` join push
    // (`LIVE-14`), and the organisation comes from `useOrgSummary` (`LIVE-12`). The leagues are
    // deliberately not counted here — a room push has no ack and no timeout, so gating the whole
    // screen on one would hang it outright if the join were ever refused. The list fills in a
    // moment later, as every room-backed list does.
    const checkDone = () => {
      if (!active) return;
      loadedCount++;
      if (loadedCount === 4) setIsLoading(false);
    };

    wsService.emit('get_data', { type: 'sports' }, (res: any) => {
      if (!active) return;
      const map: Record<string, string> = {};
      if (Array.isArray(res)) res.forEach((s: any) => { map[s.id] = s.name; });
      setSportsMap(map);
      checkDone();
    });

    wsService.emit('get_data', { type: 'teams', orgId }, (res: any) => {
      if (!active) return;
      setTeams(Array.isArray(res) ? res : []);
      checkDone();
    });

    wsService.emit('get_data', { type: 'games', orgId }, (res: any) => {
      if (!active) return;
      setGames(Array.isArray(res) ? res : []);
      checkDone();
    });

    wsService.emit('get_data', { type: 'sites', orgId }, (res: any) => {
      if (!active) return;
      setSites(Array.isArray(res) ? res : []);
      checkDone();
    });


    const leagueRoom = `org:${orgId}:leagues`;

    const handleUpdate = (event: any) => {
      if (!active) return;
      if (event) {
        if (event.type === 'LEAGUES_SYNC') {
          if (Array.isArray(event.data)) setLeagues(event.data);
        } else if (event.type === 'LEAGUE_ADDED') {
          setLeagues(prev => {
            if (prev.some(l => l.id === event.data.id)) {
              return prev.map(l => l.id === event.data.id ? event.data : l);
            }
            return [event.data, ...prev];
          });
        } else if (event.type === 'LEAGUE_UPDATED') {
          setLeagues(prev => prev.map(l => l.id === event.data.id ? event.data : l));
        } else if (event.type === 'LEAGUE_DELETED') {
          setLeagues(prev => prev.filter(l => l.id !== event.data.id));
        }
      }
    };

    wsService.on('update', handleUpdate);
    const unsubscribeLeagues = wsService.subscribeToRoom(leagueRoom, handleUpdate);

    return () => {
      active = false;
      unsubscribeLeagues();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId]);

  if (isLoading || isOrgLoading || !orgData) {
    return (
      <SafeAreaView className="flex-1 bg-canvas items-center justify-center" edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
      </SafeAreaView>
    );
  }

  const { primary: primaryColor, secondary: secondaryColor } = orgColors(orgData);
  const mappedSports = orgData.supportedSportIds?.map((id: string) => sportsMap[id] || id) || ['General'];

  const ink = inkOnBrand(primaryColor);
  const isLightBg = ink.isLight;
  const textColor = ink.text;
  const subtextColor = ink.subtext;
  const borderColor = ink.border;

  const userMembership = orgMemberships.find(m => m.orgId === orgId);
  let membershipStatus: string | null = null;
  if (isAuthenticated) {
    if (userMembership) {
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
    return s ? s.name : 'Unknown Site';
  };

  const mappedTeams = teams.map(t => ({
    id: t.id,
    name: t.name,
    sport: sportsMap[t.sportId] || t.sportId || 'Sport',
    players: t.playerCount || 0,
    coach: 'TBD'
  }));

  const mappedFixtures = games.map(g => {
    // A fixture with no kick-off says so, rather than borrowing today's date.
    const kickoff = g.scheduledStartTime || g.startTime;
    return {
      id: g.id,
      title: g.name || 'Match',
      sport: sportsMap[g.sportId] || 'Sport',
      home: getTeamName(g.homeTeamId),
      away: getTeamName(g.awayTeamId),
      date: formatInstantDate(kickoff) || 'Date TBD',
      time: (g.timeTbd ? '' : formatKickoffTime(kickoff)) || 'TBD',
      venue: getSiteName(g.siteId)
    };
  });

  const mappedFacilities = sites.map(s => ({
    id: s.id,
    name: s.name,
    type: s.type || 'Site',
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
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-line-soft bg-card z-10">
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/organizations')}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color={themeColor(isDark, 'primary')} />
          <Text className="font-inter-bold text-xs text-ink-muted uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-xs tracking-widest text-ink uppercase">
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
                className="border bg-logo-plate rounded-full" 
                style={{ borderColor: borderColor }}
              />
              <Text style={{ color: textColor }} className="flex-1 font-orbitron-bold text-xl uppercase tracking-wide leading-tight flex-shrink">
                {org.name}
              </Text>
            </View>
            {org.membershipStatus ? (
              <View style={{ backgroundColor: ink.chip, borderColor: borderColor }} className="flex-row items-center gap-1 border px-2.5 py-1 rounded-lg">
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

          {(org.membershipStatus === 'Admin' || org.membershipStatus === 'Staff') && (
            <View style={{ borderTopColor: borderColor }} className="mt-4 border-t pt-4">
              <TouchableOpacity
                style={{
                  backgroundColor: ink.button,
                  borderColor: borderColor,
                }}
                className="w-full border py-2.5 rounded-lg items-center justify-center active:opacity-85"
                onPress={() => router.push(`/admin/${orgId}` as any)}
              >
                <Text style={{ color: textColor }} className="font-inter-bold text-sm">
                  Manage Workspace
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </OrgBrandedCard>

        {/* INTERACTIVE NAVIGATION TABS */}
        <View className="flex-row bg-card border border-line p-1 rounded-xl mb-6 gap-1">
          {(['overview', 'teams', 'fixtures', 'facilities', 'leagues'] as const).map((tab) => {
            const isTabActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                className="flex-1 py-2.5 rounded-lg items-center active:opacity-85"
                style={{
                  backgroundColor: isTabActive ? themeColor(isDark, 'raised') : 'transparent',
                }}
              >
                <Text
                  className="font-orbitron-bold text-[10px] uppercase tracking-wider"
                  style={{
                    color: themeColor(isDark, isTabActive ? 'primary-ink' : 'ink-muted'),
                  }}
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
            <View className="gap-4">
              <GlassCard className="border border-line p-5">
                <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-widest mb-3">
                  About Organization
                </Text>
                <Text className="font-inter text-sm text-ink-soft leading-6">
                  {org.description}
                </Text>
              </GlassCard>

              <GlassCard className="border border-primary-line bg-primary-soft p-5 flex-row items-center gap-3">
                <Ionicons name="information-circle-outline" size={22} color={themeColor(isDark, 'primary')} />
                <View className="flex-1">
                  <Text className="font-orbitron-bold text-xs text-ink uppercase tracking-wider">
                    Registration Alert
                  </Text>
                  <Text className="font-inter text-xs text-ink-muted mt-0.5">
                    {org.registrationStatus}
                  </Text>
                </View>
              </GlassCard>
            </View>
          )}

          {activeTab === 'teams' && (
            <View className="gap-4">
              {org.teams.map((team) => (
                <GlassCard key={team.id} className="border border-line p-4 flex-row justify-between items-center">
                  <View className="flex-1 mr-3">
                    <View className="bg-sunken px-2 py-0.5 rounded-full w-fit mb-2 border border-line-soft">
                      <Text className="font-inter-bold text-[8px] text-ink-soft uppercase tracking-wider">
                        {team.sport}
                      </Text>
                    </View>
                    <Text className="font-orbitron-bold text-base text-ink uppercase tracking-wide">
                      {team.name}
                    </Text>
                    <Text className="font-inter text-xs text-ink-muted mt-1">
                      Coach: {team.coach}
                    </Text>
                  </View>
                  <View className="items-end bg-sunken border border-line rounded-xl px-3 py-2">
                    <Text className="font-orbitron-bold text-sm text-ink">
                      {team.players}
                    </Text>
                    <Text className="font-inter text-[8px] text-ink-muted uppercase tracking-wider mt-0.5">
                      Players
                    </Text>
                  </View>
                </GlassCard>
              ))}
            </View>
          )}

          {activeTab === 'fixtures' && (
            <View className="gap-4">
              {org.fixtures.map((fix) => (
                <GlassCard key={fix.id} className="border border-line p-5">
                  <View className="flex-row justify-between items-center mb-3">
                    <View className="bg-primary-soft px-2.5 py-0.5 rounded border border-primary-line">
                      <Text className="font-orbitron-bold text-[8px] text-primary-ink uppercase tracking-wider">
                        {fix.title}
                      </Text>
                    </View>
                    <Text className="font-inter-bold text-[9px] text-ink-muted uppercase tracking-wider">
                      {fix.sport}
                    </Text>
                  </View>

                  <Text className="font-orbitron-bold text-base text-ink text-center py-2 uppercase tracking-wide">
                    {fix.home} <Text className="text-primary-ink text-xs font-inter lowercase">vs</Text> {fix.away}
                  </Text>

                  <View className="flex-row justify-between border-t border-line-soft pt-3 mt-1">
                    <View className="flex-row items-center gap-1.5">
                      <Ionicons name="calendar-outline" size={13} color={themeColor(isDark, 'primary')} />
                      <Text className="font-inter text-xs text-ink-muted">
                        {fix.date} @ {fix.time}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      <Ionicons name="location-outline" size={13} color={themeColor(isDark, 'primary')} />
                      <Text className="font-inter text-xs text-ink-muted">
                        {fix.venue}
                      </Text>
                    </View>
                  </View>
                </GlassCard>
              ))}
            </View>
          )}

          {activeTab === 'facilities' && (
            <View className="gap-4">
              {org.facilities.map((fac) => (
                <GlassCard key={fac.id} className="border border-line p-4 flex-row items-center gap-3.5">
                  <View className="w-10 h-10 rounded-xl bg-special-soft border border-special-line items-center justify-center">
                    <Ionicons name="location-outline" size={18} color={themeColor(isDark, 'special')} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-orbitron-bold text-base text-ink uppercase tracking-wide">
                      {fac.name}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-1">
                      <Text className="font-inter-bold text-[9px] text-special-ink uppercase tracking-wide bg-special-soft px-2 py-0.5 rounded border border-special-line">
                        {fac.type}
                      </Text>
                      <Text className="font-inter text-xs text-ink-muted">
                        {fac.location}
                      </Text>
                    </View>
                  </View>
                </GlassCard>
              ))}
            </View>
          )}

          {activeTab === 'leagues' && (
            <View className="gap-4">
              {leagues.map((league) => (
                <GlassCard key={league.id} className="border border-line p-4 flex-row items-center gap-3.5">
                  <View className="w-10 h-10 rounded-xl bg-primary-soft items-center justify-center border border-primary-line">
                    <Ionicons name="trophy" size={16} color={themeColor(isDark, 'primary')} />
                  </View>
                  
                  <View className="flex-1">
                    <Text className="font-orbitron-bold text-base text-ink uppercase tracking-wide">
                      {league.name}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-1">
                      <Text className="font-inter-bold text-[9px] text-ink-muted uppercase tracking-wide">
                        {sportsMap[league.sportId] || 'Sport'}
                      </Text>
                      {!!league.ageGroup && (
                        <>
                          <Text className="text-ink-faint">•</Text>
                          <Text className="font-inter-bold text-[9px] text-ink-muted uppercase tracking-wide">
                            {league.ageGroup}
                          </Text>
                        </>
                      )}
                    </View>
                  </View>

                  <Button
                    title="View"
                    variant="secondary"
                    onPress={() => router.push(`/leagues/${league.id}` as any)}
                    className="px-4 py-1.5 rounded-lg shadow-sm"
                  />
                </GlassCard>
              ))}

              {leagues.length === 0 && (
                <View className="items-center justify-center py-10">
                  <Ionicons name="trophy-outline" size={36} color={themeColor(isDark, 'ink-muted')} className="opacity-45 mb-2" />
                  <Text className="font-orbitron-bold text-xs text-ink-muted">No Active Leagues</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* PREMIUM ACTION CTA CARD */}
        <GlassCard className="bg-primary-soft border border-primary-line p-5 items-center">
          <Ionicons name="mail-unread-outline" size={24} color={themeColor(isDark, 'primary')} className="mb-2" />
          <Text className="font-orbitron-bold text-sm text-ink text-center mb-1 uppercase tracking-wide">
            INTERESTED IN JOINING?
          </Text>
          <Text className="font-inter text-xs text-ink-muted text-center mb-4 leading-4">
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
