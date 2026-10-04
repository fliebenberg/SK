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
import { sendAction } from '../../../../../../services/actions';
import { useWsStore } from '../../../../../../store/wsStore';
import {
  SocketAction,
  Event,
  Game,
  Sport,
  Site,
  Team,
  Organization,
  TournamentDivision,
  TournamentStage,
  isCollapsed,
} from '@sk/shared';
import { RegisterOrgModal } from '../../../../../../components/RegisterOrgModal';
import { UnclaimedOrgBadge } from '../../../../../../components/UnclaimedOrgBadge';
import { nominateOrgContact } from '../../../../../../services/nominations';

import DatePicker from '../../../../../../components/DatePicker';
import CustomSelect from '../../../../../../components/CustomSelect';
import { AgeGroupPicker } from '../../../../../../components/AgeGroupPicker';
import { venueInputsToInstant, venueTimeHint, venueTimeZone } from '../../../../../../utils/dates';
import { useToastStore } from '../../../../../../store/toastStore';
import { pickableTeams } from '../../../../../../components/teams/TeamBits';
import { pickableSites } from '../../../../../../components/sites/SiteBits';
import { themeColor } from '../../../../../../constants/Colors';

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
  /** Whose venues these are, and whose timezone a venue without one uses (DATE-2). */
  const [hostOrg, setHostOrg] = useState<Organization | null>(null);
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

  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamShortName, setNewTeamShortName] = useState('');
  const [newTeamAgeGroupId, setNewTeamAgeGroupId] = useState<string | null>(null);
  const [targetOrgIdForTeam, setTargetOrgIdForTeam] = useState('');


  /**
   * Where this fixture belongs, on a tournament (`FIX-12`).
   *
   * A fixture added by hand used to name no stage, and so no division — which meant a convenor
   * could neither read nor score it, the choke point skipped it entirely so it counted toward no
   * table, and the only reason it was visible at all was that Phase 5 chose to show orphans rather
   * than hide them. `PEOPLE-3` settled the design question: **a fixture should always have a
   * stage**, and since Phase 5 every division is created with at least one, so there is always one
   * to default to.
   *
   * The pickers below follow the collapse rule (U15): with one division and one stage — the
   * ordinary case — nothing is shown and the choice is made silently. The concept appears exactly
   * when there is a second one to choose between.
   */
  const [divisions, setDivisions] = useState<TournamentDivision[]>([]);
  const [stages, setStages] = useState<TournamentStage[]>([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [selectedStageId, setSelectedStageId] = useState('');

  // Modal alert
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  /**
   * The chosen division's stages.
   *
   * Loaded per division rather than for the whole event: with fifteen divisions, fetching every
   * division's stages to render a picker that shows one of them is fourteen reads nobody looks at.
   */
  useEffect(() => {
    if (!isConnected || !selectedDivisionId) {
      setStages([]);
      setSelectedStageId('');
      return;
    }
    let active = true;
    wsService.emit('get_data', { type: 'division_stages', divisionId: selectedDivisionId }, (res: any) => {
      if (!active) return;
      const list: TournamentStage[] = Array.isArray(res) ? res : [];
      const ordered = [...list].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      setStages(ordered);
      setSelectedStageId(ordered[0]?.id || '');
    });
    return () => {
      active = false;
    };
  }, [isConnected, selectedDivisionId]);

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

    // Empty for a single match, which is the collapse rule having nothing to collapse.
    wsService.emit('get_data', { type: 'divisions', eventId }, (res: any) => {
      const list: TournamentDivision[] = Array.isArray(res) ? res : [];
      const ordered = [...list].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      setDivisions(ordered);
      if (ordered.length) setSelectedDivisionId(ordered[0].id);
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
  }, [isConnected, orgId, eventId]);

  // Fallback gameDate to event.startDate if not set
  useEffect(() => {
    if (event && !gameDate) {
      setGameDate(event.startDate || '');
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

  // Resolve Home and Away Teams filtered by org & sport, leaving out inactive teams (docs/teams.md)
  const homeTeamsList = pickableTeams(orgTeams[selectedHomeOrgId] || [], [selectedHomeTeamId]).filter(t => t.sportId === selectedSportId);
  const awayTeamsList = pickableTeams(orgTeams[selectedAwayOrgId] || [], [selectedAwayTeamId]).filter(t => t.sportId === selectedSportId);

  // Team Quick-Create Trigger
  const handleCreateTeamTrigger = (targetOrgId: string) => {
    setTargetOrgIdForTeam(targetOrgId);
    
    // Default the age group to the other team's (if available), else the sport's "Open".
    let defaultedAgeGroupId: string | null =
      sports.find(s => s.id === selectedSportId)?.ageGroups?.find(g => g.isOfficial && g.name === 'Open')?.id || null;
    if (targetOrgId === selectedHomeOrgId) {
      if (selectedAwayTeamId) {
        const otherTeam = (orgTeams[selectedAwayOrgId] || []).find(t => t.id === selectedAwayTeamId);
        if (otherTeam?.ageGroupId) defaultedAgeGroupId = otherTeam.ageGroupId;
      }
    } else {
      if (selectedHomeTeamId) {
        const otherTeam = (orgTeams[selectedHomeOrgId] || []).find(t => t.id === selectedHomeTeamId);
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
    setIsProcessing(true);

    const payload = {
      name: newTeamName.trim(),
      shortName: newTeamShortName.trim(),
      orgId: targetOrgIdForTeam,
      sportId: selectedSportId,
      ageGroupId: newTeamAgeGroupId,
      isActive: true
    };

    sendAction(SocketAction.ADD_TEAM, payload).then(result => {
      setIsProcessing(false);
      if (!result.ok) return;
      const team = result.data;
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
      setNewTeamAgeGroupId(null);
    });
  };

  // The clock the kick-off is typed on: the chosen venue's, else the organisation's (DATE-2).
  const timeZone = hostOrg ? venueTimeZone(sites.find(s => s.id === selectedSiteId), hostOrg) : null;
  const timeHint = timeZone ? venueTimeHint(timeZone) : null;

  // Submit Handler
  const handleSubmit = (ignoreConflict = false) => {
    if (!event || !selectedHomeTeamId || !selectedAwayTeamId) return;
    if (!timeZone) {
      useToastStore.getState().showError('Still loading the site — try again in a moment.', 'Not Ready');
      return;
    }

    // The kick-off as the organiser typed it, on the venue's clock — or noon there that day while it
    // is TBD (date-formatting skill, DATE-2). Refused before anything is sent if the date or time is
    // half-typed.
    const scheduledTime = venueInputsToInstant(gameDate || event.startDate, isTbd ? null : startTime, timeZone);
    if (!scheduledTime) {
      useToastStore.getState().showError('Enter the full game date and start time.', 'Date Needed');
      return;
    }

    // Conflict Check
    if (!isTbd && scheduledTime && !ignoreConflict) {
      const matchConflict = games.find(g => {
        if (g.status === 'Cancelled' || !g.startTime) return false;
        
        // Compare same site and same time
        const gTime = new Date(g.startTime).getTime();
        const propTime = new Date(scheduledTime).getTime();
        return g.siteId === selectedSiteId && gTime === propTime;
      });

      if (matchConflict) {
        const homeName = getTeamName(matchConflict.participants?.[0]?.teamId || '');
        const awayName = getTeamName(matchConflict.participants?.[1]?.teamId || '');
        setConflictWarning(
          `There is already a game scheduled at this site and time:\n\n"${homeName} vs ${awayName}"\n\nDo you want to schedule this anyway?`
        );
        return;
      }
    }

    setIsProcessing(true);

    const gamePayload = {
      eventId: eventId,
      sportId: selectedSportId,
      // `FIX-12`: a tournament fixture names its stage, and through it its division. Undefined on a
      // single match, which has neither and correctly belongs to no stage.
      stageId: selectedStageId || undefined,
      participants: [{ teamId: selectedHomeTeamId }, { teamId: selectedAwayTeamId }],
      scheduledStartTime: scheduledTime,
      startTime: scheduledTime,
      siteId: selectedSiteId || undefined,
      customSettings: {
        timeTbd: isTbd
      }
    };
    sendAction(SocketAction.ADD_GAME, gamePayload).then(result => {
      setIsProcessing(false);
      setConflictWarning(null);
      // A failed save stays on the form, as filled in; the refusal is already toasted.
      if (result.ok) safeBack(`/admin/${orgId}/events/${eventId}`);
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
      <SafeAreaView className="flex-1 bg-canvas justify-center items-center">
        <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
        <Text className="font-orbitron text-xs text-ink-muted mt-4 uppercase tracking-widest">
          Loading Details...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-line-soft bg-card z-10">
        <TouchableOpacity
          onPress={() => safeBack(`/admin/${orgId}/events/${eventId}`)}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color={themeColor(isDark, 'primary')} />
          <Text className="font-inter-bold text-xs text-ink-muted uppercase tracking-wider">
            Cancel
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-ink uppercase truncate flex-1 text-center px-4" numberOfLines={1}>
          Schedule Game
        </Text>
        <TouchableOpacity 
          className={`active:opacity-85 ${(!selectedHomeTeamId || !selectedAwayTeamId) ? 'opacity-40' : ''}`}
          disabled={!selectedHomeTeamId || !selectedAwayTeamId || isProcessing}
          onPress={() => handleSubmit(false)}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={themeColor(isDark, 'primary')} />
          ) : (
            <Text className="font-inter-bold text-xs text-primary-ink uppercase tracking-wider">
              Save
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 60 }}>
        <GlassCard className="border border-line p-5 space-y-5">
          <Text className="font-orbitron-bold text-[9px] text-ink-muted uppercase tracking-widest mb-1">
            Game Setup for: {event.name}
          </Text>

          {/*
            Where the fixture belongs. Shown only when there is something to choose between — one
            division and one stage is the ordinary case and picks itself silently (U15, `FIX-12`).
          */}
          {!isCollapsed(divisions.length) && (
            <View className="space-y-1.5">
              <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
                Division
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {divisions.map(division => {
                  const isSelected = selectedDivisionId === division.id;
                  return (
                    <TouchableOpacity
                      key={division.id}
                      onPress={() => {
                        setSelectedDivisionId(division.id);
                        // A division has one sport, so choosing one settles it — and stops a
                        // fixture being created under a sport its division does not play.
                        if (division.sportId) {
                          setSelectedSportId(division.sportId);
                          setSelectedHomeTeamId('');
                          setSelectedAwayTeamId('');
                        }
                      }}
                      className={`px-3 py-2 rounded-lg border ${
                        isSelected
                          ? 'bg-primary-soft border-primary'
                          : 'bg-canvas border-line'
                      }`}
                    >
                      <Text className={`font-inter text-xs ${isSelected ? 'text-primary-ink font-bold' : 'text-ink-soft'}`}>
                        {division.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {!isCollapsed(stages.length) && (
            <View className="space-y-1.5">
              <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
                Stage
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {stages.map(stage => {
                  const isSelected = selectedStageId === stage.id;
                  return (
                    <TouchableOpacity
                      key={stage.id}
                      onPress={() => setSelectedStageId(stage.id)}
                      className={`px-3 py-2 rounded-lg border ${
                        isSelected
                          ? 'bg-primary-soft border-primary'
                          : 'bg-canvas border-line'
                      }`}
                    >
                      <Text className={`font-inter text-xs ${isSelected ? 'text-primary-ink font-bold' : 'text-ink-soft'}`}>
                        {stage.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Select Sport */}
          <View className="space-y-1.5">
            <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
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
          </View>

          {/* Home Org Selection */}
          <View className="space-y-1.5">
            <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
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
                        ? 'bg-primary-soft border-primary' 
                        : 'bg-canvas border-line'
                    }`}
                  >
                    <Text className={`font-inter text-xs ${isSelected ? 'text-primary-ink font-bold' : 'text-ink-soft'}`}>
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
                <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
                  Home Team
                </Text>
                <TouchableOpacity onPress={() => handleCreateTeamTrigger(selectedHomeOrgId)}>
                  <Text className="font-inter-bold text-[10px] text-primary-ink uppercase tracking-wider">
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
                          ? 'bg-primary-soft border-primary' 
                          : 'bg-canvas border-line'
                      }`}
                    >
                      <Text className={`font-inter text-xs ${isSelected ? 'text-primary-ink font-bold' : 'text-ink-soft'}`}>
                        {team.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {homeTeamsList.length === 0 && (
                  <Text className="font-inter text-xs text-ink-muted italic">No teams matching selected sport.</Text>
                )}
              </View>
            </View>
          )}

          {/* Away Org Selection */}
          <View className="space-y-1.5 pt-2 border-t border-line-soft">
            <View className="flex-row justify-between items-center">
              <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
                Away Organization
              </Text>
              <TouchableOpacity onPress={() => setIsCreatingOrg(true)}>
                <Text className="font-inter-bold text-[10px] text-primary-ink uppercase tracking-wider">
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
                        ? 'bg-primary-soft border-primary' 
                        : 'bg-canvas border-line'
                    }`}
                  >
                    <View className="flex-row items-center gap-1.5">
                      <Text className={`font-inter text-xs ${isSelected ? 'text-primary-ink font-bold' : 'text-ink-soft'}`}>
                        {o.name}
                      </Text>
                      {/* An org with no administrator: the way to nominate one (docs/nomination-process.md §4). */}
                      {o.id !== orgId && <UnclaimedOrgBadge org={o} size={13} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Away Team Selection */}
          {!!selectedAwayOrgId && (
            <View className="space-y-1.5">
              <View className="flex-row justify-between items-center">
                <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
                  Away Team
                </Text>
                <TouchableOpacity onPress={() => handleCreateTeamTrigger(selectedAwayOrgId)}>
                  <Text className="font-inter-bold text-[10px] text-primary-ink uppercase tracking-wider">
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
                          ? 'bg-primary-soft border-primary' 
                          : 'bg-canvas border-line'
                      }`}
                    >
                      <Text className={`font-inter text-xs ${isSelected ? 'text-primary-ink font-bold' : 'text-ink-soft'}`}>
                        {team.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {awayTeamsList.length === 0 && (
                  <Text className="font-inter text-xs text-ink-muted italic">No opponent teams matching selected sport.</Text>
                )}
              </View>
            </View>
          )}

          {/* Site selection */}
          <View className="space-y-1.5 pt-2 border-t border-line-soft">
            <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
              Site Field/Court
            </Text>
            <CustomSelect
              value={selectedSiteId}
              onChange={(val: string) => setSelectedSiteId(val)}
              options={pickableSites(sites, [selectedSiteId]).map(s => ({ label: s.name, value: s.id }))}
              placeholder="Select site..."
              clearable={true}
            />
          </View>

          {/* Match Date & Time */}
          <View className="space-y-3 pt-2 border-t border-line-soft">
            <View className="space-y-1.5">
              <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
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
                <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
                  Start Time
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

      {/* Registering a school that is not on the system — the shared dialog (2026-09-21). */}
      <RegisterOrgModal
        isOpen={isCreatingOrg}
        onClose={() => setIsCreatingOrg(false)}
        sportId={selectedSportId || undefined}
        onRegistered={(org, contactEmail) => {
          // A failed invitation is announced on its own and does not undo the organisation.
          if (contactEmail) void nominateOrgContact(org.id, contactEmail);
          setOrgsList(prev => [...prev, org]);
          setSelectedAwayOrgId(org.id);
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
          <View className="bg-card rounded-2xl p-6 border border-line shadow-xl space-y-4">
            <Text className="font-orbitron-bold text-base text-ink uppercase tracking-wider">
              Register Team
            </Text>
            <View className="space-y-1.5">
              <Text className="font-orbitron text-[9px] text-ink-muted uppercase tracking-wider">Team Name</Text>
              <TextInput
                placeholder="e.g. 1st Team"
                placeholderTextColor={themeColor(isDark, 'ink-muted')}
                value={newTeamName}
                onChangeText={setNewTeamName}
                className="bg-canvas border border-line rounded-xl px-4 py-3 font-inter text-sm text-ink"
              />
            </View>
            <View className="space-y-1.5">
              <Text className="font-orbitron text-[9px] text-ink-muted uppercase tracking-wider">Short Code / Abbreviation</Text>
              <TextInput
                placeholder="e.g. 1ST"
                placeholderTextColor={themeColor(isDark, 'ink-muted')}
                value={newTeamShortName}
                onChangeText={setNewTeamShortName}
                className="bg-canvas border border-line rounded-xl px-4 py-3 font-inter text-sm text-ink"
              />
            </View>
            <View className="space-y-1.5">
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
    </SafeAreaView>
  );
}
