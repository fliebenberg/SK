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
 * **U49 answered the question the rows themselves never did: what is this list?** Shown a bare
 * progress bar over five headings, an organiser could not tell that the list *was* the setup, what
 * any row would ask for before opening it, or where to start — and the one number on screen said
 * "2 outstanding" on the tab while the bar under it said "3 of 5 done". So: the list is introduced
 * ({@link SetupChecklistIntro}), every row carries an icon and a line saying what the step is for,
 * **every outstanding row is tinted** so the remaining work is visible in one glance, and the
 * counting happens once, here, in the direction the bar fills.
 *
 * **The tint replaced a `Next up` card.** The first cut of U49 put the first outstanding step in an
 * emphasised card above the list, repeated in its own place below. It worked, and it was one signal
 * too many: the card said *start here* while the rows it sat over said nothing, so the page had a
 * summary and a list again — the same shape the checklist card failed as, three revisions earlier.
 * Tinting the rows themselves says the same thing without the duplication, and says it about
 * *every* outstanding step rather than only the first, which is what an organiser picking up a
 * half-built tournament actually needs to see.
 *
 * The steps are the setup *process* rather than the model's parts (U46) — Basic Info, what is being
 * played, entrants, rules and scoring, fixtures — which is why nothing here names one; the order,
 * the labels, the icons and the routes live in
 * [setupSteps.ts](file:///c:/Fred/Coding/SK/expo-app/components/tournament/setupSteps.ts).
 */

/**
 * Where a step stands.
 *
 * `default` is the third state U49 added, and it exists because one row was reading as a
 * contradiction: Rules & scoring said "Using the default 3 / 1 / 0" and was marked **To do** in the
 * same breath — telling the organiser it was handled and outstanding at once. It is neither. The
 * competition *will* score on 3 / 1 / 0 if nobody says otherwise, so nothing is broken and nothing
 * is blocked; what is missing is only somebody having chosen it. So it reads as its own thing, it
 * does not count as done, and it does not nag like a `todo`.
 */
export type SetupStepStatus = 'done' | 'todo' | 'default';

export interface SetupStep {
  /** Stable across releases — it is what a dismissal is recorded against. */
  key: string;
  label: string;
  /** What the step is for, shown until there is a `detail` to show instead. */
  purpose?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** The state in a few words: "3 of 5 divisions", "not started". */
  detail?: string;
  status: SetupStepStatus;
  /** Guidance shown on the row when there is nothing to report yet. */
  hint?: string;
  /** False for steps that must always be answered. Defaults to true. */
  dismissible?: boolean;
}

/** Done is done; a defaulted step is not, which is what stops it counting toward the bar. */
const isStepDone = (step: SetupStep) => step.status === 'done';

export interface SetupChecklistIntroProps {
  /** The steps still showing — the caller has already removed the dismissed ones. */
  steps: SetupStep[];
}

/**
 * The heading the checklist never had, and the count, in one direction.
 *
 * Two sentences of frame, once, at the top: what the list is and — the thing organisers actually
 * worry about — that none of it has to be finished now. Everything under it can then be terse,
 * because the reader already knows what they are looking at.
 */
export function SetupChecklistIntro({ steps }: SetupChecklistIntroProps) {
  const done = steps.filter(isStepDone).length;
  const total = steps.length;
  const isComplete = total > 0 && done === total;

  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white uppercase tracking-widest">
          Set up your tournament
        </Text>
        <Text className="font-inter text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {isComplete
            ? 'Everything is in place. Open any step to change it — nothing here is locked once the tournament starts.'
            : 'Work through these in any order. Nothing has to be finished today — you can come back to it any time before the first match.'}
        </Text>
      </View>

      {/* `brand.green` is a 1.67:1 fill on a light surface, so the completed bar and its label
          take the light-safe `success` green there and the brand green in dark mode. */}
      <View className="flex-row items-center gap-3">
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
            isComplete
              ? 'text-emerald-800 dark:text-brand-green'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {isComplete ? 'Setup complete' : `${done} of ${total} steps done`}
        </Text>
      </View>
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
 * Successor to `<AccordionHeader>`, which U48 deleted along with the sticky-header machinery it
 * needed. What survives from it is the part that was about *reading* a checklist: a neutral detail
 * line and the light-safe `success` green.
 *
 * **The state moved into the row's own surface (U49) and the DONE / TO DO column went with it.**
 * Five rows each ending in a status word is the same word five times: it costs a column, it makes
 * every row equally loud, and "to do" as a *label* is noise on a list whose whole subject is what
 * is still to do. An outstanding row is **tinted orange and wears a filled orange medallion**; a
 * done row drops to the plain surface, a quiet green check and muted text. So "what is left" is
 * answered by the shape of the page before a single word is read, and it is answered for every
 * step at once rather than for the next one only.
 *
 * The one state that still needs a word keeps one — `Defaults`, on the row that would otherwise
 * look identical to an untouched step while being neither done nor blocking. It is tinted like any
 * other outstanding step, because it *is* somewhere the organiser can act; the chip is what says
 * the competition is already scorable without it.
 *
 * An empty `ellipse-outline` in the leading slot is not an option here and never was: it reads as
 * an unselected radio button, which is the opposite of what a checklist row means.
 *
 * The detail runs to two lines. A collapsed accordion row sat above five others competing for the
 * same screen; this row has a page to itself, and the guidance on an unstarted step is a sentence
 * worth reading.
 */
export function SetupChecklistRow({ step, onPress }: SetupChecklistRowProps) {
  const isDark = useActiveTheme() === 'dark';
  const secondary = getThemeColor(isDark, 'textSecondary');
  const isDone = isStepDone(step);

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${step.label}, ${
        isDone ? 'done' : step.status === 'default' ? 'using defaults' : 'to do'
      }`}
      activeOpacity={0.8}
      className={`flex-row items-center gap-3.5 px-4 py-3.5 rounded-2xl border ${
        isDone
          ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5'
          : 'bg-brand-orange/5 dark:bg-brand-orange/10 border-brand-orange/40'
      }`}
    >
      <View
        className={`w-9 h-9 rounded-full items-center justify-center ${
          isDone ? 'bg-emerald-800/10 dark:bg-brand-green/15' : 'bg-brand-orange'
        }`}
      >
        <Ionicons
          name={isDone ? 'checkmark' : step.icon || 'ellipse-outline'}
          size={isDone ? 18 : 17}
          color={isDone ? getThemeColor(isDark, 'success') : '#FFFFFF'}
        />
      </View>

      <View className="flex-1 min-w-0">
        <Text
          className={`font-orbitron-bold text-[11px] uppercase tracking-widest ${
            isDone ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-white'
          }`}
        >
          {step.label}
        </Text>
        <Text
          className={`font-inter text-[11px] mt-0.5 ${
            isDone ? 'text-slate-500 dark:text-slate-400' : 'text-slate-600 dark:text-slate-300'
          }`}
          numberOfLines={2}
        >
          {step.detail || step.hint || step.purpose}
        </Text>
      </View>

      {step.status === 'default' && (
        <View className="px-2 py-0.5 rounded bg-white/70 dark:bg-white/10 border border-brand-orange/20">
          <Text className="font-inter-bold text-[9px] uppercase tracking-widest text-slate-600 dark:text-slate-300">
            Defaults
          </Text>
        </View>
      )}

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
        tournament. They are not counted above.
      </Text>
      {steps.map(step => (
        <View key={step.key} className="flex-row items-center justify-between">
          <Text
            className="font-inter text-[11px] text-slate-500 dark:text-slate-400 flex-1"
            numberOfLines={1}
          >
            {step.label}
          </Text>
          {onRestore && (
            <TouchableOpacity
              onPress={() => onRestore(step.key)}
              className="px-2 py-1"
              activeOpacity={0.8}
            >
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
