import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Modal, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import DatePicker from '../../../../components/DatePicker';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { useActiveTheme } from '../../../../store/settingsStore';
import { wsService } from '../../../../services/websocket';
import { useWsStore } from '../../../../store/wsStore';
import { useAuthStore } from '../../../../store/authStore';
import { SocketAction, Event, Game, Sport, Site, Team, Organization, calculateStandings, LeagueStandingRow } from '@sk/shared';
import { COLORS, getThemeColor } from '../../../../constants/Colors';
import CustomSelect from '../../../../components/CustomSelect';
import { getMatchPermissions } from '../../../../utils/matchPermissions';

export default function EventDetails() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string, eventId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  // Data States
  const [isLoading, setIsLoading] = useState(true);
  const [event, setEvent] = useState<Event | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
  const [hostTeams, setHostTeams] = useState<Team[]>([]);
  const [participatingTeams, setParticipatingTeams] = useState<Record<string, Team[]>>({});

  // UI States
  const [activeTab, setActiveTab] = useState<'schedule' | 'standings' | 'settings'>('schedule');
  const [groupingMode, setGroupingMode] = useState<'time' | 'sport' | 'site'>('time');
  const [sportFilter, setSportFilter] = useState('all');
  const [siteFilter, setSiteFilter] = useState('all');

  // Modals & Saving
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isScoringVisible, setIsScoringVisible] = useState(false);
  
  // Single Game Score Inputs
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [selectedGameToScore, setSelectedGameToScore] = useState<Game | null>(null);

  // Settings Edit Fields
  const [editName, setEditName] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [editEndDate, setEditEndDate] = useState('');
  const [editSiteId, setEditSiteId] = useState('');
  const [editSportIds, setEditSportIds] = useState<string[]>([]);
  const [editParticipatingOrgs, setEditParticipatingOrgs] = useState<Organization[]>([]);
  const [orgSearchText, setOrgSearchText] = useState('');
  const [searchedOrgs, setSearchedOrgs] = useState<Organization[]>([]);
  const [isSearchingOrgs, setIsSearchingOrgs] = useState(false);

  const user = useAuthStore((state: any) => state.user);
  const orgMemberships = useAuthStore((state: any) => state.orgMemberships);
  const teamMemberships = useAuthStore((state: any) => state.teamMemberships);
  const canEdit = event ? event.orgId === orgId : false;

  const canUserScoreGame = (game: Game) => {
    if (user?.globalRole === 'admin') return true;
    if (event && event.orgId === orgId) return true;

    const homeTeamId = game.participants?.[0]?.teamId;
    const awayTeamId = game.participants?.[1]?.teamId;

    const isCoachOfHome = homeTeamId && teamMemberships.some((m: any) => m.teamId === homeTeamId && (m.roleId === 'role-coach' || m.roleId === 'role-assistant-coach'));
    const isCoachOfAway = awayTeamId && teamMemberships.some((m: any) => m.teamId === awayTeamId && (m.roleId === 'role-coach' || m.roleId === 'role-assistant-coach'));
    if (isCoachOfHome || isCoachOfAway) return true;

    const homeOrgId = homeTeamId ? getTeamOrgId(homeTeamId) : '';
    const awayOrgId = awayTeamId ? getTeamOrgId(awayTeamId) : '';

    const isAdminOfHomeOrg = homeOrgId && orgMemberships.some((m: any) => m.orgId === homeOrgId && (m.roleId === 'role-org-admin' || m.roleId === 'role-org-staff'));
    const isAdminOfAwayOrg = awayOrgId && orgMemberships.some((m: any) => m.orgId === awayOrgId && (m.roleId === 'role-org-admin' || m.roleId === 'role-org-staff'));
    if (isAdminOfHomeOrg || isAdminOfAwayOrg) return true;

    return false;
  };

  // Subscription and state loading
  useEffect(() => {
    if (!isConnected || !eventId || !orgId) return;

    let active = true;
    setIsLoading(true);

    const loadData = () => {
      // Get Event Details
      wsService.emit('get_data', { type: 'event', id: eventId }, (res: any) => {
        if (!active) return;
        if (res) {
          setEvent(res);
          setEditName(res.name);
          setEditStartDate(res.startDate?.split('T')[0] || '');
          setIsMultiDay(!!res.endDate);
          setEditEndDate(res.endDate?.split('T')[0] || '');
          setEditSiteId(res.siteId || '');
          setEditSportIds(res.sportIds || []);
        }
      });

      // Get Games for Org
      wsService.emit('get_data', { type: 'games', orgId }, (res: any) => {
        if (!active) return;
        if (Array.isArray(res)) setGames(res.filter(g => g.eventId === eventId));
        setIsLoading(false);
      });

      // Get Sports
      wsService.emit('get_data', { type: 'sports' }, (res: any) => {
        if (!active) return;
        if (Array.isArray(res)) setSports(res);
      });

      // Get Sites
      wsService.emit('get_data', { type: 'sites', orgId }, (res: any) => {
        if (!active) return;
        if (Array.isArray(res)) setSites(res);
      });

      // Get Host Teams
      wsService.emit('get_data', { type: 'teams', orgId }, (res: any) => {
        if (!active) return;
        if (Array.isArray(res)) setHostTeams(res);
      });

      // Get All Organizations
      wsService.emit('get_data', { type: 'organizations' }, (res: any) => {
        if (!active) return;
        if (Array.isArray(res)) {
          setAllOrgs(res);
        }
      });
    };

    loadData();

    // Subscribe to rooms
    const eventRoom = `event:${eventId}`;
    const unsubEvent = wsService.subscribeToRoom(eventRoom);

    const handleUpdate = (eventPayload: any) => {
      if (!active) return;
      if (eventPayload) {
        if (eventPayload.type === 'EVENT_UPDATED' && eventPayload.data.id === eventId) {
          setEvent(eventPayload.data);
        }
        if (eventPayload.type === 'GAME_ADDED') {
          if (eventPayload.data?.eventId === eventId) {
            setGames(prev => {
              if (prev.some(g => g.id === eventPayload.data.id)) {
                return prev.map(g => g.id === eventPayload.data.id ? { ...g, ...eventPayload.data } : g);
              }
              return [...prev, eventPayload.data];
            });
          }
        } else if (eventPayload.type === 'GAME_UPDATED') {
          setGames(prev =>
            prev.map(g => {
              if (g.id !== eventPayload.data?.id) return g;
              const updatedLiveState = eventPayload.data.liveState
                ? { ...g.liveState, ...eventPayload.data.liveState }
                : g.liveState;
              return { ...g, ...eventPayload.data, liveState: updatedLiveState };
            })
          );
        } else if (eventPayload.type === 'GAME_DELETED') {
          setGames(prev => prev.filter(g => g.id !== eventPayload.data?.id));
        }
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      active = false;
      unsubEvent();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, eventId, orgId]);

  // Load participating org details when event updates
  useEffect(() => {
    if (!event || !event.participatingOrgIds || allOrgs.length === 0) return;
    const selected = allOrgs.filter(o => event.participatingOrgIds?.includes(o.id));
    setEditParticipatingOrgs(selected);
  }, [event, allOrgs]);

  // Fetch teams for participating organizations to resolve their names/orgs
  useEffect(() => {
    if (!event || !event.participatingOrgIds) return;
    event.participatingOrgIds.forEach(pOrgId => {
      wsService.emit('get_data', { type: 'teams', orgId: pOrgId }, (res: any) => {
        if (Array.isArray(res)) {
          setParticipatingTeams(prev => ({
            ...prev,
            [pOrgId]: res
          }));
        }
      });
    });
  }, [event?.participatingOrgIds]);

  // Search similar orgs for edit settings autocomplete
  useEffect(() => {
    const query = orgSearchText.trim();
    if (!query) {
      setSearchedOrgs([]);
      return;
    }

    setIsSearchingOrgs(true);
    const timer = setTimeout(() => {
      wsService.emit('get_data', { type: 'search_similar_orgs', name: query }, (res: any) => {
        setIsSearchingOrgs(false);
        if (Array.isArray(res)) {
          setSearchedOrgs(res.filter(o => o.id !== orgId && !editParticipatingOrgs.some(p => p.id === o.id)));
        }
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [orgSearchText, editParticipatingOrgs, orgId]);

  // Helper to resolve team names and organizations
  const getTeamName = (teamId: string) => {
    const hostTeam = hostTeams.find(t => t.id === teamId);
    if (hostTeam) return hostTeam.name;

    for (const [_, teamsList] of Object.entries(participatingTeams)) {
      const matchTeam = teamsList.find(t => t.id === teamId);
      if (matchTeam) {
        const teamOrg = allOrgs.find(o => o.id === matchTeam.orgId);
        return teamOrg?.shortName ? `${teamOrg.shortName} ${matchTeam.name}` : matchTeam.name;
      }
    }
    return teamId;
  };

  const getTeamOrgId = (teamId: string): string => {
    const hostTeam = hostTeams.find(t => t.id === teamId);
    if (hostTeam) return orgId;

    for (const [pOrgId, teamsList] of Object.entries(participatingTeams)) {
      if (teamsList.some(t => t.id === teamId)) return pOrgId;
    }
    return '';
  };

  // Standings Calculation
  const calculateLiveStandings = (): LeagueStandingRow[] => {
    if (!event) return [];
    
    // Resolve organization profiles participating in the event
    const orgsList = [
      { id: orgId, name: allOrgs.find(o => o.id === orgId)?.name || 'Host' },
      ...editParticipatingOrgs.map(o => ({ id: o.id, name: o.name }))
    ];

    // Map game participants from TeamId to OrgId so standings calculate by school/club rather than individual team
    const mappedGames = games.map(game => {
      const mappedParticipants = game.participants?.map(p => {
        const pOrgId = getTeamOrgId(p.teamId || '');
        return {
          ...p,
          teamId: pOrgId || p.teamId || '' // Fallback to teamId if org is unresolved
        };
      });

      return {
        ...game,
        participants: mappedParticipants
      };
    });

    const config = {
      pointsPerWin: event.settings?.pointsPerWin ?? 3,
      pointsPerDraw: event.settings?.pointsPerDraw ?? 1,
      pointsPerLoss: 0
    };

    return calculateStandings(mappedGames, orgsList, config);
  };

  // Score match handler
  const handleScoreGame = () => {
    if (!selectedGameToScore) return;
    setIsProcessing(true);

    const homeVal = parseInt(homeScore);
    const awayVal = parseInt(awayScore);

    const payload = {
      id: selectedGameToScore.id,
      userId: user?.id,
      orgId,
      data: {
        status: 'Finished',
        finalScoreData: {
          home: isNaN(homeVal) ? 0 : homeVal,
          away: isNaN(awayVal) ? 0 : awayVal
        }
      }
    };

    wsService.emit('action', { type: SocketAction.UPDATE_GAME, payload }, (res: any) => {
      setIsProcessing(false);
      setIsScoringVisible(false);
      setSelectedGameToScore(null);
      setHomeScore('');
      setAwayScore('');
    });
  };

  // Update Settings Handler
  const handleSaveSettings = () => {
    if (!editName.trim()) return;
    setIsProcessing(true);

    const payload = {
      id: eventId,
      userId: user?.id,
      orgId,
      data: {
        name: editName.trim(),
        startDate: `${editStartDate}T12:00:00.000Z`,
        endDate: isMultiDay && editEndDate ? `${editEndDate}T12:00:00.000Z` : null,
        siteId: editSiteId || null,
        sportIds: editSportIds,
        participatingOrgIds: editParticipatingOrgs.map(o => o.id)
      }
    };

    wsService.emit('action', { type: SocketAction.UPDATE_EVENT, payload }, (res: any) => {
      setIsProcessing(false);
      if (res) {
        setEvent(res);
        setActiveTab('schedule');
      }
    });
  };

  // Cancel Event Handler
  const handleCancelEvent = () => {
    setIsProcessing(true);
    const payload = {
      id: eventId,
      userId: user?.id,
      orgId,
      data: { status: 'Cancelled' }
    };

    wsService.emit('action', { type: SocketAction.UPDATE_EVENT, payload }, (res: any) => {
      setIsProcessing(false);
      setIsCancelling(false);
    });
  };

  // Delete Event Handler
  const handleDeleteEvent = () => {
    setIsProcessing(true);
    wsService.emit('action', { 
      type: SocketAction.DELETE_EVENT, 
      payload: { id: eventId, userId: user?.id, orgId } 
    }, (res: any) => {
      setIsProcessing(false);
      setIsDeleting(false);
      router.push(`/admin/${orgId}/events`);
    });
  };

  if (isLoading || !event) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950 justify-center items-center">
        <ActivityIndicator size="large" color={COLORS.brand.orange} />
        <Text className="font-orbitron text-xs text-slate-500 mt-4 uppercase tracking-widest">
          Loading Details...
        </Text>
      </SafeAreaView>
    );
  }

  const isSingleMatch = event.type === 'SingleMatch';
  const standingsRows = calculateLiveStandings();

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => safeBack(`/admin/${orgId}/events`)}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.brand.orange} />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase truncate flex-1 text-center px-4" numberOfLines={1}>
          {event.name}
        </Text>
        <View className="w-10" />
      </View>

      {/* CORE INFO SUMMARY BAR */}
      <View className="bg-white dark:bg-slate-900 px-6 py-3 flex-row justify-between items-center border-b border-slate-100 dark:border-white/5">
        <View className="flex-row items-center gap-2">
          <Ionicons name="calendar-outline" size={14} color={COLORS.brand.orange} />
          <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
            {event.startDate?.split('T')[0]} {event.endDate ? `to ${event.endDate.split('T')[0]}` : ''}
          </Text>
        </View>
        <View className="bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded">
          <Text className="font-orbitron-bold text-[9px] text-slate-700 dark:text-slate-400 uppercase tracking-widest">
            {event.type}
          </Text>
        </View>
      </View>

      {/* TABS (For Container Events) */}
      {!isSingleMatch && (
        <View className="flex-row bg-white dark:bg-slate-900 border-b border-slate-200/50 dark:border-white/5">
          {((canEdit ? ['schedule', 'standings', 'settings'] : ['schedule', 'standings']) as ('schedule' | 'standings' | 'settings')[]).map(tab => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                className={`flex-1 items-center py-3 border-b-2 ${
                  isActive ? 'border-brand-orange' : 'border-transparent'
                }`}
              >
                <Text
                  className={`font-orbitron-bold text-xs uppercase tracking-wider ${
                    isActive ? 'text-brand-orange' : 'text-slate-500'
                  }`}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 60 }}>
        {/* SINGLE MATCH VIEW */}
        {isSingleMatch ? (
          <View className="space-y-6">
            <GlassCard className="border border-slate-200 dark:border-white/5 p-5">
              <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
                Single Match Details
              </Text>
              
              {games.length > 0 ? (
                <View className="space-y-6 items-center">
                  <View className="flex-row justify-between items-center w-full">
                    <View className="flex-1 items-center">
                      <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white text-center">
                        {getTeamName(games[0].participants?.[0]?.teamId || '')}
                      </Text>
                      {games[0].status === 'Finished' && (
                        <Text className="font-orbitron-bold text-4xl text-brand-orange mt-2">
                          {games[0].finalScoreData?.home ?? 0}
                        </Text>
                      )}
                    </View>
                    <View className="px-4">
                      <Text className="font-inter-bold text-xs text-slate-400 uppercase tracking-wider">VS</Text>
                    </View>
                    <View className="flex-1 items-center">
                      <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white text-center">
                        {getTeamName(games[0].participants?.[1]?.teamId || '')}
                      </Text>
                      {games[0].status === 'Finished' && (
                        <Text className="font-orbitron-bold text-4xl text-brand-orange mt-2">
                          {games[0].finalScoreData?.away ?? 0}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View className="bg-slate-100 dark:bg-white/5 px-4 py-2 rounded-xl border border-slate-200/50 dark:border-white/5 w-full flex-row justify-around">
                    <View className="items-center">
                      <Text className="font-inter text-[10px] text-slate-500 uppercase">Status</Text>
                      <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white mt-0.5">{games[0].status}</Text>
                    </View>
                    <View className="items-center">
                      <Text className="font-inter text-[10px] text-slate-500 uppercase">Venue</Text>
                      <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white mt-0.5">
                        {sites.find(s => s.id === games[0].siteId)?.name || 'Default Site'}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row gap-2 w-full">
                    <Button
                      title="View Match"
                      variant="secondary"
                      onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/${games[0].id}/view`)}
                      className="flex-1 py-2.5 rounded-lg shadow-sm"
                    />
                    {canUserScoreGame(games[0]) && (
                      <Button
                        title="Lineup"
                        variant="secondary"
                        onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/${games[0].id}/selection`)}
                        className="flex-1 py-2.5 rounded-lg shadow-sm"
                      />
                    )}
                    {canEdit && (
                      <Button
                        title="Edit Match"
                        variant="secondary"
                        onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/${games[0].id}/edit`)}
                        className="flex-1 py-2.5 rounded-lg shadow-sm"
                      />
                    )}
                    {canUserScoreGame(games[0]) && (
                      <Button
                        title="Score Match"
                        onPress={() => {
                          router.push(`/admin/${orgId}/events/${eventId}/games/${games[0].id}/score`);
                        }}
                        className="flex-1 py-2.5 rounded-lg"
                      />
                    )}
                  </View>
                </View>
              ) : (
                <View className="items-center py-6">
                  <Text className="font-inter text-xs text-slate-400 italic">No game configured. Wait for socket load.</Text>
                </View>
              )}
            </GlassCard>

            {/* READ ONLY WARNING BANNER */}
            {!canEdit && (
              <GlassCard className="border border-brand-orange/20 bg-brand-orange/5 p-4 flex-row items-center gap-3">
                <Ionicons name="information-circle-outline" size={20} color={COLORS.brand.orange} />
                <Text className="font-inter text-xs text-slate-600 dark:text-slate-400 flex-1 leading-relaxed">
                  You are viewing this event in read-only mode because it belongs to another organization.
                </Text>
              </GlassCard>
            )}

            {/* DANGER ZONE (For Single Match) */}
            {canEdit && (
              <GlassCard className="border border-red-500/25 bg-red-500/5 p-5 space-y-4">
                <Text className="font-orbitron-bold text-xs text-brand-red uppercase tracking-wider">Danger Zone</Text>
                <View className="flex-row justify-between items-center">
                  <View>
                    <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Cancel Event</Text>
                    <Text className="font-inter text-xs text-slate-500 mt-0.5">Marks the match as cancelled.</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setIsCancelling(true)}
                    disabled={event.status === 'Cancelled'}
                    className={`px-4 py-2 border border-brand-orange rounded-lg ${
                      event.status === 'Cancelled' ? 'opacity-40' : ''
                    }`}
                  >
                    <Text className="font-inter-bold text-xs text-brand-orange uppercase">Cancel Match</Text>
                  </TouchableOpacity>
                </View>

                <View className="flex-row justify-between items-center pt-4 border-t border-slate-100 dark:border-white/5">
                  <View>
                    <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Delete Event</Text>
                    <Text className="font-inter text-xs text-slate-500 mt-0.5">Permanently deletes match records.</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setIsDeleting(true)}
                    className="px-4 py-2 border border-brand-red rounded-lg"
                  >
                    <Text className="font-inter-bold text-xs text-brand-red uppercase">Delete Match</Text>
                  </TouchableOpacity>
                </View>
              </GlassCard>
            )}
          </View>
        ) : (
          /* MULTI-GAME TABS */
          <View>
            {/* SCHEDULE TAB */}
            {activeTab === 'schedule' && (
              <View className="space-y-4">
                {/* Filters Row */}
                <View className="flex-row gap-3">
                  <View className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 flex-row justify-between items-center">
                    <Text className="font-inter text-xs text-slate-500">Group: </Text>
                    <TouchableOpacity 
                      onPress={() => setGroupingMode(prev => prev === 'time' ? 'sport' : prev === 'sport' ? 'site' : 'time')}
                      className="bg-slate-100 dark:bg-white/10 px-2.5 py-1 rounded"
                    >
                      <Text className="font-orbitron-bold text-[10px] text-brand-orange uppercase tracking-wider">
                        {groupingMode}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {canEdit && (
                    <TouchableOpacity
                      onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/new`)}
                      className="bg-brand-orange px-4 rounded-xl flex-row items-center justify-center gap-1 shadow-md shadow-brand-orange/10"
                    >
                      <Ionicons name="add" size={16} color="white" />
                      <Text className="font-inter-bold text-xs text-white uppercase">Add Game</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Games Group Lists */}
                {games.length === 0 ? (
                  <View className="items-center justify-center py-16 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
                    <Ionicons name="calendar-outline" size={40} color={COLORS.dark.textSecondary} style={{ opacity: 0.3, marginBottom: 8 }} />
                    <Text className="font-orbitron text-xs text-slate-500 uppercase tracking-widest">No games scheduled</Text>
                    {canEdit && (
                      <Button 
                        title="Add your first game" 
                        onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/new`)}
                        className="mt-4 px-6 py-2 rounded-lg"
                      />
                    )}
                  </View>
                ) : (
                  <View className="space-y-4">
                    {/* Render Group Headers and Games list */}
                    {Object.entries(
                      games.reduce((acc, game) => {
                        let key = 'Other';
                        if (groupingMode === 'time') {
                          key = (game.scheduledStartTime && !game.customSettings?.timeTbd) ? game.scheduledStartTime.split('T')[1]?.substring(0, 5) : 'TBD';
                        } else if (groupingMode === 'sport') {
                          key = sports.find(s => s.id === game.sportId)?.name || 'Unknown Sport';
                        } else if (groupingMode === 'site') {
                          key = sites.find(s => s.id === game.siteId)?.name || 'Main Site';
                        }
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(game);
                        return acc;
                      }, {} as Record<string, Game[]>)
                    ).map(([groupTitle, groupGames]) => (
                      <View key={groupTitle} className="space-y-2">
                        <Text className="font-orbitron-bold text-[10px] text-slate-500 uppercase tracking-widest pl-1">
                          {groupTitle}
                        </Text>
                        {groupGames.map(game => (
                          <GlassCard key={game.id} className="border border-slate-200 dark:border-white/5 p-4 flex-row justify-between items-center">
                            <TouchableOpacity
                              onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/${game.id}/${canEdit ? 'edit' : 'view'}`)}
                              className="flex-1 active:opacity-80"
                            >
                              <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white leading-tight">
                                {getTeamName(game.participants?.[0]?.teamId || '')} vs {getTeamName(game.participants?.[1]?.teamId || '')}
                              </Text>
                              <Text className="font-inter text-[10px] text-slate-500 mt-1 uppercase tracking-wider">
                                {sports.find(s => s.id === game.sportId)?.name} • {game.status}
                              </Text>
                            </TouchableOpacity>
                             <View className="flex-row items-center gap-1.5">
                              {game.status === 'Finished' && game.finalScoreData && (
                                <Text className="font-orbitron-bold text-xs text-brand-orange mr-1">
                                  {game.finalScoreData?.home ?? 0} - {game.finalScoreData?.away ?? 0}
                                </Text>
                              )}
                              <TouchableOpacity
                                onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/${game.id}/view`)}
                                className="w-7 h-7 bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 rounded-lg items-center justify-center active:opacity-80"
                              >
                                <Ionicons name="eye-outline" size={12} color={getThemeColor(isDark, 'textSecondary')} />
                              </TouchableOpacity>
                              {canEdit && (
                                <TouchableOpacity
                                  onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/${game.id}/edit`)}
                                  className="w-7 h-7 bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 rounded-lg items-center justify-center active:opacity-80"
                                >
                                  <Ionicons name="pencil-outline" size={12} color={getThemeColor(isDark, 'textSecondary')} />
                                </TouchableOpacity>
                              )}
                              {canUserScoreGame(game) && (
                                <TouchableOpacity
                                  onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/${game.id}/selection`)}
                                  className="w-7 h-7 bg-brand-orange/10 border border-brand-orange/30 rounded-lg items-center justify-center active:opacity-85"
                                >
                                  <Ionicons name="people-outline" size={12} color={COLORS.brand.orange} />
                                </TouchableOpacity>
                              )}
                              {canUserScoreGame(game) && (
                                <TouchableOpacity
                                  onPress={() => {
                                    router.push(`/admin/${orgId}/events/${eventId}/games/${game.id}/score`);
                                  }}
                                  className="w-7 h-7 bg-brand-orange/10 border border-brand-orange/30 rounded-lg items-center justify-center active:opacity-85"
                                >
                                  <Ionicons name="trophy-outline" size={12} color={COLORS.brand.orange} />
                                </TouchableOpacity>
                              )}
                             </View>
                          </GlassCard>
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* STANDINGS TAB */}
            {activeTab === 'standings' && (
              <View className="space-y-4">
                <Text className="font-orbitron-bold text-[10px] text-slate-500 uppercase tracking-widest pl-1 mb-2">
                  Event Leaderboard (Points Board)
                </Text>

                <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm">
                  <View className="flex-row bg-slate-100 dark:bg-slate-800 px-4 py-3">
                    <Text className="flex-1 font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-wider">Organization</Text>
                    <Text className="w-10 text-center font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-wider">P</Text>
                    <Text className="w-10 text-center font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-wider">W</Text>
                    <Text className="w-10 text-center font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-wider">D</Text>
                    <Text className="w-12 text-center font-orbitron-bold text-[9px] text-brand-orange uppercase tracking-wider">Pts</Text>
                  </View>

                  {standingsRows.map((row, idx) => (
                    <View key={row.teamId} className="flex-row items-center px-4 py-3.5 border-b border-slate-100 dark:border-white/5">
                      <Text className="flex-1 font-inter-bold text-sm text-slate-800 dark:text-white pr-2" numberOfLines={1}>
                        {idx + 1}. {row.teamName}
                      </Text>
                      <Text className="w-10 text-center font-inter text-sm text-slate-600 dark:text-slate-400">{row.played}</Text>
                      <Text className="w-10 text-center font-inter text-sm text-slate-600 dark:text-slate-400">{row.wins}</Text>
                      <Text className="w-10 text-center font-inter text-sm text-slate-600 dark:text-slate-400">{row.draws}</Text>
                      <Text className="w-12 text-center font-orbitron-bold text-sm text-brand-orange">{row.points}</Text>
                    </View>
                  ))}

                  {standingsRows.length === 0 && (
                    <View className="p-8 items-center justify-center">
                      <Text className="font-inter text-xs text-slate-400 italic">No scoreboard data calculated. Schedule and complete games.</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* SETTINGS TAB */}
            {activeTab === 'settings' && (
              <View className="space-y-6">
                <GlassCard className="border border-slate-200 dark:border-white/5 p-5 space-y-5">
                  <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white uppercase tracking-wider">
                    Edit Event Details
                  </Text>

                  {/* Event Name */}
                  <View className="space-y-1.5">
                    <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Event Name</Text>
                    <TextInput
                      value={editName}
                      onChangeText={setEditName}
                      className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
                    />
                  </View>

                  {/* Dates */}
                  <View className="space-y-3">
                    <View className="flex-row justify-between items-center">
                      <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Dates</Text>
                      <View className="flex-row items-center gap-2">
                        <Text className="font-inter text-xs text-slate-500">Multi-day</Text>
                        <Switch
                          value={isMultiDay}
                          onValueChange={setIsMultiDay}
                          trackColor={{ false: '#CBD5E1', true: COLORS.brand.orange }}
                        />
                      </View>
                    </View>
                    <DatePicker value={editStartDate} onChange={setEditStartDate} />
                    {isMultiDay && (
                      <DatePicker value={editEndDate} onChange={setEditEndDate} placeholder="End Date" />
                    )}
                  </View>

                  {/* Site venue */}
                  <View className="space-y-1.5">
                    <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Site Venue</Text>
                    <CustomSelect
                      value={editSiteId || ''}
                      onChange={(val: string) => setEditSiteId(val)}
                      options={sites.map(s => ({ label: s.name, value: s.id }))}
                      placeholder="Select site..."
                      clearable={true}
                    />
                  </View>

                  {/* Multi-select sports */}
                  <View className="space-y-1.5">
                    <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Featured Sports</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {sports.map(sport => {
                        const isSelected = editSportIds.includes(sport.id);
                        return (
                          <TouchableOpacity
                            key={sport.id}
                            onPress={() => {
                              if (isSelected) {
                                setEditSportIds(prev => prev.filter(id => id !== sport.id));
                              } else {
                                setEditSportIds(prev => [...prev, sport.id]);
                              }
                            }}
                            className={`px-3 py-2 rounded-lg border ${
                              isSelected 
                                ? 'bg-brand-orange/10 border-brand-orange' 
                                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/5'
                            }`}
                          >
                            <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                              {sport.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Participating organizations */}
                  <View className="space-y-2">
                    <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Participating Organizations
                    </Text>

                    {editParticipatingOrgs.length > 0 && (
                      <View className="flex-row flex-wrap gap-2 mb-2">
                        {editParticipatingOrgs.map(po => (
                          <View key={po.id} className="flex-row items-center bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200/50 dark:border-white/5">
                            <Text className="font-inter text-xs text-slate-700 dark:text-slate-300 mr-1.5">{po.name}</Text>
                            <TouchableOpacity onPress={() => setEditParticipatingOrgs(prev => prev.filter(o => o.id !== po.id))}>
                              <Ionicons name="close-circle" size={14} color={COLORS.brand.red} />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}

                    <View className="relative z-20">
                      <TextInput
                        placeholder="Search and add organizations..."
                        placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                        value={orgSearchText}
                        onChangeText={setOrgSearchText}
                        className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
                      />
                      {isSearchingOrgs && (
                        <ActivityIndicator size="small" color={COLORS.brand.orange} className="absolute right-4 top-3.5" />
                      )}

                      {searchedOrgs.length > 0 && (
                        <View className="absolute top-12 left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl shadow-lg z-30 max-h-40 overflow-y-auto">
                          {searchedOrgs.map(o => (
                            <TouchableOpacity
                              key={o.id}
                              onPress={() => {
                                setEditParticipatingOrgs(prev => [...prev, o]);
                                setOrgSearchText('');
                                setSearchedOrgs([]);
                              }}
                              className="p-3 border-b border-slate-100 dark:border-white/5 hover:bg-slate-50"
                            >
                              <Text className="font-inter text-xs text-slate-800 dark:text-white">{o.name}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>

                  <Button
                    title="Save Settings"
                    onPress={handleSaveSettings}
                    disabled={isProcessing || !editName.trim()}
                    className="w-full py-3 rounded-xl mt-4"
                  />
                </GlassCard>

                {/* DANGER ZONE (For Container Events) */}
                <GlassCard className="border border-red-500/25 bg-red-500/5 p-5 space-y-4">
                  <Text className="font-orbitron-bold text-xs text-brand-red uppercase tracking-wider">Danger Zone</Text>
                  <View className="flex-row justify-between items-center">
                    <View>
                      <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Cancel Event</Text>
                      <Text className="font-inter text-xs text-slate-500 mt-0.5">Marks the event and all matches as cancelled.</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setIsCancelling(true)}
                      disabled={event.status === 'Cancelled'}
                      className={`px-4 py-2 border border-brand-orange rounded-lg ${
                        event.status === 'Cancelled' ? 'opacity-40' : ''
                      }`}
                    >
                      <Text className="font-inter-bold text-xs text-brand-orange uppercase">Cancel Event</Text>
                    </TouchableOpacity>
                  </View>

                  <View className="flex-row justify-between items-center pt-4 border-t border-slate-100 dark:border-white/5">
                    <View>
                      <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Delete Event</Text>
                      <Text className="font-inter text-xs text-slate-500 mt-0.5">Permanently removes all data and matchups.</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setIsDeleting(true)}
                      className="px-4 py-2 border border-brand-red rounded-lg"
                    >
                      <Text className="font-inter-bold text-xs text-brand-red uppercase">Delete Event</Text>
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* SCORE GAME POPUP MODAL */}
      <Modal
        visible={isScoringVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setIsScoringVisible(false);
          setSelectedGameToScore(null);
        }}
      >
        <View className="flex-1 bg-black/60 justify-center px-6">
          <View className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-white/5 shadow-xl space-y-4">
            <Text className="font-orbitron-bold text-base text-slate-850 dark:text-white uppercase tracking-wider text-center">
              Input Final Scores
            </Text>
            {selectedGameToScore && (
              <View className="space-y-4">
                <View className="flex-row items-center justify-between">
                  <Text className="font-inter-bold text-sm text-slate-700 dark:text-slate-300 flex-1 pr-3" numberOfLines={1}>
                    {getTeamName(selectedGameToScore.participants?.[0]?.teamId || '')}
                  </Text>
                  <TextInput
                    placeholder="0"
                    placeholderTextColor={COLORS.dark.placeholder}
                    value={homeScore}
                    onChangeText={setHomeScore}
                    keyboardType="numeric"
                    className="w-16 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-lg px-3 py-2 font-orbitron-bold text-sm text-slate-850 dark:text-white text-center"
                  />
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="font-inter-bold text-sm text-slate-700 dark:text-slate-300 flex-1 pr-3" numberOfLines={1}>
                    {getTeamName(selectedGameToScore.participants?.[1]?.teamId || '')}
                  </Text>
                  <TextInput
                    placeholder="0"
                    placeholderTextColor={COLORS.dark.placeholder}
                    value={awayScore}
                    onChangeText={setAwayScore}
                    keyboardType="numeric"
                    className="w-16 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-lg px-3 py-2 font-orbitron-bold text-sm text-slate-850 dark:text-white text-center"
                  />
                </View>
                <View className="flex-row gap-3 pt-4">
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={() => {
                      setIsScoringVisible(false);
                      setSelectedGameToScore(null);
                    }}
                    className="flex-1 py-2.5 rounded-lg"
                  />
                  <Button
                    title="Save Score"
                    onPress={handleScoreGame}
                    disabled={isProcessing}
                    className="flex-1 py-2.5 rounded-lg"
                  />
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* CANCELLATION CONFIRMATION */}
      <ConfirmationModal
        isOpen={isCancelling}
        title="Cancel Event / Match?"
        description={`Are you sure you want to cancel "${event.name}"? This action will set the status of all associated games to Cancelled.`}
        confirmText="Cancel Event"
        cancelText="Keep Scheduled"
        onConfirm={handleCancelEvent}
        onClose={() => setIsCancelling(false)}
        isProcessing={isProcessing}
      />

      {/* DELETION CONFIRMATION */}
      <ConfirmationModal
        isOpen={isDeleting}
        title="Delete Event / Match?"
        description={`Are you sure you want to permanently delete "${event.name}"? This will remove all database records and standings, and cannot be undone.`}
        confirmText="Delete Event"
        cancelText="Cancel"
        onConfirm={handleDeleteEvent}
        onClose={() => setIsDeleting(false)}
        isProcessing={isProcessing}
      />
    </SafeAreaView>
  );
}
