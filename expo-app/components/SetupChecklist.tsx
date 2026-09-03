import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useActiveTheme } from '../store/settingsStore';
import { COLORS, getThemeColor } from '../constants/Colors';

/**
 * Setting a tournament up is a checklist, not a wizard (U17).
 *
 * [design_spec §5.2](file:///c:/Fred/Coding/SK/docs/design_spec.md) prescribes a multi-step wizard
 * for complex creation, and a tournament does not fit that shape — because it is not built in one
 * sitting. The name and dates are known in March, entrants confirm through April, fixtures follow,
 * and the schedule is done the week before. A wizard that must be completed before it produces
 * anything is the wrong container for work that spans weeks.
 *
 * So the wizard creates the shell and this carries the rest: a resumable state that says what is
 * outstanding, and puts "generate fixtures" and "auto-schedule" in context as checklist actions
 * rather than buried in a settings tab. It also makes the phased build legible — a format with no
 * generator yet simply shows "add fixtures by hand" on that step.
 *
 * **This is the scaffold.** The container and its dismissible steps are Phase 5; the steps
 * themselves fill in over Phases 6-8, which is why a step carries its own action rather than this
 * component knowing what any of them do.
 */

export interface SetupStep {
  /** Stable across releases — it is what a dismissal is recorded against. */
  key: string;
  label: string;
  /** The state in a few words: "3 of 5 divisions", "not started". */
  detail?: string;
  status: 'done' | 'todo';
  /** Shown when there is nothing to press yet, e.g. "Fixtures arrive in a later release." */
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** False for steps that must always be answered. Defaults to true. */
  dismissible?: boolean;
}

export interface SetupChecklistProps {
  steps: SetupStep[];
  /** Keys the organiser has put away. Persisted on the event, not per viewer. */
  dismissed: string[];
  onDismiss: (key: string) => void;
  onRestore: (key: string) => void;
  /** False hides every control, so a guest sees progress without being offered the work. */
  canEdit?: boolean;
}

export function SetupChecklist({
  steps,
  dismissed,
  onDismiss,
  onRestore,
  canEdit = true,
}: SetupChecklistProps) {
  const isDark = useActiveTheme() === 'dark';
  const secondary = getThemeColor(isDark, 'textSecondary');
  const [showDismissed, setShowDismissed] = useState(false);

  const visible = steps.filter(step => !dismissed.includes(step.key));
  const hidden = steps.filter(step => dismissed.includes(step.key));
  const done = visible.filter(step => step.status === 'done').length;
  const isComplete = visible.length > 0 && done === visible.length;

  return (
    <GlassCard className="border border-slate-200 dark:border-white/5 p-5">
      <View className="flex-row items-center justify-between mb-4">
        <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
          Setup
        </Text>
        <Text
          className={`font-inter-bold text-[10px] uppercase tracking-widest ${
            isComplete ? 'text-brand-green' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {done} of {visible.length} done
        </Text>
      </View>

      <View className="space-y-2">
        {visible.map(step => (
          <View
            key={step.key}
            className="flex-row items-center gap-3 bg-slate-50 dark:bg-white/5 rounded-xl px-3 py-3"
          >
            <Ionicons
              name={step.status === 'done' ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={step.status === 'done' ? COLORS.brand.green : secondary}
            />
            <View className="flex-1 min-w-0">
              <Text className="font-inter-bold text-xs text-slate-800 dark:text-white" numberOfLines={1}>
                {step.label}
              </Text>
              {!!(step.detail || step.hint) && (
                <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 mt-0.5" numberOfLines={2}>
                  {step.detail || step.hint}
                </Text>
              )}
            </View>

            {canEdit && step.onAction && step.actionLabel && (
              <TouchableOpacity
                onPress={step.onAction}
                className="px-3 py-1.5 rounded-lg bg-brand-orange/10 border border-brand-orange/30 active:opacity-80"
              >
                <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                  {step.actionLabel}
                </Text>
              </TouchableOpacity>
            )}

            {/* A step that genuinely does not apply has to be dismissible, or an organiser who
                wants no points system is nagged about it forever. */}
            {canEdit && step.dismissible !== false && (
              <TouchableOpacity
                onPress={() => onDismiss(step.key)}
                accessibilityLabel={`Dismiss ${step.label}`}
                className="w-7 h-7 items-center justify-center active:opacity-70"
              >
                <Ionicons name="close" size={14} color={secondary} />
              </TouchableOpacity>
            )}
          </View>
        ))}

        {visible.length === 0 && (
          <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 italic py-2">
            Every setup step has been dismissed.
          </Text>
        )}
      </View>

      {hidden.length > 0 && (
        <View className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5">
          <TouchableOpacity
            onPress={() => setShowDismissed(prev => !prev)}
            className="flex-row items-center gap-1.5 active:opacity-80"
          >
            <Ionicons name={showDismissed ? 'chevron-down' : 'chevron-forward'} size={12} color={secondary} />
            <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
              {hidden.length} dismissed
            </Text>
          </TouchableOpacity>

          {showDismissed &&
            hidden.map(step => (
              <View key={step.key} className="flex-row items-center justify-between mt-2 pl-5">
                <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400 flex-1" numberOfLines={1}>
                  {step.label}
                </Text>
                {canEdit && (
                  <TouchableOpacity onPress={() => onRestore(step.key)} className="px-2 py-1 active:opacity-80">
                    <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                      Restore
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
        </View>
      )}
    </GlassCard>
  );
}
