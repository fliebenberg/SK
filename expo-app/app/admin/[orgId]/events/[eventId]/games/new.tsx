import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Modal, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../../../components/GlassCard';
import { Button } from '../../../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmationModal } from '../../../../../../components/ConfirmationModal';
import { useActiveTheme } from '../../../../../../store/settingsStore';
import { wsService } from '../../../../../../services/websocket';
import { useWsStore } from '../../../../../../store/wsStore';
import { useAuthStore } from '../../../../../../store/authStore';
import { SocketAction, Event, Game, Sport, Site, Team, Organization } from '@sk/shared';
import { COLORS, getThemeColor } from '../../../../../../constants/Colors';
import DatePicker from '../../../../../../components/DatePicker';
import CustomSelect from '../../../../../../components/CustomSelect';

export default function ScheduleGame() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string, eventId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  // Form Loading States
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [event, setEvent] = useState<Event | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [orgsList, setOrgsList] = useState<Organization[]>([]);

  // Team cache by organization
  const [orgTeams, setOrgTeams] = useState<Record<string, Team[]>>({});

  // Form Fields
  const [selectedSportId, setSelectedSportId] = useState('');
  const [selectedHomeOrgId, setSelectedHomeOrgId] = useState(orgId);
  const [selectedHomeTeamId, setSelectedHomeTeamId] = useState('');
  const [selectedAwayOrgId, setSelectedAwayOrgId] = useState('');
  const [selectedAwayTeamId, setSelectedAwayTeamId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [gameDate, setGameDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [isTbd, setIsTbd] = useState(false);

  // Quick Create Modals
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgShortName, setNewOrgShortName] = useState('');
  const [newOrgContactEmail, setNewOrgContactEmail] = useState('');

  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamShortName, setNewTeamShortName] = useState('');
  const [newTeamAgeGroup, setNewTeamAgeGroup] = useState('Open');
  const [targetOrgIdForTeam, setTargetOrgIdForTeam] = useState('');

  const [pendingReferrals, setPendingReferrals] = useState<Record<string, string>>({});

  // Modal alert
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  // Load Metadata
  useEffect(() => {
    if (!isConnected || !orgId || !eventId) return;

    setIsLoading(true);

    wsService.emit('get_data', { type: 'event', id: eventId }, (res: any) => {
      if (res) {
        setEvent(res);
        if (res.sportIds && res.sportIds.length > 0) {
          setSelectedSportId(res.sportIds[0]);
        }
        if (res.siteId) setSelectedSiteId(res.siteId);
      }
    });

    wsService.emit('get_data', { type: 'games', orgId }, (res: any) => {
      if (Array.isArray(res)) setGames(res);
    });

    wsService.emit('get_data', { type: 'sports' }, (resSports: any) => {
      const allSports = Array.isArray(resSports) ? resSports : [];
      if (allSports.length > 0) {
        setSports(allSports);
        if (!selectedSportId) {
          wsService.emit('get_data', { type: 'organization', id: orgId }, (hostOrg: any) => {
            if (hostOrg && Array.isArray(hostOrg.supportedSportIds) && hostOrg.supportedSportIds.length > 0) {
              const matchedSport = allSports.find((s: any) => hostOrg.supportedSportIds.includes(s.id));
              if (matchedSport) {
                setSelectedSportId(matchedSport.id);
                return;
              }
            }
            setSelectedSportId(allSports[0].id);
          });
        }
      }
    });

    wsService.emit('get_data', { type: 'sites', orgId }, (res: any) => {
      if (Array.isArray(res)) setSites(res);
    });

    wsService.emit('get_data', { type: 'organizations' }, (res: any) => {
      if (res && Array.isArray(res.items)) {
        setOrgsList(res.items);
      } else if (Array.isArray(res)) {
        setOrgsList(res);
      }
    });
  }, [isConnected, orgId, eventId]);

  // Fallback gameDate to event.startDate if not set
  useEffect(() => {
    if (event && !gameDate) {
      const d = event.startDate?.split('T')[0] || '';
      setGameDate(d);
    }
  }, [event, gameDate]);

  // Load teams for host and participating orgs when event/organizations are loaded
  useEffect(() => {
    if (!event || orgsList.length === 0) return;

    const allInvolvedOrgIds = [orgId, ...(event.participatingOrgIds || [])];
    
    let loadedCount = 0;
    allInvolvedOrgIds.forEach(id => {
      wsService.emit('get_data', { type: 'teams', orgId: id }, (res: any) => {
        if (Array.isArray(res)) {
          setOrgTeams(prev => ({
            ...prev,
            [id]: res
          }));
        }
        loadedCount++;
        if (loadedCount === allInvolvedOrgIds.length) {
          setIsLoading(false);
        }
      });
    });
  }, [event, orgsList, orgId]);

  // Filter sports to only show those featured in the event
  const eventSports = sports.filter(s => event?.sportIds?.includes(s.id));

  // Resolve list of involved organizations
  const involvedOrgs = orgsList.filter(o => o.id === orgId || event?.participatingOrgIds?.includes(o.id));

  // Resolve Home and Away Teams filtered by org & sport
  const homeTeamsList = (orgTeams[selectedHomeOrgId] || []).filter(t => t.sportId === selectedSportId);
  const awayTeamsList = (orgTeams[selectedAwayOrgId] || []).filter(t => t.sportId === selectedSportId);

  // Quick Create Org Handler
  const handleQuickCreateOrg = () => {
    if (!newOrgName.trim()) return;
    setIsProcessing(true);

    const payload = {
      name: newOrgName.trim(),
      shortName: newOrgShortName.trim() || undefined,
      joinPolicy: 'request',
      supportedSportIds: selectedSportId ? [selectedSportId] : [],
      isClaimed: false
    };

    wsService.emit('action', { type: SocketAction.ADD_ORG, payload }, (res: any) => {
      const org = res?.data || res;
      if (org && org.id) {
        // Invite contact person if specified
        const email = newOrgContactEmail.trim();
        const currentUserId = useAuthStore.getState().user?.id;
        if (email && currentUserId) {
          wsService.emit('action', {
            type: SocketAction.REFER_ORG_CONTACT,
            payload: {
              orgId: org.id,
              contactEmails: [email],
              referredByUserId: currentUserId
            }
          });
        }

        // Update list
        setOrgsList(prev => [...prev, org]);
        setSelectedAwayOrgId(org.id);
        setIsCreatingOrg(false);
        setNewOrgName('');
        setNewOrgShortName('');
        setNewOrgContactEmail('');
      }
      setIsProcessing(false);
    });
  };

  // Team Quick-Create Trigger
  const handleCreateTeamTrigger = (targetOrgId: string) => {
    setTargetOrgIdForTeam(targetOrgId);
    
    // Default the age group to the other team's age group (if available)
    let defaultedAgeGroup = 'Open';
    if (targetOrgId === selectedHomeOrgId) {
      if (selectedAwayTeamId) {
        const otherTeam = (orgTeams[selectedAwayOrgId] || []).find(t => t.id === selectedAwayTeamId);
        if (otherTeam?.ageGroup) defaultedAgeGroup = otherTeam.ageGroup;
      }
    } else {
      if (selectedHomeTeamId) {
        const otherTeam = (orgTeams[selectedHomeOrgId] || []).find(t => t.id === selectedHomeTeamId);
        if (otherTeam?.ageGroup) defaultedAgeGroup = otherTeam.ageGroup;
      }
    }
    
    setNewTeamAgeGroup(defaultedAgeGroup);
    setNewTeamName('');
    setNewTeamShortName('');
    setIsCreatingTeam(true);
  };

  // Team Quick-Create Handler
  const handleQuickCreateTeam = () => {
    if (!newTeamName.trim() || !newTeamShortName.trim() || !selectedSportId || !targetOrgIdForTeam) return;
    setIsProcessing(true);

    const payload = {
      name: newTeamName.trim(),
      shortName: newTeamShortName.trim(),
      orgId: targetOrgIdForTeam,
      sportId: selectedSportId,
      ageGroup: newTeamAgeGroup.trim() || 'Open',
      isActive: true
    };

    wsService.emit('action', { type: SocketAction.ADD_TEAM, payload }, (res: any) => {
      setIsProcessing(false);
      const team = res?.data || res;
      if (team && team.id) {
        setOrgTeams(prev => ({
          ...prev,
          [targetOrgIdForTeam]: [...(prev[targetOrgIdForTeam] || []), team]
        }));
        
        if (targetOrgIdForTeam === selectedHomeOrgId) {
          setSelectedHomeTeamId(team.id);
        } else {
          setSelectedAwayTeamId(team.id);
        }
        setIsCreatingTeam(false);
        setNewTeamName('');
        setNewTeamShortName('');
        setNewTeamAgeGroup('Open');
      }
    });
  };

  // Submit Handler
  const handleSubmit = (ignoreConflict = false) => {
    if (!event || !selectedHomeTeamId || !selectedAwayTeamId) return;

    // Emit pending referrals if any exist
    const currentUserId = useAuthStore.getState().user?.id;
    if (currentUserId) {
      Object.entries(pendingReferrals).forEach(([rOrgId, email]) => {
        const trimmedEmail = email.trim();
        if (trimmedEmail && trimmedEmail.includes('@')) {
          wsService.emit('action', {
            type: SocketAction.REFER_ORG_CONTACT,
            payload: {
              orgId: rOrgId,
              contactEmails: [trimmedEmail],
              referredByUserId: currentUserId
            }
          });
        }
      });
    }

    const dateBase = gameDate || event.startDate.split('T')[0];
    let scheduledTime: string | undefined = undefined;

    if (isTbd) {
      const dateObj = new Date(`${dateBase}T12:00:00`);
      scheduledTime = !isNaN(dateObj.getTime()) ? dateObj.toISOString() : `${dateBase}T12:00:00`;
    } else {
      const dateObj = new Date(`${dateBase}T${startTime}:00`);
      scheduledTime = !isNaN(dateObj.getTime()) ? dateObj.toISOString() : `${dateBase}T${startTime}:00`;
    }

    // Conflict Check
    if (!isTbd && scheduledTime && !ignoreConflict) {
      const matchConflict = games.find(g => {
        if (g.status === 'Cancelled' || !g.startTime) return false;
        
        // Compare same site and same time
        const gTime = new Date(g.startTime).getTime();
        const propTime = new Date(scheduledTime!).getTime();
        return g.siteId === selectedSiteId && gTime === propTime;
      });

      if (matchConflict) {
        const homeName = getTeamName(matchConflict.participants?.[0]?.teamId || '');
        const awayName = getTeamName(matchConflict.participants?.[1]?.teamId || '');
        setConflictWarning(
          `There is already a game scheduled at this venue and time:\n\n"${homeName} vs ${awayName}"\n\nDo you want to schedule this anyway?`
        );
        return;
      }
    }

    setIsProcessing(true);

    const gamePayload = {
      eventId: eventId,
      sportId: selectedSportId,
      participants: [{ teamId: selectedHomeTeamId }, { teamId: selectedAwayTeamId }],
      scheduledStartTime: scheduledTime,
      startTime: scheduledTime,
      siteId: selectedSiteId || undefined,
      status: 'Scheduled',
      customSettings: {
        timeTbd: isTbd
      }
    };
      wsService.emit('action', { type: SocketAction.ADD_GAME, payload: gamePayload }, (res: any) => {
      setIsProcessing(false);
      setConflictWarning(null);
      const game = res?.data || res;
      if (game) safeBack(`/admin/${orgId}/events/${eventId}`);
    });
  };

  // Helper to resolve team display name
  const getTeamName = (teamId: string) => {
    for (const [_, teamsList] of Object.entries(orgTeams)) {
      const t = teamsList.find(item => item.id === teamId);
      if (t) {
        const tOrg = orgsList.find(o => o.id === t.orgId);
        return tOrg?.shortName ? `${tOrg.shortName} ${t.name}` : t.name;
      }
    }
    return teamId;
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

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => safeBack(`/admin/${orgId}/events/${eventId}`)}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.brand.orange} />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Cancel
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase truncate flex-1 text-center px-4" numberOfLines={1}>
          Schedule Game
        </Text>
        <TouchableOpacity 
          className={`active:opacity-85 ${(!selectedHomeTeamId || !selectedAwayTeamId) ? 'opacity-40' : ''}`}
          disabled={!selectedHomeTeamId || !selectedAwayTeamId || isProcessing}
          onPress={() => handleSubmit(false)}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={COLORS.brand.orange} />
          ) : (
            <Text className="font-inter-bold text-xs text-brand-orange uppercase tracking-wider">
              Save
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 60 }}>
        <GlassCard className="border border-slate-200 dark:border-white/5 p-5 space-y-5">
          <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
            Game Setup for: {event.name}
          </Text>

          {/* Select Sport */}
          <View className="space-y-1.5">
            <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Sport
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {eventSports.map(sport => {
                const isSelected = selectedSportId === sport.id;
                return (
                  <TouchableOpacity
                    key={sport.id}
                    onPress={() => {
                      setSelectedSportId(sport.id);
                      setSelectedHomeTeamId('');
                      setSelectedAwayTeamId('');
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

          {/* Home Org Selection */}
          <View className="space-y-1.5">
            <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Home Organization
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {involvedOrgs.map(o => {
                const isSelected = selectedHomeOrgId === o.id;
                return (
                  <TouchableOpacity
                    key={o.id}
                    onPress={() => {
                      setSelectedHomeOrgId(o.id);
                      setSelectedHomeTeamId('');
                    }}
                    className={`px-3 py-2 rounded-lg border ${
                      isSelected 
                        ? 'bg-brand-orange/10 border-brand-orange' 
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/5'
                    }`}
                  >
                    <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                      {o.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Home Team Selection */}
          {!!selectedHomeOrgId && (
            <View className="space-y-1.5">
              <View className="flex-row justify-between items-center">
                <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Home Team
                </Text>
                <TouchableOpacity onPress={() => handleCreateTeamTrigger(selectedHomeOrgId)}>
                  <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                    + Add Team
                  </Text>
                </TouchableOpacity>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {homeTeamsList.map(team => {
                  const isSelected = selectedHomeTeamId === team.id;
                  return (
                    <TouchableOpacity
                      key={team.id}
                      onPress={() => setSelectedHomeTeamId(team.id)}
                      className={`px-3 py-2 rounded-lg border ${
                        isSelected 
                          ? 'bg-brand-orange/10 border-brand-orange' 
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/5'
                      }`}
                    >
                      <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                        {team.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {homeTeamsList.length === 0 && (
                  <Text className="font-inter text-xs text-slate-400 italic">No teams matching selected sport.</Text>
                )}
              </View>
            </View>
          )}

          {/* Away Org Selection */}
          <View className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-white/5">
            <View className="flex-row justify-between items-center">
              <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Away Organization
              </Text>
              <TouchableOpacity onPress={() => setIsCreatingOrg(true)}>
                <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                  + Register Org
                </Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {orgsList.filter(o => o.id === orgId || event?.participatingOrgIds?.includes(o.id) || o.id === selectedAwayOrgId).map(o => {
                const isSelected = selectedAwayOrgId === o.id;
                return (
                  <TouchableOpacity
                    key={o.id}
                    onPress={() => {
                      setSelectedAwayOrgId(o.id);
                      setSelectedAwayTeamId('');
                    }}
                    className={`px-3 py-2 rounded-lg border ${
                      isSelected 
                        ? 'bg-brand-orange/10 border-brand-orange' 
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/5'
                    }`}
                  >
                    <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                      {o.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Unclaimed Org Contact Referral section */}
            {(() => {
              const selectedAwayOrg = orgsList.find(o => o.id === selectedAwayOrgId);
              if (selectedAwayOrg && selectedAwayOrg.isClaimed === false) {
                return (
                  <View className="bg-brand-orange/10 dark:bg-brand-orange/5 border border-brand-orange/20 rounded-xl p-4 mt-2 space-y-2">
                    <Text className="font-orbitron-bold text-[10px] text-brand-orange uppercase tracking-wider">
                      Help us get this organization claimed!
                    </Text>
                    <Text className="font-inter text-xs text-slate-650 dark:text-slate-400 leading-4">
                      If you know who manages {selectedAwayOrg.name} (e.g. head of sports, club secretary), add their email below so we can invite them to claim administrative access and manage their own teams, rosters, and schedules.
                    </Text>
                    <TextInput
                      placeholder="contact@school.edu"
                      placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                      value={pendingReferrals[selectedAwayOrgId] || ''}
                      onChangeText={(email) => setPendingReferrals(prev => ({ ...prev, [selectedAwayOrgId]: email }))}
                      className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2 font-inter text-sm text-slate-850 dark:text-white"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                );
              }
              return null;
            })()}
          </View>

          {/* Away Team Selection */}
          {!!selectedAwayOrgId && (
            <View className="space-y-1.5">
              <View className="flex-row justify-between items-center">
                <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Away Team
                </Text>
                <TouchableOpacity onPress={() => handleCreateTeamTrigger(selectedAwayOrgId)}>
                  <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                    + Add Team
                  </Text>
                </TouchableOpacity>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {awayTeamsList.map(team => {
                  const isSelected = selectedAwayTeamId === team.id;
                  return (
                    <TouchableOpacity
                      key={team.id}
                      onPress={() => setSelectedAwayTeamId(team.id)}
                      className={`px-3 py-2 rounded-lg border ${
                        isSelected 
                          ? 'bg-brand-orange/10 border-brand-orange' 
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/5'
                      }`}
                    >
                      <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                        {team.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {awayTeamsList.length === 0 && (
                  <Text className="font-inter text-xs text-slate-400 italic">No opponent teams matching selected sport.</Text>
                )}
              </View>
            </View>
          )}

          {/* Site selection */}
          <View className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-white/5">
            <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Site Field/Court
            </Text>
            <CustomSelect
              value={selectedSiteId}
              onChange={(val: string) => setSelectedSiteId(val)}
              options={sites.map(s => ({ label: s.name, value: s.id }))}
              placeholder="Select site..."
              clearable={true}
            />
          </View>

          {/* Match Date & Time */}
          <View className="space-y-3 pt-2 border-t border-slate-100 dark:border-white/5">
            <View className="space-y-1.5">
              <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Match Date
              </Text>
              <DatePicker
                value={gameDate}
                onChange={setGameDate}
                placeholder="Select Date"
              />
            </View>

            <View className="space-y-3 pt-2">
              <View className="flex-row justify-between items-center">
                <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Start Time
                </Text>
                <View className="flex-row items-center gap-2">
                  <Text className="font-inter text-xs text-slate-500">TBD</Text>
                  <Switch
                    value={isTbd}
                    onValueChange={setIsTbd}
                    trackColor={{ false: '#CBD5E1', true: COLORS.brand.orange }}
                  />
                </View>
              </View>

              {!isTbd && (
                <TextInput
                  placeholder="e.g. 09:00"
                  placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                  value={startTime}
                  onChangeText={setStartTime}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
                />
              )}
            </View>
          </View>
        </GlassCard>
      </ScrollView>

      {/* CONFLICT ALERT MODAL */}
      <ConfirmationModal
        isOpen={conflictWarning !== null}
        title="Schedule Conflict!"
        description={conflictWarning || ''}
        confirmText="Schedule Anyway"
        cancelText="Cancel"
        onConfirm={() => handleSubmit(true)}
        onClose={() => setConflictWarning(null)}
        isProcessing={isProcessing}
      />

      {/* QUICK CREATE ORGANIZATION MODAL */}
      <Modal
        visible={isCreatingOrg}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsCreatingOrg(false)}
      >
        <View className="flex-1 bg-black/60 justify-center px-6">
          <View className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-white/5 shadow-xl space-y-4">
            <Text className="font-orbitron-bold text-base text-slate-850 dark:text-white uppercase tracking-wider">
              Register Organization
            </Text>
            <View className="space-y-1.5">
              <Text className="font-orbitron text-[9px] text-slate-500 uppercase tracking-wider">Full Name</Text>
              <TextInput
                placeholder="e.g. St John's College"
                placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                value={newOrgName}
                onChangeText={setNewOrgName}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
              />
            </View>
            <View className="space-y-1.5">
              <Text className="font-orbitron text-[9px] text-slate-500 uppercase tracking-wider">Short Code / Initials</Text>
              <TextInput
                placeholder="e.g. SJC"
                placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                value={newOrgShortName}
                onChangeText={setNewOrgShortName}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
              />
            </View>
            <View className="space-y-1.5">
              <Text className="font-orbitron text-[9px] text-slate-500 uppercase tracking-wider">Contact Person Email (Optional)</Text>
              <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 mb-1 leading-4">
                Help us get this organization claimed! If you know who manages this school or club (e.g. head of sports or club secretary), add their email below so we can invite them to take control of their teams and schedules.
              </Text>
              <TextInput
                placeholder="contact@school.edu"
                placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                value={newOrgContactEmail}
                onChangeText={setNewOrgContactEmail}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            <View className="flex-row gap-3 pt-4">
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setIsCreatingOrg(false)}
                className="flex-1 py-2.5 rounded-lg"
              />
              <Button
                title="Register"
                onPress={handleQuickCreateOrg}
                disabled={!newOrgName.trim()}
                className="flex-1 py-2.5 rounded-lg"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* QUICK CREATE TEAM MODAL */}
      <Modal
        visible={isCreatingTeam}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsCreatingTeam(false)}
      >
        <View className="flex-1 bg-black/60 justify-center px-6">
          <View className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-white/5 shadow-xl space-y-4">
            <Text className="font-orbitron-bold text-base text-slate-850 dark:text-white uppercase tracking-wider">
              Register Team
            </Text>
            <View className="space-y-1.5">
              <Text className="font-orbitron text-[9px] text-slate-500 uppercase tracking-wider">Team Name</Text>
              <TextInput
                placeholder="e.g. 1st Team"
                placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                value={newTeamName}
                onChangeText={setNewTeamName}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
              />
            </View>
            <View className="space-y-1.5">
              <Text className="font-orbitron text-[9px] text-slate-500 uppercase tracking-wider">Short Code / Abbreviation</Text>
              <TextInput
                placeholder="e.g. 1ST"
                placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                value={newTeamShortName}
                onChangeText={setNewTeamShortName}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
              />
            </View>
            <View className="space-y-1.5">
              <Text className="font-orbitron text-[9px] text-slate-500 uppercase tracking-wider">Age Group</Text>
              <TextInput
                placeholder="e.g. Open"
                placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                value={newTeamAgeGroup}
                onChangeText={setNewTeamAgeGroup}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
              />
            </View>
            <View className="flex-row gap-3 pt-4">
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setIsCreatingTeam(false)}
                className="flex-1 py-2.5 rounded-lg"
              />
              <Button
                title="Register"
                onPress={handleQuickCreateTeam}
                disabled={!newTeamName.trim() || !newTeamShortName.trim()}
                className="flex-1 py-2.5 rounded-lg"
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
