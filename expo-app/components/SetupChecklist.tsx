import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';
import { getThemeColor } from '../constants/Colors';

/**
 * Setting a tournament up is a checklist, not a wizard (U17) — and the checklist is now a page of
 * its own, with a screen behind every row (U48).
 *
 * [design_spec §5.2](file:///c:/Fred/Coding/SK/docs/design_spec.md) prescribes a multi-step wizard
 * for complex creation, and a tournament does not fit that shape, because it is not built in one
 * sitting: the name and dates are known in March, entrants confirm through April, fixtures follow,
 * and the schedule is done the week before. So creation is a name and a date (U45) and the event
 * screen carries a resumable state that says what is outstanding.
 *
 * **Four attempts at showing that state, and what each one was for.** A card of steps at the top
 * of the tab — which meant scrolling back to the top to reach the next one. A sticky stepper of
 * chips under the tabs, which fixed the scrolling but left the tab carrying a long unbroken column
 * of inputs. Then each step *became* a collapsible section (U44), which gave the work a seam but
 * kept six steps' worth of inputs on one phone screen. Now the rows are the whole page and the
 * work is behind them (U48): a row is a summary and a destination, which is what a checklist row
 * has always looked like everywhere else.
 *
 * **This is not the checklist card returning.** The card failed because the summary and the content
 * were two places on one screen and you travelled between them by scrolling. These are two
 * screens, and the travel is navigation — with a back control, a history entry, and one thing on
 * screen at a time.
 *
 * The steps are the setup *process* rather than the model's parts (U46) — Basics, what is being
 * played, entrants, rules and scoring, fixtures — which is why nothing here names one; the order
 * and the routes live in
 * [setupSteps.ts](file:///c:/Fred/Coding/SK/expo-app/components/tournament/setupSteps.ts).
 */

export interface SetupStep {
  /** Stable across releases — it is what a dismissal is recorded against. */
  key: string;
  label: string;
  /** The state in a few words: "3 of 5 divisions", "not started". */
  detail?: string;
  status: 'done' | 'todo';
  /** Guidance shown on the row when there is nothing to report yet. */
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
 * The count is the one thing the rows do not say: five rows each marked Done or To do do not add
 * themselves up, and "how much is left" is the question an organiser opens this page with.
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

export interface SetupChecklistRowProps {
  step: SetupStep;
  onPress: () => void;
}

/**
 * One row of the checklist: what the step is, where it stands, and a way in.
 *
 * Successor to `<AccordionHeader>`, which this change deleted along with the sticky-header
 * machinery it needed. What survives from it is the part that was about *reading* a checklist: the
 * state said in a word rather than drawn as a circle (an empty `ellipse-outline` in the leading
 * slot read as an unselected radio button, which is the opposite of what a checklist row means),
 * a neutral detail line, and the light-safe `success` green.
 *
 * The detail runs to two lines here, where the accordion row allowed one. A collapsed row sat
 * above five others competing for the same screen; this row has a page to itself and the hint on
 * an unstarted step is a sentence worth reading.
 */
export function SetupChecklistRow({ step, onPress }: SetupChecklistRowProps) {
  const isDark = useActiveTheme() === 'dark';
  const secondary = getThemeColor(isDark, 'textSecondary');
  const isDone = step.status === 'done';

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${step.label}, ${isDone ? 'done' : 'to do'}`}
      activeOpacity={0.8}
      className="flex-row items-center gap-3 px-4 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl"
    >
      <View className="flex-1 min-w-0">
        <Text className="font-orbitron-bold text-[11px] text-slate-800 dark:text-white uppercase tracking-widest">
          {step.label}
        </Text>
        {!!(step.detail || step.hint) && (
          <Text
            className="font-inter text-[11px] mt-0.5 text-slate-500 dark:text-slate-400"
            numberOfLines={2}
          >
            {step.detail || step.hint}
          </Text>
        )}
      </View>

      <View className="flex-row items-center gap-1">
        {isDone && <Ionicons name="checkmark" size={13} color={getThemeColor(isDark, 'success')} />}
        <Text
          className={`font-inter-bold text-[10px] uppercase tracking-widest ${
            isDone ? 'text-emerald-800 dark:text-brand-green' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          {isDone ? 'Done' : 'To do'}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color={secondary} />
    </TouchableOpacity>
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
