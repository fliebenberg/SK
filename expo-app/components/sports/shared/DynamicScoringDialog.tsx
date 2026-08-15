import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, useWindowDimensions, ActivityIndicator } from 'react-native';
import { useSharedDynamicScoring } from './DynamicScoringContext';
import { wsService } from '../../../services/websocket';
import { RosterGrid } from './ScoringActionButton';
import { Button } from '../../Button';
import { Tabs } from '../../Tabs';
import { CounterStep } from './CounterStep';
import { Ionicons } from '@expo/vector-icons';
import { ActionStep, ActionStepType, TemplateScreen, findStep, getOutcomes, getScreens, hasStep } from '@sk/shared';
import { ConfirmationModal } from '../../ConfirmationModal';
import { COLORS } from '../../../constants/Colors';

interface ReasonOption {
  id: string;
  name: string;
}

interface ReasonGroup {
  name: string;
  options: ReasonOption[];
}

interface OutcomeOption {
  id: string;
  name: string;
  variant?: 'primary' | 'success' | 'danger' | 'warning';
  triggerEventId?: string;
}

export function DynamicScoringDialog() {
  const { height: screenHeight } = useWindowDimensions();
  const maxScrollHeight = Math.max(screenHeight - 220, 160);

  const {
    game,
    homeTeam,
    awayTeam,
    homeRoster,
    awayRoster,
    isLoadingRosters,
    templates,
    scoringState,
    cancelDynamicFlow,
    submitEvent,
    removeGameEvent,
  } = useSharedDynamicScoring();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | undefined>(undefined);
  const [selectedReason, setSelectedReason] = useState<string | undefined>(undefined);
  const [selectedOutcome, setSelectedOutcome] = useState<string | undefined>(undefined);
  const [scrumResets, setScrumResets] = useState<number>(0);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isConfirmingUndo, setIsConfirmingUndo] = useState<boolean>(false);

  const isVisible = scoringState.status === 'ACTIVE';
  const isEditing = !!scoringState.editingId;
  const side = scoringState.side;
  const templateId = scoringState.templateId || '';
  const template = templates.find((t) => t.id === templateId);

  const participant = side === 'home' ? game.participants?.[0] : game.participants?.[1];
  const participantId = participant?.id;

  const roster = side === 'home' ? homeRoster : awayRoster;
  const isLoadingRoster = isLoadingRosters;

  // The dialog is the one place that cares how a template's steps are grouped: each screen is
  // a top-level step, or a GROUP rendered as a single screen. Every other question about the
  // template ("does it collect a player?") goes through the helpers, which ignore grouping.
  const screens = getScreens(template);
  const activeScreen: TemplateScreen | undefined = screens[currentStep];

  // Parse Reason Groups dynamically
  const reasonGroups: ReasonGroup[] = (findStep(template, ActionStepType.REASON_SELECTION)?.reasons || []).map(
    (rg: any) => ({
      name: rg.name || 'General',
      options: (rg.options || []).map((o: any) =>
        typeof o === 'string' ? { id: o, name: o } : { id: o.id || o.name, name: o.name || o.id }
      ),
    })
  );

  // Parse Outcome Options dynamically
  const outcomes: OutcomeOption[] = getOutcomes(template).map((o) => ({
    id: o.id,
    name: o.name || o.id,
    variant: o.variant as OutcomeOption['variant'],
    triggerEventId: o.triggerEventId,
  }));

  const hasWidget = hasStep(template, ActionStepType.CUSTOM_WIDGET);
  const isNextActionStep = outcomes.some((o) => !!o.triggerEventId);

  /** A step's own name when the spec supplies one, else a default for its kind. */
  const stepLabel = (step: ActionStep): string => {
    if (step.name) return step.name;
    switch (step.type) {
      case ActionStepType.PLAYER_SELECTION:
        return 'Player';
      case ActionStepType.REASON_SELECTION:
        return 'Infringement';
      case ActionStepType.OUTCOME_SELECTION:
        return isNextActionStep ? 'Next Action' : 'Outcome';
      default:
        return 'Details';
    }
  };

  const stepItems = screens.map((screen, index) => ({
    key: index.toString(),
    label: `${index + 1}. ${screen.name || screen.steps.map(stepLabel).join(' & ')}`,
  }));

  const totalSteps = stepItems.length;

  useEffect(() => {
    if (isVisible) {
      setIsConfirmingUndo(false);
      const init = scoringState.initialData || {};
      setSelectedPlayerId(init.playerId || init.actorOrgProfileId);
      setSelectedReason(init.reason);
      setSelectedOutcome(init.outcome);
      setScrumResets(init.scrumResets || 0);

      // Callers (e.g. the event feed's "missing detail" chips) name a step type rather than a
      // position, so a grouped step resolves to the screen that contains it.
      if (init.initialStepType) {
        const targetIndex = screens.findIndex((screen) =>
          screen.steps.some((step) => step.type === init.initialStepType)
        );
        if (targetIndex >= 0) {
          setCurrentStep(targetIndex);
          return;
        }
      }
      setCurrentStep(0);
    }
  }, [isVisible, templateId, side, scoringState.initialData]);

  if (!isVisible || !template) return null;

  const homeTeamName = homeTeam?.name || 'Home Team';
  const awayTeamName = awayTeam?.name || 'Away Team';
  const teamName = side === 'home' ? homeTeamName : awayTeamName;

  const handleConfirm = () => {
    const selectedOutcomeObj = outcomes.find((o) => o.id === selectedOutcome);
    const triggerEventId = selectedOutcomeObj?.triggerEventId;

    submitEvent({
      playerId: selectedPlayerId,
      reason: selectedReason,
      outcome: selectedOutcome,
      triggerEventId,
      scrumResets: hasWidget ? scrumResets : undefined,
      side,
    });
    setSelectedPlayerId(undefined);
    setSelectedReason(undefined);
    setSelectedOutcome(undefined);
    setScrumResets(0);
  };

  const handleUndo = () => {
    setIsConfirmingUndo(true);
  };

  const handleConfirmUndo = () => {
    setIsConfirmingUndo(false);
    if (scoringState.editingId) {
      removeGameEvent(scoringState.editingId);
    }
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

  /** Renders one step. Which steps share a screen is the template's call, not this file's. */
  const renderStep = (step: ActionStep) => {
    switch (step.type) {
      case ActionStepType.PLAYER_SELECTION:
        return (
          <View className="gap-2 my-2" style={{ maxHeight: maxScrollHeight }}>
            <View className="flex-row items-center justify-between flex-shrink-0">
              <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Select Player (Optional):
              </Text>

              {/* SINGLE READ-ONLY TEAM BADGE */}
              <View className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-white/10">
                <Text className="font-inter-bold text-[10px] text-brand-orange uppercase">
                  {teamName}
                </Text>
              </View>
            </View>

            {isLoadingRoster ? (
              <View className="py-8 items-center justify-center">
                <ActivityIndicator size="small" color={COLORS.brand.orange} />
                <Text className="font-orbitron-bold text-xs text-slate-400 mt-2 uppercase tracking-wider">
                  Loading Roster...
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: maxScrollHeight }} className="my-1" showsVerticalScrollIndicator={true}>
                <RosterGrid roster={roster} onSelect={setSelectedPlayerId} selectedPlayerId={selectedPlayerId} />
              </ScrollView>
            )}
          </View>
        );

      case ActionStepType.REASON_SELECTION:
        return (
          <View className="gap-2 my-2" style={{ maxHeight: maxScrollHeight }}>
            <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider flex-shrink-0">
              Select Infringement / Detail:
            </Text>

            <ScrollView style={{ maxHeight: maxScrollHeight }} className="my-1" showsVerticalScrollIndicator={true}>
              <View className="gap-3">
                {reasonGroups.map((group) => (
                  <View key={group.name} className="gap-1.5">
                    <View className="pb-1 border-b border-slate-200 dark:border-white/10">
                      <Text className="font-orbitron-bold text-[10px] uppercase text-brand-orange tracking-widest">
                        {group.name}
                      </Text>
                    </View>
                    <View className="flex-row flex-wrap gap-2 pt-0.5">
                      {group.options.map((rOpt) => {
                        const isSelected = selectedReason === rOpt.id || selectedReason === rOpt.name;
                        return (
                          <TouchableOpacity
                            key={rOpt.id}
                            onPress={() => setSelectedReason(rOpt.id)}
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
                              {rOpt.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        );

      case ActionStepType.CUSTOM_WIDGET:
        return (
          <View className="my-3 flex-shrink-0">
            <CounterStep label={step.name || 'Count'} value={scrumResets} onChange={setScrumResets} />
          </View>
        );

      case ActionStepType.OUTCOME_SELECTION:
        return (
          <View className="gap-2 my-2" style={{ maxHeight: maxScrollHeight }}>
            <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider flex-shrink-0">
              {isNextActionStep ? 'Select Next Action (Optional):' : 'Select Outcome (Optional):'}
            </Text>

            <ScrollView style={{ maxHeight: maxScrollHeight }} className="my-1" showsVerticalScrollIndicator={true}>
              <View className="flex-row flex-wrap gap-2.5 py-2">
                {outcomes.map((opt) => {
                  const isSelected = selectedOutcome === opt.id;
                  const isSuccess = opt.variant === 'success';
                  const isWarning = opt.variant === 'warning';
                  const isDanger = opt.variant === 'danger';

                  return (
                    <TouchableOpacity
                      key={opt.id}
                      onPress={() => setSelectedOutcome(opt.id)}
                      className={`px-4 py-3 rounded-xl border flex-row items-center gap-2 ${
                        isSelected
                          ? 'bg-brand-orange border-brand-orange'
                          : isSuccess
                          ? 'bg-emerald-500/10 border-emerald-500/30'
                          : isWarning
                          ? 'bg-amber-500/10 border-amber-500/30'
                          : isDanger
                          ? 'bg-red-500/10 border-red-500/30'
                          : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'
                      }`}
                    >
                      <Text
                        className={`font-inter-bold text-xs ${
                          isSelected
                            ? 'text-white'
                            : isSuccess
                            ? 'text-emerald-500'
                            : isWarning
                            ? 'text-amber-500'
                            : isDanger
                            ? 'text-red-500'
                            : 'text-slate-800 dark:text-white'
                        }`}
                      >
                        {opt.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Modal visible={isVisible} transparent={true} animationType="fade" onRequestClose={cancelDynamicFlow}>
        <View className="flex-1 bg-black/60 justify-center items-center px-3 py-4">
          <View
            className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-white/10 shadow-lg flex-col justify-between"
            style={{ maxHeight: Math.max(screenHeight - 32, 320) }}
          >
            {/* DIALOG HEADER & STEP NAVIGATION */}
            <View className="gap-2 flex-shrink-0">
              <View className={`flex-row items-center justify-between ${totalSteps > 1 ? '' : 'pb-3 border-b border-slate-200 dark:border-white/10'}`}>
                <View>
                  <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white uppercase">
                    {isEditing ? `Edit: ${template.name}` : template.name}
                  </Text>

                  <Text className="font-inter text-xs text-brand-orange uppercase font-bold tracking-wider mt-0.5">
                    {teamName}
                  </Text>
                </View>
                <TouchableOpacity onPress={cancelDynamicFlow} className="p-1">
                  <Ionicons name="close" size={24} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {/* STEPPER PROGRESS TABS */}
              {totalSteps > 1 && (
                <View className="pb-3 pt-1">
                  <Tabs<string>
                    items={stepItems.map((item) => ({ key: item.key, label: item.label }))}
                    activeKey={currentStep.toString()}
                    onChange={(key) => setCurrentStep(parseInt(key, 10))}
                    variant="underline"
                  />
                </View>
              )}
            </View>

            {/* NO STEPS REQUIRED (e.g. Penalty Try) */}
            {screens.length === 0 && (
              <View className="py-6 px-4 items-center justify-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-white/10 my-3 gap-1">
                <Ionicons name="flash-outline" size={32} color={COLORS.brand.orange} />
                <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white uppercase tracking-wider mt-1">
                  {template.name}
                </Text>
                <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 text-center">
                  Awarded to {teamName}
                  {template.points ? ` (${template.points} Points)` : ''}. No further details are required.
                </Text>
              </View>
            )}

            {/* THE ACTIVE SCREEN: every step the spec puts on it, in spec order */}
            {activeScreen?.steps.map((step, index) => (
              <React.Fragment key={`${currentStep}-${index}`}>{renderStep(step)}</React.Fragment>
            ))}

            {/* DIALOG ACTION FOOTER */}
            <View className="flex-row gap-2 pt-3 border-t border-slate-200 dark:border-white/10 flex-shrink-0 mt-auto">
              <Button title="Cancel" variant="ghost" onPress={cancelDynamicFlow} className="flex-1 py-2.5 rounded-xl" />

              {isEditing ? (
                <>
                  <Button title="Undo Event" variant="danger" onPress={handleUndo} className="px-3 py-2.5 rounded-xl" />
                  <Button title="Save Changes" variant="primary" onPress={handleConfirm} className="flex-1 py-2.5 rounded-xl" />
                </>
              ) : (
                <>
                  {currentStep < totalSteps - 1 && (
                    <Button title="Next Step" variant="secondary" onPress={handleNextStep} className="flex-1 py-2.5 rounded-xl" />
                  )}
                  <Button title="Confirm Event" variant="primary" onPress={handleConfirm} className="flex-1 py-2.5 rounded-xl" />
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmationModal
        isOpen={isConfirmingUndo}
        onClose={() => setIsConfirmingUndo(false)}
        title="Undo Event"
        description="Are you sure you want to undo this event? This action will remove the event from match stats and log history."
        onConfirm={handleConfirmUndo}
        confirmText="Undo Event"
        cancelText="Cancel"
        variant="danger"
      />
    </>
  );
}
