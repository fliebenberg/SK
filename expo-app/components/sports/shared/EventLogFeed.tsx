import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Game, GameEvent, Sport, GameDispute, ActionStepType } from '@sk/types';
import { wsService } from '../../../services/websocket';
import { useSharedDynamicScoring } from './DynamicScoringContext';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/Colors';
import { ConfirmationModal } from '../../ConfirmationModal';
import { resolveEventTemplate, getEventLabel, getMissingDetails, getTeamColor } from '../../../utils/gameUtils';

interface EventLogFeedProps {
  gameId: string;
  game?: Game;
  canManage?: boolean;
}

export type EventFilterCategory = 'TIME' | 'SCORE' | 'DETAIL' | 'GENERAL';

const GENERAL_PLAY_SUBTYPES = [
  'Knock-on',
  'Turnover',
  'Turnover Won',
  'Tackle Made',
  'Tackle Missed',
  'Pass',
];

function getEventCategory(evt: GameEvent): EventFilterCategory {
  if (evt.type === 'TIME' || evt.type === 'STATUS') return 'TIME';
  if (evt.type === 'SCORE') return 'SCORE';

  const subType = evt.subType || '';
  if (GENERAL_PLAY_SUBTYPES.includes(subType)) {
    return 'GENERAL';
  }
  return 'DETAIL';
}

