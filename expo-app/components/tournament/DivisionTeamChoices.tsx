import React, { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CandidateTeam } from '@sk/shared';
import { divisionTeamOptions } from '../../hooks/useEventEntrants';
import { useActiveTheme } from '../../store/settingsStore';
import { COLORS, getThemeColor } from '../../constants/Colors';

/**
 * One organisation's teams for one division, as tick-boxes — with the age-group override.
 *
 * Shared by both axes of entry (U21): the division editor lists it per organisation, the entrants
 * screen's organisation axis per division. They were two copies of the same rows, and the override
 * has to behave identically in both or a team entered from one axis goes missing from the other.
 *
 * The rule is `divisionTeamOptions`: qualifying teams, plus any other-age-group team already
 * entered (tagged with its age group), and the rest of the sport's teams behind a control that
 * says how many there are. Entering one of those is the override — no dialog, because revealing
 * them was already the deliberate step, and the tag keeps it visible afterwards.
 */
export interface DivisionTeamChoicesProps {
  /** This organisation's teams — the caller filters by organisation. */
  teams: CandidateTeam[];
  division: { sportId?: string; ageGroupId?: string | null };
  enteredTeamIds: Set<string>;
  isBusy: (team: CandidateTeam) => boolean;
  onToggle: (team: CandidateTeam) => void;
  /** Shown when nothing qualifies and nothing is entered. */
  emptyText: string;
}

export function DivisionTeamChoices({
  teams,
  division,
  enteredTeamIds,
  isBusy,
  onToggle,
  emptyText,
}: DivisionTeamChoicesProps) {
  const isDark = useActiveTheme() === 'dark';
  const secondary = getThemeColor(isDark, 'textSecondary');
  const [showOthers, setShowOthers] = useState(false);

  const { listed, others } = divisionTeamOptions(teams, division, enteredTeamIds);

  const renderRow = (team: CandidateTeam, otherAgeGroup: boolean) => {
    const entered = enteredTeamIds.has(team.id);
    const busy = isBusy(team);
    return (
      <TouchableOpacity
        key={team.id}
        onPress={() => onToggle(team)}
        disabled={busy}
        activeOpacity={0.85}
        className={`flex-row items-center gap-3 rounded-xl px-3 py-2.5 mb-1.5 border ${
          entered ? 'bg-brand-orange/10 border-brand-orange/30' : 'bg-slate-50 dark:bg-white/5 border-transparent'
        }`}
      >
        {busy ? (
          <ActivityIndicator size="small" color={COLORS.brand.orange} />
        ) : (
          <Ionicons
            name={entered ? 'checkbox' : 'square-outline'}
            size={18}
            color={entered ? COLORS.brand.orange : secondary}
          />
        )}
        <Text className="font-inter-bold text-xs text-slate-800 dark:text-white flex-1" numberOfLines={1}>
          {team.name}
        </Text>
        {otherAgeGroup && (
          <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
            {team.ageGroup ? `${team.ageGroup} · other age group` : 'No age group'}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View>
      {listed.length === 0 ? (
        <Text className="font-inter text-[11px] text-slate-400 dark:text-slate-500 italic px-1 mb-1.5">
          {emptyText}
        </Text>
      ) : (
        listed.map(option => renderRow(option.team, option.otherAgeGroup))
      )}

      {others.length > 0 &&
        (showOthers ? (
          <>
            {others.map(team => renderRow(team, true))}
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
