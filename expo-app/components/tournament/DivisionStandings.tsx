import React from 'react';
import { Text, View } from 'react-native';
import { TournamentAdjustment, TournamentStandingRow } from '@sk/shared';
import { StandingsTable } from './StandingsTable';
import { useLiveRoom } from '../../hooks/useLiveRoom';

/**
 * One division's table, or one per stage where the division has more than one.
 *
 * Mounted by both the standings tab (when its scope selector names a division) and the division's
 * own screen, so there is one rendering of "this division's table" rather than two.
 *
 * **The scope decides the row, not just the filter** (U29). At division scope the table ranks that
 * division's *entrants*, so a school that entered u14A and u14B is two rows — at this altitude the
 * question is which team won the u14 rugby, and collapsing them answers a different one. Those two
 * rows still sum into one school line in the event roll-up, which is the correct answer for the
 * day's total.
 *
 * `division:{id}:standings` is public, so this works for a spectator. The manual adjustments carry
 * a reason somebody wrote and live in the organiser tier, so they are joined only for a viewer who
 * may edit — the marker appears either way, and only the sentence behind it is gated.
 */

interface StageStandings {
  stageId: string;
  name: string;
  status: string;
  rows: TournamentStandingRow[];
}

export interface DivisionStandingsProps {
  divisionId: string;
  canEdit?: boolean;
  showPoints?: boolean;
}

export function DivisionStandings({ divisionId, canEdit = false, showPoints = true }: DivisionStandingsProps) {
  const { items: stages, isLoading } = useLiveRoom<StageStandings>(
    divisionId ? `division:${divisionId}:standings` : null,
    {
      reduce: (message) =>
        message.type === 'DIVISION_STANDINGS_UPDATED' && message.data?.divisionId === divisionId
          ? { kind: 'replace', items: message.data?.stages || [] }
          : { kind: 'ignore' },
      getId: (stage) => stage.stageId,
    }
  );

  const { items: adjustments } = useLiveRoom<TournamentAdjustment>(
    divisionId ? `division:${divisionId}:adjustments` : null,
    {
      enabled: canEdit,
      reduce: (message) =>
        message.type === 'DIVISION_ADJUSTMENTS_SYNC' && message.data?.divisionId === divisionId
          ? { kind: 'replace', items: message.data?.adjustments || [] }
          : { kind: 'ignore' },
    }
  );

  if (isLoading) {
    return (
      <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 italic py-6 text-center">
        Loading the table...
      </Text>
    );
  }

  // One stage renders inline with no heading, exactly as the fixtures do (U15): the concept of a
  // stage appears when there is a second one to choose between.
  const named = stages.length > 1;

  return (
    <View className="space-y-4">
      {stages.map(stage => (
        <View key={stage.stageId} className="space-y-2">
          {named && (
            <Text className="font-orbitron-bold text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">
              {stage.name}
            </Text>
          )}
          <StandingsTable
            rows={stage.rows}
            subjectLabel="Entrant"
            showPoints={showPoints}
            adjustments={canEdit ? adjustments : undefined}
            emptyMessage="Nothing to rank yet. Once a fixture is finished this table fills in."
          />
        </View>
      ))}

      {stages.length === 0 && (
        <StandingsTable
          rows={[]}
          subjectLabel="Entrant"
          showPoints={showPoints}
          emptyMessage="Nothing to rank yet. Once a fixture is finished this table fills in."
        />
      )}
    </View>
  );
}
