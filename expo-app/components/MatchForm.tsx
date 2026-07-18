import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Modal, Switch, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CustomSelect from './CustomSelect';
import { Button } from './Button';
import DatePicker from './DatePicker';
import { COLORS, getThemeColor } from '../constants/Colors';
import { useActiveTheme } from '../store/settingsStore';
import { wsService } from '../services/websocket';
import { useWsStore } from '../store/wsStore';
import { SocketAction, Sport, Site, Team, Organization } from '@sk/types';
import { useAuthStore } from '../store/authStore';
import { NominationModal } from './NominationModal';
import { GlassCard } from './GlassCard';

export interface MatchFormData {
  sportId: string;
  homeOrgId: string;
  homeTeamId: string;
  awayOrgId: string;
  awayTeamId: string;
  siteId: string;
  gameDate: string;
  startTime: string;
  isTbd: boolean;
  status: 'Scheduled' | 'Live' | 'Finished' | 'Cancelled';
  referrals?: Record<string, string[]>;
}

interface MatchFormProps {
  orgId: string;
  isEdit?: boolean;
  initialData?: Partial<MatchFormData>;
  onChange: (data: MatchFormData) => void;
}

export default function MatchForm({
  orgId,
  isEdit = false,
  initialData,
  onChange,
}: MatchFormProps) {
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  // Metadata Lists
  const [sports, setSports] = useState<Sport[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [orgsList, setOrgsList] = useState<Organization[]>([]);
  const [homeTeams, setHomeTeams] = useState<Team[]>([]);
  const [awayTeams, setAwayTeams] = useState<Team[]>([]);

  // Selection states
  const [selectedSportId, setSelectedSportId] = useState(initialData?.sportId || '');
  const [selectedHomeOrg, setSelectedHomeOrg] = useState<Organization | null>(null);
  const [selectedHomeTeamId, setSelectedHomeTeamId] = useState(initialData?.homeTeamId || '');
  const [selectedAwayOrg, setSelectedAwayOrg] = useState<Organization | null>(null);
  const [selectedAwayTeamId, setSelectedAwayTeamId] = useState(initialData?.awayTeamId || '');
  const [selectedSiteId, setSelectedSiteId] = useState(initialData?.siteId || '');
  const [gameDate, setGameDate] = useState(initialData?.gameDate || '');
  const [startTime, setStartTime] = useState(initialData?.startTime || '09:00');
  const [isTbd, setIsTbd] = useState(initialData?.isTbd ?? false);
  const [gameStatus, setGameStatus] = useState<'Scheduled' | 'Live' | 'Finished' | 'Cancelled'>(initialData?.status || 'Scheduled');

  // Search states
  const [homeOrgSearchText, setHomeOrgSearchText] = useState('');
  const [awayOrgSearchText, setAwayOrgSearchText] = useState('');
  const [searchedOrgs, setSearchedOrgs] = useState<Organization[]>([]);
  const [isSearchingOrgs, setIsSearchingOrgs] = useState(false);

  // Quick Create Modals
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [isCreatingHomeOrg, setIsCreatingHomeOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgShortName, setNewOrgShortName] = useState('');
  const [newOrgContactEmail, setNewOrgContactEmail] = useState('');

  const [isCreatingSite, setIsCreatingSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');

  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [targetOrgIdForTeam, setTargetOrgIdForTeam] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamShortName, setNewTeamShortName] = useState('');
  const [newTeamAgeGroup, setNewTeamAgeGroup] = useState('Open');

  const [isNominationModalVisible, setIsNominationModalVisible] = useState(false);
  const [pendingReferrals, setPendingReferrals] = useState<Record<string, string[]>>({});

  // Loading indicator for edit mode initialization
  const [isInitializing, setIsInitializing] = useState(isEdit);

  // Fetch static lookups
  useEffect(() => {
    if (!isConnected) return;

    wsService.emit('get_data', { type: 'sports' }, (res: any) => {
      if (Array.isArray(res)) setSports(res);
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
  }, [isConnected, orgId]);

  // Load home organization teams when selectedHomeOrg?.id changes
  useEffect(() => {
    if (!isConnected || !selectedHomeOrg?.id) {
      setHomeTeams([]);
      return;
    }
    wsService.emit('get_data', { type: 'teams', orgId: selectedHomeOrg.id }, (res: any) => {
      if (Array.isArray(res)) setHomeTeams(res);
    });
  }, [isConnected, selectedHomeOrg?.id]);

  // Load away organization teams when awayOrgId changes
  useEffect(() => {
    if (!isConnected || !selectedAwayOrg?.id) {
      setAwayTeams([]);
      return;
    }
    wsService.emit('get_data', { type: 'teams', orgId: selectedAwayOrg.id }, (res: any) => {
      if (Array.isArray(res)) setAwayTeams(res);
    });
  }, [isConnected, selectedAwayOrg?.id]);

  // Autocomplete organization search
  useEffect(() => {
    if (!isConnected) return;

    const query = isCreatingHomeOrg ? homeOrgSearchText : awayOrgSearchText;
    if (query.trim().length < 3) {
      setSearchedOrgs([]);
      return;
    }

    setIsSearchingOrgs(true);
    const delayDebounce = setTimeout(() => {
      wsService.emit('get_data', { type: 'organizations', search: query }, (res: any) => {
        setIsSearchingOrgs(false);
        if (res && Array.isArray(res.items)) {
          setSearchedOrgs(res.items);
        } else if (Array.isArray(res)) {
          setSearchedOrgs(res);
        }
      });
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [isConnected, homeOrgSearchText, awayOrgSearchText, isCreatingHomeOrg]);

  // Resolve Organization details for edit mode or initialData on load
  useEffect(() => {
    if (orgsList.length === 0) return;

    if (isEdit) {
      if (initialData?.homeOrgId) {
        const homeOrg = orgsList.find(o => o.id === initialData.homeOrgId);
        if (homeOrg) setSelectedHomeOrg(homeOrg);
      }
      if (initialData?.awayOrgId) {
        const awayOrg = orgsList.find(o => o.id === initialData.awayOrgId);
        if (awayOrg) setSelectedAwayOrg(awayOrg);
      }
      setIsInitializing(false);
    } else if (!isEdit && !selectedHomeOrg) {
      // Default Team 1 to host org
      const hostOrg = orgsList.find(o => o.id === orgId);
      if (hostOrg) setSelectedHomeOrg(hostOrg);
    }
  }, [orgsList, isEdit, initialData?.homeOrgId, initialData?.awayOrgId, orgId]);

  // Synchronize dynamic initialData fields when they load
  useEffect(() => {
    if (initialData?.homeTeamId) {
      setSelectedHomeTeamId(initialData.homeTeamId);
    }
  }, [initialData?.homeTeamId]);

  useEffect(() => {
    if (initialData?.awayTeamId) {
      setSelectedAwayTeamId(initialData.awayTeamId);
    }
  }, [initialData?.awayTeamId]);

  useEffect(() => {
    if (initialData?.sportId) {
      setSelectedSportId(initialData.sportId);
    }
  }, [initialData?.sportId]);

  useEffect(() => {
    if (initialData?.siteId) {
      setSelectedSiteId(initialData.siteId);
    }
  }, [initialData?.siteId]);

  useEffect(() => {
    if (initialData?.gameDate) {
      setGameDate(initialData.gameDate);
    }
  }, [initialData?.gameDate]);

  useEffect(() => {
    if (initialData?.startTime) {
      setStartTime(initialData.startTime);
    }
  }, [initialData?.startTime]);

  useEffect(() => {
    if (initialData?.isTbd !== undefined) {
      setIsTbd(initialData.isTbd);
    }
  }, [initialData?.isTbd]);

  useEffect(() => {
    if (initialData?.status) {
      setGameStatus(initialData.status);
    }
  }, [initialData?.status]);

  // Notify parent on change
  useEffect(() => {
    onChange({
      sportId: selectedSportId,
      homeOrgId: selectedHomeOrg?.id || '',
      homeTeamId: selectedHomeTeamId,
      awayOrgId: selectedAwayOrg?.id || '',
      awayTeamId: selectedAwayTeamId,
      siteId: selectedSiteId,
      gameDate,
      startTime,
      isTbd,
      status: gameStatus,
      referrals: pendingReferrals,
    });
  }, [
    selectedSportId,
    selectedHomeOrg,
    selectedHomeTeamId,
    selectedAwayOrg,
    selectedAwayTeamId,
    selectedSiteId,
    gameDate,
    startTime,
    isTbd,
    gameStatus,
    pendingReferrals,
  ]);

  // Filter home teams by sport
  const filteredHomeTeams = useMemo(() => {
    return homeTeams.filter(t => !selectedSportId || t.sportId === selectedSportId);
  }, [homeTeams, selectedSportId]);

  // Filter away teams by sport
  const filteredAwayTeams = useMemo(() => {
    return awayTeams.filter(t => !selectedSportId || t.sportId === selectedSportId);
  }, [awayTeams, selectedSportId]);

  // Quick Create Org Handler
  const handleQuickCreateOrg = () => {
    if (!newOrgName.trim()) return;

    const payload = {
      name: newOrgName.trim(),
      shortName: newOrgShortName.trim() || undefined,
      joinPolicy: 'request',
      supportedSportIds: selectedSportId ? [selectedSportId] : [],
      isClaimed: false,
    };

    wsService.emit('action', { type: SocketAction.ADD_ORG, payload }, (res: any) => {
      const org = res?.data || res;
      if (org && org.id) {
        const email = newOrgContactEmail.trim();
        const currentUserId = useAuthStore.getState().user?.id;
        if (email && currentUserId) {
          setPendingReferrals(prev => ({
            ...prev,
            [org.id]: [email],
          }));
        }

        if (isCreatingHomeOrg) {
          setSelectedHomeOrg(org);
          setHomeOrgSearchText('');
        } else {
          setSelectedAwayOrg(org);
          setAwayOrgSearchText('');
        }

        setIsCreatingOrg(false);
        setNewOrgName('');
        setNewOrgShortName('');
        setNewOrgContactEmail('');
      }
    });
  };

  // Quick Create Site Handler
  const handleQuickCreateSite = () => {
    if (!newSiteName.trim()) return;

    const payload = {
      site: {
        name: newSiteName.trim(),
        orgId: orgId,
        address: { fullAddress: 'TBD' },
      },
    };

    wsService.emit('action', { type: SocketAction.ADD_SITE, payload }, (res: any) => {
      const site = res?.data || res;
      if (site && site.id) {
        setSites(prev => [...prev, site]);
        setSelectedSiteId(site.id);
        setIsCreatingSite(false);
        setNewSiteName('');
      }
    });
  };

  // Team Quick-Create Trigger
  const handleCreateTeamTrigger = (targetOrgId: string) => {
    setTargetOrgIdForTeam(targetOrgId);
    let defaultedAgeGroup = 'Open';
    if (targetOrgId === selectedHomeOrg?.id) {
      if (selectedAwayTeamId) {
        const otherTeam = awayTeams.find(t => t.id === selectedAwayTeamId);
        if (otherTeam?.ageGroup) defaultedAgeGroup = otherTeam.ageGroup;
      }
    } else {
      if (selectedHomeTeamId) {
        const otherTeam = homeTeams.find(t => t.id === selectedHomeTeamId);
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

    const payload = {
      name: newTeamName.trim(),
      shortName: newTeamShortName.trim(),
      orgId: targetOrgIdForTeam,
      sportId: selectedSportId,
      ageGroup: newTeamAgeGroup.trim() || 'Open',
      isActive: true,
    };

    wsService.emit('action', { type: SocketAction.ADD_TEAM, payload }, (res: any) => {
      const team = res?.data || res;
      if (team && team.id) {
        if (targetOrgIdForTeam === selectedHomeOrg?.id) {
          setHomeTeams(prev => [...prev, team]);
          setSelectedHomeTeamId(team.id);
        } else {
          setAwayTeams(prev => [...prev, team]);
          setSelectedAwayTeamId(team.id);
        }
        setIsCreatingTeam(false);
        setNewTeamName('');
        setNewTeamShortName('');
        setNewTeamAgeGroup('Open');
      }
    });
  };

  if (isInitializing) {
    return (
      <View className="py-8 justify-center items-center">
        <ActivityIndicator size="small" color={COLORS.brand.orange} />
      </View>
    );
  }

  return (
    <View className="space-y-6">
      {/* CARD 1: SPORT SELECTION */}
      <GlassCard className="border border-slate-200 dark:border-white/5 p-5 space-y-4">
        <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Sport
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {sports.map(sport => {
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
      </GlassCard>

      {!selectedSportId ? (
        <GlassCard className="border border-slate-200 dark:border-white/5 p-8 items-center justify-center">
          <Ionicons name="football-outline" size={32} color={COLORS.brand.orange} className="opacity-60 mb-2" />
          <Text className="font-orbitron-bold text-xs text-slate-500 uppercase tracking-wider text-center">
            Please Select a Sport First
          </Text>
          <Text className="font-inter text-xs text-slate-400 text-center mt-1">
            Choosing a sport allows us to load the correct teams and compatible playing fields/courts.
          </Text>
        </GlassCard>
      ) : (
        <View className="flex-col lg:flex-row gap-6">
          {/* CARD 2: THE MATCHUP */}
          <View className="flex-1">
            <GlassCard className="border border-slate-200 dark:border-white/5 p-5 space-y-5 h-full">
              <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white uppercase tracking-wider">
                The Matchup
              </Text>

              {/* Team 1 Section */}
              <View className="space-y-4">
                <View className="pt-2 border-t border-slate-100 dark:border-white/5">
                  <Text className="font-orbitron-bold text-[11px] text-slate-800 dark:text-slate-200 uppercase tracking-widest font-bold">
                    Team 1
                  </Text>
                </View>

                {/* Home Org Selection */}
                <View className="space-y-1.5" style={{ zIndex: 30 }}>
                  <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Organization
                  </Text>

                  {selectedHomeOrg ? (
                    <View className="space-y-2">
                      <View className="flex-row items-center justify-between bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3">
                        <Text className="font-inter text-sm text-slate-800 dark:text-white">
                          {selectedHomeOrg.name} ({selectedHomeOrg.shortName || 'N/A'})
                        </Text>
                        <TouchableOpacity onPress={() => {
                          setSelectedHomeOrg(null);
                          setSelectedHomeTeamId('');
                        }}>
                          <Ionicons name="close-circle" size={20} color={COLORS.brand.red} />
                        </TouchableOpacity>
                      </View>

                      {!selectedHomeOrg.isClaimed && (
                        <View className="bg-brand-orange/10 dark:bg-brand-orange/5 border border-brand-orange/20 p-4 rounded-xl flex-row items-center justify-between">
                          <View className="flex-1 mr-4">
                            <Text className="font-orbitron-bold text-[10px] text-brand-orange mb-1 uppercase tracking-wider">
                              Invite Administrator
                            </Text>
                            <Text className="font-inter text-xs text-slate-600 dark:text-slate-400 leading-4">
                              {selectedHomeOrg.name} doesn't have an administrator on Scorekeeper yet. Help bring this organization to life by nominating a contact email—we'll invite them to claim it, manage their teams, and keep schedules up to date.
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => {
                              setTargetOrgIdForTeam(selectedHomeOrg.id);
                              setIsNominationModalVisible(true);
                            }}
                            className="bg-brand-orange px-3 py-1.5 rounded-lg active:opacity-80 align-self-center"
                          >
                            <Text className="font-inter-bold text-xs text-white">Nominate</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View className="relative z-35">
                      <TextInput
                        placeholder="Search For Team 1 Organisation"
                        placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                        value={homeOrgSearchText}
                        onChangeText={(text) => {
                          setIsCreatingHomeOrg(true);
                          setHomeOrgSearchText(text);
                        }}
                        className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
                      />
                      {isSearchingOrgs && isCreatingHomeOrg && (
                        <ActivityIndicator size="small" color={COLORS.brand.orange} className="absolute right-4 top-3.5" />
                      )}

                      {(searchedOrgs.length > 0 || (isCreatingHomeOrg && homeOrgSearchText.trim().length >= 3)) && (
                        <View 
                          className="absolute left-0 right-0 border border-slate-200 dark:border-white/5 rounded-xl shadow-lg"
                          style={{
                            top: 50,
                            maxHeight: 220,
                            zIndex: 50,
                            backgroundColor: getThemeColor(isDark, 'background'),
                          }}
                        >
                          {searchedOrgs.length > 0 ? (
                            <ScrollView 
                              style={{ flex: 1, maxHeight: 150 }}
                              nestedScrollEnabled={true}
                              keyboardShouldPersistTaps="handled"
                            >
                              <View className="bg-slate-50 dark:bg-slate-900/50 px-3 py-1 border-b border-slate-100 dark:border-white/5">
                                <Text className="font-orbitron-bold text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                  Existing Organizations
                                </Text>
                              </View>
                              {searchedOrgs.map(orgItem => (
                                <TouchableOpacity
                                  key={orgItem.id}
                                  onPress={() => {
                                    setSelectedHomeOrg(orgItem);
                                    setHomeOrgSearchText('');
                                    setSearchedOrgs([]);
                                  }}
                                  className="p-3 border-b border-slate-100 dark:border-white/5 hover:bg-slate-50"
                                >
                                  <Text className="font-inter text-xs text-slate-800 dark:text-white">
                                    {orgItem.name}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          ) : null}

                          {homeOrgSearchText.trim().length >= 3 && (
                            <View className="border-t border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900" style={{ backgroundColor: getThemeColor(isDark, 'background') }}>
                              <View className="bg-slate-50 dark:bg-slate-900/50 px-3 py-1 border-b border-slate-100 dark:border-white/5">
                                <Text className="font-orbitron-bold text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                  Register New Organization
                                </Text>
                              </View>
                              <TouchableOpacity
                                onPress={() => {
                                  setNewOrgName(homeOrgSearchText);
                                  setIsCreatingHomeOrg(true);
                                  setIsCreatingOrg(true);
                                  setHomeOrgSearchText('');
                                  setSearchedOrgs([]);
                                }}
                                className="flex-row items-center px-4 py-2.5 active:bg-slate-100 dark:active:bg-slate-800"
                              >
                                <Ionicons name="add-circle" size={16} color={COLORS.brand.orange} className="mr-2" />
                                <Text className="font-inter text-xs text-brand-orange font-bold">
                                  Register "{homeOrgSearchText}"
                                </Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {/* Home Team Selection */}
                {selectedHomeOrg && (
                  <View className="space-y-1.5">
                    <View className="flex-row justify-between items-center mb-1">
                      <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Team
                      </Text>
                      <TouchableOpacity onPress={() => handleCreateTeamTrigger(selectedHomeOrg.id)}>
                        <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                          + Add Team
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <CustomSelect
                      value={selectedHomeTeamId}
                      onChange={setSelectedHomeTeamId}
                      options={filteredHomeTeams.map(team => ({ value: team.id, label: `${team.name} (${team.ageGroup})` }))}
                      placeholder="Select Team"
                      showSearch={true}
                      searchPlaceholder="Search Team..."
                    />
                  </View>
                )}
              </View>

              <View className="flex-row items-center justify-center py-2">
                <View className="h-[1px] flex-1 bg-slate-100 dark:bg-white/5" />
                <Text className="font-orbitron-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest px-4">
                  VS
                </Text>
                <View className="h-[1px] flex-1 bg-slate-100 dark:bg-white/5" />
              </View>

              {/* Team 2 Section */}
              <View className="space-y-4">
                <View className="pt-2 border-t border-slate-100 dark:border-white/5">
                  <Text className="font-orbitron-bold text-[11px] text-slate-800 dark:text-slate-200 uppercase tracking-widest font-bold">
                    Team 2
                  </Text>
                </View>

                {/* Away Org Selection */}
                <View className="space-y-1.5" style={{ zIndex: 20 }}>
                  <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Organization
                  </Text>

                  {selectedAwayOrg ? (
                    <View className="space-y-2">
                      <View className="flex-row items-center justify-between bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3">
                        <Text className="font-inter text-sm text-slate-800 dark:text-white">
                          {selectedAwayOrg.name} ({selectedAwayOrg.shortName || 'N/A'})
                        </Text>
                        <TouchableOpacity onPress={() => {
                          setSelectedAwayOrg(null);
                          setSelectedAwayTeamId('');
                        }}>
                          <Ionicons name="close-circle" size={20} color={COLORS.brand.red} />
                        </TouchableOpacity>
                      </View>

                      {!selectedAwayOrg.isClaimed && (
                        <View className="bg-brand-orange/10 dark:bg-brand-orange/5 border border-brand-orange/20 p-4 rounded-xl flex-row items-center justify-between">
                          <View className="flex-1 mr-4">
                            <Text className="font-orbitron-bold text-[10px] text-brand-orange mb-1 uppercase tracking-wider">
                              Invite Administrator
                            </Text>
                            <Text className="font-inter text-xs text-slate-600 dark:text-slate-400 leading-4">
                              {selectedAwayOrg.name} doesn't have an administrator on Scorekeeper yet. Help bring this organization to life by nominating a contact email—we'll invite them to claim it, manage their teams, and keep schedules up to date.
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => {
                              setTargetOrgIdForTeam(selectedAwayOrg.id);
                              setIsNominationModalVisible(true);
                            }}
                            className="bg-brand-orange px-3 py-1.5 rounded-lg active:opacity-80 align-self-center"
                          >
                            <Text className="font-inter-bold text-xs text-white">Nominate</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View className="relative z-25">
                      <TextInput
                        placeholder="Search For Team 2 Organisation"
                        placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                        value={awayOrgSearchText}
                        onChangeText={(text) => {
                          setIsCreatingHomeOrg(false);
                          setAwayOrgSearchText(text);
                        }}
                        className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
                      />
                      {isSearchingOrgs && !isCreatingHomeOrg && (
                        <ActivityIndicator size="small" color={COLORS.brand.orange} className="absolute right-4 top-3.5" />
                      )}

                      {(searchedOrgs.length > 0 || (!isCreatingHomeOrg && awayOrgSearchText.trim().length >= 3)) && (
                        <View 
                          className="absolute left-0 right-0 border border-slate-200 dark:border-white/5 rounded-xl shadow-lg"
                          style={{
                            top: 50,
                            maxHeight: 220,
                            zIndex: 40,
                            backgroundColor: getThemeColor(isDark, 'background'),
                          }}
                        >
                          {searchedOrgs.length > 0 ? (
                            <ScrollView 
                              style={{ flex: 1, maxHeight: 150 }}
                              nestedScrollEnabled={true}
                              keyboardShouldPersistTaps="handled"
                            >
                              <View className="bg-slate-50 dark:bg-slate-900/50 px-3 py-1 border-b border-slate-100 dark:border-white/5">
                                <Text className="font-orbitron-bold text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                  Existing Organizations
                                </Text>
                              </View>
                              {searchedOrgs.map(orgItem => (
                                <TouchableOpacity
                                  key={orgItem.id}
                                  onPress={() => {
                                    setSelectedAwayOrg(orgItem);
                                    setAwayOrgSearchText('');
                                    setSearchedOrgs([]);
                                  }}
                                  className="p-3 border-b border-slate-100 dark:border-white/5 hover:bg-slate-50"
                                >
                                  <Text className="font-inter text-xs text-slate-800 dark:text-white">
                                    {orgItem.name}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          ) : null}

                          {awayOrgSearchText.trim().length >= 3 && (
                            <View className="border-t border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900" style={{ backgroundColor: getThemeColor(isDark, 'background') }}>
                              <View className="bg-slate-50 dark:bg-slate-900/50 px-3 py-1 border-b border-slate-100 dark:border-white/5">
                                <Text className="font-orbitron-bold text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                  Register New Organization
                                </Text>
                              </View>
                              <TouchableOpacity
                                onPress={() => {
                                  setNewOrgName(awayOrgSearchText);
                                  setIsCreatingHomeOrg(false);
                                  setIsCreatingOrg(true);
                                  setAwayOrgSearchText('');
                                  setSearchedOrgs([]);
                                }}
                                className="flex-row items-center px-4 py-2.5 active:bg-slate-100 dark:active:bg-slate-800"
                              >
                                <Ionicons name="add-circle" size={16} color={COLORS.brand.orange} className="mr-2" />
                                <Text className="font-inter text-xs text-brand-orange font-bold">
                                  Register "{awayOrgSearchText}"
                                </Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {/* Away Team Selection */}
                {selectedAwayOrg && (
                  <View className="space-y-1.5">
                    <View className="flex-row justify-between items-center mb-1">
                      <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Team
                      </Text>
                      <TouchableOpacity onPress={() => handleCreateTeamTrigger(selectedAwayOrg.id)}>
                        <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                          + Add Team
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <CustomSelect
                      value={selectedAwayTeamId}
                      onChange={setSelectedAwayTeamId}
                      options={filteredAwayTeams.map(team => ({ value: team.id, label: `${team.name} (${team.ageGroup})` }))}
                      placeholder="Select Team"
                      showSearch={true}
                      searchPlaceholder="Search Team..."
                    />
                  </View>
                )}
              </View>
            </GlassCard>
          </View>

          {/* CARD 3: LOGISTICS */}
          <View className="flex-1">
            <GlassCard className="border border-slate-200 dark:border-white/5 p-5 space-y-5 h-full">
              <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white uppercase tracking-wider">
                Logistics & Details
              </Text>

              {/* Select Status (Edit Mode only) */}
              {isEdit && (
                <View className="space-y-1.5 pt-2">
                  <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Match Status
                  </Text>
                  <View className="flex-row items-center justify-between bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3">
                    <Text className="font-inter text-sm text-slate-800 dark:text-white">
                      {gameStatus === 'Cancelled' ? 'Cancelled' : 'Scheduled'}
                    </Text>
                    <Switch
                      value={gameStatus === 'Cancelled'}
                      onValueChange={(val) => setGameStatus(val ? 'Cancelled' : 'Scheduled')}
                      trackColor={{ false: '#CBD5E1', true: COLORS.brand.red }}
                    />
                  </View>
                </View>
              )}

              {/* Site selection */}
              <View className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-white/5">
                <View className="flex-row justify-between items-center mb-1">
                  <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Site Field/Court
                  </Text>
                  <TouchableOpacity onPress={() => setIsCreatingSite(true)}>
                    <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                      + Create Site
                    </Text>
                  </TouchableOpacity>
                </View>
                <CustomSelect
                  value={selectedSiteId}
                  onChange={setSelectedSiteId}
                  options={sites.map(s => ({ value: s.id, label: s.name }))}
                  placeholder="Select Site"
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
                  />
                </View>

                <View className="space-y-3 pt-2">
                  <View className="flex-row justify-between items-center">
                    <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Match Start Time
                    </Text>
                    <View className="flex-row items-center gap-2">
                      <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">TBD</Text>
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
          </View>
        </View>
      )}

      {/* QUICK CREATE SITE MODAL */}
      <Modal
        visible={isCreatingSite}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsCreatingSite(false)}
      >
        <View className="flex-1 bg-black/60 justify-center px-6">
          <View className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-white/5 shadow-xl">
            <Text className="font-orbitron-bold text-base text-slate-850 dark:text-white mb-4 uppercase tracking-wider">
              Create Site Venue
            </Text>
            <TextInput
              placeholder="e.g. West Fields"
              placeholderTextColor={getThemeColor(isDark, 'placeholder')}
              value={newSiteName}
              onChangeText={setNewSiteName}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white mb-6"
            />
            <View className="flex-row gap-3">
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setIsCreatingSite(false)}
                className="flex-1 py-2.5 rounded-lg"
              />
              <Button
                title="Save Site"
                onPress={handleQuickCreateSite}
                disabled={!newSiteName.trim()}
                className="flex-1 py-2.5 rounded-lg"
              />
            </View>
          </View>
        </View>
      </Modal>

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
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-855 dark:text-white"
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

      <NominationModal
        visible={isNominationModalVisible}
        onClose={() => setIsNominationModalVisible(false)}
        orgId={targetOrgIdForTeam}
        orgName={targetOrgIdForTeam === selectedHomeOrg?.id ? (selectedHomeOrg?.name || '') : (selectedAwayOrg?.name || '')}
      />
    </View>
  );
}
