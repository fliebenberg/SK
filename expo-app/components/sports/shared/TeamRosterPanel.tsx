import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { wsService } from '../../../services/websocket';
import { COLORS } from '../../../constants/Colors';

interface TeamRosterPanelProps {
  gameId: string;
  participantId: string;
}

// Standard rugby position field coordinates (percentage x, y on field)
const PITCH_POSITIONS: Record<string, { top: string; left: string }> = {
  '1': { top: '10%', left: '20%' },  // Loosehead Prop
  '2': { top: '10%', left: '50%' },  // Hooker
  '3': { top: '10%', left: '80%' },  // Tighthead Prop
  '4': { top: '22%', left: '35%' },  // Lock
  '5': { top: '22%', left: '65%' },  // Lock
  '6': { top: '34%', left: '20%' },  // Blindside Flanker
  '8': { top: '34%', left: '50%' },  // Number 8
  '7': { top: '34%', left: '80%' },  // Openside Flanker
  '9': { top: '48%', left: '38%' },  // Scrum-half
  '10': { top: '56%', left: '50%' }, // Fly-half
  '11': { top: '68%', left: '15%' }, // Left Wing
  '12': { top: '68%', left: '40%' }, // Inside Center
  '13': { top: '68%', left: '65%' }, // Outside Center
  '14': { top: '68%', left: '85%' }, // Right Wing
  '15': { top: '85%', left: '50%' }, // Full-back
};

