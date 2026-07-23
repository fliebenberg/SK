import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { GameEvent } from '@sk/types';
import { wsService } from '../../../services/websocket';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/Colors';
import { ConfirmationModal } from '../../ConfirmationModal';

interface EventLogFeedProps {
  gameId: string;
  canManage?: boolean;
}

export function EventLogFeed({ gameId, canManage = false }: EventLogFeedProps) {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [undoEventTarget, setUndoEventTarget] = useState<GameEvent | null>(null);

  const fetchEvents = () => {
    wsService.emit('get_data', { type: 'game_events', id: gameId }, (data: GameEvent[]) => {
      if (data) setEvents([...data].reverse());
      setIsLoading(false);
    });
  };

  useEffect(() => {
    setIsLoading(true);
    fetchEvents();

    const handleUpdate = (evt: { type: string; data: any }) => {
      if (evt.type === 'GAME_EVENT_ADDED' && evt.data) {
        setEvents(prev => [evt.data, ...prev.filter(e => e.id !== evt.data.id)]);
      } else if (evt.type === 'GAME_EVENT_UPDATED' && evt.data) {
        setEvents(prev => prev.map(e => e.id === evt.data.id ? { ...e, ...evt.data } : e));
      } else if (evt.type === 'GAME_EVENT_REMOVED' && evt.data) {
        setEvents(prev => prev.filter(e => e.id !== (evt.data.id || evt.data.eventId)));
      } else if (evt.type === 'GAME_EVENTS_SYNC' && Array.isArray(evt.data)) {
        setEvents(evt.data);
      }
    };

    wsService.on('update', handleUpdate);
    return () => {
      wsService.off('update', handleUpdate);
    };
  }, [gameId]);

  const handleConfirmUndo = () => {
    if (!undoEventTarget) return;
    wsService.emit(
      'action',
      {
        type: 'UNDO_GAME_EVENT',
        payload: { gameId, eventId: undoEventTarget.id, initiatorId: null },
      },
      (res: any) => {
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

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center py-10">
        <ActivityIndicator size="small" color={COLORS.brand.orange} />
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-10">
        <Text className="font-inter text-xs text-slate-400 italic">No events recorded yet.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 px-3 py-2">
        <View className="space-y-2">
          {events.map((evt) => {
            const timeLabel = formatMatchTime(evt.eventData?.elapsedMS);
            const subType = evt.subType || evt.type || 'Event';
            const reason = evt.eventData?.reason;
            const points = evt.eventData?.points;

            return (
              <View
                key={evt.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-3 flex-row items-center justify-between shadow-sm"
              >
                <View className="flex-row items-center gap-3 flex-1 pr-2">
                  <View className="bg-brand-orange/10 px-2 py-1 rounded-md border border-brand-orange/20">
                    <Text className="font-orbitron-bold text-[10px] text-brand-orange">{timeLabel}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-inter-bold text-xs text-slate-800 dark:text-white uppercase">
                      {subType} {points ? `(+${points})` : ''}
                    </Text>
                    {reason && (
                      <Text className="font-inter text-[10px] text-slate-400 mt-0.5">{reason}</Text>
                    )}
                  </View>
                </View>

                {canManage && (
                  <TouchableOpacity
                    onPress={() => setUndoEventTarget(evt)}
                    className="w-7 h-7 bg-red-500/10 rounded-lg border border-red-500/20 items-center justify-center"
                  >
                    <Ionicons name="arrow-undo-outline" size={14} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {undoEventTarget && (
        <ConfirmationModal
          isOpen={!!undoEventTarget}
          onClose={() => setUndoEventTarget(null)}
          title="Undo Event?"
          description={`Are you sure you want to undo this event (${undoEventTarget.subType || undoEventTarget.type})? This will reverse any score changes.`}
          confirmText="Undo Event"
          cancelText="Cancel"
          onConfirm={handleConfirmUndo}
          variant="danger"
        />
      )}
    </View>
  );
}
