import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, useWindowDimensions, ActivityIndicator } from 'react-native';
import { useSharedDynamicScoring } from './DynamicScoringContext';
import { wsService } from '../../../services/websocket';
import { RosterGrid } from './ScoringActionButton';
import { Button } from '../../Button';
import { Tabs } from '../../Tabs';
import { WidgetStep } from './widgets';
import { Ionicons } from '@expo/vector-icons';
import {
  ActionStep,
  ActionStepType,
  TemplateScreen,
  findSteps,
  getOutcomes,
  getReasonGroups,
  getScreens,
} from '@sk/shared';
import { ConfirmationModal } from '../../ConfirmationModal';
import { COLORS } from '../../../constants/Colors';

interface OutcomeOption {
  id: string;
  name: string;
  variant?: 'primary' | 'success' | 'danger' | 'warning';
  triggerEventId?: string;
}

/**
 * Whether the data the dialog was opened with already answers this step.
 *
 * Read off `initialData` rather than off the dialog's state, which has not been applied yet when
 * the opening screen is chosen. A `CUSTOM_WIDGET` counts as unanswered: it always holds a value,
 * so treating it as answered would let the flow skip past a counter nobody has looked at.
 */
const isSeeded = (step: ActionStep, init: any): boolean => {
  switch (step.type) {
    case ActionStepType.PLAYER_SELECTION:
      return !!(init.playerId || init.actorOrgProfileId);
    case ActionStepType.REASON_SELECTION:
      return !!init.reason;
    case ActionStepType.OUTCOME_SELECTION:
      return !!init.outcome;
    default:
      return false;
  }
};

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
  /** Widget values, keyed by each `CUSTOM_WIDGET` step's `dataKey`. */
  const [widgetValues, setWidgetValues] = useState<Record<string, any>>({});
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
  // template ("what outcomes are there?") goes through the helpers, which ignore grouping.
  //
  // The chosen reason is passed in because it can remove a screen: an infringement with no
  // individual offender drops the player prompt rather than collecting an attribution the
  // server would discard.
  const screens = getScreens(template, { reason: selectedReason });
  const activeScreen: TemplateScreen | undefined = screens[currentStep];

  const reasonGroups = getReasonGroups(template);

  const outcomes: OutcomeOption[] = getOutcomes(template).map((o) => ({
    id: o.id,
    name: o.name || o.id,
    variant: o.variant as OutcomeOption['variant'],
    triggerEventId: o.triggerEventId,
  }));

  /** Every widget the template declares, wherever it is grouped. */
  const widgetSteps = findSteps(template, ActionStepType.CUSTOM_WIDGET);
  const isNextActionStep = outcomes.some((o) => !!o.triggerEventId);

  /** What the scorer has entered for a step, or undefined if it is still unanswered. */
  const answerFor = (step: ActionStep): any => {
    switch (step.type) {
      case ActionStepType.PLAYER_SELECTION:
        return selectedPlayerId;
      case ActionStepType.REASON_SELECTION:
        return selectedReason;
      case ActionStepType.OUTCOME_SELECTION:
        return selectedOutcome;
      default:
        // A widget always holds a value, so `required` is meaningless on one.
        return true;
    }
  };

  /**
   * Steps that must be answered before the event can be saved.
   *
   * Read off the visible screens, so a step the flow skipped can never block the save.
   */
  const unansweredRequired = screens
    .flatMap((screen) => screen.steps)
    .filter((step) => step.required && !answerFor(step));
  const canSave = unansweredRequired.length === 0;

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
      setWidgetValues(
        Object.fromEntries(
          widgetSteps.filter((step) => step.dataKey).map((step) => [step.dataKey!, init[step.dataKey!]])
        )
      );

      // Derived from `init` rather than from `screens`, which still reflects the reason from the
      // event this dialog last opened — the state above has not been applied yet.
      const initialScreens = getScreens(template, { reason: init.reason });

      // Callers (e.g. the event feed's "missing detail" chips) name a step type rather than a
      // position, so a grouped step resolves to the screen that contains it.
      if (init.initialStepType) {
        const targetIndex = initialScreens.findIndex((screen) =>
          screen.steps.some((step) => step.type === init.initialStepType)
        );
        if (targetIndex >= 0) {
          setCurrentStep(targetIndex);
          return;
        }
      }

      // A chained follow-up opens with whatever its parent's outcome seeded — a scrum awarded from
      // a free kick already knows its reason. Opening on that screen would ask the scorer for
      // something the chain has just answered, so a new event starts at the first screen still
      // needing an answer. Editing always starts at the beginning: every screen is filled in then,
      // and the scorer opened the dialog to find one of them.
      if (!scoringState.editingId) {
        const firstUnanswered = initialScreens.findIndex((screen) =>
          screen.steps.some((step) => !isSeeded(step, init))
        );
        setCurrentStep(firstUnanswered > 0 ? firstUnanswered : 0);
        return;
      }
      setCurrentStep(0);
    }
  }, [isVisible, templateId, side, scoringState.initialData]);

  // Choosing a reason can remove a later screen, which would otherwise leave `currentStep`
  // pointing past the end and the dialog rendering nothing.
  useEffect(() => {
    if (screens.length > 0 && currentStep > screens.length - 1) {
      setCurrentStep(screens.length - 1);
    }
  }, [screens.length, currentStep]);

  if (!isVisible || !template) return null;

  const homeTeamName = homeTeam?.name || 'Home Team';
  const awayTeamName = awayTeam?.name || 'Away Team';
  const teamName = side === 'home' ? homeTeamName : awayTeamName;

  const handleConfirm = () => {
    if (!canSave) return;

    const selectedOutcomeObj = outcomes.find((o) => o.id === selectedOutcome);
    const triggerEventId = selectedOutcomeObj?.triggerEventId;

    // Each widget writes to the key its step declares, so two widgets on one template cannot
    // collide and the stored field name outlives the widget that produced it.
    const widgetData: Record<string, any> = {};
    for (const step of widgetSteps) {
      if (step.dataKey) widgetData[step.dataKey] = widgetValues[step.dataKey];
    }

    submitEvent({
      playerId: selectedPlayerId,
      reason: selectedReason,
      outcome: selectedOutcome,
      triggerEventId,
      ...widgetData,
      side,
    });
    setSelectedPlayerId(undefined);
    setSelectedReason(undefined);
    setSelectedOutcome(undefined);
    setWidgetValues({});
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

  /** Steps are optional unless the spec says otherwise, and the prompt should say which. */
  const suffix = (step: ActionStep) => (step.required ? '(Required)' : '(Optional)');

  /** Renders one step. Which steps share a screen is the template's call, not this file's. */
  const renderStep = (step: ActionStep) => {
    switch (step.type) {
      case ActionStepType.PLAYER_SELECTION:
        return (
          <View className="gap-2 my-2" style={{ maxHeight: maxScrollHeight }}>
            <View className="flex-row items-center justify-between flex-shrink-0">
              <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Select Player {suffix(step)}:
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
              Select Infringement / Detail {suffix(step)}:
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
        // The dialog resolves the widget by name and stores whatever it returns; what the
        // control is and how it works are the widget's own business.
        return (
          <View className="my-3 flex-shrink-0">
            <WidgetStep
              step={step}
              value={step.dataKey ? widgetValues[step.dataKey] : undefined}
              onChange={(value) =>
                step.dataKey && setWidgetValues((prev) => ({ ...prev, [step.dataKey!]: value }))
              }
            />
          </View>
        );

      case ActionStepType.OUTCOME_SELECTION:
        return (
          <View className="gap-2 my-2" style={{ maxHeight: maxScrollHeight }}>
            <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider flex-shrink-0">
              {isNextActionStep ? 'Select Next Action' : 'Select Outcome'} {suffix(step)}:
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

            {/* WHY THE SAVE IS BLOCKED — named, so the scorer is not left hunting the screens */}
            {!canSave && (
              <View className="flex-row items-center gap-1.5 pt-2 flex-shrink-0">
                <Ionicons name="alert-circle-outline" size={14} color={COLORS.brand.orange} />
                <Text className="font-inter text-xs text-brand-orange flex-1">
                  Required: {unansweredRequired.map(stepLabel).join(', ')}
                </Text>
              </View>
            )}

            {/* DIALOG ACTION FOOTER */}
            <View className="flex-row gap-2 pt-3 border-t border-slate-200 dark:border-white/10 flex-shrink-0 mt-auto">
              <Button title="Cancel" variant="ghost" onPress={cancelDynamicFlow} className="flex-1 py-2.5 rounded-xl" />

              {isEditing ? (
                <>
                  <Button title="Undo Event" variant="danger" onPress={handleUndo} className="px-3 py-2.5 rounded-xl" />
                  <Button title="Save Changes" variant="primary" disabled={!canSave} onPress={handleConfirm} className="flex-1 py-2.5 rounded-xl" />
                </>
              ) : (
                <>
                  {currentStep < totalSteps - 1 && (
                    <Button title="Next Step" variant="secondary" onPress={handleNextStep} className="flex-1 py-2.5 rounded-xl" />
                  )}
                  <Button title="Confirm Event" variant="primary" disabled={!canSave} onPress={handleConfirm} className="flex-1 py-2.5 rounded-xl" />
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
