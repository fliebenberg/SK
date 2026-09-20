import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CandidateTeam } from '@sk/shared';
import { useActiveTheme } from '../../store/settingsStore';
import { COLORS, getThemeColor } from '../../constants/Colors';

/**
 * One team, as something to tick — the unit the whole entry grid is made of.
 *
 * It replaced a full-width row per team. A row is honest about one organisation's six teams and
 * hopeless about five organisations' thirty: the screen became a column of near-identical bars and
 * an organiser lost their place in it. A chip is short enough that a column of them reads as a
 * *list belonging to a school*, which is the shape the task actually has.
 *
 * Four states, and the third is the one worth dwelling on:
 *
 * - **available** — plain, tap to enter.
 * - **entered** — brand fill and a filled box; tap to take out.
 * - **taken** — this team is in another division of the same tournament. Dimmed, with the division
 *   named, and tapping offers to move it. **Not hidden**, which was the alternative and is worse:
 *   an organiser who put a team in the wrong division goes to the right one, finds it absent, and
 *   has nothing to tell them where it went — the mistake becomes unrecoverable at exactly the
 *   place it was noticed. Named, the fix is one tap away.
 * - **busy** — a spinner in the box's place while the write is in flight. Keyed per cell by the
 *   caller, so two chips can never share one.
 *
 * `otherAgeGroup` is a badge rather than a colour: it is information about *why* the team is
 * offered, not a state of the chip, and the chip already uses colour for whether it is in.
 */
export interface EntrantTeamChipProps {
  team: CandidateTeam;
  entered: boolean;
  /** The division already holding this team, named. Absent when it is free. */
  takenBy?: string;
  /** Plays the right sport, wrong age group — entered or enterable by override. */
  otherAgeGroup?: boolean;
  busy?: boolean;
  onPress: () => void;
}

export function EntrantTeamChip({
  team,
  entered,
  takenBy,
  otherAgeGroup,
  busy,
  onPress,
}: EntrantTeamChipProps) {
  const isDark = useActiveTheme() === 'dark';
  const secondary = getThemeColor(isDark, 'textSecondary');

  const taken = !!takenBy && !entered;

  const tone = entered
    ? 'bg-brand-orange/10 border-brand-orange/30'
    : taken
      ? 'bg-slate-50 dark:bg-white/5 border-dashed border-slate-300 dark:border-white/10'
      : 'bg-slate-50 dark:bg-white/5 border-transparent';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.85}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: entered, disabled: busy }}
      accessibilityLabel={
        taken ? `${team.name}, already in ${takenBy}. Move it here.` : team.name
      }
      /* `min-h-[44px]` is the app's touch target and the reason a chip is not smaller than this. */
      className={`flex-row items-center gap-2.5 rounded-xl px-3 py-2 mb-1.5 border min-h-[44px] ${tone}`}
    >
      {busy ? (
        <ActivityIndicator size="small" color={COLORS.brand.orange} />
      ) : (
        <Ionicons
          name={entered ? 'checkbox' : taken ? 'swap-horizontal-outline' : 'square-outline'}
          size={17}
          color={entered ? COLORS.brand.orange : taken ? secondary : secondary}
        />
      )}

      <View className="flex-1 min-w-0">
        <Text
          numberOfLines={1}
          className={`font-inter-bold text-xs ${
            taken ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-white'
          }`}
        >
          {team.name}
        </Text>
        {taken ? (
          <Text numberOfLines={1} className="font-inter text-[10px] text-slate-400 dark:text-slate-500">
            In {takenBy} — tap to move
          </Text>
        ) : otherAgeGroup ? (
          <Text numberOfLines={1} className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
            {team.ageGroup ? `${team.ageGroup} · other age group` : 'No age group'}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
