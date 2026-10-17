import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventOrgBadge, TournamentAdjustment, TournamentStandingRow } from '@sk/shared';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import { FixtureCrest } from '../events/EventBits';
import { FormResult, crestOf, entrantName, orgName } from './standingsBits';


/**
 * One standings table, wherever it appears: the tournament's leaderboard, a division's tables, an
 * organisation's teams and the table on a team's page (stage 4, docs/events.md §10).
 *
 * **Every table has the same columns** (agreed 2026-10-17): P W D L and Pts everywhere; on a wide
 * screen For, Against and the last five results too, and ± on a phone as well. The leaderboard is
 * the one exception — it adds rugby points to netball goals if it sums scores, so it shows Teams
 * instead of For / Against / ± / form.
 *
 * **No points system is still a scoreboard** (UI doc §11): played / won / drawn / lost appears as
 * soon as any fixture is finished, and the points column is what configuration *adds*. A
 * tournament may also keep no scores at all (`SCORE-18`), so `showPoints` and `showScores` each
 * take their columns away.
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

type Row = Partial<TournamentStandingRow> & { teamId: string; teamName: string };

export interface StandingsTableProps {
  rows: Row[];
  /** What the first column ranks — "Organisation", "Team". */
  subjectLabel?: string;
  /** Rows are organisations (the leaderboard) or entrants (every other table). */
  kind?: 'organisation' | 'entrant';
  /** The tournament's organisations, for each row's name and crest. */
  orgs?: EventOrgBadge[];
  isWide?: boolean;
  /** Hidden when nothing has been configured to award points. */
  showPoints?: boolean;
  /** For, Against and ± — hidden on the leaderboard, and where no scores are kept. */
  showScores?: boolean;
  /** The leaderboard's Teams column, by organisation id. */
  teamCounts?: Map<string, number>;
  /** The last results, by entrant id — shown on a wide screen. */
  form?: Map<string, FormResult[]>;
  /** Only P W D L ± Pts, for a table in a narrow column. */
  compact?: boolean;
  /** No rank and no crest: every row is one organisation's, ranked in different tables. */
  plain?: boolean;
  /** Inside a card: no frame of its own. */
  framed?: boolean;
  highlight?: (row: Row) => boolean;
  onPressRow?: (row: Row) => void;
  /** A row's name, where the organisation's and team's would repeat the page's heading. */
  nameOf?: (row: Row) => string;
  /** A second line under the name. */
  subline?: (row: Row) => string | undefined;
  /** A heading row whenever this changes from one row to the next — the sport, on an organisation's page. */
  groupOf?: (row: Row) => string | undefined;
  /** Reasons for the markers, when this viewer is entitled to them. */
  adjustments?: TournamentAdjustment[];
  emptyMessage?: string;
}

const FORM_TONE: Record<FormResult, string> = {
  W: 'bg-success-soft text-success-ink',
  D: 'bg-sunken text-ink-muted',
  L: 'bg-danger-soft text-danger-ink',
};

