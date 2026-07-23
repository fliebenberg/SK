import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { wsService } from '../../../services/websocket';
import { COLORS } from '../../../constants/Colors';

interface TeamRosterPanelProps {
  gameId: string;
  participantId: string;
}

export function TeamRosterPanel({ participantId }: TeamRosterPanelProps) {
  const [roster, setRoster] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
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
    return () => {
      isMounted = false;
    };
  }, [participantId]);

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

  return (
    <ScrollView className="flex-1 px-2 py-2">
      <View className="flex-row flex-wrap gap-2">
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
                  {item.position || '?'}
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
    </ScrollView>
  );
}