export function EventLogFeed({ gameId, game, canManage = false }: EventLogFeedProps) {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilters, setActiveFilters] = useState<Set<EventFilterCategory>>(
    new Set(['TIME', 'SCORE', 'DETAIL', 'GENERAL'])
  );
  const [undoEventTarget, setUndoEventTarget] = useState<GameEvent | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sport, setSport] = useState<Sport | undefined>(undefined);
  const [rosters, setRosters] = useState<{ [participantId: string]: any[] }>({});
  const [profileMap, setProfileMap] = useState<{ [profileId: string]: string }>({});
  const [disputes, setDisputes] = useState<GameDispute[]>([]);

  const { startDynamicFlow } = useSharedDynamicScoring();

  const homeParticipantId = game?.participants?.[0]?.id;
  const awayParticipantId = game?.participants?.[1]?.id;

  const UNDO_WINDOW_MS = 60000;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch sport, rosters, and active disputes
  useEffect(() => {
    if (!gameId) return;

    // Fetch Sport definition if available
    const resolvedSportId = game?.sportId || game?.customSettings?.sportId;
    if (resolvedSportId) {
      wsService.emit('get_data', { type: 'sport', id: resolvedSportId }, (resSport: Sport) => {
        if (resSport) setSport(resSport);
      });
    }

    // Fetch Rosters
    game?.participants?.forEach((p) => {
      wsService.emit('get_data', { type: 'roster', id: p.id }, (rosterData: any[]) => {
        if (Array.isArray(rosterData)) {
          setRosters((prev) => ({ ...prev, [p.id]: rosterData }));
          // Populate profile map
          setProfileMap((prev) => {
            const next = { ...prev };
            rosterData.forEach((item) => {
              const pid = item.orgProfileId || item.profileId || item.id;
              const name = item.name || item.profile?.name || item.displayName;
              if (pid && name) next[pid] = name;
            });
            return next;
          });
        }
      });
    });

    // Fetch Active Disputes
    wsService.emit('get_data', { type: 'active_disputes', id: gameId }, (disputeData: GameDispute[]) => {
      if (Array.isArray(disputeData)) setDisputes(disputeData);
    });

    const handleDisputeUpdate = (evt: { type: string; data: any }) => {
      if (evt.type === 'DISPUTE_STARTED' && evt.data?.dispute) {
        setDisputes((prev) => [evt.data.dispute, ...prev.filter((d) => d.id !== evt.data.dispute.id)]);
      } else if (evt.type === 'DISPUTE_VOTE_UPDATED' && evt.data?.dispute) {
        setDisputes((prev) => prev.map((d) => (d.id === evt.data.dispute.id ? { ...d, ...evt.data.dispute } : d)));
      } else if (evt.type === 'DISPUTE_RESOLVED' && evt.data?.disputeId) {
        setDisputes((prev) => prev.filter((d) => d.id !== evt.data.disputeId));
      } else if (evt.type === 'ACTIVE_DISPUTES_SYNC' && Array.isArray(evt.data)) {
        setDisputes(evt.data);
      }
    };

    wsService.on('update', handleDisputeUpdate);
    return () => {
      wsService.off('update', handleDisputeUpdate);
    };
  }, [gameId, game]);

  // Main Events fetch & live updates
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    wsService.emit('get_data', { type: 'game_events', id: gameId }, (data: GameEvent[]) => {
      if (isMounted) {
        if (data && Array.isArray(data)) {
          const sorted = [...data].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          setEvents(sorted);
        }
        setLoading(false);
      }
    });

    const handleUpdate = (evt: { type: string; data: any }) => {
      const targetGameId = evt.data?.gameId || evt.data?.id;

      if ((evt.type === 'GAME_RESET' || evt.type === 'RESET_GAME') && (!targetGameId || targetGameId === gameId)) {
        setEvents([]);
      } else if (evt.type === 'GAME_EVENTS_SYNC' && (!targetGameId || targetGameId === gameId)) {
        const syncEvents = Array.isArray(evt.data) ? evt.data : evt.data?.events;
        if (Array.isArray(syncEvents)) {
          const sorted = [...syncEvents].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          setEvents(sorted);
        }
      } else if (evt.type === 'GAME_EVENT_ADDED' && evt.data?.gameId === gameId) {
        setEvents((prev) => {
          if (!evt.data?.id) return prev;
          const exists = prev.some((e) => e.id === evt.data.id);
          if (exists) {
            return prev.map((e) => (e.id === evt.data.id ? evt.data : e));
          }
          return [evt.data, ...prev];
        });
      } else if (evt.type === 'GAME_EVENT_UPDATED' && evt.data?.gameId === gameId) {
        setEvents((prev) => prev.map((e) => (e.id === evt.data.id ? evt.data : e)));
      } else if ((evt.type === 'GAME_EVENT_REMOVED' || evt.type === 'UNDO_GAME_EVENT') && evt.data) {
        const targetId = evt.data.id || evt.data.eventId;
        setEvents((prev) => prev.filter((e) => e.id !== targetId));
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      isMounted = false;
      wsService.off('update', handleUpdate);
    };
  }, [gameId]);

  const disputedEventIds = useMemo(() => {
    return new Set(disputes.map((d) => d.gameEventId));
  }, [disputes]);

  const toggleFilter = (cat: EventFilterCategory) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size > 1) {
          next.delete(cat);
        }
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const filteredEvents = useMemo(() => {
    const seen = new Set<string>();
    return events.filter((evt) => {
      if (!evt.id || seen.has(evt.id)) return false;
      seen.add(evt.id);
      const cat = getEventCategory(evt);
      return activeFilters.has(cat);
    });
  }, [events, activeFilters]);

  const handleEventPress = (evt: GameEvent) => {
    if (!canManage || disputedEventIds.has(evt.id)) return;
    const isTimingEvent = evt.type === 'TIME' || evt.type === 'STATUS';
    if (isTimingEvent) return;

    const templateId = evt.eventData?.templateId || evt.subType;
    const side = evt.gameParticipantId === homeParticipantId ? 'home' : 'away';

    if (templateId) {
      startDynamicFlow(templateId, side, {
        eventId: evt.id,
        ...evt.eventData,
      });
    }
  };

  const handleConfirmUndo = () => {
    if (undoEventTarget) {
      wsService.emit('action', {
        type: 'UNDO_GAME_EVENT',
        payload: { gameId, eventId: undoEventTarget.id },
      });
      setUndoEventTarget(null);
    }
  };

  const formatMatchTime = (ms?: number) => {
    if (ms === undefined || ms === null) return '--:--';
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading && events.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-8">
        <ActivityIndicator size="small" color={COLORS.brand.orange} />
        <Text className="font-inter text-xs text-slate-400 mt-2">Loading event feed...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden">
      {/* HEADER & FILTER BAR */}
      <View className="flex-row items-center justify-between px-3 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-white/5">
        <Text className="font-orbitron-bold text-xs uppercase text-slate-700 dark:text-slate-300">Live Feed</Text>

        <View className="flex-row items-center gap-1.5 flex-wrap">
          <TouchableOpacity
            onPress={() => toggleFilter('TIME')}
            className={`px-2.5 py-1 rounded-full flex-row items-center gap-1 border transition-all ${
              activeFilters.has('TIME')
                ? 'bg-slate-500/20 border-slate-500/40'
                : 'bg-slate-100 dark:bg-slate-800/40 border-transparent opacity-40'
            }`}
          >
            <Ionicons name="time-outline" size={12} color={activeFilters.has('TIME') ? '#94A3B8' : '#64748B'} />
            <Text
              className={`font-inter-bold text-[10px] uppercase ${
                activeFilters.has('TIME') ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'
              }`}
            >
              Time
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => toggleFilter('SCORE')}
            className={`px-2.5 py-1 rounded-full flex-row items-center gap-1 border transition-all ${
              activeFilters.has('SCORE')
                ? 'bg-amber-500/20 border-amber-500/40'
                : 'bg-slate-100 dark:bg-slate-800/40 border-transparent opacity-40'
            }`}
          >
            <Ionicons name="trophy-outline" size={12} color={activeFilters.has('SCORE') ? COLORS.brand.orange : '#94A3B8'} />
            <Text className={`font-inter-bold text-[10px] uppercase ${activeFilters.has('SCORE') ? 'text-brand-orange' : 'text-slate-400'}`}>
              Score
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => toggleFilter('DETAIL')}
            className={`px-2.5 py-1 rounded-full flex-row items-center gap-1 border transition-all ${
              activeFilters.has('DETAIL')
                ? 'bg-blue-500/20 border-blue-500/40'
                : 'bg-slate-100 dark:bg-slate-800/40 border-transparent opacity-40'
            }`}
          >
            <Ionicons name="pulse-outline" size={12} color={activeFilters.has('DETAIL') ? '#3B82F6' : '#94A3B8'} />
            <Text className={`font-inter-bold text-[10px] uppercase ${activeFilters.has('DETAIL') ? 'text-blue-500' : 'text-slate-400'}`}>
              Detail
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => toggleFilter('GENERAL')}
            className={`px-2.5 py-1 rounded-full flex-row items-center gap-1 border transition-all ${
              activeFilters.has('GENERAL')
                ? 'bg-emerald-500/20 border-emerald-500/40'
                : 'bg-slate-100 dark:bg-slate-800/40 border-transparent opacity-40'
            }`}
          >
            <Ionicons name="football-outline" size={12} color={activeFilters.has('GENERAL') ? '#10B981' : '#94A3B8'} />
            <Text className={`font-inter-bold text-[10px] uppercase ${activeFilters.has('GENERAL') ? 'text-emerald-500' : 'text-slate-400'}`}>
              General
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* EVENT LIST */}
      {filteredEvents.length === 0 ? (
        <View className="flex-1 items-center justify-center py-10">
          <Text className="font-inter text-xs text-slate-400 italic">
            {events.length === 0 ? 'Waiting for kickoff...' : 'No events match filters.'}
          </Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-3 py-2">
          <View className="space-y-2">
            {filteredEvents.map((evt) => {
              const eventData = evt.eventData || (evt as any).event_data || {};
              const snapshot = eventData.scoreSnapshot;
              const timeLabel = formatMatchTime(eventData.elapsedMS);

              // Dynamic Template Label
              const { label: dynamicTitle, template } = getEventLabel(evt, sport);
              const title = dynamicTitle || evt.subType || evt.type;

              const points = eventData.points;
              const period = eventData.period;
              const isPending = eventData.pending || (evt.subType === 'conversion' && !eventData.outcome);
              const isTimingEvent = evt.type === 'TIME' || evt.type === 'STATUS';
              const isDisputed = disputedEventIds.has(evt.id);

              const barClass = getTeamColor(evt, game?.participants);

              const evtTime = evt.timestamp ? new Date(evt.timestamp).getTime() : now;
              const age = now - evtTime;
              const inUndoWindow = age >= 0 && age < UNDO_WINDOW_MS;
              const remainingSecs = Math.max(0, Math.ceil((UNDO_WINDOW_MS - age) / 1000));

              // Actor / Player details & Substitutions
              const actorName = evt.actorOrgProfileId ? profileMap[evt.actorOrgProfileId] || null : null;
              const isSubstitution = evt.subType === 'Replacement' || evt.subType === 'substitution';
              const playerOffName = eventData.playerOffName || (eventData.playerOffProfileId ? profileMap[eventData.playerOffProfileId] : null);
              const playerOnName = eventData.playerOnName || (eventData.playerOnProfileId ? profileMap[eventData.playerOnProfileId] : null);

              // Missing Details & Conversion action checks
              const participantRoster = evt.gameParticipantId ? rosters[evt.gameParticipantId] : undefined;
              const missingDetails = canManage && !isDisputed ? getMissingDetails(evt, template, participantRoster) : [];
              
              const isTry = template?.id === 'try' || evt.subType === 'try';
              const hasLinkedConversion = events.some((e) => {
                const isConversion = e.subType === 'conversion' || e.eventData?.templateId === 'conversion';
                if (!isConversion) return false;
                const eData = e.eventData || (e as any).event_data || {};

                // 1. Explicit link
                if (eData.linkedEventId === evt.id) return true;

                // 2. Implicit link (same participant, conversion recorded within 5 min window after try)
                if (e.gameParticipantId === evt.gameParticipantId) {
                  const conversionTime = e.timestamp ? new Date(e.timestamp).getTime() : 0;
                  const tryTime = evt.timestamp ? new Date(evt.timestamp).getTime() : 0;
                  if (conversionTime >= tryTime && conversionTime - tryTime < 300000) {
                    return true;
                  }
                }
                return false;
              });
              const canAddConversion = canManage && !isDisputed && isTry && !hasLinkedConversion;
              const side = evt.gameParticipantId === homeParticipantId ? 'home' : 'away';

              return (
                <TouchableOpacity
                  key={evt.id}
                  disabled={!canManage || isTimingEvent || isDisputed}
                  onPress={() => handleEventPress(evt)}
                  className={`bg-white dark:bg-slate-900 border ${
                    isDisputed
                      ? 'border-red-500 bg-red-500/10 dark:bg-red-500/20'
                      : isPending
                      ? 'border-amber-500 bg-amber-500/5 dark:bg-amber-500/10'
                      : 'border-slate-200 dark:border-white/5'
                  } rounded-xl p-2.5 flex-row items-center justify-between shadow-sm gap-2.5 active:opacity-80 relative`}
                >
                  <View className={`w-1 self-stretch rounded-full ${barClass}`} />

                  <View className="flex-row items-center gap-2.5 flex-1 pr-1">
                    {/* TIME & PERIOD */}
                    <View className="bg-brand-orange/10 px-2 py-1 rounded-md border border-brand-orange/20 items-center min-w-[52px]">
                      <Text className="font-orbitron-bold text-[10px] text-brand-orange">{timeLabel}</Text>
                      {period && (
                        <Text className="font-inter text-[8px] text-slate-400 uppercase tracking-tighter mt-0.5">{period}</Text>
                      )}
                    </View>

                    {/* TITLE, ACTOR, & REASON DETAILS */}
                    <View className="flex-1 min-w-0">
                      <View className="flex-row items-center gap-2 flex-wrap">
                        <Text className="font-inter-bold text-xs text-slate-800 dark:text-white truncate uppercase">
                          {title} {points ? `(+${points})` : ''}
                        </Text>
                        {isPending && (
                          <View className="bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 rounded">
                            <Text className="font-inter-bold text-[9px] text-amber-500 uppercase tracking-wider">Pending Outcome</Text>
                          </View>
                        )}
                        {isDisputed && (
                          <View className="bg-red-500 px-1.5 py-0.5 rounded">
                            <Text className="font-orbitron-bold text-[8px] text-white uppercase tracking-wider">Disputed</Text>
                          </View>
                        )}
                      </View>

                      {/* SUB-DETAILS / ACTOR / SUBSTITUTION */}
                      <View className="flex-row items-center gap-1.5 mt-0.5 flex-wrap">
                        {isSubstitution ? (
                          <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400">
                            {playerOffName || 'Unknown'} <Text className="text-amber-500">↔</Text> {playerOnName || 'Unknown'}
                          </Text>
                        ) : (
                          <>
                            {eventData.reason && evt.type !== 'SCORE' && (
                              <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
                                Reason: {eventData.reason.replace(/^(General|Set Piece) - /i, '')}
                              </Text>
                            )}
                            {actorName && (
                              <Text className="font-inter-bold text-[10px] text-slate-600 dark:text-slate-300">
                                {eventData.reason && evt.type !== 'SCORE' ? '• ' : ''}
                                {actorName}
                              </Text>
                            )}
                          </>
                        )}
                      </View>

                      {/* QUICK FIX ACTION PILLS & CONVERSION PROMPT INSIDE CARD */}
                      {(missingDetails.length > 0 || canAddConversion) && (
                        <View className="flex-row flex-wrap gap-1.5 mt-1.5">
                          {missingDetails.includes('player') && (
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                startDynamicFlow(evt.subType || evt.type, side, {
                                  ...eventData,
                                  eventId: evt.id,
                                  initialStepType: ActionStepType.PLAYER_SELECTION,
                                });
                              }}
                              className="flex-row items-center gap-1 px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 rounded-full"
                            >
                              <Ionicons name="person-outline" size={10} color="#3B82F6" />
                              <Text className="font-inter-bold text-[9px] uppercase text-blue-500">+ Player</Text>
                            </TouchableOpacity>
                          )}

                          {missingDetails.includes('reason') && (
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                startDynamicFlow(evt.subType || evt.type, side, {
                                  ...eventData,
                                  eventId: evt.id,
                                  initialStepType: ActionStepType.REASON_SELECTION,
                                });
                              }}
                              className="flex-row items-center gap-1 px-2 py-0.5 bg-purple-500/10 border border-purple-500/30 rounded-full"
                            >
                              <Ionicons name="help-circle-outline" size={10} color="#A855F7" />
                              <Text className="font-inter-bold text-[9px] uppercase text-purple-500">+ Reason</Text>
                            </TouchableOpacity>
                          )}

                          {missingDetails.includes('outcome') && (
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                startDynamicFlow(evt.subType || evt.type, side, {
                                  ...eventData,
                                  eventId: evt.id,
                                  initialStepType: ActionStepType.OUTCOME_SELECTION,
                                });
                              }}
                              className="flex-row items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full"
                            >
                              <Ionicons name="disc-outline" size={10} color="#10B981" />
                              <Text className="font-inter-bold text-[9px] uppercase text-emerald-500">
                                {evt.subType === 'penalty_awarded' || evt.subType === 'free_kick' ? '+ Next Action' : '+ Outcome'}
                              </Text>
                            </TouchableOpacity>
                          )}

                          {canAddConversion && (
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                startDynamicFlow('conversion', side, { linkedEventId: evt.id });
                              }}
                              className="flex-row items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/40 rounded-full"
                            >
                              <Ionicons name="add-circle-outline" size={10} color="#F59E0B" />
                              <Text className="font-inter-bold text-[9px] uppercase text-amber-500">+ Add Conversion</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>

                    {/* RUNNING SCORE SNAPSHOT BADGE */}
                    {snapshot && (
                      <View className="flex-row items-center gap-1 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-md border border-slate-200 dark:border-white/10 shrink-0">
                        {(() => {
                          const p1 = game?.participants?.[0];
                          const p2 = game?.participants?.[1];
                          const s1 = snapshot[p1?.id || ''] ?? 0;
                          const s2 = snapshot[p2?.id || ''] ?? 0;
                          return (
                            <>
                              <Text className="font-orbitron-bold text-[10px] text-blue-500">{s1}</Text>
                              <Text className="font-inter text-[9px] opacity-40 text-slate-400">—</Text>
                              <Text className="font-orbitron-bold text-[10px] text-red-500">{s2}</Text>
                            </>
                          );
                        })()}
                      </View>
                    )}
                  </View>

                  {/* UNDO BUTTON */}
                  {canManage && !isTimingEvent && !isDisputed && (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        setUndoEventTarget(evt);
                      }}
                      className={`flex-row items-center gap-1 px-2 py-1 rounded-lg border ${
                        inUndoWindow ? 'bg-amber-500/10 border-amber-500/40' : 'bg-red-500/10 border-red-500/20'
                      }`}
                    >
                      <Ionicons name="arrow-undo-outline" size={14} color={inUndoWindow ? '#F59E0B' : '#EF4444'} />
                      {inUndoWindow && (
                        <Text className="font-mono font-bold text-[10px] text-amber-500 animate-pulse">{remainingSecs}s</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* CONFIRMATION MODAL FOR UNDO */}
      {undoEventTarget && (
        <ConfirmationModal
          isOpen={!!undoEventTarget}
          onClose={() => setUndoEventTarget(null)}
          title="Undo Event?"
          description={`Are you sure you want to undo "${getEventLabel(undoEventTarget, sport).label || undoEventTarget.subType}"?`}
          confirmText="Undo Event"
          cancelText="Cancel"
          onConfirm={handleConfirmUndo}
          variant="danger"
        />
      )}
    </View>
  );
}
