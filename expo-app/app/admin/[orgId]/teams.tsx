import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../components/GlassCard';
import { Button } from '../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../store/settingsStore';
import { wsService } from '../../../services/websocket';
import { useWsStore } from '../../../store/wsStore';
import { SocketAction, Team, Sport, Organization } from '@sk/types';

export default function OrgTeams() {
  const router = useRouter();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  // Loading and Data States
  const [isLoading, setIsLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);

  // Filters & Layout States
  const [searchQuery, setSearchQuery] = useState('');
  const [sportFilter, setSportFilter] = useState('all');
  const [ageFilter, setAgeFilter] = useState('all');
  const [groupBy, setGroupBy] = useState<'none' | 'sport' | 'age'>('none');
  const [isDeactivatedExpanded, setIsDeactivatedExpanded] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  // Load Data & Subscribe
  useEffect(() => {
    if (!isConnected || !orgId) return;

    let active = true;
    setIsLoading(true);

    const loadData = () => {
      // Get organization details
      wsService.emit('get_data', { type: 'organization', id: orgId }, (res: any) => {
        if (!active) return;
        if (res) setOrg(res);
      });

      // Get teams
      wsService.emit('get_data', { type: 'teams', orgId }, (res: any) => {
        if (!active) return;
        if (Array.isArray(res)) {
          setTeams(res);
        }
        setIsLoading(false);
      });

      // Get sports
      wsService.emit('get_data', { type: 'sports' }, (res: any) => {
        if (!active) return;
        if (Array.isArray(res)) {
          setSports(res);
        }
      });
    };

    loadData();

    // Subscribe to teams updates
    const room = `org:${orgId}:teams`;
    const unsubscribe = wsService.subscribeToRoom(room);

    const handleUpdate = (event: any) => {
      if (!active) return;
      if (event && (event.type === 'TEAM_ADDED' || event.type === 'TEAM_UPDATED' || event.type === 'TEAM_DELETED' || event.type === 'TEAMS_SYNC')) {
        wsService.emit('get_data', { type: 'teams', orgId }, (res: any) => {
          if (!active) return;
          if (Array.isArray(res)) {
            setTeams(res);
          }
        });
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      active = false;
      unsubscribe();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId]);

  // Derived Sport List
  const availableSports = org?.supportedSportIds
    ? sports.filter(s => org.supportedSportIds?.includes(s.id))
    : sports;

  // Derived unique age groups
  const uniqueAgeGroups = Array.from(
    new Set(teams.map(t => t.ageGroup).filter(Boolean))
  ).sort() as string[];

  // Helper for icons
  const getSportIcon = (sportId: string) => {
    const sport = sports.find(s => s.id === sportId);
    const sportName = (sport?.name || '').toLowerCase();
    if (sportName.includes('rugby')) return 'shield-checkmark-outline';
    if (sportName.includes('soccer') || sportName.includes('football')) return 'football-outline';
    if (sportName.includes('netball')) return 'basketball-outline';
    if (sportName.includes('cricket') || sportName.includes('baseball')) return 'baseball-outline';
    return 'trophy-outline';
  };

  const getSportName = (sportId: string) => {
    return sports.find(s => s.id === sportId)?.name || 'Unknown Sport';
  };

  // Filtering Logic
  const filterTeam = (team: Team) => {
    const matchesSearch = team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getSportName(team.sportId).toLowerCase().includes(searchQuery.toLowerCase()) ||
      (team.ageGroup || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSport = sportFilter === 'all' || team.sportId === sportFilter;
    const matchesAge = ageFilter === 'all' || team.ageGroup === ageFilter;
    return matchesSearch && matchesSport && matchesAge;
  };

  const activeTeams = teams.filter(t => t.isActive !== false && filterTeam(t));
  const deactivatedTeams = teams.filter(t => t.isActive === false && filterTeam(t));

  // Grouping Logic
  const renderTeamCard = (team: Team) => (
    <GlassCard 
      key={team.id}
      className="border border-slate-200 dark:border-white/5 p-5 mb-4"
    >
      <View className="flex-row justify-between items-start mb-3">
        <View className="bg-slate-100 dark:bg-white/10 px-2.5 py-1 rounded-full flex-row items-center gap-1">
          <Ionicons name={getSportIcon(team.sportId) as any} size={10} color={isDark ? '#94A3B8' : '#64748B'} />
          <Text className="font-inter-bold text-[9px] text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            {team.ageGroup} • {getSportName(team.sportId)}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Ionicons name="people" size={12} color="#FF3E00" />
          <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400">
            {team.playerCount || 0} Athletes
          </Text>
        </View>
      </View>

      <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white mb-4">
        {team.name}
      </Text>

      <View className="flex-row gap-3">
        <Button
          title="Manage Roster"
          variant="secondary"
          onPress={() => router.push({
            pathname: '/admin/[orgId]/teams/[teamId]',
            params: { orgId: orgId!, teamId: team.id }
          })}
          className="flex-1 shadow-sm py-2 rounded-lg"
        />
      </View>
    </GlassCard>
  );

  const renderGroupedTeams = (teamList: Team[]) => {
    if (groupBy === 'none') {
      return teamList.map(renderTeamCard);
    }

    const grouped: Record<string, Team[]> = {};
    teamList.forEach(t => {
      const key = groupBy === 'sport' ? getSportName(t.sportId) : (t.ageGroup || 'Other');
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(t);
    });

    return Object.entries(grouped).map(([groupName, groupTeams]) => (
      <View key={groupName} className="mb-6">
        <View className="flex-row items-center gap-2 mb-3 px-1">
          <Text className="font-orbitron-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {groupName}
          </Text>
          <View className="h-[1px] flex-1 bg-slate-200 dark:bg-white/10" />
          <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500">
            ({groupTeams.length})
          </Text>
        </View>
        {groupTeams.map(renderTeamCard)}
      </View>
    ));
  };

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
          Teams & Divisions
        </Text>
        <TouchableOpacity 
          className="w-8 h-8 rounded-lg bg-brand-orange items-center justify-center shadow-md shadow-brand-orange/20 active:opacity-85"
          onPress={() => router.push({
            pathname: '/admin/[orgId]/teams/new',
            params: { orgId: orgId! }
          })}
        >
          <Ionicons name="add-outline" size={16} color="white" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FF3E00" />
          <Text className="font-orbitron text-xs text-slate-500 dark:text-slate-400 mt-3">Loading teams...</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          
          {/* SEARCH & FILTERS CONTROLS */}
          <View className="flex-row gap-2 mb-4">
            <View className="flex-1 flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 shadow-sm">
              <Ionicons name="search-outline" size={18} color="#94A3B8" />
              <TextInput
                placeholder="Search teams..."
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

            <TouchableOpacity 
              onPress={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
              className={`w-11 h-11 rounded-xl items-center justify-center border ${
                isFilterMenuOpen || sportFilter !== 'all' || ageFilter !== 'all' || groupBy !== 'none'
                  ? 'bg-brand-orange/10 border-brand-orange'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5'
              }`}
            >
              <Ionicons name="funnel-outline" size={18} color={isFilterMenuOpen || sportFilter !== 'all' || ageFilter !== 'all' || groupBy !== 'none' ? '#FF3E00' : '#94A3B8'} />
            </TouchableOpacity>
          </View>

          {/* DYNAMIC FILTER MENU */}
          {isFilterMenuOpen && (
            <GlassCard className="border border-slate-200 dark:border-white/5 p-4 mb-6">
              <Text className="font-orbitron-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Filter & Grouping options</Text>
              
              {/* Sport Filter */}
              <View className="mb-3">
                <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 mb-1.5">Sport</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
                  <TouchableOpacity 
                    onPress={() => setSportFilter('all')}
                    className={`px-3 py-1.5 rounded-full border ${sportFilter === 'all' ? 'bg-brand-orange border-brand-orange' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/5'}`}
                  >
                    <Text className={`font-inter text-xs ${sportFilter === 'all' ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>All Sports</Text>
                  </TouchableOpacity>
                  {availableSports.map(s => (
                    <TouchableOpacity 
                      key={s.id}
                      onPress={() => setSportFilter(s.id)}
                      className={`px-3 py-1.5 rounded-full border ${sportFilter === s.id ? 'bg-brand-orange border-brand-orange' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/5'}`}
                    >
                      <Text className={`font-inter text-xs ${sportFilter === s.id ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>{s.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Age Group Filter */}
              <View className="mb-3">
                <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 mb-1.5">Age Group</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
                  <TouchableOpacity 
                    onPress={() => setAgeFilter('all')}
                    className={`px-3 py-1.5 rounded-full border ${ageFilter === 'all' ? 'bg-brand-orange border-brand-orange' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/5'}`}
                  >
                    <Text className={`font-inter text-xs ${ageFilter === 'all' ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>All Ages</Text>
                  </TouchableOpacity>
                  {uniqueAgeGroups.map(age => (
                    <TouchableOpacity 
                      key={age}
                      onPress={() => setAgeFilter(age)}
                      className={`px-3 py-1.5 rounded-full border ${ageFilter === age ? 'bg-brand-orange border-brand-orange' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/5'}`}
                    >
                      <Text className={`font-inter text-xs ${ageFilter === age ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>{age}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Group By Option */}
              <View>
                <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 mb-1.5">Group Layout By</Text>
                <View className="flex-row gap-2">
                  {(['none', 'sport', 'age'] as const).map(option => (
                    <TouchableOpacity 
                      key={option}
                      onPress={() => setGroupBy(option)}
                      className={`flex-1 items-center py-2 rounded-xl border capitalize ${groupBy === option ? 'bg-brand-orange/10 border-brand-orange' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/5'}`}
                    >
                      <Text className={`font-inter text-xs font-semibold ${groupBy === option ? 'text-brand-orange' : 'text-slate-600 dark:text-slate-300'}`}>
                        {option === 'none' ? 'No Grouping' : option}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </GlassCard>
          )}

          {/* ACTIVE TEAMS LIST */}
          <View>
            {renderGroupedTeams(activeTeams)}

            {activeTeams.length === 0 && (
              <View className="items-center justify-center py-12">
                <Ionicons name="trophy-outline" size={48} color="#94A3B8" className="opacity-40 mb-3" />
                <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300">
                  No Active Teams
                </Text>
                <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 text-center mt-1">
                  Adjust filters or register a new team.
                </Text>
              </View>
            )}
          </View>

          {/* DEACTIVATED TEAMS SECTION */}
          {deactivatedTeams.length > 0 && (
            <View className="mt-8 border-t border-slate-200/50 dark:border-white/5 pt-6">
              <TouchableOpacity 
                onPress={() => setIsDeactivatedExpanded(!isDeactivatedExpanded)}
                className="flex-row items-center justify-between py-2 px-1"
              >
                <Text className="font-orbitron-bold text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Deactivated Teams ({deactivatedTeams.length})
                </Text>
                <Ionicons name={isDeactivatedExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#94A3B8" />
              </TouchableOpacity>

              {isDeactivatedExpanded && (
                <View className="mt-4">
                  {renderGroupedTeams(deactivatedTeams)}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
