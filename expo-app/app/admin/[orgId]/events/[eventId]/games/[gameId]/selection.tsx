import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MatchViewSwitcher } from '../../../../../../../components/MatchViewSwitcher';
import { getMatchPermissions } from '../../../../../../../utils/matchPermissions';
import { useAuthStore } from '../../../../../../../store/authStore';
import { useUnsavedChanges } from '../../../../../../../hooks/useUnsavedChanges';
import { useUnsavedChangesStore } from '../../../../../../../store/unsavedChangesStore';
import { useWsStore } from '../../../../../../../store/wsStore';
import { wsService } from '../../../../../../../services/websocket';
import { COLORS } from '../../../../../../../constants/Colors';
import { SocketAction } from '@sk/types';

interface RosterItem {
  orgProfileId: string;
  position?: string;
  jerseyNumber?: string;
  isReserve: boolean;
}

export default function GameSelectionScreen() {
  const { orgId, eventId, gameId } = useLocalSearchParams<{
    orgId: string;
    eventId: string;
    gameId: string;
  }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const user = useAuthStore((s) => s.user);
  const orgMemberships = useAuthStore((s) => s.orgMemberships);
  const teamMemberships = useAuthStore((s) => s.teamMemberships);
  const isConnected = useWsStore((s) => s.isConnected);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [game, setGame] = useState<any>(null);
  const [event, setEvent] = useState<any>(null);
  const [sport, setSport] = useState<any>(null);

  const [selectedParticipantIdx, setSelectedParticipantIdx] = useState<number>(0);
  const [availablePlayers, setAvailablePlayers] = useState<any[]>([]);
  const [positions, setPositions] = useState<Array<{ id: string; name: string }>>([]);
  const [teamsMap, setTeamsMap] = useState<Record<string, any>>({});

  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [originalRoster, setOriginalRoster] = useState<RosterItem[]>([]);

  // Selection Interaction States (Bi-directional desktop + mobile)
  const [activePositionId, setActivePositionId] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [activeIsReserve, setActiveIsReserve] = useState(false);
  
  // Search Inputs
  const [rosterSearch, setRosterSearch] = useState('');
  const [pickerSearch, setPickerSearch] = useState('');

  // Mobile Bottom Sheet Modal State
  const [isMobilePickerOpen, setIsMobilePickerOpen] = useState(false);

  // Editing Jersey Number State
  const [editingJerseyForId, setEditingJerseyForId] = useState<string | null>(null);
  const [tempJerseyValue, setTempJerseyValue] = useState('');

  // Fetch Game, Event, Sport via WebSockets
  const loadData = useCallback(() => {
    if (!isConnected || !gameId) return;
    setIsLoading(true);

    let loadedGame: any = null;
    let loadedEvent: any = null;
    let loadedSport: any = null;

    const checkFinished = () => {
      if (loadedGame) {
        const rawPositions =
          loadedGame?.customSettings?.positions ||
          loadedEvent?.settings?.positions ||
          loadedSport?.defaultSettings?.positions ||
          [];
        setPositions(rawPositions);
        setIsLoading(false);
      }
    };

    wsService.emit('get_data', { type: 'game', id: gameId as string }, (resGame: any) => {
      if (resGame) {
        loadedGame = resGame;
        setGame(resGame);
        if (resGame.sportId) {
          wsService.emit('get_data', { type: 'sport', id: resGame.sportId }, (resSport: any) => {
            if (resSport) {
              loadedSport = resSport;
              setSport(resSport);
            }
            checkFinished();
          });
        } else {
          checkFinished();
        }
      }
    });

    if (eventId) {
      wsService.emit('get_data', { type: 'event', id: eventId as string }, (resEvent: any) => {
        if (resEvent) {
          loadedEvent = resEvent;
          setEvent(resEvent);
        }
        checkFinished();
      });
    }
  }, [isConnected, gameId, eventId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Current selected participant
  const participants = game?.participants || [];
  const currentParticipant = participants[selectedParticipantIdx] || null;
  const currentTeamId = currentParticipant?.teamId;

  // Fetch details for all teams in participants
  useEffect(() => {
    if (!isConnected || !game?.participants) return;
    let isMounted = true;
    game.participants.forEach((p: any) => {
      if (p.teamId && !teamsMap[p.teamId]) {
        wsService.emit('get_data', { type: 'team', id: p.teamId }, (team: any) => {
          if (isMounted && team?.id && team?.name) {
            setTeamsMap((prev) => ({ ...prev, [team.id]: team }));
          }
        });
      }
    });
    return () => {
      isMounted = false;
    };
  }, [isConnected, game?.participants, teamsMap]);

  const getParticipantName = useCallback(
    (p: any, idx: number) => {
      if (!p) return `Team ${idx + 1}`;
      if (p.name) return p.name;
      if (p.teamName) return p.teamName;
      if (p.teamId && teamsMap[p.teamId]?.name) return teamsMap[p.teamId].name;
      return `Team ${idx + 1}`;
    },
    [teamsMap]
  );

  // Calculate Match Permissions
  const permissions = useMemo(() => {
    return getMatchPermissions({
      game,
      event,
      currentOrgId: orgId as string,
      user,
      orgMemberships,
      teamMemberships,
      teamsMap,
    });
  }, [game, event, orgId, user, orgMemberships, teamMemberships, teamsMap]);

  const canEditCurrentTeam =
    selectedParticipantIdx === 0
      ? permissions.canEditTeam1Lineup
      : permissions.canEditTeam2Lineup;

  // Fetch Team Members & Saved Roster whenever selected participant changes
  useEffect(() => {
    if (!isConnected || !currentParticipant?.id || !currentTeamId) return;

    let isMounted = true;

    // 1. Fetch team available players
    wsService.emit(
      'get_data',
      { type: 'team_members', teamId: currentTeamId },
      (members: any[]) => {
        if (isMounted) {
          setAvailablePlayers(members || []);
        }
      }
    );

    // 2. Fetch saved game roster
    wsService.emit(
      'get_data',
      { type: 'game_roster', id: currentParticipant.id },
      (data: any[]) => {
        if (isMounted) {
          const mapped: RosterItem[] = (data || []).map((r) => ({
            orgProfileId: r.orgProfileId,
            position: r.position || undefined,
            jerseyNumber: r.jerseyNumber || undefined,
            isReserve: !!r.isReserve,
          }));
          setRoster(mapped);
          setOriginalRoster(mapped);
        }
      }
    );

    return () => {
      isMounted = false;
    };
  }, [isConnected, currentParticipant?.id, currentTeamId]);

  // Real-Time Room Subscription & Delta Update Listener
  useEffect(() => {
    if (!isConnected || !gameId) return;
    const room = `game:${gameId}`;
    const unsubscribeRoom = wsService.subscribeToRoom(room);

    const handleUpdate = (evt: { type: string; data: any }) => {
      if (!evt) return;

      if (evt.type === 'GAME_ROSTER_UPDATED') {
        const { participantId, items } = evt.data || {};
        if (participantId && participantId === currentParticipant?.id && Array.isArray(items)) {
          const mapped: RosterItem[] = items.map((r: any) => ({
            orgProfileId: r.orgProfileId,
            position: r.position || undefined,
            jerseyNumber: r.jerseyNumber || undefined,
            isReserve: !!r.isReserve,
          }));
          setRoster(mapped);
          setOriginalRoster(mapped);
          useUnsavedChangesStore.getState().clear();
        }
      } else if (evt.type === 'GAME_UPDATED' && currentParticipant?.id) {
        wsService.emit(
          'get_data',
          { type: 'game_roster', id: currentParticipant.id },
          (data: any[]) => {
            if (data) {
              const mapped: RosterItem[] = data.map((r) => ({
                orgProfileId: r.orgProfileId,
                position: r.position || undefined,
                jerseyNumber: r.jerseyNumber || undefined,
                isReserve: !!r.isReserve,
              }));
              setRoster(mapped);
              setOriginalRoster(mapped);
              useUnsavedChangesStore.getState().clear();
            }
          }
        );
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      unsubscribeRoom();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, gameId, currentParticipant?.id]);

  // Check dirty state
  const isDirty = useMemo(() => {
    if (roster.length !== originalRoster.length) return true;
    const sortedR = [...roster].sort((a, b) =>
      a.orgProfileId.localeCompare(b.orgProfileId)
    );
    const sortedO = [...originalRoster].sort((a, b) =>
      a.orgProfileId.localeCompare(b.orgProfileId)
    );
    return JSON.stringify(sortedR) !== JSON.stringify(sortedO);
  }, [roster, originalRoster]);

  const handleCancel = useCallback(() => {
    setRoster(originalRoster);
    setActivePositionId(null);
    setActivePlayerId(null);
    setActiveIsReserve(false);
    useUnsavedChangesStore.getState().clear();
  }, [originalRoster]);

  useUnsavedChanges(isDirty, handleCancel);

  // Save Roster Handler
  const handleSave = () => {
    if (!currentParticipant?.id || !canEditCurrentTeam || !game?.id) return;
    setIsSaving(true);
    wsService.emit(
      'action',
      {
        type: SocketAction.SAVE_GAME_ROSTER,
        payload: {
          gameId: game.id,
          participantId: currentParticipant.id,
          items: roster,
        },
      },
      (res: any) => {
        setIsSaving(false);
        if (res && res.status === 'ok') {
          setOriginalRoster(roster);
          useUnsavedChangesStore.getState().clear();
        } else {
          console.error('Failed to save game roster:', res?.message || 'Unknown error');
        }
      }
    );
  };

  // Reserve Limit
  const sportMaxReserves = sport?.defaultSettings?.maxReserves ?? 0;
  const gameMaxReserves = game?.customSettings?.maxReserves;
  const maxReserves =
    gameMaxReserves !== undefined ? gameMaxReserves : sportMaxReserves;
  const assignedReserves = roster.filter((r) => r.isReserve);

  // Core Allocation Logic
  const handleAssignPlayerToSlot = (
    profileId: string,
    targetPositionId?: string,
    isReserveSlot = false
  ) => {
    if (!canEditCurrentTeam) return;

    setRoster((prev) => {
      // Remove player from any existing position
      const filtered = prev.filter((item) => item.orgProfileId !== profileId);

      if (targetPositionId) {
        // Remove anyone currently occupying targetPositionId
        const finalRoster = filtered.filter(
          (item) => item.position !== targetPositionId
        );
        return [
          ...finalRoster,
          {
            orgProfileId: profileId,
            position: targetPositionId,
            jerseyNumber: targetPositionId, // Default jersey number to position ID
            isReserve: false,
          },
        ];
      } else if (isReserveSlot) {
        if (maxReserves > 0 && assignedReserves.length >= maxReserves) {
          return prev; // Reached reserve cap
        }
        return [
          ...filtered,
          {
            orgProfileId: profileId,
            position: undefined,
            jerseyNumber: undefined,
            isReserve: true,
          },
        ];
      }
      return filtered;
    });

    // Reset active selection states
    setActivePositionId(null);
    setActivePlayerId(null);
    setActiveIsReserve(false);
    setIsMobilePickerOpen(false);
    setPickerSearch('');
  };

  const handleRemoveFromRoster = (profileId: string) => {
    if (!canEditCurrentTeam) return;
    setRoster((prev) => prev.filter((item) => item.orgProfileId !== profileId));
  };

  const handleSaveJerseyNumber = (profileId: string, newJersey: string) => {
    setRoster((prev) =>
      prev.map((item) =>
        item.orgProfileId === profileId
          ? { ...item, jerseyNumber: newJersey.trim() || undefined }
          : item
      )
    );
    setEditingJerseyForId(null);
    setTempJerseyValue('');
  };

  // Click Handlers for Positions & Players (Bi-directional activation)
  const handlePositionSlotClick = (posId: string) => {
    if (!canEditCurrentTeam) return;

    if (!isDesktop) {
      // On mobile, tap position opens bottom sheet modal
      setActivePositionId(posId);
      setActiveIsReserve(false);
      setIsMobilePickerOpen(true);
      return;
    }

    // On desktop / tablet:
    if (activePlayerId) {
      // If a player card is already active, assign that player to this position!
      handleAssignPlayerToSlot(activePlayerId, posId, false);
    } else {
      // Else toggle active position
      if (activePositionId === posId) {
        setActivePositionId(null);
      } else {
        setActivePositionId(posId);
        setActiveIsReserve(false);
        setActivePlayerId(null);
      }
    }
  };

  const handleReserveSectionClick = () => {
    if (!canEditCurrentTeam) return;

    if (!isDesktop) {
      // On mobile, tap reserve opens bottom sheet modal
      setActivePositionId(null);
      setActiveIsReserve(true);
      setIsMobilePickerOpen(true);
      return;
    }

    // On desktop / tablet:
    if (activePlayerId) {
      handleAssignPlayerToSlot(activePlayerId, undefined, true);
    } else {
      if (activeIsReserve) {
        setActiveIsReserve(false);
      } else {
        setActiveIsReserve(true);
        setActivePositionId(null);
        setActivePlayerId(null);
      }
    }
  };

  const handleAvailablePlayerClick = (profileId: string, isAssigned: boolean) => {
    if (!canEditCurrentTeam) return;

    if (isAssigned) {
      // Tapping an allocated player clears them from lineup
      handleRemoveFromRoster(profileId);
      return;
    }

    if (activePositionId) {
      // If a position slot is active, assign player to that active position!
      handleAssignPlayerToSlot(profileId, activePositionId, false);
    } else if (activeIsReserve) {
      // If reserve area is active, assign player to reserve!
      handleAssignPlayerToSlot(profileId, undefined, true);
    } else {
      // Else toggle active player
      if (activePlayerId === profileId) {
        setActivePlayerId(null);
      } else {
        setActivePlayerId(profileId);
        setActivePositionId(null);
        setActiveIsReserve(false);
      }
    }
  };

  // Web HTML5 Drag & Drop Handlers
  const handleDragStartPlayer = (e: any, profileId: string) => {
    if (Platform.OS === 'web' && e?.dataTransfer) {
      e.dataTransfer.setData('profileId', profileId);
      e.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDragOver = (e: any) => {
    if (Platform.OS === 'web' && e?.preventDefault) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDropOnPosition = (e: any, posId: string) => {
    if (Platform.OS === 'web' && e?.preventDefault) {
      e.preventDefault();
      const profileId = e.dataTransfer?.getData('profileId');
      if (profileId) {
        handleAssignPlayerToSlot(profileId, posId, false);
      }
    }
  };

  const handleDropOnReserves = (e: any) => {
    if (Platform.OS === 'web' && e?.preventDefault) {
      e.preventDefault();
      const profileId = e.dataTransfer?.getData('profileId');
      if (profileId) {
        handleAssignPlayerToSlot(profileId, undefined, true);
      }
    }
  };

  // Allocated Count
  const totalPositions = positions.length;
  const allocatedCount = roster.filter(
    (r) => !!r.position && !r.isReserve
  ).length;
  const isFullyAllocated =
    totalPositions > 0 && allocatedCount === totalPositions;

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color={COLORS.brand.orange} />
        <Text className="font-orbitron text-xs text-slate-400 mt-3 uppercase tracking-widest">
          Loading Lineup...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* STANDARD MATCH HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          className="flex-row items-center gap-1.5"
        >
          <Ionicons name="chevron-back" size={18} color={COLORS.brand.orange} />
          <Text className="font-orbitron-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>

        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase flex-1 text-center px-4" numberOfLines={1}>
          Team Selection
        </Text>

        <MatchViewSwitcher
          orgId={orgId as string}
          eventId={eventId as string}
          gameId={gameId as string}
          currentView="selection"
          permissions={permissions}
        />
      </View>

      {/* Participant Switcher Tabs (Team 1 vs Team 2) */}
      {participants.length > 0 && (
        <View className="px-6 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-white/5">
          <View className="flex-row bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-white/10 max-w-xl self-center w-full">
            {participants.map((p: any, idx: number) => {
              const isActive = selectedParticipantIdx === idx;
              const isEditable =
                idx === 0
                  ? permissions.canEditTeam1Lineup
                  : permissions.canEditTeam2Lineup;

              return (
                <TouchableOpacity
                  key={p.id || idx}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedParticipantIdx(idx);
                    setActivePositionId(null);
                    setActivePlayerId(null);
                    setActiveIsReserve(false);
                  }}
                  className={`flex-1 py-2 rounded-lg items-center flex-row justify-center gap-1.5 ${
                    isActive ? 'bg-white dark:bg-slate-700' : ''
                  }`}
                >
                  <Text
                    numberOfLines={1}
                    className={`font-orbitron-bold text-xs ${
                      isActive
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {getParticipantName(p, idx)}
                  </Text>
                  {!isEditable && (
                    <Ionicons
                      name="eye-outline"
                      size={12}
                      color="#94A3B8"
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* MAIN CONTAINER: 2-COLUMN RESPONSIVE LAYOUT */}
      <ScrollView className="flex-1 px-3 py-3" contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Read-Only Notice Banner */}
        {!canEditCurrentTeam && (
          <View className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-3 flex-row items-center gap-2">
            <Ionicons name="information-circle-outline" size={18} color="#F59E0B" />
            <Text className="font-inter text-xs text-amber-600 dark:text-amber-400 flex-1">
              You are viewing this team's lineup in read-only mode. Only assigned coaches or org admins can edit team selections.
            </Text>
          </View>
        )}

        {/* Header Metadata & Allocation Badge */}
        <View className="flex-row items-center justify-between mb-4 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
          <View className="flex-1">
            <Text className="font-orbitron-bold text-base text-slate-900 dark:text-white">
              {currentParticipant ? getParticipantName(currentParticipant, selectedParticipantIdx) : 'Team Selection'}
            </Text>
            <Text className="font-inter text-xs text-slate-400">
              {totalPositions} Positions Available • Max Reserves:{' '}
              {maxReserves > 0 ? maxReserves : 'Unlimited'}
            </Text>
          </View>

          {totalPositions > 0 && (
            <View
              className={`px-3 py-1.5 rounded-full border ${
                isFullyAllocated
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-white/10'
              }`}
            >
              <Text
                className={`font-orbitron-bold text-xs ${
                  isFullyAllocated
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {allocatedCount} / {totalPositions}
              </Text>
            </View>
          )}
        </View>

        {/* Active Selection Guidance Bar (Desktop/Tablet) */}
        {isDesktop && canEditCurrentTeam && (activePositionId || activePlayerId || activeIsReserve) && (
          <View className="bg-brand-orange/10 border border-brand-orange/30 rounded-xl p-3 mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Ionicons name="sparkles" size={16} color={COLORS.brand.orange} />
              <Text className="font-orbitron-bold text-xs text-brand-orange">
                {activePositionId
                  ? `Position ${activePositionId} Selected: Click an available player on the right to assign!`
                  : activeIsReserve
                  ? `Reserves Selected: Click an available player on the right to add as reserve!`
                  : `Player Selected: Click any starting position or reserve area on the left to assign!`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setActivePositionId(null);
                setActivePlayerId(null);
                setActiveIsReserve(false);
              }}
              className="bg-brand-orange/20 px-2 py-1 rounded"
            >
              <Text className="font-orbitron-bold text-[10px] text-brand-orange">Cancel Selection</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 2-COLUMN SIDE-BY-SIDE ON DESKTOP/TABLET (`flex-row`) */}
        <View className={`flex-1 ${isDesktop ? 'flex-row gap-6 items-start' : 'flex-col'}`}>
          
          {/* LEFT COLUMN: STARTING LINEUP & RESERVES */}
          <View className={`gap-6 ${isDesktop ? 'flex-1 min-w-0' : 'w-full'}`}>
            
            {/* STARTING LINEUP SECTION */}
            <View>
              <Text className="font-orbitron-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 px-1">
                Starting Lineup
              </Text>

              <View className="gap-2">
                {positions.map((pos) => {
                  const assignedItem = roster.find((r) => r.position === pos.id);
                  const player = assignedItem
                    ? availablePlayers.find(
                        (p) => p.id === assignedItem.orgProfileId || p.orgProfileId === assignedItem.orgProfileId
                      )
                    : null;

                  const isActivePos = activePositionId === pos.id;

                  return (
                    <View
                      key={pos.id}
                      {...(Platform.OS === 'web'
                        ? ({
                            onDragOver: handleDragOver,
                            onDrop: (e: any) => handleDropOnPosition(e, pos.id),
                          } as any)
                        : {})}
                      className={`bg-white dark:bg-slate-900 border rounded-2xl p-3 flex-row items-center gap-3 ${
                        isActivePos
                          ? 'border-2 border-brand-orange bg-brand-orange/10'
                          : player
                          ? 'border-brand-orange/30 bg-brand-orange/5 dark:bg-brand-orange/10'
                          : 'border-slate-200 dark:border-white/10 border-dashed'
                      }`}
                    >
                      {/* Position Badge */}
                      <TouchableOpacity
                        disabled={!canEditCurrentTeam}
                        onPress={() => handlePositionSlotClick(pos.id)}
                        className={`w-10 h-10 rounded-xl items-center justify-center border ${
                          isActivePos
                            ? 'bg-brand-orange border-brand-orange'
                            : 'bg-brand-orange/10 border-brand-orange/20'
                        }`}
                      >
                        <Text
                          className={`font-orbitron-bold text-sm ${
                            isActivePos ? 'text-white' : 'text-brand-orange'
                          }`}
                        >
                          {pos.id}
                        </Text>
                      </TouchableOpacity>

                      {/* Position Name & Player Info */}
                      <TouchableOpacity
                        disabled={!canEditCurrentTeam}
                        onPress={() => handlePositionSlotClick(pos.id)}
                        className="flex-1 min-w-0"
                      >
                        <Text className="font-orbitron-bold text-xs text-slate-400 uppercase">
                          {pos.name}
                        </Text>
                        {player ? (
                          <Text
                            className="font-inter-bold text-sm text-slate-900 dark:text-white"
                            numberOfLines={1}
                          >
                            {player.name || player.orgProfileName}
                          </Text>
                        ) : (
                          <Text className="font-inter text-xs text-slate-400 italic">
                            {isActivePos ? 'Select player on right...' : 'Empty Slot (Tap to assign)'}
                          </Text>
                        )}
                      </TouchableOpacity>

                      {/* Jersey Number & Slot Actions */}
                      {player ? (
                        <View className="flex-row items-center gap-2">
                          {/* Jersey Badge / Edit Input */}
                          {editingJerseyForId === player.id ? (
                            <View className="flex-row items-center bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-white/20 px-1">
                              <TextInput
                                autoFocus
                                keyboardType="numeric"
                                value={tempJerseyValue}
                                onChangeText={setTempJerseyValue}
                                className="font-orbitron-bold text-xs text-slate-900 dark:text-white w-10 text-center py-1"
                              />
                              <TouchableOpacity
                                onPress={() =>
                                  handleSaveJerseyNumber(player.id, tempJerseyValue)
                                }
                                className="p-1"
                              >
                                <Ionicons
                                  name="checkmark-circle"
                                  size={18}
                                  color="#10B981"
                                />
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <TouchableOpacity
                              disabled={!canEditCurrentTeam}
                              onPress={() => {
                                setEditingJerseyForId(player.id);
                                setTempJerseyValue(
                                  assignedItem?.jerseyNumber || pos.id
                                );
                              }}
                              className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 px-2 py-1 rounded-lg flex-row items-center gap-1"
                            >
                              <Text className="font-orbitron-bold text-xs text-slate-700 dark:text-slate-300">
                                #{assignedItem?.jerseyNumber || pos.id}
                              </Text>
                              {canEditCurrentTeam && (
                                <Ionicons
                                  name="pencil"
                                  size={10}
                                  color="#94A3B8"
                                />
                              )}
                            </TouchableOpacity>
                          )}

                          {/* Remove Player Button */}
                          {canEditCurrentTeam && (
                            <TouchableOpacity
                              onPress={() => handleRemoveFromRoster(player.id)}
                              className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 items-center justify-center"
                            >
                              <Ionicons name="trash-outline" size={14} color="#EF4444" />
                            </TouchableOpacity>
                          )}
                        </View>
                      ) : (
                        canEditCurrentTeam && (
                          <TouchableOpacity
                            onPress={() => handlePositionSlotClick(pos.id)}
                            className="bg-brand-orange px-3 py-1.5 rounded-xl"
                          >
                            <Text className="font-orbitron-bold text-xs text-white">
                              {isActivePos ? 'Active' : 'Assign'}
                            </Text>
                          </TouchableOpacity>
                        )
                      )}
                    </View>
                  );
                })}
              </View>
            </View>

            {/* RESERVES SECTION */}
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-2 px-1">
                <Text className="font-orbitron-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  Reserves ({assignedReserves.length}
                  {maxReserves > 0 ? ` / ${maxReserves}` : ''})
                </Text>
                {canEditCurrentTeam &&
                  (maxReserves === 0 || assignedReserves.length < maxReserves) && (
                    <TouchableOpacity
                      onPress={handleReserveSectionClick}
                      className={`flex-row items-center gap-1 px-2.5 py-1 rounded-lg border ${
                        activeIsReserve
                          ? 'bg-amber-500 border-amber-500 text-white'
                          : 'bg-amber-500/10 border-amber-500/20'
                      }`}
                    >
                      <Ionicons
                        name="add-circle"
                        size={14}
                        color={activeIsReserve ? '#FFFFFF' : '#F59E0B'}
                      />
                      <Text
                        className={`font-orbitron-bold text-xs ${
                          activeIsReserve
                            ? 'text-white'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {activeIsReserve ? 'Active Zone' : 'Add Reserve'}
                      </Text>
                    </TouchableOpacity>
                  )}
              </View>

              <View
                {...(Platform.OS === 'web'
                  ? ({
                      onDragOver: handleDragOver,
                      onDrop: handleDropOnReserves,
                    } as any)
                  : {})}
                className={`bg-white dark:bg-slate-900 border rounded-2xl p-3 ${
                  activeIsReserve
                    ? 'border-2 border-amber-500 bg-amber-500/10'
                    : 'border-slate-200 dark:border-white/5'
                }`}
              >
                {assignedReserves.length === 0 ? (
                  <TouchableOpacity
                    disabled={!canEditCurrentTeam}
                    onPress={handleReserveSectionClick}
                    className="py-4 items-center justify-center border border-dashed border-slate-200 dark:border-white/10 rounded-xl"
                  >
                    <Text className="font-inter text-xs text-slate-400 italic">
                      {activeIsReserve
                        ? 'Click player on right to add as reserve...'
                        : 'No reserves assigned. Drag player here or click to assign.'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View className="gap-2">
                    {assignedReserves.map((res) => {
                      const player = availablePlayers.find(
                        (p) => p.id === res.orgProfileId || p.orgProfileId === res.orgProfileId
                      );
                      if (!player) return null;

                      return (
                        <View
                          key={player.id || res.orgProfileId}
                          className="bg-slate-50 dark:bg-slate-800/50 border border-amber-500/20 rounded-xl p-2.5 flex-row items-center gap-3"
                        >
                          <View className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 items-center justify-center">
                            <Text className="font-orbitron-bold text-[10px] text-amber-500">
                              RES
                            </Text>
                          </View>

                          <View className="flex-1 min-w-0">
                            <Text className="font-inter-bold text-xs text-slate-900 dark:text-white" numberOfLines={1}>
                              {player.name || player.orgProfileName}
                            </Text>
                          </View>

                          {/* Reserve Jersey Number & Actions */}
                          <View className="flex-row items-center gap-2">
                            {editingJerseyForId === player.id ? (
                              <View className="flex-row items-center bg-white dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-white/20 px-1">
                                <TextInput
                                  autoFocus
                                  keyboardType="numeric"
                                  value={tempJerseyValue}
                                  onChangeText={setTempJerseyValue}
                                  className="font-orbitron-bold text-xs text-slate-900 dark:text-white w-10 text-center py-1"
                                />
                                <TouchableOpacity
                                  onPress={() =>
                                    handleSaveJerseyNumber(player.id, tempJerseyValue)
                                  }
                                  className="p-1"
                                >
                                  <Ionicons
                                    name="checkmark-circle"
                                    size={16}
                                    color="#10B981"
                                  />
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <TouchableOpacity
                                disabled={!canEditCurrentTeam}
                                onPress={() => {
                                  setEditingJerseyForId(player.id);
                                  setTempJerseyValue(res.jerseyNumber || '');
                                }}
                                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 px-2 py-0.5 rounded-lg flex-row items-center gap-1"
                              >
                                <Text className="font-orbitron-bold text-xs text-slate-700 dark:text-slate-300">
                                  #{res.jerseyNumber || '—'}
                                </Text>
                                {canEditCurrentTeam && (
                                  <Ionicons
                                    name="pencil"
                                    size={10}
                                    color="#94A3B8"
                                  />
                                )}
                              </TouchableOpacity>
                            )}

                            {canEditCurrentTeam && (
                              <TouchableOpacity
                                onPress={() => handleRemoveFromRoster(player.id)}
                                className="w-6 h-6 rounded-lg bg-red-500/10 border border-red-500/20 items-center justify-center"
                              >
                                <Ionicons name="trash-outline" size={12} color="#EF4444" />
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* RIGHT COLUMN: AVAILABLE TEAM ROSTER (DESKTOP/TABLET ONLY) */}
          {isDesktop && (
            <View className="w-80 lg:w-96 shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-4 shadow-sm">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="font-orbitron-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  Available Roster ({availablePlayers.length})
                </Text>
                {activePlayerId && (
                  <View className="bg-brand-orange/10 px-2 py-0.5 rounded border border-brand-orange/20">
                    <Text className="font-orbitron-bold text-[10px] text-brand-orange">1 Selected</Text>
                  </View>
                )}
              </View>

              {/* Roster Search Input */}
              <View className="flex-row items-center bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2 border border-slate-200 dark:border-white/10 mb-3">
                <Ionicons name="search" size={14} color="#94A3B8" />
                <TextInput
                  placeholder="Search team members..."
                  placeholderTextColor="#94A3B8"
                  value={rosterSearch}
                  onChangeText={setRosterSearch}
                  className="flex-1 font-inter text-xs text-slate-900 dark:text-white ml-2"
                />
              </View>

              {/* Available Player Cards List */}
              <ScrollView className="max-h-[580px]">
                <View className="gap-2">
                  {availablePlayers
                    .filter((p) =>
                      (p.name || p.orgProfileName || '')
                        .toLowerCase()
                        .includes(rosterSearch.toLowerCase())
                    )
                    .map((player) => {
                      const pId = player.id || player.orgProfileId;
                      const rosterItem = roster.find(
                        (r) => r.orgProfileId === pId
                      );
                      const isAssigned = !!rosterItem;
                      const isActiveCard = activePlayerId === pId;

                      return (
                        <TouchableOpacity
                          key={pId}
                          disabled={!canEditCurrentTeam}
                          {...(Platform.OS === 'web'
                            ? ({
                                draggable: !isAssigned && canEditCurrentTeam,
                                onDragStart: (e: any) => handleDragStartPlayer(e, pId),
                              } as any)
                            : {})}
                          onPress={() => handleAvailablePlayerClick(pId, isAssigned)}
                          className={`flex-row items-center p-3 rounded-xl border ${
                            isActiveCard
                              ? 'bg-brand-orange/10 border-2 border-brand-orange'
                              : isAssigned
                              ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-white/5 opacity-60'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10'
                          }`}
                        >
                          <View className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center border border-slate-200 dark:border-white/10 mr-2.5">
                            <Ionicons name="person" size={14} color="#94A3B8" />
                          </View>

                          <View className="flex-1 min-w-0">
                            <Text
                              className={`font-inter-bold text-xs ${
                                isAssigned
                                  ? 'text-slate-400 dark:text-slate-500'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                              numberOfLines={1}
                            >
                              {player.name || player.orgProfileName}
                            </Text>
                          </View>

                          {/* Allocation Status Badge */}
                          {isAssigned ? (
                            <View
                              className={`px-2 py-0.5 rounded ${
                                rosterItem?.isReserve
                                  ? 'bg-amber-500/10 border border-amber-500/20'
                                  : 'bg-brand-orange/10 border border-brand-orange/20'
                              }`}
                            >
                              <Text
                                className={`font-orbitron-bold text-[9px] ${
                                  rosterItem?.isReserve
                                    ? 'text-amber-500'
                                    : 'text-brand-orange'
                                }`}
                              >
                                {rosterItem?.isReserve
                                  ? 'RES'
                                  : `POS ${rosterItem?.position}`}
                              </Text>
                            </View>
                          ) : (
                            <Ionicons
                              name={isActiveCard ? 'checkmark-circle' : 'add-circle-outline'}
                              size={18}
                              color={isActiveCard ? COLORS.brand.orange : '#94A3B8'}
                            />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                </View>
              </ScrollView>
            </View>
          )}

        </View>
      </ScrollView>

      {/* Sticky Bottom Action Bar */}
      {isDirty && canEditCurrentTeam && (
        <View className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-white/10 p-3 flex-row gap-3">
          <TouchableOpacity
            disabled={isSaving}
            onPress={handleCancel}
            className="flex-1 py-3 rounded-xl border border-slate-300 dark:border-slate-700 items-center"
          >
            <Text className="font-orbitron-bold text-xs text-slate-600 dark:text-slate-300">
              Cancel
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={isSaving}
            onPress={handleSave}
            className="flex-1 py-3 rounded-xl bg-brand-orange items-center flex-row justify-center gap-2"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="save-outline" size={16} color="#FFFFFF" />
                <Text className="font-orbitron-bold text-xs text-white">
                  Save Lineup
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* MOBILE PLAYER PICKER BOTTOM SHEET MODAL (FOR PHONES) */}
      <Modal
        visible={isMobilePickerOpen && !isDesktop}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setIsMobilePickerOpen(false);
          setActivePositionId(null);
          setActiveIsReserve(false);
        }}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-white dark:bg-slate-900 rounded-t-3xl p-4 shadow-lg" style={{ height: '75%', maxHeight: '85%' }}>
            {/* Modal Header */}
            <View className="flex-row items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
              <View>
                <Text className="font-orbitron-bold text-xs text-slate-400 uppercase tracking-widest">
                  Assigning Player
                </Text>
                <Text className="font-orbitron-bold text-lg text-slate-900 dark:text-white">
                  {activeIsReserve
                    ? 'Reserve Player'
                    : `Position ${activePositionId} • ${
                        positions.find((p) => p.id === activePositionId)?.name ||
                        ''
                      }`}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setIsMobilePickerOpen(false);
                  setActivePositionId(null);
                  setActiveIsReserve(false);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center"
              >
                <Ionicons name="close" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Instant Search Bar */}
            <View className="my-3 flex-row items-center bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2 border border-slate-200 dark:border-white/10">
              <Ionicons name="search" size={16} color="#94A3B8" />
              <TextInput
                autoFocus
                placeholder="Search team players..."
                placeholderTextColor="#94A3B8"
                value={pickerSearch}
                onChangeText={setPickerSearch}
                className="flex-1 font-inter text-sm text-slate-900 dark:text-white ml-2"
              />
            </View>

            {/* Player List */}
            <ScrollView className="flex-1">
              {(() => {
                const filtered = availablePlayers.filter((p) =>
                  (p.name || p.orgProfileName || '')
                    .toLowerCase()
                    .includes(pickerSearch.toLowerCase())
                );

                if (filtered.length === 0) {
                  return (
                    <View className="py-12 items-center justify-center">
                      <Ionicons name="people-outline" size={40} color="#94A3B8" />
                      <Text className="font-inter-medium text-sm text-slate-500 dark:text-slate-400 mt-3 text-center">
                        {pickerSearch
                          ? 'No matching players found'
                          : 'No available players found in roster'}
                      </Text>
                    </View>
                  );
                }

                return filtered.map((player) => {
                  const pId = player.id || player.orgProfileId;
                  const rosterItem = roster.find(
                    (r) => r.orgProfileId === pId
                  );
                  const isAssigned = !!rosterItem;

                  return (
                    <TouchableOpacity
                      key={pId}
                      activeOpacity={0.8}
                      onPress={() =>
                        handleAssignPlayerToSlot(
                          pId,
                          activePositionId || undefined,
                          activeIsReserve
                        )
                      }
                      className={`flex-row items-center p-3 rounded-xl mb-1 border ${
                        isAssigned
                          ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-white/5 opacity-60'
                          : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-white/5'
                      }`}
                    >
                      <View className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center border border-slate-200 dark:border-white/10 mr-3">
                        <Ionicons
                          name="person"
                          size={18}
                          color="#94A3B8"
                        />
                      </View>

                      <View className="flex-1">
                        <Text className="font-inter-bold text-sm text-slate-900 dark:text-white">
                          {player.name || player.orgProfileName}
                        </Text>
                      </View>

                      {isAssigned && (
                        <View className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded-lg">
                          <Text className="font-orbitron-bold text-[10px] text-slate-600 dark:text-slate-300">
                            {rosterItem?.isReserve
                              ? 'RES'
                              : `POS ${rosterItem?.position}`}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                });
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
