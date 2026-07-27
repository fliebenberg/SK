import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Game, GameEvent } from '@sk/types';
import { wsService } from '../../../services/websocket';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/Colors';
import { ConfirmationModal } from '../../ConfirmationModal';

interface EventLogFeedProps {
  gameId: string;
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

function getDisplayEventTitle(evt: GameEvent): string {
  const subType = evt.subType || evt.type || 'Event';
  const period = evt.eventData?.period;

  switch (subType) {
    case 'GAME_STARTED':
      return 'Match Started';
    case 'GAME_ENDED':
      return 'Match Finished';
    case 'GAME_CANCELLED':
      return 'Match Cancelled';
    case 'GAME_UPDATED':
      return 'Match Updated';
    case 'PERIOD_STARTED':
      return period ? `${period} Started` : 'Period Started';
    case 'PERIOD_ENDED':
      return period ? `${period} Ended` : 'Period Ended';
    case 'CLOCK_STARTED':
      return 'Clock Started';
    case 'CLOCK_PAUSED':
      return 'Clock Paused';
    case 'CLOCK_RESUMED':
      return 'Clock Resumed';
    case 'SCORE':
      return evt.eventData?.templateId || 'Score';
    default:
      return subType
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, char => char.toUpperCase());
  }
}

function getEventDetailText(evt: GameEvent): string | null {
  const subType = evt.subType || evt.type || 'Event';
  const period = evt.eventData?.period;
  const reason = evt.eventData?.reason;

  if (reason) return `Reason: ${reason}`;

  switch (subType) {
    case 'GAME_STARTED':
      return period ? `${period} Kickoff` : 'Kickoff';
    case 'PERIOD_STARTED':
      return period ? `${period} Kickoff` : 'Period Kickoff';
    case 'PERIOD_ENDED':
      return period ? `End of ${period} • Intermission` : 'Intermission';
    case 'CLOCK_PAUSED':
      return 'Clock Temporarily Stopped';
    case 'CLOCK_RESUMED':
      return 'Match Action Resumed';
    case 'GAME_ENDED':
      return 'Full Time • Match Concluded';
    default:
      return null;
  }
}

function getEventCategory(evt: GameEvent): EventFilterCategory {
  if (evt.type === 'TIME' || evt.type === 'STATUS') return 'TIME';
  if (evt.type === 'SCORE') return 'SCORE';

  const subType = evt.subType || '';
  if (GENERAL_PLAY_SUBTYPES.includes(subType)) {
    return 'GENERAL';
  }
  return 'DETAIL';
}

function getCategoryAccentBarClass(cat: EventFilterCategory, evt: GameEvent, homeId?: string, awayId?: string): string {
  switch (cat) {
    case 'TIME':
      return 'bg-slate-400 dark:bg-slate-600';
    case 'SCORE':
      if (evt.gameParticipantId && evt.gameParticipantId === homeId) return 'bg-blue-500';
      if (evt.gameParticipantId && evt.gameParticipantId === awayId) return 'bg-red-500';
      return 'bg-amber-500';
    case 'DETAIL':
      return 'bg-blue-500';
    case 'GENERAL':
      return 'bg-emerald-500';
  }
}

