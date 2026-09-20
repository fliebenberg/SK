import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CandidateTeam } from '@sk/shared';
import { divisionTeamOptions } from '../../hooks/useEventEntrants';
import { EntrantTeamChip } from './EntrantTeamChip';
import { useActiveTheme } from '../../store/settingsStore';
import { COLORS, getThemeColor } from '../../constants/Colors';

/**
 * One group's teams for one division, as chips — with the age-group override and the one-division
 * rule.
 *
 * Shared by both axes of entry (U21): the division editor renders it per organisation, the
 * entrants screen's organisation axis per division. They were two copies of the same rows once,
 * and the override has to behave identically in both or a team entered from one axis goes missing
 * from the other.
 *
 * The rule is `divisionTeamOptions`: qualifying teams, plus any other-age-group team already
 * entered or held by another division (tagged with its age group), and the rest of the sport's
 * teams behind a control that says how many there are. Entering one of those is the override — no
 * dialog, because revealing them was already the deliberate step, and the tag keeps it visible
 * afterwards.
 */
export interface DivisionTeamChoicesProps {
  /** This group's teams — the caller filters by organisation. */
  teams: CandidateTeam[];
  division: { id?: string; sportId?: string; ageGroupId?: string | null };
  enteredTeamIds: Set<string>;
  /** Every entered team in the tournament and the division holding it (`divisionByTeamId`). */
  divisionByTeam?: Map<string, string>;
  /** Names the division a team is held by, for the chip that says where it went. */
  divisionName?: (divisionId: string) => string;
  isBusy: (team: CandidateTeam) => boolean;
  onToggle: (team: CandidateTeam) => void;
  /** Tapping a team another division holds. Without it, such a chip is inert. */
  onMove?: (team: CandidateTeam, fromDivisionId: string) => void;
  /** Shown when nothing qualifies and nothing is entered. */
  emptyText: string;
}

export function DivisionTeamChoices({
  teams,
  division,
  enteredTeamIds,
  divisionByTeam,
  divisionName,
  isBusy,
  onToggle,
  onMove,
  emptyText,
}: DivisionTeamChoicesProps) {
  const isDark = useActiveTheme() === 'dark';
  const secondary = getThemeColor(isDark, 'textSecondary');
  const [showOthers, setShowOthers] = useState(false);

  const { listed, others } = divisionTeamOptions(teams, division, enteredTeamIds, divisionByTeam);

  const renderChip = (team: CandidateTeam, otherAgeGroup: boolean, takenByDivisionId?: string) => (
    <EntrantTeamChip
      key={team.id}
      team={team}
      entered={enteredTeamIds.has(team.id)}
      takenBy={takenByDivisionId ? divisionName?.(takenByDivisionId) || 'another division' : undefined}
      otherAgeGroup={otherAgeGroup}
      busy={isBusy(team)}
      onPress={() =>
        takenByDivisionId && !enteredTeamIds.has(team.id)
          ? onMove?.(team, takenByDivisionId)
          : onToggle(team)
      }
    />
  );

  return (
    <View>
      {listed.length === 0 ? (
        <Text className="font-inter text-[11px] text-slate-400 dark:text-slate-500 italic px-1 mb-1.5">
          {emptyText}
        </Text>
      ) : (
        listed.map(option => renderChip(option.team, option.otherAgeGroup, option.takenByDivisionId))
      )}

      {others.length > 0 &&
        (showOthers ? (
          <>
            {others.map(team => renderChip(team, true))}
            <TouchableOpacity
              onPress={() => setShowOthers(false)}
              activeOpacity={0.8}
              className="flex-row items-center gap-1 px-1 py-1"
            >
              <Ionicons name="chevron-up" size={12} color={secondary} />
              <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Hide other age groups
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            onPress={() => setShowOthers(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            className="flex-row items-center gap-1 px-1 py-1"
          >
            <Ionicons name="chevron-down" size={12} color={COLORS.brand.orange} />
            <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
              Other age groups ({others.length})
            </Text>
          </TouchableOpacity>
        ))}
    </View>
  );
}
