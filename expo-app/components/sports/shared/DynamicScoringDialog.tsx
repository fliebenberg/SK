import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { useSharedDynamicScoring } from './DynamicScoringContext';
import { wsService } from '../../../services/websocket';
import { RosterGrid } from './ScoringActionButton';
import { Button } from '../../Button';
import { Ionicons } from '@expo/vector-icons';

const REASON_OPTIONS: { [key: string]: string[] } = {
  yellow_card: ['High Tackle', 'Dangerous Play', 'Repeated Infringement', 'Professional Foul', 'Unsportsmanlike Conduct'],
  red_card: ['Dangerous Tackle / Tip Tackle', 'Striking / Punching', 'Second Yellow Card', 'Abuse of Official', 'Serious Foul Play'],
  penalty_awarded: ['Offside', 'High Tackle', 'Not Releasing', 'Collapsing Scrum', 'Illegal Binding', 'In From the Side'],
  free_kick: ['Early Push in Scrum', 'Lineout Delay', 'Not Straight', 'Foot Up'],
  scrum: ['Knock-on', 'Forward Pass', 'Unplayable Maul', 'Accidental Offside'],
  lineout: ['Ball Out of Bounds', 'Touchjudge Signal', 'Direct Touch Kick'],
};

export function DynamicScoringDialog() {
  const { game, templates, scoringState, cancelDynamicFlow, submitEvent } = useSharedDynamicScoring();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | undefined>(undefined);
  const [selectedReason, setSelectedReason] = useState<string | undefined>(undefined);
  const [customNotes, setCustomNotes] = useState<string>('');
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [roster, setRoster] = useState<any[]>([]);

  const isVisible = scoringState.status === 'ACTIVE';
  const side = scoringState.side;
  const templateId = scoringState.templateId || '';
  const template = templates.find((t) => t.id === templateId);
  const participantId = side === 'home' ? game.participants?.[0]?.id : game.participants?.[1]?.id;

  const reasons = REASON_OPTIONS[templateId] || [];
  const hasReasons = reasons.length > 0;

  // Step 0: Player Selection
  // Step 1: Reason Selection (if applicable)
  const totalSteps = hasReasons ? 2 : 1;

  useEffect(() => {
    if (participantId && isVisible) {
      wsService.emit('get_data', { type: 'game_roster', id: participantId }, (data: any[]) => {
        if (data) setRoster(data);
      });
    }
  }, [participantId, isVisible]);

  useEffect(() => {
    if (isVisible) {
      setCurrentStep(0);
      setSelectedPlayerId(undefined);
      setSelectedReason(undefined);
      setCustomNotes('');
    }
  }, [isVisible, templateId]);

  if (!isVisible || !template) return null;

  const handleConfirm = () => {
    submitEvent({
      playerId: selectedPlayerId,
      reason: selectedReason,
      notes: customNotes,
      side,
    });
    setSelectedPlayerId(undefined);
    setSelectedReason(undefined);
    setCustomNotes('');
  };

  const handleNextStep = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleConfirm();
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <Modal visible={isVisible} transparent={true} animationType="fade" onRequestClose={cancelDynamicFlow}>
      <View className="flex-1 bg-black/60 justify-center px-5">
        <View className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-white/10 shadow-2xl space-y-4 max-h-[85%]">
          {/* DIALOG HEADER */}
          <View className="flex-row items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
            <View>
              <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white uppercase">
                {template.name}
              </Text>

              <Text className="font-inter text-xs text-brand-orange uppercase font-bold tracking-wider">
                {side?.toUpperCase()} TEAM
              </Text>
            </View>
            <TouchableOpacity onPress={cancelDynamicFlow} className="p-1">
              <Ionicons name="close" size={24} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* STEPPER PROGRESS BADGES */}
          {totalSteps > 1 && (
            <View className="flex-row items-center justify-center gap-2 py-1">
              <TouchableOpacity
                onPress={() => setCurrentStep(0)}
                className={`px-3 py-1 rounded-full border ${
                  currentStep === 0
                    ? 'bg-brand-orange border-brand-orange'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-white/10'
                }`}
              >
                <Text
                  className={`font-orbitron-bold text-[10px] uppercase ${
                    currentStep === 0 ? 'text-white' : 'text-slate-500'
                  }`}
                >
                  1. Player
                </Text>
              </TouchableOpacity>

              <Ionicons name="chevron-forward" size={14} color="#94A3B8" />

              <TouchableOpacity
                onPress={() => setCurrentStep(1)}
                className={`px-3 py-1 rounded-full border ${
                  currentStep === 1
                    ? 'bg-brand-orange border-brand-orange'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-white/10'
                }`}
              >
                <Text
                  className={`font-orbitron-bold text-[10px] uppercase ${
                    currentStep === 1 ? 'text-white' : 'text-slate-500'
                  }`}
                >
                  2. Details & Reason
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 0: PLAYER SELECTION */}
          {currentStep === 0 && (
            <View className="space-y-2">
              <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Select Involved Player (Optional):
              </Text>
              <ScrollView className="max-h-56 my-1">
                <RosterGrid roster={roster} onSelect={setSelectedPlayerId} selectedPlayerId={selectedPlayerId} />
              </ScrollView>
            </View>
          )}

          {/* STEP 1: REASON / INFRINGEMENT / DETAILS SELECTION */}
          {currentStep === 1 && (
            <View className="space-y-3">
              <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Select Infringement / Detail:
              </Text>
              <ScrollView className="max-h-48 my-1">
                <View className="flex-row flex-wrap gap-2">
                  {reasons.map((r) => {
                    const isSelected = selectedReason === r;
                    return (
                      <TouchableOpacity
                        key={r}
                        onPress={() => setSelectedReason(r)}
                        className={`px-3 py-2 rounded-xl border ${
                          isSelected
                            ? 'bg-brand-orange border-brand-orange'
                            : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'
                        }`}
                      >
                        <Text
                          className={`font-inter-bold text-xs ${
                            isSelected ? 'text-white' : 'text-slate-800 dark:text-white'
                          }`}
                        >
                          {r}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider mt-2">
                Additional Notes (Optional):
              </Text>
              <TextInput
                value={customNotes}
                onChangeText={setCustomNotes}
                placeholder="e.g. 22m line, ref warning..."
                placeholderTextColor="#94A3B8"
                className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-white/10 rounded-xl px-3 py-2 text-xs font-inter text-slate-900 dark:text-white"
              />
            </View>
          )}

          {/* DIALOG ACTION FOOTER */}
          <View className="flex-row gap-3 pt-3 border-t border-slate-200 dark:border-white/10">
            {currentStep > 0 ? (
              <Button title="Back" variant="secondary" onPress={handlePrevStep} className="flex-1 py-2.5 rounded-xl" />
            ) : (
              <Button title="Cancel" variant="secondary" onPress={cancelDynamicFlow} className="flex-1 py-2.5 rounded-xl" />
            )}

            {currentStep < totalSteps - 1 ? (
              <Button title="Next Step" onPress={handleNextStep} className="flex-1 py-2.5 rounded-xl" />
            ) : (
              <Button title="Confirm Event" onPress={handleConfirm} className="flex-1 py-2.5 rounded-xl" />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
