import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../store/settingsStore';
import { getThemeColor } from '../../constants/Colors';
import { SetupStepRoute } from './setupSteps';

/**
 * The bottom of a setup step screen: where you go when you are done with this one (U48).
 *
 * **`Next` names the step it goes to.** A bare `Next` over a numbered flow would say the steps are
 * ordered and must be walked, which setup is not (U17) — naming the destination makes it an offer
 * rather than a sequence. The last step offers the checklist instead, because there is nothing
 * after it and a dead control is worse than none.
 *
 * **There is no `Previous`.** Back is always the checklist, never the step before, so an organiser
 * who came from the checklist to fix one thing is one tap from where they started rather than
 * walking the list backwards. This is the whole shape of the hub: the checklist is the only thing
 * a step returns to.
 *
 * **`Next` saves first when the screen is dirty.** The screen passes `isDirty`, and the handler it
 * gives for `onNext` is expected to write and then navigate. Routing `Next` through the
 * unsaved-changes dialog instead would ask somebody who has just filled a step in whether they
 * want to discard it.
 */
export interface SetupStepFooterProps {
  /** The step this screen is, for the dismiss control's label. */
  label: string;
  /** Where `Next` goes. `undefined` renders the return-to-checklist control instead. */
  nextStep?: SetupStepRoute;
  onNext: () => void;
  onBackToChecklist: () => void;
  /** Changes `Next` to `Save & Continue`, so the control says what pressing it will do. */
  isDirty?: boolean;
  isProcessing?: boolean;
  nextDisabled?: boolean;
  /** Omitted for a step that must always be answered — Basic Info and Sports & Divisions. */
  onDismiss?: () => void;
}

export function SetupStepFooter({
  label,
  nextStep,
  onNext,
  onBackToChecklist,
  isDirty,
  isProcessing,
  nextDisabled,
  onDismiss,
}: SetupStepFooterProps) {
  const isDark = useActiveTheme() === 'dark';
  const secondary = getThemeColor(isDark, 'textSecondary');

  return (
    <View className="pt-2 gap-4">
      <TouchableOpacity
        onPress={onNext}
        disabled={nextDisabled || isProcessing}
        activeOpacity={0.85}
        className={`min-h-[44px] flex-row items-center justify-center gap-2 rounded-xl px-4 py-3 bg-brand-orange ${
          nextDisabled || isProcessing ? 'opacity-50' : ''
        }`}
      >
        {isProcessing ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Text className="font-inter-bold text-sm text-white text-center">
              {nextStep
                ? `${isDirty ? 'Save & continue to' : 'Next:'} ${nextStep.label}`
                : isDirty
                ? 'Save & back to checklist'
                : 'Back to checklist'}
            </Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </>
        )}
      </TouchableOpacity>

      {nextStep && (
        <TouchableOpacity
          onPress={onBackToChecklist}
          activeOpacity={0.7}
          className="flex-row items-center justify-center gap-1 py-1"
        >
          <Ionicons name="list-outline" size={14} color={secondary} />
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
            Back to the checklist
          </Text>
        </TouchableOpacity>
      )}

      {/* A step that genuinely does not apply has to be dismissible, or an organiser who wants no
          points system is nagged about it forever (U17). It sits at the bottom of the step rather
          than on the checklist row: it is rare, and it is a decision you make having looked at
          what the step actually asks for. */}
      {onDismiss && (
        <TouchableOpacity
          onPress={onDismiss}
          accessibilityLabel={`Dismiss ${label}`}
          activeOpacity={0.7}
          className="flex-row items-center justify-center gap-1 py-1"
        >
          <Ionicons name="close" size={12} color={secondary} />
          <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500">
            This doesn't apply to this tournament
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
