import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Game, GameEvent, Sport, GameDispute, ActionStepType, SocketAction } from '@sk/types';
import { wsService } from '../../../services/websocket';
import { useOptionalSharedDynamicScoring, useSharedDynamicScoring } from './DynamicScoringContext';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/Colors';
import { ConfirmationModal } from '../../ConfirmationModal';
import { resolveEventTemplate, getEventLabel, getMissingDetails, getTeamColor } from '../../../utils/gameUtils';
import { useAuthStore } from '../../../store/authStore';
import { evaluateUndoWindow, getScoreImpact, getUndoNowMs } from '../../../utils/undoWindow';

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
  const dynamicScoring = useOptionalSharedDynamicScoring();
  const startDynamicFlow = dynamicScoring?.startDynamicFlow;

  const {
    events,
    isLoadingEvents: loading,
    disputes,
    sport,
    profileMap,
    homeRoster,
    awayRoster,
  } = useSharedDynamicScoring();

  const [activeFilters, setActiveFilters] = useState<Set<EventFilterCategory>>(
    new Set(['TIME', 'SCORE', 'DETAIL', 'GENERAL'])
  );
  const [undoEventTarget, setUndoEventTarget] = useState<GameEvent | null>(null);
  const [disputeEventTarget, setDisputeEventTarget] = useState<GameEvent | null>(null);
  // Server-aligned clock so every scorer counts down the same undo window
  const [now, setNow] = useState(getUndoNowMs);

  const homeParticipantId = game?.participants?.[0]?.id;
  const awayParticipantId = game?.participants?.[1]?.id;

  const rosters = useMemo(() => {
    const map: { [participantId: string]: any[] } = {};
    if (homeParticipantId) map[homeParticipantId] = homeRoster;
    if (awayParticipantId) map[awayParticipantId] = awayRoster;
    return map;
  }, [homeParticipantId, awayParticipantId, homeRoster, awayRoster]);

  const getLinkedEventsInfo = (targetEvt: GameEvent | null) => {
    if (!targetEvt) return { childEvents: [], childLabels: [], isScoreChanging: false, totalPointsEffect: 0 };

    const { childEvents, totalPointsEffect, isScoreChanging } = getScoreImpact(targetEvt, events);

    const childLabels = childEvents.map((c) => {
      const label = getEventLabel(c, sport).label || c.subType;
      const cData = c.eventData || (c as any).event_data || {};
      const pts = cData.pointsDelta ?? cData.points;
      return pts ? `${label} (+${pts} pts)` : label;
    });

    return { childEvents, childLabels, isScoreChanging, totalPointsEffect };
  };

  const isUndoableChildEvent = (targetEvt: GameEvent): boolean => {
    const eData = targetEvt.eventData || (targetEvt as any).event_data || {};
    if (!eData.linkedEventId) return true;

    const parentEvt = events.find((e) => e.id === eData.linkedEventId);
    if (!parentEvt) return true;

    const parentTemplateId = parentEvt.eventData?.templateId || parentEvt.subType;
    const parentTemplate = sport?.eventTemplates?.find((t) => t.id === parentTemplateId);
    if (!parentTemplate) return true;

    const flatSteps = parentTemplate.steps?.flatMap((s: any) => (s.type === 'GROUP' ? s.steps || [] : [s])) || [];
    const outcomeStep = flatSteps.find((s: any) => s.type === 'OUTCOME_SELECTION' || s.type === ActionStepType.OUTCOME_SELECTION);
    const hasMultipleOutcomes = outcomeStep?.outcomes && outcomeStep.outcomes.length > 1;

    return !!hasMultipleOutcomes;
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(getUndoNowMs()), 1000);
    return () => clearInterval(timer);
  }, []);

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

    if (getUndoState(evt).isLockedByOtherScorer) {
      setErrorMessage('Event locked: the scorer is still within their undo window. Please wait.');
      return;
    }

    const templateId = evt.eventData?.templateId || evt.subType;
    const side = evt.gameParticipantId === homeParticipantId ? 'home' : 'away';

    if (templateId) {
      startDynamicFlow?.(templateId, side, {
        eventId: evt.id,
        actorOrgProfileId: evt.actorOrgProfileId,
        playerId: evt.actorOrgProfileId,
        ...evt.eventData,
      });
    }
  };

  const user = useAuthStore((state) => state.user);
  const orgMemberships = useAuthStore((state) => state.orgMemberships);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const myOrgProfileIds = useMemo(() => {
    const ids = new Set<string>();
    (orgMemberships || []).forEach((m: any) => {
      if (m?.orgProfileId) ids.add(m.orgProfileId);
    });
    if (user?.id) ids.add(user.id);
    return ids;
  }, [orgMemberships, user?.id]);

  // Only the scorer who recorded the event may undo it while the window is open.
  // Once it expires, all scorers can remove the event or change the outcome.
  const getUndoState = (targetEvt: GameEvent) =>
    evaluateUndoWindow({
      event: targetEvt,
      events,
      myOrgProfileIds,
      isGlobalAdmin: user?.globalRole === 'admin',
      now,
    });

  const resolveInitiatorId = () => {
    if (!user) return undefined;
    const orgMemberships = useAuthStore.getState().orgMemberships || [];
    if (user.globalRole === 'admin') {
      const adminMem = orgMemberships.find((m: any) => m.orgId === 'org-system-admins');
      if (adminMem?.orgProfileId) return adminMem.orgProfileId;
    }
    if (game?.id && (game as any).officials) {
      const matchedOfficial = (game as any).officials?.find((o: any) =>
        orgMemberships.some((m: any) => m.orgProfileId === o.orgProfileId)
      );
      if (matchedOfficial?.orgProfileId) return matchedOfficial.orgProfileId;
    }
    return orgMemberships[0]?.orgProfileId || user.id;
  };

  const handleConfirmUndo = () => {
    if (undoEventTarget) {
      const target = undoEventTarget;
      setUndoEventTarget(null);
      const initiatorId = resolveInitiatorId();
      if (!initiatorId) {
        setErrorMessage('User session required: Initiator ID is missing to undo event.');
        return;
      }
      wsService.emitAction(
        SocketAction.UNDO_GAME_EVENT,
        { gameId, eventId: target.id, initiatorId },
        (res: any) => {
          if (res && res.error) {
            console.error('Failed to undo event:', res.error);
            if (typeof res.error === 'string' && res.error.toLowerCase().includes('expired')) {
              setDisputeEventTarget(target);
            } else {
              setErrorMessage(res.error);
            }
          }
        }
      );
    }
  };

  const handleConfirmDispute = () => {
    if (disputeEventTarget) {
      const target = disputeEventTarget;
      setDisputeEventTarget(null);
      const initiatorId = resolveInitiatorId();
      if (!initiatorId) {
        setErrorMessage('User session required: Initiator ID is missing to initiate dispute.');
        return;
      }
      wsService.emitAction(
        SocketAction.INITIATE_UNDO_VOTE,
        { gameId, eventIdToUndo: target.id, initiatorId },
        (res: any) => {
          if (res && res.error) {
            console.error('Failed to initiate dispute:', res.error);
            setErrorMessage(res.error);
          }
        }
      );
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
            className={`px-2.5 py-1 rounded-full flex-row items-center gap-1 border ${
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
            className={`px-2.5 py-1 rounded-full flex-row items-center gap-1 border ${
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
            className={`px-2.5 py-1 rounded-full flex-row items-center gap-1 border ${
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
            className={`px-2.5 py-1 rounded-full flex-row items-center gap-1 border ${
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
              const isScoringEvent = template?.section === 'Scoring' || (template?.points && template.points > 0);
              const isPending = eventData.pending || (isScoringEvent && !eventData.outcome);
              const isTimingEvent = evt.type === 'TIME' || evt.type === 'STATUS';
              const isDisputed = disputedEventIds.has(evt.id);

              const barClass = getTeamColor(evt, game?.participants);

              const { canUndo, isLockedByOtherScorer, remainingSecs } = getUndoState(evt);

              // Actor / Player details & Substitutions
              const actorName = evt.actorOrgProfileId ? profileMap[evt.actorOrgProfileId] || null : null;
              const isSubstitution = evt.subType === 'Replacement' || evt.subType === 'substitution';
              const playerOffName = eventData.playerOffName || (eventData.playerOffProfileId ? profileMap[eventData.playerOffProfileId] : null);
              const playerOnName = eventData.playerOnName || (eventData.playerOnProfileId ? profileMap[eventData.playerOnProfileId] : null);

              // Missing Details & Conversion / Linked action checks
              const participantRoster = evt.gameParticipantId ? rosters[evt.gameParticipantId] : undefined;
              const missingDetails = canManage && !isDisputed && !isLockedByOtherScorer ? getMissingDetails(evt, template, participantRoster) : [];
              
              const triggerEventId = template?.triggerEventId;
              const hasTriggerEvent = !!triggerEventId;
              const hasLinkedTrigger = events.some((e) => {
                const eData = e.eventData || (e as any).event_data || {};
                if (eData.status === 'REMOVED') return false;

                // 1. Explicit link
                if (eData.linkedEventId === evt.id) return true;

                // 2. Implicit link (same participant, trigger event recorded within 5 min window)
                if (e.subType === triggerEventId && e.gameParticipantId === evt.gameParticipantId) {
                  const triggerTime = e.timestamp ? new Date(e.timestamp).getTime() : 0;
                  const tryTime = evt.timestamp ? new Date(evt.timestamp).getTime() : 0;
                  if (triggerTime >= tryTime && triggerTime - tryTime < 300000) {
                    return true;
                  }
                }
                return false;
              });
              const canAddTrigger = canManage && !isDisputed && !isLockedByOtherScorer && hasTriggerEvent && !hasLinkedTrigger;
              const side = evt.gameParticipantId === homeParticipantId ? 'home' : 'away';

              return (
                <TouchableOpacity
                  key={evt.id}
                  disabled={!canManage || isTimingEvent || isDisputed}
                  onPress={() => handleEventPress(evt)}
                  activeOpacity={0.8}
                  className={`bg-white dark:bg-slate-900 border ${
                    isDisputed
                      ? 'border-red-500 bg-red-500/10 dark:bg-red-500/20'
                      : isPending
                      ? 'border-amber-500 bg-amber-500/5 dark:bg-amber-500/10'
                      : 'border-slate-200 dark:border-white/5'
                  } rounded-xl p-2.5 flex-row items-center justify-between shadow-sm gap-2.5 relative`}
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
                          {title}
                        </Text>
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

                      {/* QUICK FIX ACTION PILLS & CONVERSION / TRIGGER PROMPT INSIDE CARD */}
                      {(missingDetails.length > 0 || canAddTrigger) && (
                        <View className="flex-row flex-wrap gap-1.5 mt-1.5">
                          {missingDetails.includes('player') && (
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                startDynamicFlow?.(evt.subType || evt.type, side, {
                                  ...eventData,
                                  eventId: evt.id,
                                  actorOrgProfileId: evt.actorOrgProfileId,
                                  playerId: evt.actorOrgProfileId,
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
                                startDynamicFlow?.(evt.subType || evt.type, side, {
                                  ...eventData,
                                  eventId: evt.id,
                                  actorOrgProfileId: evt.actorOrgProfileId,
                                  playerId: evt.actorOrgProfileId,
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
                                startDynamicFlow?.(evt.subType || evt.type, side, {
                                  ...eventData,
                                  eventId: evt.id,
                                  actorOrgProfileId: evt.actorOrgProfileId,
                                  playerId: evt.actorOrgProfileId,
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

                          {canAddTrigger && triggerEventId && (
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                startDynamicFlow?.(triggerEventId, side, { linkedEventId: evt.id });
                              }}
                              className="flex-row items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/40 rounded-full"
                            >
                              <Ionicons name="add-circle-outline" size={10} color="#F59E0B" />
                              <Text className="font-inter-bold text-[9px] uppercase text-amber-500">
                                {triggerEventId === 'conversion' ? '+ Add Conversion' : `+ ${triggerEventId.replace(/_/g, ' ')}`}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>

                  </View>

                  {/* RIGHT SIDE ACTIONS & SCORE */}
                  <View className="flex-row items-center gap-2 shrink-0">
                    {/* UNDO / REMOVE BUTTON — undo is reserved for the original scorer */}
                    {canManage && !isTimingEvent && !isDisputed && isUndoableChildEvent(evt) && (
                      isLockedByOtherScorer ? (
                        <View
                          {...(Platform.OS === 'web' ? { title: `Locked — scorer's undo window (${remainingSecs}s)` } : {})}
                          className="items-center justify-center px-1.5 py-1 rounded-lg border bg-slate-500/10 border-slate-500/20 min-w-[32px]"
                        >
                          <Ionicons name="lock-closed" size={14} color={COLORS.dark.textSecondary} />
                          <Text className="font-mono font-bold text-[9px] text-slate-400 mt-0.5" style={{ lineHeight: 10 }}>{remainingSecs}s</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          {...(Platform.OS === 'web' ? { title: canUndo ? `Undo (${remainingSecs}s)` : 'Remove' } : {})}
                          onPress={(e) => {
                            e.stopPropagation();
                            const { isScoreChanging } = getLinkedEventsInfo(evt);

                            if (canUndo || !isScoreChanging) {
                              setUndoEventTarget(evt);
                            } else {
                              setDisputeEventTarget(evt);
                            }
                          }}
                          className={`items-center justify-center px-1.5 py-1 rounded-lg border ${
                            canUndo ? 'bg-amber-500/10 border-amber-500/40 min-w-[32px]' : 'bg-red-500/10 border-red-500/20 min-w-[32px]'
                          }`}
                        >
                          <Ionicons name={canUndo ? "arrow-undo-outline" : "trash-outline"} size={14} color={canUndo ? '#F59E0B' : '#EF4444'} />
                          {canUndo && (
                            <Text className="font-mono font-bold text-[9px] text-amber-500 animate-pulse mt-0.5" style={{ lineHeight: 10 }}>{remainingSecs}s</Text>
                          )}
                        </TouchableOpacity>
                      )
                    )}

                    {/* RUNNING SCORE SNAPSHOT BADGE */}
                    {snapshot && (
                      <View className="flex-col items-center justify-center px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-md border border-slate-200 dark:border-white/10 shrink-0 min-w-[24px]">
                        {(() => {
                          const p1 = game?.participants?.[0];
                          const p2 = game?.participants?.[1];
                          const s1 = snapshot[p1?.id || ''] ?? 0;
                          const s2 = snapshot[p2?.id || ''] ?? 0;
                          return (
                            <>
                              <Text className="font-orbitron-bold text-xs text-blue-500 leading-none py-0.5">{s1}</Text>
                              <Text className="font-orbitron-bold text-xs text-red-500 leading-none py-0.5">{s2}</Text>
                            </>
                          );
                        })()}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* CONFIRMATION MODAL FOR UNDO */}
      {undoEventTarget && (() => {
        const { childLabels } = getLinkedEventsInfo(undoEventTarget);
        const targetLabel = getEventLabel(undoEventTarget, sport).label || undoEventTarget.subType;
        const linkedText = childLabels.length > 0
          ? `\n\nThis will also remove linked event(s):\n• ${childLabels.join('\n• ')}`
          : '';
        return (
          <ConfirmationModal
            isOpen={!!undoEventTarget}
            onClose={() => setUndoEventTarget(null)}
            title="Undo Event?"
            description={`Are you sure you want to undo "${targetLabel}"?${linkedText}`}
            confirmText="Undo Event"
            cancelText="Cancel"
            onConfirm={handleConfirmUndo}
            variant="danger"
          />
        );
      })()}

      {/* CONFIRMATION MODAL FOR DISPUTE */}
      {disputeEventTarget && (() => {
        const { childLabels } = getLinkedEventsInfo(disputeEventTarget);
        const targetLabel = getEventLabel(disputeEventTarget, sport).label || disputeEventTarget.subType;
        const linkedText = childLabels.length > 0
          ? ` and its linked event(s) (${childLabels.join(', ')})`
          : '';
        return (
          <ConfirmationModal
            isOpen={!!disputeEventTarget}
            onClose={() => setDisputeEventTarget(null)}
            title="Request Event Removal?"
            description={`To remove "${targetLabel}"${linkedText}, you need consensus from the other scorers. Proceed?`}
            confirmText="Request Removal"
            cancelText="Cancel"
            onConfirm={handleConfirmDispute}
            variant="primary"
          />
        );
      })()}

      {/* ERROR MODAL */}
      {errorMessage && (
        <ConfirmationModal
          isOpen={!!errorMessage}
          onClose={() => setErrorMessage(null)}
          title="Operation Failed"
          description={errorMessage}
          confirmText="OK"
          onConfirm={() => setErrorMessage(null)}
          variant="danger"
        />
      )}
    </View>
  );
}
