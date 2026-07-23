import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { useSharedDynamicScoring } from './DynamicScoringContext';
import { wsService } from '../../../services/websocket';
import { RosterGrid } from './ScoringActionButton';
import { Button } from '../../Button';
import { COLORS } from '../../../constants/Colors';

export function DynamicScoringDialog() {
  const { game, scoringState, cancelDynamicFlow, submitEvent } = useSharedDynamicScoring();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | undefined>(undefined);
  const [roster, setRoster] = useState<any[]>([]);

  const isVisible = scoringState.status === 'ACTIVE';
  const side = scoringState.side;
  const participantId = side === 'home' ? game.participants?.[0]?.id : game.participants?.[1]?.id;

  useEffect(() => {
    if (participantId && isVisible) {
      wsService.emit('get_data', { type: 'game_roster', id: participantId }, (data: any[]) => {
        if (data) setRoster(data);
      });
    }
  }, [participantId, isVisible]);

  if (!isVisible) return null;

  const handleConfirm = () => {
    submitEvent({
      playerId: selectedPlayerId,
      side,
    });
    setSelectedPlayerId(undefined);
  };

  return (
    <Modal visible={isVisible} transparent={true} animationType="fade" onRequestClose={cancelDynamicFlow}>
      <View className="flex-1 bg-black/60 justify-center px-6">
        <View className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-white/5 shadow-xl space-y-4 max-h-[80%]">
          <Text className="font-orbitron-bold text-base text-slate-850 dark:text-white uppercase tracking-wider text-center">
            Record Event: {scoringState.templateId?.toUpperCase()} ({side?.toUpperCase()})
          </Text>

          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400">
            Select Player (Optional):
          </Text>

          <ScrollView className="flex-1 max-h-64 my-2">
            <RosterGrid roster={roster} onSelect={setSelectedPlayerId} selectedPlayerId={selectedPlayerId} />
          </ScrollView>

          <View className="flex-row gap-3 pt-2">
            <Button title="Cancel" variant="secondary" onPress={cancelDynamicFlow} className="flex-1 py-2.5 rounded-lg" />
            <Button title="Confirm Event" onPress={handleConfirm} className="flex-1 py-2.5 rounded-lg" />
          </View>
        </View>
      </View>
    </Modal>
  );
}
