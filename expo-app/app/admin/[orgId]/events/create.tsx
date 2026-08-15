import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Modal, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import DatePicker from '../../../../components/DatePicker';
import { useActiveTheme } from '../../../../store/settingsStore';
import { wsService } from '../../../../services/websocket';
import { useWsStore } from '../../../../store/wsStore';
import { SocketAction, Event, Sport, Site, Team, Organization, Facility } from '@sk/shared';
import { useAuthStore } from '../../../../store/authStore';
import { COLORS, getThemeColor } from '../../../../constants/Colors';
import { NominationModal } from '@/components/NominationModal';
import CustomSelect from '../../../../components/CustomSelect';
import MatchForm from '../../../../components/MatchForm';

export default function CreateEvent() {
  const router = useRouter();
  const safeBack = useSafeBack();
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

  const [pendingReferrals, setPendingReferrals] = useState<Record<string, string | string[]>>({});

  // Sports Day / Tournament Fields
  const [selectedSportIds, setSelectedSportIds] = useState<string[]>([]);
  const [participatingOrgs, setParticipatingOrgs] = useState<Organization[]>([]);
  const [orgSearchText, setOrgSearchText] = useState('');
  const [searchedOrgs, setSearchedOrgs] = useState<Organization[]>([]);
  const [isSearchingOrgs, setIsSearchingOrgs] = useState(false);

  // Single Game Fields
  const [selectedSportId, setSelectedSportId] = useState('');
  const [selectedHomeOrg, setSelectedHomeOrg] = useState<Organization | null>(null);
  const [homeOrgSearchText, setHomeOrgSearchText] = useState('');
  const [selectedHomeTeamId, setSelectedHomeTeamId] = useState('');
  const [awayOrgSearchText, setAwayOrgSearchText] = useState('');
  const [selectedAwayOrg, setSelectedAwayOrg] = useState<Organization | null>(null);
  const [awayTeams, setAwayTeams] = useState<Team[]>([]);
  const [selectedAwayTeamId, setSelectedAwayTeamId] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [isTbd, setIsTbd] = useState(false);
  const [isCreatingHomeOrg, setIsCreatingHomeOrg] = useState(false);

  // Quick Create Modals
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgShortName, setNewOrgShortName] = useState('');
  const [isNominationModalVisible, setIsNominationModalVisible] = useState(false);

  const [isCreatingSite, setIsCreatingSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');

  // Load Initial Metadata
  useEffect(() => {
    if (!isConnected || !orgId) return;

    wsService.emit('get_data', { type: 'organization', id: orgId }, (res: any) => {
      if (res) {
        setOrg(res);
        setSelectedHomeOrg(res);
      }
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

  // Debounced search for organizations (Sports Day / Tournament / Away Org / Home Org)
  useEffect(() => {
    const query = type === 'game' 
      ? (homeOrgSearchText.trim() || awayOrgSearchText.trim()) 
      : orgSearchText.trim();
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
          setSearchedOrgs(res);
        }
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [orgSearchText, awayOrgSearchText, homeOrgSearchText, type, orgId]);

  // Fetch Home Org Teams once selected
  useEffect(() => {
    if (!selectedHomeOrg) {
      setHomeTeams([]);
      setSelectedHomeTeamId('');
      return;
    }

    wsService.emit('get_data', { type: 'teams', orgId: selectedHomeOrg.id }, (res: any) => {
      if (Array.isArray(res)) {
        setHomeTeams(res.filter(t => !selectedSportId || t.sportId === selectedSportId));
      }
    });
  }, [selectedHomeOrg, selectedSportId]);

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
      const org = res?.data || res;
      if (org && org.id) {
        // If a contact email was specified, also refer the org contact
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

        if (type === 'game') {
          if (isCreatingHomeOrg) {
            setSelectedHomeOrg(org);
            setHomeOrgSearchText('');
            setIsCreatingHomeOrg(false);
          } else {
            setSelectedAwayOrg(org);
            setAwayOrgSearchText('');
          }
        } else {
          setParticipatingOrgs(prev => [...prev, org]);
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
      const team = res?.data || res;
      if (team && team.id) {
        if (targetOrgIdForTeam === orgId) {
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

  // Form Submit Handler
  const handleSubmit = () => {
    if (type !== 'game' && !eventName.trim()) return;
    if (type === 'game' && (!selectedHomeTeamId || !selectedAwayTeamId || !selectedSportId)) return;

    setIsProcessing(true);

    // Emit pending referrals if any exist and the user is authenticated
    const currentUserId = useAuthStore.getState().user?.id;
    if (currentUserId) {
      Object.entries(pendingReferrals).forEach(([rOrgId, val]) => {
        const emails = Array.isArray(val) ? val : [val];
        emails.forEach(email => {
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
      });
    }

    // Anchor date at midday UTC
    const formattedStartDate = `${startDate}T12:00:00.000Z`;
    const formattedEndDate = isMultiDay && endDate ? `${endDate}T12:00:00.000Z` : undefined;

    // Get sport IDs and participating org IDs
    const sportIds = type === 'game' 
      ? (selectedSportId ? [selectedSportId] : []) 
      : selectedSportIds;

    const rawParticipatingOrgIds: string[] = [];
    if (type === 'game') {
      if (selectedHomeOrg && selectedHomeOrg.id !== orgId) {
        rawParticipatingOrgIds.push(selectedHomeOrg.id);
      }
      if (selectedAwayOrg && selectedAwayOrg.id !== orgId) {
        rawParticipatingOrgIds.push(selectedAwayOrg.id);
      }
    } else {
      participatingOrgs.forEach(o => rawParticipatingOrgIds.push(o.id));
    }
    const participatingOrgIds = [...new Set(rawParticipatingOrgIds)];

    // Default Name for Single Match if empty
    let eventTitle = eventName;
    if (type === 'game' && !eventTitle.trim()) {
      const homeTeamName = homeTeams.find(t => t.id === selectedHomeTeamId)?.name || 'Home';
      const awayTeamName = awayTeams.find(t => t.id === selectedAwayTeamId)?.name || 'Away';
      eventTitle = `${selectedHomeOrg?.shortName || selectedHomeOrg?.name || 'Home'} ${homeTeamName} vs ${selectedAwayOrg?.shortName || selectedAwayOrg?.name || 'Away'} ${awayTeamName}`;
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

    wsService.emit('action', { type: SocketAction.ADD_EVENT, payload: eventPayload }, (newEventResponse: any) => {
      const newEvent = newEventResponse?.data || newEventResponse;
      if (newEvent && newEvent.id) {
        if (type === 'game') {
          let scheduledTime: string | undefined = undefined;
          if (isTbd) {
            const dateObj = new Date(`${startDate}T12:00:00`);
            scheduledTime = !isNaN(dateObj.getTime()) ? dateObj.toISOString() : `${startDate}T12:00:00`;
          } else {
            const dateObj = new Date(`${startDate}T${startTime}:00`);
            scheduledTime = !isNaN(dateObj.getTime()) ? dateObj.toISOString() : `${startDate}T${startTime}:00`;
          }

          const gamePayload = {
            eventId: newEvent.id,
            sportId: selectedSportId,
            participants: [{ teamId: selectedHomeTeamId }, { teamId: selectedAwayTeamId }],
            scheduledStartTime: scheduledTime,
            startTime: scheduledTime,
            siteId: selectedSiteId || undefined,
            facilityId: selectedFacilityId || undefined,
            status: 'Scheduled',
            customSettings: {
              timeTbd: isTbd
            }
          };

          wsService.emit('action', { type: SocketAction.ADD_GAME, payload: gamePayload }, (newGame: any) => {
            setIsProcessing(false);
            safeBack(`/admin/${orgId}/events`);
          });
        } else {
          setIsProcessing(false);
          safeBack(`/admin/${orgId}/events`);
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
          onPress={() => safeBack(`/admin/${orgId}/events`)}
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
        {type === 'game' ? (
          <MatchForm
            orgId={orgId}
            onChange={(data) => {
              setSelectedSportId(data.sportId);
              setSelectedHomeOrg(data.homeOrgId ? { id: data.homeOrgId, name: '' } as any : null);
              setSelectedHomeTeamId(data.homeTeamId);
              setSelectedAwayOrg(data.awayOrgId ? { id: data.awayOrgId, name: '' } as any : null);
              setSelectedAwayTeamId(data.awayTeamId);
              setSelectedSiteId(data.siteId);
              setStartDate(data.gameDate);
              setStartTime(data.startTime);
              setIsTbd(data.isTbd);
              setPendingReferrals(data.referrals || {});
            }}
          />
        ) : (
          <GlassCard className="border border-slate-200 dark:border-white/5 p-5 space-y-5">
            {/* SPORT SELECTOR (FIRST FIELD) */}
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

            {/* EVENT NAME (OPTIONAL) */}
            <View className="space-y-1.5">
              <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Event Name (Optional)
              </Text>
              <TextInput
                placeholder="e.g. Local Derby"
                placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                value={eventName}
                onChangeText={setEventName}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
              />
            </View>

            {/* DATE */}
            <View className="space-y-3">
              <View className="flex-row justify-between items-center">
                <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Date
                </Text>
                <View className="flex-row items-center gap-2">
                  <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">Multi-day event</Text>
                  <Switch
                    value={isMultiDay}
                    onValueChange={setIsMultiDay}
                    trackColor={{ false: '#CBD5E1', true: COLORS.brand.orange }}
                  />
                </View>
              </View>
              <DatePicker value={startDate} onChange={setStartDate} placeholder="Select Date" />

              {isMultiDay && (
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
              <CustomSelect
                value={selectedSiteId}
                onChange={(val: string) => setSelectedSiteId(val)}
                options={sites.map(s => ({ label: s.name, value: s.id }))}
                placeholder="Select site..."
                clearable={true}
              />
            </View>

            {/* FACILITY/VENUE SELECTOR */}
            {!!selectedSiteId && (
              <View className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-white/5">
                <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
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
            )}

            {/* SPORTS DAY / TOURNAMENT MULTI-SELECT SPORT FIELDS */}
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
                    value={(() => {
                      const val = pendingReferrals[orgItem.id];
                      return Array.isArray(val) ? val.join(', ') : (val || '');
                    })()}
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
          </GlassCard>
        )}
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

      <NominationModal
        visible={isNominationModalVisible}
        onClose={() => setIsNominationModalVisible(false)}
        orgId={selectedAwayOrg?.id || ''}
        orgName={selectedAwayOrg?.name || ''}
      />
    </SafeAreaView>
  );
}
