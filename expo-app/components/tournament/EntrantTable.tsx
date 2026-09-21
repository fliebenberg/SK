import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EntrantRow, OrgBadge, TournamentDivision, divisionsForTeam } from '@sk/shared';
import CustomSelect from '../CustomSelect';
import { OrgLogo } from '../OrgLogo';
import { useActiveTheme } from '../../store/settingsStore';
import { COLORS, getThemeColor } from '../../constants/Colors';

/**
 * Who is entered, as one table: a row per competitor, a tick, and the division it plays in.
 *
 * This replaced a two-axis grid of chips, and the reason is not that the grid was ugly. The grid
 * asked *which teams for this division*, so "a team plays in one division" was a rule it had to
 * defend — a server refusal, a dimmed chip saying where the team went, a Move-here dialog, and the
 * whole tournament's roster threaded through three components so a chip could know it was taken.
 * Asked the other way round, **a competitor has one division cell**, and the invariant stops being
 * sayable rather than being enforced. Changing where a team plays is changing a dropdown.
 *
 * It also flattens the navigation. Getting to a team used to be axis → sport → age group →
 * organisation → chip; it is now a filter, or nothing at all.
 *
 * **Playing and Division are one decision in two controls, and cannot disagree.** Ticking Playing
 * enters the competitor into its only qualifying division, so "playing, but nowhere" — a state an
 * entrant cannot be in, since an entrant *is* a division's entrant — is unreachable. The division
 * shows as plain text when there is exactly one choice and becomes a dropdown at two or more,
 * which is the collapse rule (U15): most teams qualify for exactly one division, so most rows
 * carry no control at all.
 */
export interface EntrantTableProps {
  rows: EntrantRow[];
  divisions: TournamentDivision[];
  orgs: OrgBadge[];
  divisionLabel: (division: TournamentDivision) => string;
  /** Keyed per row, so two rows can never share a spinner. */
  isBusy: (row: EntrantRow) => boolean;
  /** `null` takes the competitor out. */
  onSetDivision: (row: EntrantRow, divisionId: string | null) => void;
  canEdit: boolean;
  emptyText: string;
}

export function EntrantTable({
  rows,
  divisions,
  orgs,
  divisionLabel,
  isBusy,
  onSetDivision,
  canEdit,
  emptyText,
}: EntrantTableProps) {
  const isDark = useActiveTheme() === 'dark';
  const secondary = getThemeColor(isDark, 'textSecondary');
  const { width } = useWindowDimensions();
  /* 768px, the break the rest of the app uses. Below it the division control moves under the
     name rather than shrinking, because a squeezed dropdown is unreadable and a wrapped one is
     merely taller. */
  const isWide = width >= 768;

  if (!rows.length) {
    return (
      <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 px-1 py-3">
        {emptyText}
      </Text>
    );
  }

  const renderRow = (row: EntrantRow) => {
    const org = orgs.find(o => o.id === row.orgId);
    const { qualifying, others } = divisionsForTeam(row.team, divisions);
    const entered = !!row.entrant;
    const busy = isBusy(row);

    /*
      Qualifying divisions first, then the override in a group of its own. A flat list would make
      entering a u13 side into the u14 division a mis-tap rather than a decision, which is what the
      grid's "Other age groups (3)" control bought and what this keeps.
    */
    const options = [
      ...qualifying.map(d => ({ value: d.id, label: divisionLabel(d) })),
      ...others.map(d => ({
        value: d.id,
        label: divisionLabel(d),
        description: 'Another age group — entered as an override',
      })),
    ];

    /** Ticking enters into the one qualifying division; there is no "playing, but nowhere". */
    const toggle = () => {
      if (!canEdit || busy) return;
      if (entered) onSetDivision(row, null);
      else if (qualifying.length) onSetDivision(row, qualifying[0].id);
    };

    const nothingToEnterInto = !entered && qualifying.length === 0 && others.length === 0;

    const divisionCell = (
      <View className={isWide ? 'w-64' : 'mt-2'}>
        {!entered ? (
          <Text className="font-inter text-[11px] text-slate-400 dark:text-slate-500">
            {nothingToEnterInto ? 'No division for this team' : '—'}
          </Text>
        ) : options.length > 1 && canEdit ? (
          <CustomSelect
            value={row.entrant?.divisionId || ''}
            onChange={divisionId => onSetDivision(row, divisionId)}
            options={options}
            placeholder="Choose a division"
          />
        ) : (
          <Text className="font-inter text-xs text-slate-800 dark:text-white" numberOfLines={1}>
            {divisions.find(d => d.id === row.entrant?.divisionId)
              ? divisionLabel(divisions.find(d => d.id === row.entrant?.divisionId)!)
              : '—'}
          </Text>
        )}
      </View>
    );

    return (
      <View
        key={row.key}
        className={`border-b border-slate-100 dark:border-white/5 py-2.5 ${
          isWide ? 'flex-row items-center gap-3' : ''
        }`}
      >
        <View className="flex-row items-center gap-3 flex-1 min-w-0">
          <TouchableOpacity
            onPress={toggle}
            disabled={!canEdit || busy || nothingToEnterInto}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: entered, disabled: !canEdit || busy }}
            accessibilityLabel={`${row.name} playing`}
            className="w-11 h-11 items-center justify-center -my-1 active:opacity-80"
          >
            {busy ? (
              <ActivityIndicator size="small" color={COLORS.brand.orange} />
            ) : (
              <Ionicons
                name={entered ? 'checkbox' : 'square-outline'}
                size={19}
                color={entered ? COLORS.brand.orange : nothingToEnterInto ? secondary : secondary}
              />
            )}
          </TouchableOpacity>

          <View className="flex-1 min-w-0">
            <Text
              numberOfLines={1}
              className={`font-inter-bold text-xs ${
                entered ? 'text-slate-800 dark:text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {row.name}
            </Text>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              {!!org && (
                <OrgLogo
                  logo={org.logo}
                  settings={org.logoConfig ? { logoConfig: org.logoConfig } : undefined}
                  primaryColor={org.primaryColor}
                  size={13}
                  className="rounded-full"
                />
              )}
              <Text numberOfLines={1} className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
                {[
                  org?.shortName,
                  row.kind === 'placeholder' ? 'Placeholder' : row.team?.ageGroup,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </View>
        </View>

        {divisionCell}
      </View>
    );
  };

  return (
    <View>
      {/* A header only where there is room for it; on a phone the controls label themselves. */}
      {isWide && (
        <View className="flex-row items-center gap-3 pb-2 border-b border-slate-200 dark:border-white/10">
          <View className="flex-1 flex-row items-center gap-3">
            <Text className="w-11 text-center font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              In
            </Text>
            <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Team
            </Text>
          </View>
          <Text className="w-64 font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            Division
          </Text>
        </View>
      )}
      {rows.map(renderRow)}
    </View>
  );
}
