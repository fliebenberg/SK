import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

/**
 * Setting a tournament up is a checklist, not a wizard (U17) — and the checklist is the sections.
 *
 * [design_spec §5.2](file:///c:/Fred/Coding/SK/docs/design_spec.md) prescribes a multi-step wizard
 * for complex creation, and a tournament does not fit that shape, because it is not built in one
 * sitting: the name and dates are known in March, entrants confirm through April, fixtures follow,
 * and the schedule is done the week before. So the wizard creates the shell and the event screen
 * carries a resumable state that says what is outstanding.
 *
 * **How the checklist has been shown, and why it is now the sections themselves (U44).** First a
 * card of steps at the top of the tab — which meant scrolling back to the top to reach the next
 * one. Then a sticky stepper of chips under the tabs, which fixed the scrolling but left the tab
 * carrying a long unbroken column of inputs with no clear seam between one step's work and the
 * next. Now each step *is* a collapsible section: collapsed, the five rows are the checklist;
 * expanded, the row is the heading of the work. This is not the card returning — the card failed
 * because the summary and the content were separate things to move between, and there is now
 * nothing to move between.
 *
 * What is left here is what survives that: the step type the event screen builds, the progress
 * line that replaced the stepper's `2/5`, and the restore list for dismissed steps. The rows
 * themselves are [`<AccordionHeader>`](file:///c:/Fred/Coding/SK/expo-app/components/Accordion.tsx),
 * which is general and knows nothing about setup.
 */

export interface SetupStep {
  /** Stable across releases — it is what a dismissal is recorded against. */
  key: string;
  label: string;
  /** The state in a few words: "3 of 5 divisions", "not started". */
  detail?: string;
  status: 'done' | 'todo';
  /** Guidance shown inside the section when there is nothing to press yet. */
  hint?: string;
  /** False for steps that must always be answered. Defaults to true. */
  dismissible?: boolean;
}

export interface SetupProgressProps {
  /** The steps still showing — the caller has already removed the dismissed ones. */
  steps: SetupStep[];
}

/**
 * How much of the setup is done, in one line.
 *
 * All that is left of the stepper: with every step now a row you can see, a second list of the
 * same five labels was saying nothing the sections were not already saying. The count is the part
 * that was not visible anywhere else.
 */
export function SetupProgress({ steps }: SetupProgressProps) {
  const done = steps.filter(step => step.status === 'done').length;
  const total = steps.length;
  const isComplete = total > 0 && done === total;

  return (
    <View className="flex-row items-center gap-3 px-1">
      {/* `brand.green` is a 1.67:1 fill on a light surface, so the completed bar and its label
          take the light-safe `success` green there and the brand green in dark mode. */}
      <View className="flex-1 h-1 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
        <View
          className={`h-1 rounded-full ${
            isComplete ? 'bg-emerald-800 dark:bg-brand-green' : 'bg-brand-orange'
          }`}
          style={{ width: total > 0 ? `${(done / total) * 100}%` : 0 }}
        />
      </View>
      <Text
        className={`font-inter-bold text-[10px] uppercase tracking-widest ${
          isComplete ? 'text-emerald-800 dark:text-brand-green' : 'text-slate-400 dark:text-slate-500'
        }`}
      >
        {isComplete ? 'Setup complete' : `${done} of ${total} done`}
      </Text>
    </View>
  );
}

export interface SetupDismissedStepsProps {
  steps: SetupStep[];
  onRestore?: (key: string) => void;
}

/** Dismissed is not gone: the steps put away are listed, counted and restorable. */
export function SetupDismissedSteps({ steps, onRestore }: SetupDismissedStepsProps) {
  if (steps.length === 0) return null;
  return (
    <View className="border border-dashed border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 gap-2">
      <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
        {steps.length === 1 ? '1 step' : `${steps.length} steps`} marked as not applying to this
        tournament.
      </Text>
      {steps.map(step => (
        <View key={step.key} className="flex-row items-center justify-between">
          <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400 flex-1" numberOfLines={1}>
            {step.label}
          </Text>
          {onRestore && (
            <TouchableOpacity onPress={() => onRestore(step.key)} className="px-2 py-1" activeOpacity={0.8}>
              <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                Restore
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}