export function TeamRosterPanel({ gameId, participantId }: TeamRosterPanelProps) {
  const [roster, setRoster] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'pitch'>('list');

  useEffect(() => {
    let isMounted = true;
    const room = gameId ? `game:${gameId}` : null;
    const unsubscribeRoom = room ? wsService.subscribeToRoom(room) : () => {};

    wsService.emit('get_data', { type: 'game_roster', id: participantId }, (data: any[]) => {
      if (isMounted) {
        const sorted = [...(data || [])].sort((a, b) => {
          const posA = parseInt(a.position) || 999;
          const posB = parseInt(b.position) || 999;
          return posA - posB;
        });
        setRoster(sorted);
        setIsLoading(false);
      }
    });

    const handleUpdate = (evt: { type: string; data: any }) => {
      if (!evt) return;
      if (evt.type === 'GAME_ROSTER_UPDATED' && evt.data?.participantId === participantId) {
        if (isMounted && Array.isArray(evt.data.items)) {
          const sorted = [...evt.data.items].sort((a, b) => {
            const posA = parseInt(a.position) || 999;
            const posB = parseInt(b.position) || 999;
            return posA - posB;
          });
          setRoster(sorted);
        }
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      isMounted = false;
      unsubscribeRoom();
      wsService.off('update', handleUpdate);
    };
  }, [gameId, participantId]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center py-10">
        <ActivityIndicator size="small" color={COLORS.brand.orange} />
        <Text className="font-orbitron text-xs text-slate-400 mt-2 uppercase tracking-widest">
          Loading Roster...
        </Text>
      </View>
    );
  }

  if (roster.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-10">
        <Text className="font-inter text-xs text-slate-400 italic">
          No players registered for this team.
        </Text>
      </View>
    );
  }

  const startingLineup = roster.filter((r) => !r.isReserve && r.position);
  const reserves = roster.filter((r) => r.isReserve);

  return (
    <View className="flex-1">
      {/* View Mode Toggle Header */}
      <View className="flex-row items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-white/5">
        <Text className="font-orbitron-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
          Match Roster ({roster.length})
        </Text>
        <View className="flex-row bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-white/10">
          <TouchableOpacity
            onPress={() => setViewMode('list')}
            className={`flex-row items-center px-2.5 py-1 rounded-md gap-1 ${
              viewMode === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm' : ''
            }`}
          >
            <Ionicons
              name="list"
              size={12}
              color={viewMode === 'list' ? COLORS.brand.orange : '#94A3B8'}
            />
            <Text
              className={`font-orbitron-bold text-[10px] ${
                viewMode === 'list'
                  ? 'text-brand-orange'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              List
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewMode('pitch')}
            className={`flex-row items-center px-2.5 py-1 rounded-md gap-1 ${
              viewMode === 'pitch' ? 'bg-white dark:bg-slate-700 shadow-sm' : ''
            }`}
          >
            <Ionicons
              name="football-outline"
              size={12}
              color={viewMode === 'pitch' ? COLORS.brand.orange : '#94A3B8'}
            />
            <Text
              className={`font-orbitron-bold text-[10px] ${
                viewMode === 'pitch'
                  ? 'text-brand-orange'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Pitch
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-2 py-2">
        {viewMode === 'list' ? (
          /* LIST VIEW */
          <View className="flex-row flex-wrap gap-2 pb-6">
            {roster.map((item) => {
              const nameParts = (item.name || item.orgProfileName || 'Player').split(' ');
              const firstName = nameParts[0];
              const lastName = nameParts.slice(1).join(' ');

              return (
                <View
                  key={item.orgProfileId || item.id}
                  className="w-[48%] bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-3 flex-row items-center gap-3 shadow-sm"
                >
                  <View className="w-10 h-10 rounded-full bg-brand-orange/10 border border-brand-orange/20 items-center justify-center">
                    <Text className="font-orbitron-bold text-xs text-brand-orange">
                      {item.jerseyNumber || item.position || '?'}
                    </Text>
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="font-inter-bold text-xs text-slate-800 dark:text-white truncate" numberOfLines={1}>
                      {firstName}
                    </Text>
                    <Text className="font-inter text-[10px] text-slate-400 truncate" numberOfLines={1}>
                      {lastName || 'Player'}
                    </Text>
                  </View>
                  {item.isReserve && (
                    <View className="bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      <Text className="font-orbitron-bold text-[8px] text-amber-500">RES</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          /* PITCH DIAGRAM VIEW */
          <View className="space-y-4 pb-6">
            {/* Visual Field Layout */}
            <View className="relative w-full h-[460px] bg-emerald-800/90 dark:bg-emerald-950 rounded-2xl border-2 border-emerald-600/40 overflow-hidden shadow-inner p-2">
              {/* Field Markings */}
              <View className="absolute inset-x-0 top-1/2 border-b-2 border-emerald-400/30" />
              <View className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full border-2 border-emerald-400/20" />
              <View className="absolute inset-x-8 top-0 h-14 border-b-2 border-x-2 border-emerald-400/20" />
              <View className="absolute inset-x-8 bottom-0 h-14 border-t-2 border-x-2 border-emerald-400/20" />

              {/* Pitch Player Markers */}
              {startingLineup.map((player) => {
                const posKey = String(player.position);
                const coords = PITCH_POSITIONS[posKey] || { top: '50%', left: '50%' };
                const nameParts = (player.name || player.orgProfileName || 'Player').split(' ');

                return (
                  <View
                    key={player.orgProfileId || player.id}
                    style={{ top: coords.top as any, left: coords.left as any, transform: [{ translateX: -24 }, { translateY: -24 }] }}
                    className="absolute items-center z-10"
                  >
                    <View className="w-10 h-10 rounded-full bg-brand-orange border-2 border-white items-center justify-center shadow-lg">
                      <Text className="font-orbitron-bold text-xs text-white">
                        {player.jerseyNumber || player.position}
                      </Text>
                    </View>
                    <View className="bg-black/70 px-1.5 py-0.5 rounded mt-0.5 max-w-[70px]">
                      <Text className="font-inter-bold text-[9px] text-white text-center truncate" numberOfLines={1}>
                        {nameParts[nameParts.length - 1]}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Reserves Section Below Pitch */}
            {reserves.length > 0 && (
              <View className="space-y-2 mt-4">
                <Text className="font-orbitron-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider px-1">
                  Reserves ({reserves.length})
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {reserves.map((res) => {
                    const nameParts = (res.name || res.orgProfileName || 'Player').split(' ');
                    return (
                      <View
                        key={res.orgProfileId || res.id}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 flex-row items-center gap-2"
                      >
                        <View className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 items-center justify-center">
                          <Text className="font-orbitron-bold text-[10px] text-amber-500">
                            {res.jerseyNumber || 'RES'}
                          </Text>
                        </View>
                        <Text className="font-inter-bold text-xs text-slate-800 dark:text-white">
                          {nameParts.join(' ')}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