export function EventLogFeed({ gameId, canManage = false }: EventLogFeedProps) {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [game, setGame] = useState<Game | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [undoEventTarget, setUndoEventTarget] = useState<GameEvent | null>(null);
  const [now, setNow] = useState(Date.now());

  const UNDO_WINDOW_MS = 60000;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Active category filters (All 4 ON by default)
  const [activeFilters, setActiveFilters] = useState<Set<EventFilterCategory>>(
    new Set(['TIME', 'SCORE', 'DETAIL', 'GENERAL'])
  );

  const fetchEvents = () => {
    wsService.emit('get_data', { type: 'game_events', id: gameId }, (data: GameEvent[]) => {
      if (data) setEvents([...data].reverse());
      setIsLoading(false);
    });
  };

  useEffect(() => {
    setIsLoading(true);
    fetchEvents();

    wsService.emit('get_data', { type: 'game', id: gameId }, (resGame: Game) => {
      if (resGame) setGame(resGame);
    });

    const handleUpdate = (evt: { type: string; data: any }) => {
      if (evt.type === 'GAME_EVENT_ADDED' && evt.data) {
        setEvents(prev => [evt.data, ...prev.filter(e => e.id !== evt.data.id)]);
      } else if (evt.type === 'GAME_EVENT_UPDATED' && evt.data) {
        setEvents(prev => prev.map(e => e.id === evt.data.id ? { ...e, ...evt.data } : e));
      } else if (evt.type === 'GAME_EVENT_REMOVED' && evt.data) {
        setEvents(prev => prev.filter(e => e.id !== (evt.data.id || evt.data.eventId)));
      } else if (evt.type === 'GAME_EVENTS_SYNC' && Array.isArray(evt.data)) {
        setEvents(evt.data);
      } else if (evt.type === 'GAME_RESET') {
        setEvents([]);
      }
    };

    wsService.on('update', handleUpdate);
    return () => {
      wsService.off('update', handleUpdate);
    };
  }, [gameId]);

  const toggleFilter = (cat: EventFilterCategory) => {
    setActiveFilters(prev => {
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

  const handleConfirmUndo = () => {
    if (!undoEventTarget) return;
    wsService.emit(
      'action',
      {
        type: 'UNDO_GAME_EVENT',
        payload: { gameId, eventId: undoEventTarget.id, initiatorId: null },
      },
      () => {
        setUndoEventTarget(null);
        fetchEvents();
      }
    );
  };

  const formatMatchTime = (ms?: number) => {
    if (ms === undefined || ms === null) return '--:--';
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const filteredEvents = useMemo(() => {
    return events.filter(evt => {
      const cat = getEventCategory(evt);
      return activeFilters.has(cat);
    });
  }, [events, activeFilters]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center py-10">
        <ActivityIndicator size="small" color={COLORS.brand.orange} />
      </View>
    );
  }

  const homeParticipantId = game?.participants?.[0]?.id;
  const awayParticipantId = game?.participants?.[1]?.id;

  return (
    <View className="flex-1">
      {/* Top Filter Buttons Bar */}
      <View className="px-3 py-2 flex-row items-center justify-between border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50">
        <View className="flex-row items-center gap-1.5 flex-wrap">
          {/* TIME FILTER */}
          <TouchableOpacity
            onPress={() => toggleFilter('TIME')}
            className={`px-2.5 py-1 rounded-full flex-row items-center gap-1 border transition-all ${
              activeFilters.has('TIME')
                ? 'bg-slate-500/20 border-slate-500/40'
                : 'bg-slate-100 dark:bg-slate-800/40 border-transparent opacity-40'
            }`}
          >
            <Ionicons
              name="time-outline"
              size={12}
              color={activeFilters.has('TIME') ? '#94A3B8' : '#64748B'}
            />
            <Text
              className={`font-inter-bold text-[10px] uppercase ${
                activeFilters.has('TIME') ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'
              }`}
            >
              Time
            </Text>
          </TouchableOpacity>

          {/* SCORE FILTER */}
          <TouchableOpacity
            onPress={() => toggleFilter('SCORE')}
            className={`px-2.5 py-1 rounded-full flex-row items-center gap-1 border transition-all ${
              activeFilters.has('SCORE')
                ? 'bg-amber-500/20 border-amber-500/40'
                : 'bg-slate-100 dark:bg-slate-800/40 border-transparent opacity-40'
            }`}
          >
            <Ionicons
              name="trophy-outline"
              size={12}
              color={activeFilters.has('SCORE') ? COLORS.brand.orange : '#94A3B8'}
            />
            <Text
              className={`font-inter-bold text-[10px] uppercase ${
                activeFilters.has('SCORE') ? 'text-brand-orange' : 'text-slate-400'
              }`}
            >
              Score
            </Text>
          </TouchableOpacity>

          {/* DETAIL FILTER */}
          <TouchableOpacity
            onPress={() => toggleFilter('DETAIL')}
            className={`px-2.5 py-1 rounded-full flex-row items-center gap-1 border transition-all ${
              activeFilters.has('DETAIL')
                ? 'bg-blue-500/20 border-blue-500/40'
                : 'bg-slate-100 dark:bg-slate-800/40 border-transparent opacity-40'
            }`}
          >
            <Ionicons
              name="pulse-outline"
              size={12}
              color={activeFilters.has('DETAIL') ? '#3B82F6' : '#94A3B8'}
            />
            <Text
              className={`font-inter-bold text-[10px] uppercase ${
                activeFilters.has('DETAIL') ? 'text-blue-500' : 'text-slate-400'
              }`}
            >
              Detail
            </Text>
          </TouchableOpacity>

          {/* GENERAL FILTER */}
          <TouchableOpacity
            onPress={() => toggleFilter('GENERAL')}
            className={`px-2.5 py-1 rounded-full flex-row items-center gap-1 border transition-all ${
              activeFilters.has('GENERAL')
                ? 'bg-emerald-500/20 border-emerald-500/40'
                : 'bg-slate-100 dark:bg-slate-800/40 border-transparent opacity-40'
            }`}
          >
            <Ionicons
              name="football-outline"
              size={12}
              color={activeFilters.has('GENERAL') ? '#10B981' : '#94A3B8'}
            />
            <Text
              className={`font-inter-bold text-[10px] uppercase ${
                activeFilters.has('GENERAL') ? 'text-emerald-500' : 'text-slate-400'
              }`}
            >
              General
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Events Feed List */}
      {filteredEvents.length === 0 ? (
        <View className="flex-1 items-center justify-center py-10">
          <Text className="font-inter text-xs text-slate-400 italic">No events recorded for active filters.</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-3 py-2">
          <View className="space-y-2">
            {filteredEvents.map((evt) => {
              const timeLabel = formatMatchTime(evt.eventData?.elapsedMS);
              const title = getDisplayEventTitle(evt);
              const detailText = getEventDetailText(evt);
              const points = evt.eventData?.points;
              const period = evt.eventData?.period;
              const isTimingEvent = evt.type === 'TIME' || evt.type === 'STATUS';
              const category = getEventCategory(evt);
              const barClass = getCategoryAccentBarClass(category, evt, homeParticipantId, awayParticipantId);

              // Undo window countdown calculation
              const evtTime = evt.timestamp ? new Date(evt.timestamp).getTime() : now;
              const age = now - evtTime;
              const inUndoWindow = age >= 0 && age < UNDO_WINDOW_MS;
              const remainingSecs = Math.max(0, Math.ceil((UNDO_WINDOW_MS - age) / 1000));

              return (
                <View
                  key={evt.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-2.5 flex-row items-center justify-between shadow-sm gap-2.5"
                >
                  {/* Category Indicator Accent Bar */}
                  <View className={`w-1 self-stretch rounded-full ${barClass}`} />

                  <View className="flex-row items-center gap-2.5 flex-1 pr-1">
                    {/* Timestamp & Period Badge */}
                    <View className="bg-brand-orange/10 px-2 py-1 rounded-md border border-brand-orange/20 items-center min-w-[52px]">
                      <Text className="font-orbitron-bold text-[10px] text-brand-orange">{timeLabel}</Text>
                      {period && (
                        <Text className="font-inter text-[8px] text-slate-400 uppercase tracking-tighter mt-0.5">
                          {period}
                        </Text>
                      )}
                    </View>

                    {/* Title & Details / Reasons */}
                    <View className="flex-1 min-w-0">
                      <Text className="font-inter-bold text-xs text-slate-800 dark:text-white truncate">
                        {title} {points ? `(+${points})` : ''}
                      </Text>
                      {detailText ? (
                        <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 mt-0.5" numberOfLines={1}>
                          {detailText}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {canManage && !isTimingEvent && (
                    <TouchableOpacity
                      onPress={() => setUndoEventTarget(evt)}
                      className={`flex-row items-center gap-1 px-2 py-1 rounded-lg border ${
                        inUndoWindow
                          ? 'bg-amber-500/10 border-amber-500/40'
                          : 'bg-red-500/10 border-red-500/20'
                      }`}
                    >
                      <Ionicons
                        name="arrow-undo-outline"
                        size={14}
                        color={inUndoWindow ? '#F59E0B' : '#EF4444'}
                      />
                      {inUndoWindow && (
                        <Text className="font-mono font-bold text-[10px] text-amber-500 animate-pulse">
                          {remainingSecs}s
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      {undoEventTarget && (
        <ConfirmationModal
          isOpen={!!undoEventTarget}
          onClose={() => setUndoEventTarget(null)}
          title="Undo Event?"
          description={`Are you sure you want to undo "${getDisplayEventTitle(undoEventTarget)}"? This will reverse any score changes.`}
          confirmText="Undo Event"
          cancelText="Cancel"
          onConfirm={handleConfirmUndo}
          variant="danger"
        />
      )}
    </View>
  );
}