export function StandingsTable({
  rows,
  subjectLabel = 'Team',
  kind = 'entrant',
  orgs,
  isWide = false,
  showPoints = true,
  showScores = true,
  teamCounts,
  form,
  compact = false,
  plain = false,
  framed = true,
  highlight,
  onPressRow,
  nameOf: nameOverride,
  subline,
  groupOf,
  adjustments,
  emptyMessage = 'Nothing to rank yet. Add fixtures and record results.',
}: StandingsTableProps) {
  const isDark = useActiveTheme() === 'dark';
  const muted = themeColor(isDark, 'ink-muted');
  const faint = themeColor(isDark, 'ink-faint');
  const [openReasonFor, setOpenReasonFor] = useState<string | null>(null);

  const wide = isWide && !compact;
  const scoreColumns = showScores && kind === 'entrant';
  // A phone's entrant table has six columns to fit beside a name, so they close up and the crest goes.
  const tight = !isWide && scoreColumns;
  const count = tight ? 25 : 30;
  const columns: Array<{ key: string; label: string; width: number }> = [
    ...(wide && teamCounts ? [{ key: 'teams', label: 'Teams', width: 48 }] : []),
    { key: 'played', label: 'P', width: count },
    { key: 'wins', label: 'W', width: count },
    { key: 'draws', label: 'D', width: count },
    { key: 'losses', label: 'L', width: count },
    ...(wide && scoreColumns ? [{ key: 'pointsFor', label: 'For', width: 40 }, { key: 'pointsAgainst', label: 'Agst', width: 40 }] : []),
    ...(scoreColumns ? [{ key: 'pointsDifference', label: '±', width: tight ? 34 : 40 }] : []),
  ];
  const pointsWidth = tight ? 36 : 44;
  const showForm = wide && !!form && kind === 'entrant';

  const reasonFor = (entrantId?: string) => {
    if (!entrantId || !adjustments) return null;
    const matching = adjustments.filter(adjustment => adjustment.entrantId === entrantId);
    if (!matching.length) return null;
    return matching
      .map(adjustment => `${adjustment.pointsDelta > 0 ? '+' : ''}${adjustment.pointsDelta} — ${adjustment.reason}`)
      .join('\n');
  };
  const nameOf = (row: Row) => nameOverride ? nameOverride(row) : kind === 'organisation' ? orgName(row as any, orgs, !wide) : entrantName(row as any, orgs, !wide);
  const cell = (row: Row, key: string) => {
    if (key === 'teams') return teamCounts?.get(row.orgId || row.teamId) ?? 0;
    const value = (row as any)[key] ?? 0;
    return key === 'pointsDifference' && value > 0 ? `+${value}` : value;
  };
  const heading = 'font-orbitron-bold text-[9px] text-ink-muted uppercase tracking-wider text-center';

  return (
    <View className={framed ? 'bg-card border border-line rounded-2xl overflow-hidden' : ''}>
      <View className={`flex-row items-center bg-sunken py-2.5 ${framed ? 'px-4' : 'px-3 rounded-lg'}`}>
        <Text className="flex-1 font-orbitron-bold text-[9px] text-ink-muted uppercase tracking-wider">{subjectLabel}</Text>
        {columns.map(column => (
          <Text key={column.key} className={heading} style={{ width: column.width }}>{column.label}</Text>
        ))}
        {showPoints ? <Text className={`${heading} text-primary-ink`} style={{ width: pointsWidth }}>Pts</Text> : null}
        {showForm ? <Text className={heading} style={{ width: 104 }}>Form</Text> : null}
        {onPressRow ? <View style={{ width: 16 }} /> : null}
      </View>

      {rows.map((row, index) => {
        const isAdjusted = !!row.adjustment;
        const reason = reasonFor(row.entrantId);
        const isOpen = openReasonFor === row.teamId;
        const group = groupOf?.(row);
        const newGroup = group && group !== (index ? groupOf?.(rows[index - 1]) : undefined);
        const crest = plain || tight ? undefined : crestOf(row.orgId || (kind === 'organisation' ? row.teamId : undefined), orgs);
        const second = subline?.(row);
        const results = showForm ? (form!.get(row.entrantId || '') || []).slice(-5) : [];
        const name = nameOf(row);

        const body = (
          <View className={`flex-row items-center py-3 ${framed ? 'px-4' : 'px-3'} ${highlight?.(row) ? 'bg-info-soft' : ''}`}>
            <View className="flex-1 flex-row items-center gap-2.5 pr-2 min-w-0">
              {plain ? null : (
                <Text className="font-inter-bold text-[13px] text-ink-muted text-right" style={{ width: 22 }}>
                  {/* Entrants no configured factor could separate share a rank (1, 2, 2, 4) — the
                      signal that a human has to decide. So the server's rank is printed when there
                      is one, rather than the row's position in the list. A withdrawn entrant has no
                      rank at all: its results stand, but it is not competing for a place. */}
                  {row.withdrawn ? '–' : row.rank ?? index + 1}
                </Text>
              )}
              {crest ? <FixtureCrest participant={crest as any} size={26} /> : null}
              <View className="flex-shrink min-w-0">
                <View className="flex-row items-center">
                  <Text className={`font-inter-bold text-sm flex-shrink ${row.withdrawn ? 'text-ink-muted' : 'text-ink'}`} numberOfLines={1}>
                    {name}
                  </Text>
                  {isAdjusted ? (
                    <TouchableOpacity
                      onPress={() => setOpenReasonFor(isOpen ? null : row.teamId)}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Adjusted by the organiser — show why"
                    >
                      <Ionicons name="ellipse" size={6} color={muted} style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                {second || row.withdrawn ? (
                  <Text className="font-inter text-[11px] text-ink-muted" numberOfLines={1}>
                    {[row.withdrawn ? 'Withdrawn' : null, second].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </View>
            </View>
            {columns.map(column => (
              <Text key={column.key} className="font-inter text-sm text-ink-muted text-center" style={{ width: column.width }}>
                {cell(row, column.key)}
              </Text>
            ))}
            {showPoints ? (
              <Text className="font-orbitron-bold text-sm text-primary-ink text-center" style={{ width: pointsWidth }}>{row.points ?? 0}</Text>
            ) : null}
            {showForm ? (
              <View className="flex-row justify-center gap-[3px]" style={{ width: 104 }}>
                {results.length ? results.map((result, i) => (
                  <Text key={i} className={`font-inter-bold text-[9px] text-center rounded overflow-hidden ${FORM_TONE[result]}`} style={{ width: 17, lineHeight: 17 }}>
                    {result}
                  </Text>
                )) : <Text className="font-inter text-sm text-ink-faint">–</Text>}
              </View>
            ) : null}
            {onPressRow ? <Ionicons name="chevron-forward" size={14} color={faint} style={{ width: 16 }} /> : null}
          </View>
        );

        return (
          <View key={row.entrantId || row.teamId || index}>
            {newGroup ? (
              <Text className={`font-orbitron-bold text-[9px] text-ink-muted uppercase tracking-widest pt-3 pb-1.5 ${framed ? 'px-4' : 'px-3'}`}>
                {group}
              </Text>
            ) : null}
            <View className="border-t border-line-soft">
              {onPressRow ? (
                <TouchableOpacity onPress={() => onPressRow(row)} accessibilityRole="link" accessibilityLabel={`${name}${second ? `, ${second}` : ''}`}>
                  {body}
                </TouchableOpacity>
              ) : body}
            </View>

            {isOpen ? (
              <View className={`py-3 bg-sunken ${framed ? 'px-4' : 'px-3'}`}>
                <Text className="font-orbitron-bold text-[9px] text-ink-muted uppercase tracking-widest mb-1">
                  Adjusted by the organiser
                </Text>
                <Text className="font-inter text-[11px] text-ink-soft">
                  {reason ||
                    `${row.adjustment! > 0 ? '+' : ''}${row.adjustment} point${
                      Math.abs(row.adjustment!) === 1 ? '' : 's'
                    }, already counted above.`}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}

      {rows.length === 0 && (
        <View className="p-8 items-center justify-center">
          <Text className="font-inter text-xs text-ink-muted italic text-center">{emptyMessage}</Text>
        </View>
      )}
    </View>
  );
}
