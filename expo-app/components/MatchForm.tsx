import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Modal, Switch, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CustomSelect from './CustomSelect';
import { Button } from './Button';
import DatePicker from './DatePicker';
import { useActiveTheme } from '../store/settingsStore';
import { wsService } from '../services/websocket';
import { sendAction } from '../services/actions';
import { useWsStore } from '../store/wsStore';
import { SocketAction, Sport, Site, Team, Organization, Facility } from '@sk/shared';
import { RegisterOrgModal } from './RegisterOrgModal';
import { UnclaimedOrgBadge } from './UnclaimedOrgBadge';
import { nominateOrgContact } from '../services/nominations';
import { GlassCard } from './GlassCard';
import { AgeGroupPicker } from './AgeGroupPicker';
import { pickableTeams } from './teams/TeamBits';
import { pickableFacilities, pickableSites } from './sites/SiteBits';
import { venueTimeHint, venueTimeZone, type TimeZone } from '../utils/dates';
import { themeColor } from '../constants/Colors';

export interface MatchFormData {
  sportId: string;
  homeOrgId: string;
  homeTeamId: string;
  awayOrgId: string;
  awayTeamId: string;
  siteId: string;
  facilityId: string;
  gameDate: string;
  startTime: string;
  isTbd: boolean;
  /**
   * The timezone `gameDate` and `startTime` are on: the chosen venue's, or the organisation's
   * (`DATE-2`). `null` until the organisation has loaded — the caller must not save until it is
   * set, or the kick-off would be read on the wrong clock.
   */
  timeZone: TimeZone | null;
  status: 'Scheduled' | 'Live' | 'Finished' | 'Cancelled';
}

interface MatchFormProps {
  orgId: string;
  isEdit?: boolean;
  initialData?: Partial<MatchFormData>;
  onChange: (data: MatchFormData) => void;
}

