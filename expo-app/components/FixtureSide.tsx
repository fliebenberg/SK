import React from 'react';
import { View, Text, TextProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  FixtureSourceNames,
  GameParticipant,
  TournamentEntrant,
  resolveFixtureSide,
} from '@sk/shared';
import { useActiveTheme } from '../store/settingsStore';
import { COLORS, getThemeColor } from '../constants/Colors';

/**
 * One side of a fixture, in whichever of its three states it is in (data model §2.0, U22).
 *
 * Every surface renders this: the fixtures list, the schedule, the bracket, the game screen, the
 * standings and anything printed. Five independent renderings of "TBC" is a guaranteed
 * inconsistency, and this is the component that decides whether a placeholder feels deliberate or
 * broken - so it is the one every later screen is checked against.
 *
 * The text itself is derived in `@sk/shared` (`resolveFixtureSide`), because it is also needed
 * server-side and on anything printed, and because it is where it can be unit tested.
 */
export interface FixtureSideProps {
  /** The side as stored: its team, its entrant, or the rule that will fill it. */
  participant?: Partial<GameParticipant>;
  /** The entrant `participant.entrantId` names, when the screen has it loaded. */
  entrant?: Partial<TournamentEntrant>;
  /** The competitor's name when the participant does not carry it - from a `GameSummary`, say. */
  name?: string;
  /** Prefixed to a known name, as the fixtures list does: "SBHS 1st XV". */
  orgShortName?: string;
  /**
   * Names for what a fill rule points at, so "Winner QF1" can be written out. A rule stores ids
   * and never text; without these the label degrades to "Winner of an earlier fixture".
   */
  names?: FixtureSourceNames;
  /** Right-align the label, for the away side of a two-column fixture card. */
  align?: 'left' | 'right';
  /**
   * Draw the small clock glyph beside a placeholder. On by default; turn it off where the row is
   * already dense, such as inside a schedule grid cell.
   */
  showIcon?: boolean;
  className?: string;
  /** Applied to the label itself, so a caller can set its size and weight. */
  textClassName?: string;
  numberOfLines?: number;
  textProps?: TextProps;
}

export function FixtureSide({
  participant,
  entrant,
  name,
  orgShortName,
  names,
  align = 'left',
  showIcon = true,
  className = '',
  textClassName = 'text-sm font-semibold',
  numberOfLines = 1,
  textProps,
}: FixtureSideProps) {
  const isDark = useActiveTheme() === 'dark';
  const side = resolveFixtureSide({ participant, entrant, name, orgShortName, names });

  // A placeholder is quieter than a competitor but never illegible: secondary text carries the
  // AAA contrast the design system requires in Light Mode, which a lower opacity would not.
  const color = side.isPlaceholder
    ? getThemeColor(isDark, 'textSecondary')
    : getThemeColor(isDark, 'textPrimary');

  // Awaiting a result is a different kind of unknown from awaiting a person: one resolves itself
  // when a game finishes, the other needs somebody to make a decision.
  const iconName = side.state === 'awaitingResult' ? 'git-branch-outline' : 'time-outline';

  return (
    <View
      className={`flex-row items-center gap-1.5 ${align === 'right' ? 'justify-end' : ''} ${className}`}
    >
      {showIcon && side.isPlaceholder && (
        <Ionicons
          name={iconName}
          size={12}
          color={side.state === 'awaitingResult' ? COLORS.brand.orange : color}
        />
      )}
      <Text
        numberOfLines={numberOfLines}
        className={`${textClassName} ${side.isPlaceholder ? 'italic' : ''} flex-shrink`}
        style={{ color, textAlign: align }}
        {...textProps}
      >
        {side.label}
      </Text>
    </View>
  );
}

export default FixtureSide;
