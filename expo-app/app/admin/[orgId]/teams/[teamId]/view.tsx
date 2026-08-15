import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../../../store/settingsStore';
import { wsService } from '../../../../../services/websocket';
import { useWsStore } from '../../../../../store/wsStore';
import { useAuthStore } from '../../../../../store/authStore';
import { Team, TeamMember, Game, Sport, Organization } from '@sk/shared';
import { useSocketQuery } from '../../../../../hooks/useSocketQuery';
import { getAvatarUrl } from '../../../../../services/api';
import { COLORS } from '../../../../../constants/Colors';

const parseImageConfig = (config: any) => {
  if (!config) return { scale: 1, x: 0, y: 0 };
  if (typeof config === 'string') {
    try {
      return JSON.parse(config);
    } catch (e) {
      return { scale: 1, x: 0, y: 0 };
    }
  }
  return {
    scale: config.scale ?? 1,
    x: config.x ?? 0,
    y: config.y ?? 0
  };
};

export default function TeamViewScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, teamId } = useLocalSearchParams<{ orgId: string; teamId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'roster' | 'staff' | 'fixtures' | 'stats'>('roster');

  // Loading States
  const [isLoading, setIsLoading] = useState(true);

  // Data States
  const [team, setTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<TeamMember[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const { data: sportsData } = useSocketQuery<Sport[]>('sports');
  const { data: org } = useSocketQuery<Organization>('organization', { orgId });

  // User & Permissions
  const user = useAuthStore(state => state.user);
  const orgMemberships = useAuthStore(state => state.orgMemberships || []);
  const userMembership = orgMemberships.find(m => m.orgId === orgId);
  const isOwner = org?.creatorId === user?.id;
  const canEdit = Boolean(
    user?.globalRole === 'admin' ||
    isOwner ||
    (userMembership && (userMembership.roleId === 'role-org-admin' || userMembership.roleId === 'role-org-staff'))
  );

  const sports = sportsData || [];
  const players = useMemo(() => roster.filter(m => m.roleId === 'role-player'), [roster]);
  const staff = useMemo(() => roster.filter(m => m.roleId !== 'role-player'), [roster]);

  useEffect(() => {
    if (!isConnected || !orgId || !teamId) return;

    setIsLoading(true);

    // Get Team details
    wsService.emit('get_data', { type: 'team', id: teamId }, (res: any) => {
      if (res) {
        setTeam(res);
      }
    });

    // Get Roster
    wsService.emit('get_data', { type: 'team_roster', teamId }, (res: any) => {
      if (Array.isArray(res)) {
        setRoster(res);
      }
    });

    // Get Games
    wsService.emit('get_data', { type: 'team_games', teamId }, (res: any) => {
      if (Array.isArray(res)) {
        setGames(res);
      }
      setIsLoading(false);
    });

    const teamsRoom = `org:${orgId}:teams`;
    const unsubscribeTeams = wsService.subscribeToRoom(teamsRoom);

    const handleUpdate = (event: any) => {
      if (!event) return;
      if (event.type === 'TEAM_UPDATED' && event.data.id === teamId) {
        setTeam(event.data);
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      unsubscribeTeams();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId, teamId]);

  if (isLoading || !team) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950 justify-center items-center">
        <ActivityIndicator size="large" color="#FF3E00" />
        <Text className="font-orbitron text-xs text-slate-500 dark:text-slate-400 mt-3">Loading Team View...</Text>
      </SafeAreaView>
    );
  }

  const teamSport = sports.find(s => s.id === team.sportId)?.name || 'Sport';

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => safeBack(`/admin/${orgId}/teams`)}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Teams
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase">
          Team Profile
        </Text>
        {canEdit ? (
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/admin/[orgId]/teams/[teamId]', params: { orgId: orgId!, teamId: team.id } })}
            className="w-8 h-8 rounded-lg bg-brand-orange/10 border border-brand-orange/20 items-center justify-center active:opacity-85"
          >
            <Ionicons name="pencil" size={15} color="#FF3E00" />
          </TouchableOpacity>
        ) : (
          <View className="w-8" />
        )}
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* TEAM SUMMARY CARD */}
        <GlassCard className="border border-slate-200 dark:border-white/5 p-6 mb-6">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-1 mr-3">
              <Text className="font-orbitron-bold text-xl text-slate-800 dark:text-white">
                {team.name}
              </Text>
              <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-0.5">
                {teamSport} • {team.ageGroup} {team.shortName ? `(${team.shortName})` : ''}
              </Text>
            </View>
            <View className={`px-3 py-1 rounded-full ${team.isActive !== false ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-slate-200 dark:bg-slate-800'}`}>
              <Text className={`font-orbitron-bold text-[9px] uppercase tracking-wider ${team.isActive !== false ? 'text-emerald-500' : 'text-slate-500'}`}>
                {team.isActive !== false ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>

          {/* QUICK STATISTICS */}
          <View className="flex-row items-center gap-4 pt-4 border-t border-slate-200/50 dark:border-white/5 mt-2">
            <View className="flex-1 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200/50 dark:border-white/5 items-center">
              <Text className="font-orbitron-bold text-lg text-brand-orange">{players.length}</Text>
              <Text className="font-inter text-[10px] text-slate-400 uppercase tracking-wider">Athletes</Text>
            </View>
            <View className="flex-1 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200/50 dark:border-white/5 items-center">
              <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white">{staff.length}</Text>
              <Text className="font-inter text-[10px] text-slate-400 uppercase tracking-wider">Staff</Text>
            </View>
            <View className="flex-1 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200/50 dark:border-white/5 items-center">
              <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white">{games.length}</Text>
              <Text className="font-inter text-[10px] text-slate-400 uppercase tracking-wider">Games</Text>
            </View>
          </View>
        </GlassCard>

        {/* TABS */}
        <View className="flex-row border-b border-slate-200 dark:border-white/5 mb-6">
          {(['roster', 'staff', 'fixtures'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              className={`flex-1 pb-3 items-center border-b-2 ${activeTab === tab ? 'border-brand-orange' : 'border-transparent'}`}
            >
              <Text className={`font-orbitron-bold text-xs uppercase tracking-wider ${activeTab === tab ? 'text-brand-orange' : 'text-slate-400 dark:text-slate-500'}`}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* TAB CONTENTS */}
        {activeTab === 'roster' && (
          <View className="space-y-2">
            {players.map(item => {
              const avatarSource = item.image ? { uri: getAvatarUrl(item.image, 'thumb') } : null;
              const logoConf = parseImageConfig(item.imageConfig);
              return (
                <GlassCard key={item.membershipId} className="border border-slate-200 dark:border-white/5 p-3 flex-row items-center gap-3">
                  <View className="w-8 h-8 rounded-full bg-brand-orange/10 overflow-hidden items-center justify-center">
                    {avatarSource ? (
                      <View style={{ width: 32, height: 32, overflow: 'hidden' }}>
                        <View
                          style={{
                            width: '100%',
                            height: '100%',
                            transform: [
                              { scale: logoConf.scale },
                              { translateX: logoConf.x * 32 },
                              { translateY: logoConf.y * 32 },
                            ],
                          }}
                        >
                          <Image source={avatarSource} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        </View>
                      </View>
                    ) : (
                      <Text className="font-orbitron-bold text-xs text-brand-orange">
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="font-inter-bold text-sm text-slate-800 dark:text-white leading-tight">{item.name}</Text>
                    <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
                      {item.email || 'Athlete'}
                    </Text>
                  </View>
                </GlassCard>
              );
            })}
            {players.length === 0 && (
              <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 italic text-center py-6">Roster is Empty</Text>
            )}
          </View>
        )}

        {activeTab === 'staff' && (
          <View className="space-y-2">
            {staff.map(item => {
              const avatarSource = item.image ? { uri: getAvatarUrl(item.image, 'thumb') } : null;
              const logoConf = parseImageConfig(item.imageConfig);
              return (
                <GlassCard key={item.membershipId} className="border border-slate-200 dark:border-white/5 p-3 flex-row items-center gap-3">
                  <View className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden items-center justify-center">
                    {avatarSource ? (
                      <View style={{ width: 32, height: 32, overflow: 'hidden' }}>
                        <View
                          style={{
                            width: '100%',
                            height: '100%',
                            transform: [
                              { scale: logoConf.scale },
                              { translateX: logoConf.x * 32 },
                              { translateY: logoConf.y * 32 },
                            ],
                          }}
                        >
                          <Image source={avatarSource} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        </View>
                      </View>
                    ) : (
                      <Text className="font-orbitron-bold text-xs text-slate-455">
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="font-inter-bold text-sm text-slate-800 dark:text-white leading-tight">{item.name}</Text>
                    <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
                      {item.roleId === 'role-coach' ? 'Coach' : 'Manager'}
                    </Text>
                  </View>
                </GlassCard>
              );
            })}
            {staff.length === 0 && (
              <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 italic text-center py-6">No staff assigned</Text>
            )}
          </View>
        )}

        {activeTab === 'fixtures' && (
          <View className="space-y-2">
            {games.map(game => {
              const targetEventId = game.eventId;
              return (
                <GlassCard key={game.id} className="border border-slate-200 dark:border-white/5 p-4 flex-row items-center justify-between">
                  <View className="flex-1 mr-3">
                    <View className="flex-row justify-between items-center mb-1">
                      <Text className="font-orbitron-bold text-[9px] text-slate-400 uppercase tracking-widest">{game.status}</Text>
                      <Text className="font-inter text-[10px] text-slate-400">{game.scheduledStartTime ? new Date(game.scheduledStartTime).toLocaleDateString() : ''}</Text>
                    </View>
                    <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">
                      {game.participants?.[0]?.teamId || 'TBD'} vs {game.participants?.[1]?.teamId || 'TBD'}
                    </Text>
                  </View>
                  {targetEventId && (
                    <View className="flex-row items-center gap-1.5">
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => router.push(`/admin/${orgId}/events/${targetEventId}/games/${game.id}/selection?teamId=${teamId}`)}
                        className="w-7 h-7 bg-brand-orange/10 border border-brand-orange/30 rounded-lg items-center justify-center"
                      >
                        <Ionicons name="people-outline" size={13} color={COLORS.brand.orange} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => router.push(`/admin/${orgId}/events/${targetEventId}/games/${game.id}/score`)}
                        className="w-7 h-7 bg-brand-orange/10 border border-brand-orange/30 rounded-lg items-center justify-center"
                      >
                        <Ionicons name="trophy-outline" size={13} color={COLORS.brand.orange} />
                      </TouchableOpacity>
                    </View>
                  )}
                </GlassCard>
              );
            })}
            {games.length === 0 && (
              <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 italic text-center py-6">No games scheduled</Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
