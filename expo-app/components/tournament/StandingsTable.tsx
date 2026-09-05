import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TournamentAdjustment, TournamentStandingRow } from '@sk/shared';
import { useActiveTheme } from '../../store/settingsStore';
import { getThemeColor } from '../../constants/Colors';

/**
 * One standings table, wherever it appears.
 *
 * **No points system is still a scoreboard** (UI doc §11). Played / won / drawn / lost appears as
 * soon as any fixture is finished; the points column is what configuration *adds*, not what makes
 * the table exist. So `showPoints` is a property of the table rather than a reason to have two.
 *
 * Rows come from the server, never from a client-side calculation (D30). The choke point is the one
 * thing that writes a table, and a screen that recomputed it would be a second answer to a question
 * that already has one — which is how two surfaces come to disagree about who won.
 *
 * **An override is quiet but discoverable** (U30, D29). A manual points correction shows a small
 * marker on its row and the reason on tap: loud enough that somebody who spots an inconsistency can
 * find out why, quiet enough not to alarm the majority of readers, who do not know the tiebreak
 * rules and would only be confused by a prominent warning about something they were not
 * questioning. The reason itself lives in the organiser tier, so a spectator sees the marker and
 * "adjusted by the organiser" rather than "ineligible player".
 */

export interface StandingsTableProps {
  rows: Array<Partial<TournamentStandingRow> & { teamId: string; teamName: string }>;
  /** What the first column ranks — "Organisation", "Team", "Entrant". */
  subjectLabel?: string;
  /** Hidden when nothing has been configured to award points. */
  showPoints?: boolean;
  /** Reasons for the markers, when this viewer is entitled to them. */
  adjustments?: TournamentAdjustment[];
  emptyMessage?: string;
}

export function StandingsTable({
  rows,
  subjectLabel = 'Competitor',
  showPoints = true,
  adjustments,
  emptyMessage = 'Nothing to rank yet. Add fixtures and record results.',
}: StandingsTableProps) {
  const isDark = useActiveTheme() === 'dark';
  const secondary = getThemeColor(isDark, 'textSecondary');
  const [openReasonFor, setOpenReasonFor] = useState<string | null>(null);

  const reasonFor = (entrantId?: string) => {
    if (!entrantId || !adjustments) return null;
    const matching = adjustments.filter(adjustment => adjustment.entrantId === entrantId);
    if (!matching.length) return null;
    return matching
      .map(adjustment => `${adjustment.pointsDelta > 0 ? '+' : ''}${adjustment.pointsDelta} — ${adjustment.reason}`)
      .join('\n');
  };

  return (
    <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm">
      <View className="flex-row bg-slate-100 dark:bg-slate-800 px-4 py-3">
        <Text className="flex-1 font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-wider">
          {subjectLabel}
        </Text>
        {['P', 'W', 'D', 'L'].map(heading => (
          <Text
            key={heading}
            className="w-8 text-center font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-wider"
          >
            {heading}
          </Text>
        ))}
        {showPoints && (
          <Text className="w-12 text-center font-orbitron-bold text-[9px] text-brand-orange uppercase tracking-wider">
            Pts
          </Text>
        )}
      </View>

      {rows.map((row, index) => {
        const isAdjusted = !!row.adjustment;
        const reason = reasonFor(row.entrantId);
        const isOpen = openReasonFor === row.teamId;

        return (
          <View key={row.teamId || index}>
            <TouchableOpacity
              activeOpacity={isAdjusted ? 0.7 : 1}
              onPress={() => isAdjusted && setOpenReasonFor(isOpen ? null : row.teamId)}
              className="flex-row items-center px-4 py-3.5 border-b border-slate-100 dark:border-white/5"
            >
              <View className="flex-1 flex-row items-center pr-2">
                <Text
                  className="font-inter-bold text-sm text-slate-800 dark:text-white"
                  numberOfLines={1}
                >
                  {/* Entrants no configured factor could separate share a rank (1, 2, 2, 4) — the
                      signal that a human has to decide. So the server's rank is printed when there
                      is one, rather than the row's position in the list. */}
                  {row.rank ?? index + 1}. {row.teamName}
                </Text>
                {isAdjusted && (
                  <Ionicons
                    name="ellipse"
                    size={5}
                    color={secondary}
                    style={{ marginLeft: 6, opacity: 0.8 }}
                  />
                )}
              </View>
              <Text className="w-8 text-center font-inter text-sm text-slate-600 dark:text-slate-400">
                {row.played ?? 0}
              </Text>
              <Text className="w-8 text-center font-inter text-sm text-slate-600 dark:text-slate-400">
                {row.wins ?? 0}
              </Text>
              <Text className="w-8 text-center font-inter text-sm text-slate-600 dark:text-slate-400">
                {row.draws ?? 0}
              </Text>
              <Text className="w-8 text-center font-inter text-sm text-slate-600 dark:text-slate-400">
                {row.losses ?? 0}
              </Text>
              {showPoints && (
                <Text className="w-12 text-center font-orbitron-bold text-sm text-brand-orange">
                  {row.points ?? 0}
                </Text>
              )}
            </TouchableOpacity>

            {isOpen && (
              <View className="px-4 py-3 bg-slate-50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5">
                <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
                  Adjusted by the organiser
                </Text>
                <Text className="font-inter text-[11px] text-slate-600 dark:text-slate-300">
                  {reason ||
                    `${row.adjustment! > 0 ? '+' : ''}${row.adjustment} point${
                      Math.abs(row.adjustment!) === 1 ? '' : 's'
                    }, already counted above.`}
                </Text>
              </View>
            )}
          </View>
        );
      })}

      {rows.length === 0 && (
        <View className="p-8 items-center justify-center">
          <Text className="font-inter text-xs text-slate-400 italic text-center">{emptyMessage}</Text>
        </View>
      )}
    </View>
  );
}