/** The match-status badge: a tint and its readable shade for each status (`UI-6`, `UI-24`). */
const STATUS_CHIP: Record<'Scheduled' | 'Live' | 'Finished' | 'Cancelled', { box: string; text: string }> = {
  Scheduled: { box: 'bg-success-soft border-success-line', text: 'text-success-ink' },
  Live: { box: 'bg-primary-soft border-primary-line', text: 'text-primary-ink' },
  Finished: { box: 'bg-sunken border-line', text: 'text-ink-muted' },
  Cancelled: { box: 'bg-danger-soft border-danger-line', text: 'text-danger-ink' },
};

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
  /** The organisation the match is being scheduled for: whose venues these are, and whose timezone a venue without one uses. */
  const [hostOrg, setHostOrg] = useState<Organization | null>(null);
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
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState(initialData?.facilityId || '');
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
  /** What was typed into the search that found nothing — the register dialog's starting name. */
  const [newOrgName, setNewOrgName] = useState('');

  const [isCreatingSite, setIsCreatingSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');

  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [targetOrgIdForTeam, setTargetOrgIdForTeam] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamShortName, setNewTeamShortName] = useState('');
  const [newTeamAgeGroupId, setNewTeamAgeGroupId] = useState<string | null>(null);


  // Loading indicator for edit mode initialization
  const [isInitializing, setIsInitializing] = useState(isEdit);

  // Fetch static lookups
  useEffect(() => {
    if (!isConnected) return;

    wsService.emit('get_data', { type: 'sports' }, (resSports: any) => {
      const allSports = Array.isArray(resSports) ? resSports : [];
      if (allSports.length > 0) {
        setSports(allSports);

        if (!selectedSportId && !initialData?.sportId) {
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

    wsService.emit('get_data', { type: 'organization', id: orgId }, (res: any) => {
      if (res) setHostOrg(res);
    });

    wsService.emit('get_data', { type: 'organizations' }, (res: any) => {
      if (res && Array.isArray(res.items)) {
        setOrgsList(res.items);
      } else if (Array.isArray(res)) {
        setOrgsList(res);
      }
    });
  }, [isConnected, orgId]);

  // Load facilities for the selected site
  useEffect(() => {
    if (!selectedSiteId) {
      setFacilities([]);
      setSelectedFacilityId('');
      return;
    }
    wsService.emit('get_data', { type: 'facilities', siteId: selectedSiteId }, (res: any) => {
      if (Array.isArray(res)) {
        setFacilities(res);
        if (initialData?.facilityId && selectedSiteId === initialData.siteId) {
          setSelectedFacilityId(initialData.facilityId);
        } else if (initialData?.facilityId && res.some((f: any) => f.id === initialData.facilityId)) {
          setSelectedFacilityId(initialData.facilityId);
        } else if (!res.some((f: any) => f.id === selectedFacilityId)) {
          setSelectedFacilityId('');
        }
      } else {
        setFacilities([]);
        if (initialData?.facilityId && selectedSiteId === initialData.siteId) {
          setSelectedFacilityId(initialData.facilityId);
        } else {
          setSelectedFacilityId('');
        }
      }
    });
  }, [selectedSiteId, initialData?.facilityId, initialData?.siteId]);

  // Reset selectedFacilityId immediately if the site changes from the initial site
  useEffect(() => {
    if (selectedSiteId !== initialData?.siteId) {
      setSelectedFacilityId('');
    }
  }, [selectedSiteId, initialData?.siteId]);

  // Filter facilities by the selected sport
  const filteredFacilities = useMemo(() => {
    return pickableFacilities(facilities, [initialData?.facilityId]).filter(f => {
      if (!selectedSportId) return true;
      if (!f.supportedSportIds || f.supportedSportIds.length === 0) return true;
      return f.supportedSportIds.includes(selectedSportId) || f.primarySportId === selectedSportId;
    });
  }, [facilities, selectedSportId, initialData?.facilityId]);

  // Resolve Sport-Specific Facility Term
  const getFacilityLabel = () => {
    if (selectedSportId) {
      const sport = sports.find(s => s.id === selectedSportId);
      return sport?.facilityTerm || 'Facility';
    }
    return 'Facility';
  };

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
    if (initialData?.facilityId) {
      setSelectedFacilityId(initialData.facilityId);
    }
  }, [initialData?.facilityId]);

  useEffect(() => {
    if (initialData?.status) {
      setGameStatus(initialData.status);
    }
  }, [initialData?.status]);

  // The clock the kick-off is typed on: the chosen venue's, else the organisation's (DATE-2).
  const timeZone = useMemo(
    () => (hostOrg ? venueTimeZone(sites.find(s => s.id === selectedSiteId), hostOrg) : null),
    [hostOrg, sites, selectedSiteId],
  );
  const timeHint = timeZone ? venueTimeHint(timeZone) : null;

  // Notify parent on change
  useEffect(() => {
    if (isInitializing) return;

    onChange({
      sportId: selectedSportId,
      homeOrgId: selectedHomeOrg?.id || '',
      homeTeamId: selectedHomeTeamId,
      awayOrgId: selectedAwayOrg?.id || '',
      awayTeamId: selectedAwayTeamId,
      siteId: selectedSiteId,
      facilityId: selectedFacilityId,
      gameDate,
      startTime,
      isTbd,
      timeZone,
      status: gameStatus,
    });
  }, [
    isInitializing,
    timeZone,
    selectedSportId,
    selectedHomeOrg,
    selectedHomeTeamId,
    selectedAwayOrg,
    selectedAwayTeamId,
    selectedSiteId,
    selectedFacilityId,
    gameDate,
    startTime,
    isTbd,
    gameStatus,
  ]);

  // Filter home teams by sport; an inactive team only if it is already the one chosen.
  const filteredHomeTeams = useMemo(() => {
    return pickableTeams(homeTeams, [selectedHomeTeamId]).filter(t => !selectedSportId || t.sportId === selectedSportId);
  }, [homeTeams, selectedSportId, selectedHomeTeamId]);

  // Filter away teams by sport; an inactive team only if it is already the one chosen.
  const filteredAwayTeams = useMemo(() => {
    return pickableTeams(awayTeams, [selectedAwayTeamId]).filter(t => !selectedSportId || t.sportId === selectedSportId);
  }, [awayTeams, selectedSportId, selectedAwayTeamId]);

  // Quick Create Site Handler
  const handleQuickCreateSite = () => {
    if (!newSiteName.trim()) return;

    // The site itself is the payload — the server reads `name` and `orgId` off it directly.
    const payload = {
      name: newSiteName.trim(),
      orgId: orgId,
      // The server creates the address and assigns its id.
      address: { fullAddress: 'TBD' },
    };

    sendAction(SocketAction.ADD_SITE, payload).then(result => {
      if (!result.ok) return;
      const site = result.data;
      setSites(prev => [...prev, site]);
      setSelectedSiteId(site.id);
      setIsCreatingSite(false);
      setNewSiteName('');
    });
  };

  // Team Quick-Create Trigger
  const handleCreateTeamTrigger = (targetOrgId: string) => {
    setTargetOrgIdForTeam(targetOrgId);
    // The opponent's age group when one is chosen, else the sport's "Open", else none yet.
    let defaultedAgeGroupId: string | null =
      sports.find(s => s.id === selectedSportId)?.ageGroups?.find(g => g.isOfficial && g.name === 'Open')?.id || null;
    if (targetOrgId === selectedHomeOrg?.id) {
      if (selectedAwayTeamId) {
        const otherTeam = awayTeams.find(t => t.id === selectedAwayTeamId);
        if (otherTeam?.ageGroupId) defaultedAgeGroupId = otherTeam.ageGroupId;
      }
    } else {
      if (selectedHomeTeamId) {
        const otherTeam = homeTeams.find(t => t.id === selectedHomeTeamId);
        if (otherTeam?.ageGroupId) defaultedAgeGroupId = otherTeam.ageGroupId;
      }
    }

    setNewTeamAgeGroupId(defaultedAgeGroupId);
    setNewTeamName('');
    setNewTeamShortName('');
    setIsCreatingTeam(true);
  };

  // Team Quick-Create Handler
  const handleQuickCreateTeam = () => {
    if (!newTeamName.trim() || !newTeamShortName.trim() || !selectedSportId || !newTeamAgeGroupId || !targetOrgIdForTeam) return;

    const payload = {
      name: newTeamName.trim(),
      shortName: newTeamShortName.trim(),
      orgId: targetOrgIdForTeam,
      sportId: selectedSportId,
      ageGroupId: newTeamAgeGroupId,
      isActive: true,
    };

    sendAction(SocketAction.ADD_TEAM, payload).then(result => {
      if (!result.ok) return;
      const team = result.data;
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
      setNewTeamAgeGroupId(null);
    });
  };

  if (isInitializing) {
    return (
      <View className="py-8 justify-center items-center">
        <ActivityIndicator size="small" color={themeColor(isDark, 'primary')} />
      </View>
    );
  }

  return (
    <View className="gap-6">
      {/* CARD 1: SPORT SELECTION */}
      <GlassCard className="border border-line p-5 gap-4">
        <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
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
                    ? 'bg-primary-soft border-primary' 
                    : 'bg-canvas border-line'
                }`}
              >
                <Text className={`font-inter text-xs ${isSelected ? 'text-primary-ink font-bold' : 'text-ink-soft'}`}>
                  {sport.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </GlassCard>

      {!selectedSportId ? (
        <GlassCard className="border border-line p-8 items-center justify-center">
          <Ionicons name="football-outline" size={32} color={themeColor(isDark, 'primary')} className="opacity-60 mb-2" />
          <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-wider text-center">
            Please Select a Sport First
          </Text>
          <Text className="font-inter text-xs text-ink-muted text-center mt-1">
            Choosing a sport allows us to load the correct teams and compatible playing fields/courts.
          </Text>
        </GlassCard>
      ) : (
        <View className="flex-col lg:flex-row gap-6">
          {/* CARD 2: THE MATCHUP */}
          <View className="flex-1">
            <GlassCard className="border border-line p-5 gap-5 h-full">
              <Text className="font-orbitron-bold text-xs text-ink uppercase tracking-wider">
                The Matchup
              </Text>

              {/* Team 1 Section */}
              <View className="gap-4">
                <View className="pt-2 border-t border-line-soft">
                  <Text className="font-orbitron-bold text-[11px] text-ink uppercase tracking-widest font-bold">
                    Team 1
                  </Text>
                </View>

                {/* Home Org Selection */}
                <View className="gap-1.5" style={{ zIndex: 30 }}>
                  <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
                    Organization
                  </Text>

                  {selectedHomeOrg ? (
                    <View className="gap-2">
                      <View className="flex-row items-center justify-between bg-canvas border border-line rounded-xl px-4 py-3">
                        <View className="flex-1 flex-row items-center mr-2">
                          <Text className="font-inter text-sm text-ink flex-shrink">
                            {selectedHomeOrg.name} ({selectedHomeOrg.shortName || 'N/A'})
                          </Text>
                          {/* An org with no administrator: the way to nominate one (docs/nomination-process.md §4).
                              It asks by itself for an org the user has just picked, not for the workspace's own. */}
                          <UnclaimedOrgBadge
                            org={selectedHomeOrg}
                            size={16}
                            className="ml-2"
                            autoPrompt={!isEdit && selectedHomeOrg.id !== orgId}
                          />
                        </View>
                        <TouchableOpacity onPress={() => {
                          setSelectedHomeOrg(null);
                          setSelectedHomeTeamId('');
                        }}>
                          <Ionicons name="close-circle" size={20} color={themeColor(isDark, 'danger')} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View className="relative z-35">
                      <TextInput
                        placeholder="Search For Team 1 Organisation"
                        placeholderTextColor={themeColor(isDark, 'ink-muted')}
                        value={homeOrgSearchText}
                        onChangeText={(text) => {
                          setIsCreatingHomeOrg(true);
                          setHomeOrgSearchText(text);
                        }}
                        className="bg-canvas border border-line rounded-xl px-4 py-3 font-inter text-sm text-ink"
                      />
                      {isSearchingOrgs && isCreatingHomeOrg && (
                        <ActivityIndicator size="small" color={themeColor(isDark, 'primary')} className="absolute right-4 top-3.5" />
                      )}

                      {(searchedOrgs.length > 0 || (isCreatingHomeOrg && homeOrgSearchText.trim().length >= 3)) && (
                        <View 
                          className="absolute left-0 right-0 border border-line rounded-xl shadow-lg"
                          style={{
                            top: 50,
                            maxHeight: 220,
                            zIndex: 50,
                            backgroundColor: themeColor(isDark, 'card'),
                          }}
                        >
                          {searchedOrgs.length > 0 ? (
                            <ScrollView 
                              style={{ flex: 1, maxHeight: 150 }}
                              nestedScrollEnabled={true}
                              keyboardShouldPersistTaps="handled"
                            >
                              <View className="bg-sunken px-3 py-1 border-b border-line-soft">
                                <Text className="font-orbitron-bold text-[8px] text-ink-muted uppercase tracking-wider">
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
                                  className="p-3 border-b border-line-soft hover:bg-sunken"
                                >
                                  <Text className="font-inter text-xs text-ink">
                                    {orgItem.name}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          ) : null}

                          {homeOrgSearchText.trim().length >= 3 && (
                            <View className="border-t border-line bg-card" style={{ backgroundColor: themeColor(isDark, 'card') }}>
                              <View className="bg-sunken px-3 py-1 border-b border-line-soft">
                                <Text className="font-orbitron-bold text-[8px] text-ink-muted uppercase tracking-wider">
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
                                className="flex-row items-center px-4 py-2.5 active:bg-sunken"
                              >
                                <Ionicons name="add-circle" size={16} color={themeColor(isDark, 'primary')} className="mr-2" />
                                <Text className="font-inter text-xs text-primary-ink font-bold">
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
                  <View className="gap-1.5">
                    <View className="flex-row justify-between items-center mb-1">
                      <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
                        Team
                      </Text>
                      <TouchableOpacity onPress={() => handleCreateTeamTrigger(selectedHomeOrg.id)}>
                        <Text className="font-inter-bold text-[10px] text-primary-ink uppercase tracking-wider">
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
                <View className="h-[1px] flex-1 bg-sunken" />
                <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-widest px-4">
                  VS
                </Text>
                <View className="h-[1px] flex-1 bg-sunken" />
              </View>

              {/* Team 2 Section */}
              <View className="gap-4">
                <View className="pt-2 border-t border-line-soft">
                  <Text className="font-orbitron-bold text-[11px] text-ink uppercase tracking-widest font-bold">
                    Team 2
                  </Text>
                </View>

                {/* Away Org Selection */}
                <View className="gap-1.5" style={{ zIndex: 20 }}>
                  <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
                    Organization
                  </Text>

                  {selectedAwayOrg ? (
                    <View className="gap-2">
                      <View className="flex-row items-center justify-between bg-canvas border border-line rounded-xl px-4 py-3">
                        <View className="flex-1 flex-row items-center mr-2">
                          <Text className="font-inter text-sm text-ink flex-shrink">
                            {selectedAwayOrg.name} ({selectedAwayOrg.shortName || 'N/A'})
                          </Text>
                          {/* An org with no administrator: the way to nominate one (docs/nomination-process.md §4).
                              It asks by itself for an org the user has just picked, not for the workspace's own. */}
                          <UnclaimedOrgBadge
                            org={selectedAwayOrg}
                            size={16}
                            className="ml-2"
                            autoPrompt={!isEdit && selectedAwayOrg.id !== orgId}
                          />
                        </View>
                        <TouchableOpacity onPress={() => {
                          setSelectedAwayOrg(null);
                          setSelectedAwayTeamId('');
                        }}>
                          <Ionicons name="close-circle" size={20} color={themeColor(isDark, 'danger')} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View className="relative z-25">
                      <TextInput
                        placeholder="Search For Team 2 Organisation"
                        placeholderTextColor={themeColor(isDark, 'ink-muted')}
                        value={awayOrgSearchText}
                        onChangeText={(text) => {
                          setIsCreatingHomeOrg(false);
                          setAwayOrgSearchText(text);
                        }}
                        className="bg-canvas border border-line rounded-xl px-4 py-3 font-inter text-sm text-ink"
                      />
                      {isSearchingOrgs && !isCreatingHomeOrg && (
                        <ActivityIndicator size="small" color={themeColor(isDark, 'primary')} className="absolute right-4 top-3.5" />
                      )}

                      {(searchedOrgs.length > 0 || (!isCreatingHomeOrg && awayOrgSearchText.trim().length >= 3)) && (
                        <View 
                          className="absolute left-0 right-0 border border-line rounded-xl shadow-lg"
                          style={{
                            top: 50,
                            maxHeight: 220,
                            zIndex: 40,
                            backgroundColor: themeColor(isDark, 'card'),
                          }}
                        >
                          {searchedOrgs.length > 0 ? (
                            <ScrollView 
                              style={{ flex: 1, maxHeight: 150 }}
                              nestedScrollEnabled={true}
                              keyboardShouldPersistTaps="handled"
                            >
                              <View className="bg-sunken px-3 py-1 border-b border-line-soft">
                                <Text className="font-orbitron-bold text-[8px] text-ink-muted uppercase tracking-wider">
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
                                  className="p-3 border-b border-line-soft hover:bg-sunken"
                                >
                                  <Text className="font-inter text-xs text-ink">
                                    {orgItem.name}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          ) : null}

                          {awayOrgSearchText.trim().length >= 3 && (
                            <View className="border-t border-line bg-card" style={{ backgroundColor: themeColor(isDark, 'card') }}>
                              <View className="bg-sunken px-3 py-1 border-b border-line-soft">
                                <Text className="font-orbitron-bold text-[8px] text-ink-muted uppercase tracking-wider">
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
                                className="flex-row items-center px-4 py-2.5 active:bg-sunken"
                              >
                                <Ionicons name="add-circle" size={16} color={themeColor(isDark, 'primary')} className="mr-2" />
                                <Text className="font-inter text-xs text-primary-ink font-bold">
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
                  <View className="gap-1.5">
                    <View className="flex-row justify-between items-center mb-1">
                      <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
                        Team
                      </Text>
                      <TouchableOpacity onPress={() => handleCreateTeamTrigger(selectedAwayOrg.id)}>
                        <Text className="font-inter-bold text-[10px] text-primary-ink uppercase tracking-wider">
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
            <GlassCard className="border border-line p-5 gap-5 h-full">
              <Text className="font-orbitron-bold text-xs text-ink uppercase tracking-wider">
                Logistics & Details
              </Text>

              {/* Select Status (Edit Mode only) */}
              {isEdit && (
                <View className="flex-row justify-between items-center pt-2">
                  <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
                    Match Status
                  </Text>
                  <View className={`px-3 py-1 rounded-full border ${STATUS_CHIP[gameStatus].box}`}>
                    <Text className={`font-inter-bold text-xs ${STATUS_CHIP[gameStatus].text}`}>
                      {gameStatus}
                    </Text>
                  </View>
                </View>
              )}

              {/* Site selection */}
              <View className="gap-1.5 pt-2 border-t border-line-soft">
                <View className="flex-row justify-between items-center mb-1">
                  <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
                    Site Field/Court
                  </Text>
                  <TouchableOpacity onPress={() => setIsCreatingSite(true)}>
                    <Text className="font-inter-bold text-[10px] text-primary-ink uppercase tracking-wider">
                      + Create Site
                    </Text>
                  </TouchableOpacity>
                </View>
                <CustomSelect
                  value={selectedSiteId}
                  onChange={setSelectedSiteId}
                  options={pickableSites(sites, [initialData?.siteId]).map(s => ({ value: s.id, label: s.name }))}
                  placeholder="Select Site"
                  clearable={true}
                />
              </View>

              {/* Facility Selection */}
              {selectedSiteId ? (
                <View className="gap-2 pt-2 border-t border-line-soft">
                  <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
                    Select {getFacilityLabel()}
                  </Text>
                  <CustomSelect
                    value={selectedFacilityId}
                    onChange={(val: string) => setSelectedFacilityId(val)}
                    options={filteredFacilities.map(f => ({ label: f.name, value: f.id }))}
                    placeholder={`Select ${getFacilityLabel().toLowerCase()}...`}
                    clearable={true}
                  />
                </View>
              ) : null}

              {/* Match Date & Time */}
              <View className="gap-3 pt-2 border-t border-line-soft">
                <View className="gap-1.5">
                  <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
                    Match Date
                  </Text>
                  <DatePicker
                    value={gameDate}
                    onChange={setGameDate}
                  />
                </View>

                <View className="gap-3 pt-2">
                  <View className="flex-row justify-between items-center">
                    <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
                      Match Start Time
                    </Text>
                    <View className="flex-row items-center gap-2">
                      <Text className="font-inter text-xs text-ink-muted">TBD</Text>
                      <Switch
                        value={isTbd}
                        onValueChange={setIsTbd}
                        trackColor={{ false: themeColor(isDark, 'line-strong'), true: themeColor(isDark, 'primary') }}
                      />
                    </View>
                  </View>
                  {!isTbd && (
                    <TextInput
                      placeholder="e.g. 09:00"
                      placeholderTextColor={themeColor(isDark, 'ink-muted')}
                      value={startTime}
                      onChangeText={setStartTime}
                      className="bg-canvas border border-line rounded-xl px-4 py-3 font-inter text-sm text-ink"
                    />
                  )}
                  {!isTbd && timeHint && (
                    <Text className="font-inter text-xs text-ink-muted">{timeHint}</Text>
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
        <View className="flex-1 bg-overlay/60 justify-center px-6">
          <View className="bg-card rounded-2xl p-6 border border-line shadow-xl">
            <Text className="font-orbitron-bold text-base text-ink mb-4 uppercase tracking-wider">
              Create Site
            </Text>
            <TextInput
              placeholder="e.g. West Fields"
              placeholderTextColor={themeColor(isDark, 'ink-muted')}
              value={newSiteName}
              onChangeText={setNewSiteName}
              className="bg-canvas border border-line rounded-xl px-4 py-3 font-inter text-sm text-ink mb-6"
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

      {/* Registering a school that is not on the system — the shared dialog (2026-09-21). The
          invitation to its contact goes at once, like every nomination (docs/nomination-process.md §4):
          it is not part of this match, so cancelling the form must not lose it. */}
      <RegisterOrgModal
        isOpen={isCreatingOrg}
        onClose={() => setIsCreatingOrg(false)}
        initialName={newOrgName}
        sportId={selectedSportId || undefined}
        onRegistered={(org, contactEmail) => {
          // A failed invitation is announced on its own and does not undo the organisation.
          if (contactEmail) void nominateOrgContact(org.id, contactEmail);
          if (isCreatingHomeOrg) {
            setSelectedHomeOrg(org);
            setHomeOrgSearchText('');
          } else {
            setSelectedAwayOrg(org);
            setAwayOrgSearchText('');
          }
        }}
      />

      {/* QUICK CREATE TEAM MODAL */}
      <Modal
        visible={isCreatingTeam}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsCreatingTeam(false)}
      >
        <View className="flex-1 bg-overlay/60 justify-center px-6">
          <View className="bg-card rounded-2xl p-6 border border-line shadow-xl gap-4">
            <Text className="font-orbitron-bold text-base text-ink uppercase tracking-wider">
              Register Team
            </Text>
            <View className="gap-1.5">
              <Text className="font-orbitron text-[9px] text-ink-muted uppercase tracking-wider">Team Name</Text>
              <TextInput
                placeholder="e.g. 1st Team"
                placeholderTextColor={themeColor(isDark, 'ink-muted')}
                value={newTeamName}
                onChangeText={setNewTeamName}
                className="bg-canvas border border-line rounded-xl px-4 py-3 font-inter text-sm text-ink"
              />
            </View>
            <View className="gap-1.5">
              <Text className="font-orbitron text-[9px] text-ink-muted uppercase tracking-wider">Short Code / Abbreviation</Text>
              <TextInput
                placeholder="e.g. 1ST"
                placeholderTextColor={themeColor(isDark, 'ink-muted')}
                value={newTeamShortName}
                onChangeText={setNewTeamShortName}
                className="bg-canvas border border-line rounded-xl px-4 py-3 font-inter text-sm text-ink"
              />
            </View>
            <View className="gap-1.5">
              <Text className="font-orbitron text-[9px] text-ink-muted uppercase tracking-wider">Age Group</Text>
              <AgeGroupPicker
                sportId={selectedSportId}
                ageGroups={sports.find(s => s.id === selectedSportId)?.ageGroups}
                value={newTeamAgeGroupId}
                onChange={setNewTeamAgeGroupId}
                orgId={targetOrgIdForTeam || undefined}
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
                disabled={!newTeamName.trim() || !newTeamShortName.trim() || !newTeamAgeGroupId}
                className="flex-1 py-2.5 rounded-lg"
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
