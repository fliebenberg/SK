import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Modal, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import DatePicker from '../../../../components/DatePicker';
import { useActiveTheme } from '../../../../store/settingsStore';
import { wsService } from '../../../../services/websocket';
import { useWsStore } from '../../../../store/wsStore';
import { SocketAction, Event, Sport, Site, Team, Organization, Facility } from '@sk/types';
import { useAuthStore } from '../../../../store/authStore';
import { COLORS, getThemeColor } from '../../../../constants/Colors';

export default function CreateEvent() {
  const router = useRouter();
  const { orgId, type } = useLocalSearchParams<{ orgId: string, type: 'game' | 'sportsday' | 'tournament' }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  // Form Loading States
  const [isProcessing, setIsProcessing] = useState(false);
  const [org, setOrg] = useState<Organization | null>(null);
  const [sports, setSports] = useState<Sport[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [homeTeams, setHomeTeams] = useState<Team[]>([]);

  // Base Form Fields
  const [eventName, setEventName] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState('');
  const [newOrgContactEmail, setNewOrgContactEmail] = useState('');

  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamShortName, setNewTeamShortName] = useState('');
  const [newTeamAgeGroup, setNewTeamAgeGroup] = useState('Open');
  const [targetOrgIdForTeam, setTargetOrgIdForTeam] = useState('');

  const [pendingReferrals, setPendingReferrals] = useState<Record<string, string>>({});

  // Sports Day / Tournament Fields
  const [selectedSportIds, setSelectedSportIds] = useState<string[]>([]);
  const [participatingOrgs, setParticipatingOrgs] = useState<Organization[]>([]);
  const [orgSearchText, setOrgSearchText] = useState('');
  const [searchedOrgs, setSearchedOrgs] = useState<Organization[]>([]);
  const [isSearchingOrgs, setIsSearchingOrgs] = useState(false);

  // Single Game Fields
  const [selectedSportId, setSelectedSportId] = useState('');
  const [selectedHomeTeamId, setSelectedHomeTeamId] = useState('');
  const [awayOrgSearchText, setAwayOrgSearchText] = useState('');
  const [selectedAwayOrg, setSelectedAwayOrg] = useState<Organization | null>(null);
  const [awayTeams, setAwayTeams] = useState<Team[]>([]);
  const [selectedAwayTeamId, setSelectedAwayTeamId] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [isTbd, setIsTbd] = useState(false);

  // Quick Create Modals
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgShortName, setNewOrgShortName] = useState('');

  const [isCreatingSite, setIsCreatingSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');

  // Load Initial Metadata
  useEffect(() => {
    if (!isConnected || !orgId) return;

    wsService.emit('get_data', { type: 'organization', id: orgId }, (res: any) => {
      if (res) setOrg(res);
    });

    wsService.emit('get_data', { type: 'sports' }, (res: any) => {
      if (Array.isArray(res)) {
        setSports(res);
      }
    });

    wsService.emit('get_data', { type: 'sites', orgId }, (res: any) => {
      if (Array.isArray(res)) {
        setSites(res);
        if (res.length > 0) setSelectedSiteId(res[0].id);
      }
    });

    wsService.emit('get_data', { type: 'teams', orgId }, (res: any) => {
      if (Array.isArray(res)) setHomeTeams(res);
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
      } else {
        setFacilities([]);
      }
    });
  }, [selectedSiteId]);

  // Filter sports showing only sports available to the org of the user setting up the event
  const filteredSports = sports.filter(sport => !org?.supportedSportIds || org.supportedSportIds.length === 0 || org.supportedSportIds.includes(sport.id));

  // Automatically select first sport once filtered list is populated
  useEffect(() => {
    if (filteredSports.length > 0 && !selectedSportId) {
      setSelectedSportId(filteredSports[0].id);
    }
  }, [filteredSports, selectedSportId]);

  // Filter facilities by the selected sport
  const filteredFacilities = facilities.filter(f => {
    const activeSportId = type === 'game' ? selectedSportId : (selectedSportIds[0] || '');
    if (!activeSportId) return true;
    if (!f.supportedSportIds || f.supportedSportIds.length === 0) return true;
    return f.supportedSportIds.includes(activeSportId) || f.primarySportId === activeSportId;
  });

  // Automatically select first compatible facility
  useEffect(() => {
    if (filteredFacilities.length > 0) {
      if (!filteredFacilities.some(f => f.id === selectedFacilityId)) {
        setSelectedFacilityId(filteredFacilities[0].id);
      }
    } else {
      setSelectedFacilityId('');
    }
  }, [filteredFacilities, selectedFacilityId]);

  // Resolve Sport-Specific Facility Term (like Court, Pitch, Field, Venue)
  const getFacilityLabel = () => {
    const activeSportIds = type === 'game'
      ? (selectedSportId ? [selectedSportId] : [])
      : selectedSportIds;
    if (activeSportIds.length === 1) {
      const sport = sports.find(s => s.id === activeSportIds[0]);
      return sport?.facilityTerm || 'Venue';
    }
    return 'Venue';
  };

  // Debounced search for organizations (Sports Day / Tournament / Away Org)
  useEffect(() => {
    const query = type === 'game' ? awayOrgSearchText.trim() : orgSearchText.trim();
    if (!query) {
      setSearchedOrgs([]);
      setIsSearchingOrgs(false);
      return;
    }

    setIsSearchingOrgs(true);
    const timer = setTimeout(() => {
      wsService.emit('get_data', { type: 'search_similar_orgs', name: query }, (res: any) => {
        setIsSearchingOrgs(false);
        if (Array.isArray(res)) {
          // Filter out the host organization
          setSearchedOrgs(res.filter(o => o.id !== orgId));
        }
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [orgSearchText, awayOrgSearchText, type, orgId]);

  // Fetch Away Org Teams once selected
  useEffect(() => {
    if (!selectedAwayOrg) {
      setAwayTeams([]);
      setSelectedAwayTeamId('');
      return;
    }

    wsService.emit('get_data', { type: 'teams', orgId: selectedAwayOrg.id }, (res: any) => {
      if (Array.isArray(res)) {
        // Filter by currently selected sport if any
        setAwayTeams(res.filter(t => !selectedSportId || t.sportId === selectedSportId));
      }
    });
  }, [selectedAwayOrg, selectedSportId]);

  // Filter home teams by sport
  const filteredHomeTeams = homeTeams.filter(t => !selectedSportId || t.sportId === selectedSportId);

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
      if (res && res.id) {
        // If a contact email was specified, also refer the org contact
        const email = newOrgContactEmail.trim();
        const currentUserId = useAuthStore.getState().user?.id;
        if (email && currentUserId) {
          wsService.emit('action', {
            type: SocketAction.REFER_ORG_CONTACT,
            payload: {
              orgId: res.id,
              contactEmails: [email],
              referredByUserId: currentUserId
            }
          });
        }

        if (type === 'game') {
          setSelectedAwayOrg(res);
          setAwayOrgSearchText('');
        } else {
          setParticipatingOrgs(prev => [...prev, res]);
          setOrgSearchText('');
        }
        setIsCreatingOrg(false);
        setNewOrgName('');
        setNewOrgShortName('');
        setNewOrgContactEmail('');
      }
      setIsProcessing(false);
    });
  };

  // Quick Create Site Handler
  const handleQuickCreateSite = () => {
    if (!newSiteName.trim()) return;
    setIsProcessing(true);

    const payload = {
      site: {
        name: newSiteName.trim(),
        orgId: orgId,
        address: { fullAddress: 'TBD' }
      }
    };

    wsService.emit('action', { type: SocketAction.ADD_SITE, payload }, (res: any) => {
      setIsProcessing(false);
      if (res && res.id) {
        setSites(prev => [...prev, res]);
        setSelectedSiteId(res.id);
        setIsCreatingSite(false);
        setNewSiteName('');
      }
    });
  };

  // Team Quick-Create Trigger
  const handleCreateTeamTrigger = (targetOrgId: string) => {
    setTargetOrgIdForTeam(targetOrgId);
    
    // Default the age group to the other team's age group (if available)
    let defaultedAgeGroup = 'Open';
    if (targetOrgId === orgId) {
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
      if (res && res.id) {
        if (targetOrgIdForTeam === orgId) {
          setHomeTeams(prev => [...prev, res]);
          setSelectedHomeTeamId(res.id);
        } else {
          setAwayTeams(prev => [...prev, res]);
          setSelectedAwayTeamId(res.id);
        }
        setIsCreatingTeam(false);
        setNewTeamName('');
        setNewTeamShortName('');
        setNewTeamAgeGroup('Open');
      }
    });
  };

  // Form Submit Handler
  const handleSubmit = () => {
    if (type !== 'game' && !eventName.trim()) return;
    if (type === 'game' && (!selectedHomeTeamId || !selectedAwayTeamId)) return;

    setIsProcessing(true);

    // Emit pending referrals if any exist and the user is authenticated
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

    // Anchor date at midday UTC
    const formattedStartDate = `${startDate}T12:00:00.000Z`;
    const formattedEndDate = isMultiDay && endDate ? `${endDate}T12:00:00.000Z` : undefined;

    // Get sport IDs and participating org IDs
    const sportIds = type === 'game' 
      ? (selectedSportId ? [selectedSportId] : []) 
      : selectedSportIds;

    const participatingOrgIds = type === 'game'
      ? (selectedAwayOrg ? [selectedAwayOrg.id] : [])
      : participatingOrgs.map(o => o.id);

    // Default Name for Single Match if empty
    let eventTitle = eventName;
    if (type === 'game' && !eventTitle.trim()) {
      const homeTeamName = homeTeams.find(t => t.id === selectedHomeTeamId)?.name || 'Home';
      const awayTeamName = awayTeams.find(t => t.id === selectedAwayTeamId)?.name || 'Away';
      eventTitle = `${org?.shortName || org?.name || 'Home'} ${homeTeamName} vs ${selectedAwayOrg?.shortName || selectedAwayOrg?.name || 'Away'} ${awayTeamName}`;
    }

    const eventPayload = {
      name: eventTitle.trim(),
      type: type === 'game' ? 'SingleMatch' : type === 'sportsday' ? 'SportsDay' : 'Tournament',
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      siteId: selectedSiteId || undefined,
      facilityId: selectedFacilityId || undefined,
      orgId,
      sportIds,
      participatingOrgIds,
      status: 'Scheduled'
    };

    wsService.emit('action', { type: SocketAction.ADD_EVENT, payload: eventPayload }, (newEvent: any) => {
      if (newEvent && newEvent.id) {
        if (type === 'game') {
          // Now create the game record associated with the SingleMatch event
          const dateObj = new Date(`${startDate}T${startTime}:00`);
          const gamePayload = {
            eventId: newEvent.id,
            sportId: selectedSportId || 'rugby',
            participants: [{ teamId: selectedHomeTeamId }, { teamId: selectedAwayTeamId }],
            scheduledStartTime: isTbd ? undefined : (!isNaN(dateObj.getTime()) ? dateObj.toISOString() : `${startDate}T${startTime}:00`),
            startTime: isTbd ? undefined : (!isNaN(dateObj.getTime()) ? dateObj.toISOString() : `${startDate}T${startTime}:00`),
            siteId: selectedSiteId || undefined,
            facilityId: selectedFacilityId || undefined,
            status: 'Scheduled'
          };

          wsService.emit('action', { type: SocketAction.ADD_GAME, payload: gamePayload }, (newGame: any) => {
            setIsProcessing(false);
            router.back();
          });
        } else {
          setIsProcessing(false);
          router.back();
        }
      } else {
        setIsProcessing(false);
      }
    });
  };

  const isFormValid = () => {
    const siteHasFacilities = filteredFacilities.length > 0;
    const facilityValid = !siteHasFacilities || !!selectedFacilityId;
    if (type === 'game') {
      return !!selectedHomeTeamId && !!selectedAwayTeamId && !!selectedSiteId && facilityValid;
    } else {
      return !!eventName.trim() && !!selectedSiteId && facilityValid && selectedSportIds.length > 0;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.brand.orange} />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Cancel
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase">
          {type === 'game' ? 'Schedule Match' : type === 'sportsday' ? 'New Sports Day' : 'New Tournament'}
        </Text>
        <TouchableOpacity 
          className={`active:opacity-85 ${!isFormValid() ? 'opacity-40' : ''}`}
          disabled={!isFormValid() || isProcessing}
          onPress={handleSubmit}
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
          {/* SPORT SELECTOR (FIRST FIELD) */}
          {type === 'game' ? (
            <View className="space-y-1.5">
              <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Select Sport
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {filteredSports.map(sport => {
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
          ) : (
            <View className="space-y-1.5">
              <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Featured Sports
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {filteredSports.map(sport => {
                  const isSelected = selectedSportIds.includes(sport.id);
                  return (
                    <TouchableOpacity
                      key={sport.id}
                      onPress={() => {
                        if (isSelected) {
                          setSelectedSportIds(prev => prev.filter(id => id !== sport.id));
                        } else {
                          setSelectedSportIds(prev => [...prev, sport.id]);
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
          )}

          {/* EVENT NAME (Not strictly required for Single Match, will autogenerate if empty) */}
          <View className="space-y-1.5">
            <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {type === 'game' ? 'Event Name (Optional)' : 'Event Name'}
            </Text>
            <TextInput
              placeholder={type === 'game' ? 'e.g. Friendly Derby' : 'e.g. Winter Squash Tournament 2026'}
              placeholderTextColor={getThemeColor(isDark, 'placeholder')}
              value={eventName}
              onChangeText={setEventName}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
            />
          </View>

          {/* DATE SELECTORS */}
          <View className="space-y-3">
            <View className="flex-row justify-between items-center">
              <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {isMultiDay ? 'Start Date' : 'Date'}
              </Text>
              {type !== 'game' && (
                <View className="flex-row items-center gap-2">
                  <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">Multi-day</Text>
                  <Switch
                    value={isMultiDay}
                    onValueChange={setIsMultiDay}
                    trackColor={{ false: '#CBD5E1', true: COLORS.brand.orange }}
                  />
                </View>
              )}
            </View>
            <DatePicker value={startDate} onChange={setStartDate} placeholder="Select Date" />

            {isMultiDay && type !== 'game' && (
              <View className="space-y-1.5">
                <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  End Date
                </Text>
                <DatePicker value={endDate} onChange={setEndDate} placeholder="Select End Date" />
              </View>
            )}
          </View>

          {/* SITE VENUE SELECTOR */}
          <View className="space-y-1.5">
            <View className="flex-row justify-between items-center">
              <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Site
              </Text>
              <TouchableOpacity onPress={() => setIsCreatingSite(true)}>
                <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                  + Create Site
                </Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {sites.map(site => {
                const isSelected = selectedSiteId === site.id;
                return (
                  <TouchableOpacity
                    key={site.id}
                    onPress={() => setSelectedSiteId(site.id)}
                    className={`px-3 py-2 rounded-lg border ${
                      isSelected 
                        ? 'bg-brand-orange/10 border-brand-orange' 
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/5'
                    }`}
                  >
                    <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                      {site.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {sites.length === 0 && (
                <Text className="font-inter text-xs text-slate-400 italic">No sites registered. Click Create Site.</Text>
              )}
            </View>
          </View>

          {/* FACILITY/VENUE SELECTOR */}
          {!!selectedSiteId && (
            <View className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-white/5">
              <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Select {getFacilityLabel()}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {filteredFacilities.map(fac => {
                  const isSelected = selectedFacilityId === fac.id;
                  return (
                    <TouchableOpacity
                      key={fac.id}
                      onPress={() => setSelectedFacilityId(fac.id)}
                      className={`px-3 py-2 rounded-lg border ${
                        isSelected 
                          ? 'bg-brand-orange/10 border-brand-orange' 
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/5'
                      }`}
                    >
                      <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                        {fac.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {filteredFacilities.length === 0 && (
                  <Text className="font-inter text-xs text-slate-400 italic">
                    No {getFacilityLabel().toLowerCase()}s available for this sport at the selected site.
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* SINGLE GAME SPECIFIC FIELDS */}
          {type === 'game' && (
            <View className="space-y-5 pt-4 border-t border-slate-100 dark:border-white/5">
              {/* Home Team Selection */}
              <View className="space-y-1.5">
                <View className="flex-row justify-between items-center">
                  <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Home Team
                  </Text>
                  <TouchableOpacity onPress={() => handleCreateTeamTrigger(orgId)}>
                    <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                      + Add Team
                    </Text>
                  </TouchableOpacity>
                </View>
                <View className="flex-row flex-wrap gap-2">
                  {filteredHomeTeams.map(team => {
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
                  {filteredHomeTeams.length === 0 && (
                    <Text className="font-inter text-xs text-slate-400 italic">No teams matching selected sport.</Text>
                  )}
                </View>
              </View>

              {/* Away Organization Selection */}
              <View className="space-y-1.5" style={{ zIndex: 20 }}>
                <View className="flex-row justify-between items-center">
                  <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Opponent Organization
                  </Text>
                </View>

                {selectedAwayOrg ? (
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
                ) : (
                  <View className="relative z-20">
                    <TextInput
                      placeholder="Search opponent school or club..."
                      placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                      value={awayOrgSearchText}
                      onChangeText={setAwayOrgSearchText}
                      className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
                    />
                    {isSearchingOrgs && (
                      <ActivityIndicator size="small" color={COLORS.brand.orange} className="absolute right-4 top-3.5" />
                    )}

                    {(searchedOrgs.length > 0 || awayOrgSearchText.trim().length >= 3) && (
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

                {/* Unclaimed Org Contact Referral section */}
                {selectedAwayOrg && selectedAwayOrg.isClaimed === false && (
                  <View className="bg-brand-orange/5 border border-brand-orange/20 rounded-xl p-4 mt-2 space-y-2">
                    <Text className="font-orbitron-bold text-[9px] text-brand-orange uppercase tracking-wider">
                      Invite Administrator
                    </Text>
                    <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
                      {selectedAwayOrg.name} doesn't have an administrator on Scorekeeper yet. Help bring this organization to life by nominating a contact email—we'll invite them to claim it, manage their teams, and keep schedules up to date.
                    </Text>
                    <TextInput
                      placeholder="contact@school.edu"
                      placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                      value={pendingReferrals[selectedAwayOrg.id] || ''}
                      onChangeText={(email) => setPendingReferrals(prev => ({ ...prev, [selectedAwayOrg.id]: email }))}
                      className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2 font-inter text-sm text-slate-850 dark:text-white"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                )}
              </View>

              {/* Away Team Selection */}
              {selectedAwayOrg && (
                <View className="space-y-1.5">
                  <View className="flex-row justify-between items-center">
                    <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Opponent Team
                    </Text>
                    <TouchableOpacity onPress={() => handleCreateTeamTrigger(selectedAwayOrg.id)}>
                      <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                        + Add Team
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    {awayTeams.map(team => {
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
                    {awayTeams.length === 0 && (
                      <Text className="font-inter text-xs text-slate-400 italic">No opponent teams registered for this sport.</Text>
                    )}
                  </View>
                </View>
              )}

              {/* Match Time Selectors */}
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
          )}

          {/* SPORTS DAY / TOURNAMENT MULTI-SELECT SPORT FIELDS */}
          {type !== 'game' && (
            <View className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/5">
              {/* Render Selected Orgs Claim Prompts */}
              {participatingOrgs.filter(o => o.isClaimed === false).map(orgItem => (
                <View key={`claim-${orgItem.id}`} className="bg-brand-orange/5 border border-brand-orange/20 rounded-xl p-4 mt-2 space-y-2">
                  <Text className="font-orbitron-bold text-[9px] text-brand-orange uppercase tracking-wider">
                    Invite Administrator for {orgItem.name}
                  </Text>
                  <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
                    {orgItem.name} doesn't have an administrator on Scorekeeper yet. Help bring this organization to life by nominating a contact email—we'll invite them to claim it, manage their teams, and keep schedules up to date.
                  </Text>
                  <TextInput
                    placeholder="contact@school.edu"
                    placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                    value={pendingReferrals[orgItem.id] || ''}
                    onChangeText={(email) => setPendingReferrals(prev => ({ ...prev, [orgItem.id]: email }))}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2 font-inter text-sm text-slate-850 dark:text-white"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              ))}

              {/* Participating Organizations (Multi-select) */}
              <View className="space-y-1.5" style={{ zIndex: 20 }}>
                <View className="flex-row justify-between items-center">
                  <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Participating Organizations
                  </Text>
                </View>

                {/* Render Selected Orgs */}
                {participatingOrgs.length > 0 && (
                  <View className="flex-row flex-wrap gap-2 mb-2">
                    {participatingOrgs.map(orgItem => (
                      <View key={orgItem.id} className="flex-row items-center bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200/50 dark:border-white/5">
                        <Text className="font-inter text-xs text-slate-700 dark:text-slate-300 mr-1.5">
                          {orgItem.name}
                        </Text>
                        <TouchableOpacity onPress={() => setParticipatingOrgs(prev => prev.filter(o => o.id !== orgItem.id))}>
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

                  {(searchedOrgs.filter(o => !participatingOrgs.some(po => po.id === o.id)).length > 0 || orgSearchText.trim().length >= 3) && (
                    <View 
                      className="absolute left-0 right-0 border border-slate-200 dark:border-white/5 rounded-xl shadow-lg"
                      style={{
                        top: 50,
                        maxHeight: 220,
                        zIndex: 50,
                        backgroundColor: getThemeColor(isDark, 'background'),
                      }}
                    >
                      {searchedOrgs.filter(o => !participatingOrgs.some(po => po.id === o.id)).length > 0 ? (
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
                          {searchedOrgs
                            .filter(o => !participatingOrgs.some(po => po.id === o.id))
                            .map(orgItem => (
                              <TouchableOpacity
                                key={orgItem.id}
                                onPress={() => {
                                  setParticipatingOrgs(prev => [...prev, orgItem]);
                                  setOrgSearchText('');
                                  setSearchedOrgs([]);
                                }}
                                className="p-3 border-b border-slate-100 dark:border-white/5 hover:bg-slate-50"
                              >
                                <Text className="font-inter text-xs text-slate-850 dark:text-white">
                                  {orgItem.name}
                                </Text>
                              </TouchableOpacity>
                            ))}
                        </ScrollView>
                      ) : null}

                      {orgSearchText.trim().length >= 3 && (
                        <View className="border-t border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900" style={{ backgroundColor: getThemeColor(isDark, 'background') }}>
                          <View className="bg-slate-50 dark:bg-slate-900/50 px-3 py-1 border-b border-slate-100 dark:border-white/5">
                            <Text className="font-orbitron-bold text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                              Register New Organization
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => {
                              setNewOrgName(orgSearchText);
                              setIsCreatingOrg(true);
                              setOrgSearchText('');
                              setSearchedOrgs([]);
                            }}
                            className="flex-row items-center px-4 py-2.5 active:bg-slate-100 dark:active:bg-slate-800"
                          >
                            <Ionicons name="add-circle" size={16} color={COLORS.brand.orange} className="mr-2" />
                            <Text className="font-inter text-xs text-brand-orange font-bold">
                              Register "{orgSearchText}"
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}
        </GlassCard>
      </ScrollView>

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
