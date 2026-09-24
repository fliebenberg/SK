import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EntrantRow, OrgBadge, TournamentDivision, divisionsForTeam } from '@sk/shared';
import CustomSelect from '../CustomSelect';
import { OrgLogo } from '../OrgLogo';
import { useActiveTheme } from '../../store/settingsStore';
import { COLORS, getThemeColor } from '../../constants/Colors';

/**
 * Who is entered, as one table: a row per competitor, highlighted when it is playing, and the
 * division it plays in beside its name.
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
 * **Playing and Division are one decision in two controls, and cannot disagree.** Pressing a row
 * enters the competitor into its only qualifying division, so "playing, but nowhere" — a state an
 * entrant cannot be in, since an entrant *is* a division's entrant — is unreachable. The division
 * shows as plain text when there is exactly one choice and becomes a dropdown at two or more,
 * which is the collapse rule (U15): most teams qualify for exactly one division, so most rows
 * carry no control at all. A row that is not playing shows no division.
 */
export interface EntrantTableProps {
  rows: EntrantRow[];
  divisions: TournamentDivision[];
  orgs: OrgBadge[];
  divisionLabel: (division: TournamentDivision) => string;
  /** For the sport line under each name. */
  sportName: (sportId?: string) => string | undefined;
  /** Keyed per row, so two rows can never share a spinner. */
  isBusy: (row: EntrantRow) => boolean;
  /** `null` takes the competitor out. */
  onSetDivision: (row: EntrantRow, divisionId: string | null) => void;
  /**
   * Put somebody else in a playing row's place, keeping its fixtures (2026-09-24). Offered on
   * every playing row when given; left out, the table has no replace control at all.
   */
  onReplace?: (row: EntrantRow) => void;
  canEdit: boolean;
  emptyText: string;
}

export function EntrantTable({
  rows,
  divisions,
  orgs,
  divisionLabel,
  sportName,
  isBusy,
  onSetDivision,
  onReplace,
  canEdit,
  emptyText,
}: EntrantTableProps) {
  const isDark = useActiveTheme() === 'dark';
  const { width } = useWindowDimensions();
  /* 768px, the break the rest of the app uses. It only decides how roomy the dropdown is; the
     column's width is measured either way. */
  const isWide = width >= 768;

  /**
   * One column width for the table, measured from the longest division name it can show.
   *
   * A fixed column left a dropdown of white space next to "U13"; sizing each row to its own text
   * made the list ragged. So: measure the longest label once, off-screen, add the control's
   * padding and chevron, and give every row that. Capped at half the row, because the competitor's
   * name is what the list is for — beyond that the dropdown truncates instead.
   */
  const [tableWidth, setTableWidth] = useState(0);
  const [labelWidth, setLabelWidth] = useState(0);
  const longestLabel = useMemo(() => {
    const labels = [...divisions.map(divisionLabel), 'Not playing'];
    return labels.reduce((longest, label) => (label.length > longest.length ? label : longest), '');
  }, [divisions, divisionLabel]);

  /** Horizontal padding, the gap and the chevron — what the text itself does not account for. */
  const controlChrome = isWide ? 58 : 50;
  const divisionWidth = Math.min(
    Math.max(labelWidth + controlChrome, 96),
    tableWidth ? tableWidth * 0.5 : Number.MAX_SAFE_INTEGER
  );

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

    /** Entering puts the competitor in its first qualifying division; there is no "playing, but nowhere". */
    const toggle = () => {
      if (!canEdit || busy) return;
      if (entered) onSetDivision(row, null);
      else if (qualifying.length) onSetDivision(row, qualifying[0].id);
    };

    const nothingToEnterInto = !entered && qualifying.length === 0 && others.length === 0;
    const enteredDivision = divisions.find(d => d.id === row.entrant?.divisionId);

    /* A team carries its own sport and age group. A placeholder or a person has neither until it
       is in a division, and then the division's are its. */
    const details = [
      sportName(row.team?.sportId || enteredDivision?.sportId),
      row.team ? row.team.ageGroup : enteredDivision?.ageGroup,
    ]
      .filter(Boolean)
      .join(' · ');

    /* A team that pulled out after playing is not playing, but it is not a team that never played
       either: its results are still in the table, and the row says so. */
    const withdrawnPlayed = !entered ? row.withdrawn?.playedCount || 0 : 0;
    const withdrawnFrom = row.withdrawn ? divisions.find(d => d.id === row.withdrawn?.divisionId) : undefined;

    /*
      Only a playing row has a division, so only a playing row shows one. A row that is not playing
      says so, and says how to change it — the row is the control, and nothing else on it looks
      pressable. Where there is nowhere it *could* play, it says that instead, because otherwise
      pressing it would seem to do nothing.
    */
    const divisionCell = busy ? (
      <View className="items-end">
        <ActivityIndicator size="small" color={COLORS.brand.orange} />
      </View>
    ) : entered ? (
      options.length > 1 && canEdit ? (
        <CustomSelect
          value={row.entrant?.divisionId || ''}
          onChange={divisionId => onSetDivision(row, divisionId)}
          options={options}
          placeholder="Choose a division"
          style={isWide ? undefined : { paddingHorizontal: 12, paddingVertical: 8 }}
        />
      ) : (
        <Text className="font-inter text-xs text-slate-800 dark:text-white text-right" numberOfLines={1}>
          {enteredDivision ? divisionLabel(enteredDivision) : '—'}
        </Text>
      )
    ) : nothingToEnterInto ? (
      <Text className="font-inter text-[11px] text-slate-400 dark:text-slate-500 text-right">
        No division
      </Text>
    ) : (
      <View className="items-end">
        <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">Not playing</Text>
        {canEdit && (
          <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
            {Platform.OS === 'web' ? 'Click' : 'Tap'} to add to tournament
          </Text>
        )}
      </View>
    );

    return (
      /*
        The row *is* the control: pressing anywhere on it enters or withdraws the competitor, and
        a playing row is highlighted rather than ticked. That frees the width a checkbox column
        took, which is what lets the division sit beside the name on a phone. The division
        dropdown is its own touchable, so pressing it opens the picker and does not toggle.
      */
      <TouchableOpacity
        key={row.key}
        onPress={toggle}
        disabled={!canEdit || busy || nothingToEnterInto}
        activeOpacity={0.7}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: entered, disabled: !canEdit || busy || nothingToEnterInto }}
        accessibilityLabel={`${row.name}${org ? `, ${org.name}` : ''}, playing`}
        className={`flex-row items-center gap-3 px-3 py-2.5 mb-1 rounded-lg border-l-2 ${
          entered ? 'bg-orange-50 dark:bg-brand-orange/10 border-brand-orange' : 'border-transparent'
        }`}
      >
        <OrgSquare org={org} isDark={isDark} />

        <View className="flex-1 min-w-0">
          <Text
            numberOfLines={1}
            className={`font-inter-bold text-xs ${
              entered ? 'text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {row.name}
          </Text>
          {/* The flag leads the second line rather than following the name: on a phone it would
              otherwise push the name out of sight, and losing the sport line is the lesser cost. */}
          <View className="flex-row items-center gap-1.5 mt-0.5 min-w-0">
            {row.kind === 'placeholder' && <PlaceholderFlag />}
            {withdrawnPlayed > 0 && <WithdrawnFlag />}
            <Text
              numberOfLines={1}
              className="font-inter text-[10px] text-slate-500 dark:text-slate-400 flex-shrink"
            >
              {withdrawnPlayed > 0
                ? `${withdrawnFrom ? `${divisionLabel(withdrawnFrom)} · ` : ''}${withdrawnPlayed} result${
                    withdrawnPlayed === 1 ? '' : 's'
                  } kept`
                : details || (row.kind === 'placeholder' ? '' : '—')}
            </Text>
          </View>
        </View>

        {/* Its own touchable, like the dropdown, so pressing it does not take the row out. */}
        {entered && canEdit && !busy && !!onReplace && (
          <TouchableOpacity
            onPress={() => onReplace(row)}
            accessibilityRole="button"
            accessibilityLabel={`Replace ${row.name}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="w-8 h-8 items-center justify-center rounded-lg active:bg-slate-200/60 dark:active:bg-white/10"
          >
            <Ionicons name="swap-horizontal-outline" size={16} color={getThemeColor(isDark, 'textSecondary')} />
          </TouchableOpacity>
        )}

        {/* A fixed column, and the dropdown fills it: sized to its own text, every row's control
            was a different width and the list read as ragged. */}
        <View style={{ width: divisionWidth }}>{divisionCell}</View>
      </TouchableOpacity>
    );
  };

  return (
    <View onLayout={event => setTableWidth(event.nativeEvent.layout.width)}>
      {/* The measuring copy: the same font and size as the control's text, laid out off-screen so
          it is never constrained by the column it is deciding. */}
      <Text
        className="font-inter text-sm absolute opacity-0"
        style={{ left: 0, top: 0 }}
        numberOfLines={1}
        pointerEvents="none"
        onLayout={event => setLabelWidth(event.nativeEvent.layout.width)}
      >
        {longestLabel}
      </Text>
      {/* A header only where there is room for it; on a phone the controls label themselves. */}
      {isWide && (
        <View className="flex-row items-center gap-3 px-3 pb-2 mb-1 border-b border-slate-200 dark:border-white/10">
          <Text className="flex-1 pl-11 font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            Team
          </Text>
          <Text
            className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest"
            style={{ width: divisionWidth }}
          >
            Division
          </Text>
        </View>
      )}
      {rows.map(renderRow)}
    </View>
  );
}

/** As tall as the two lines beside it — the name and the sport line. */
const ORG_SQUARE = 32;

/**
 * The organisation, as its crest on the far left of the row. The name is not repeated in text:
 * hovering the crest shows it on web, and a screen reader hears it in the row's label. A row with
 * no organisation — a generic placeholder — keeps an empty square, so the names stay in one column.
 *
 * The hover is a plain `View` listening for the mouse, not a `Pressable`, because a `Pressable`
 * would claim the press and stop a tap on the crest toggling the row. React Native's types do not
 * list the mouse events a `View` forwards on web, hence the cast.
 */
function OrgSquare({ org, isDark }: { org?: OrgBadge; isDark: boolean }) {
  const [hovered, setHovered] = useState(false);

  if (!org) {
    return (
      <View
        className="items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800"
        style={{ width: ORG_SQUARE, height: ORG_SQUARE }}
      >
        <Ionicons name="people-outline" size={15} color={getThemeColor(isDark, 'textSecondary')} />
      </View>
    );
  }

  const mouse = { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) } as any;

  return (
    <View {...mouse} style={{ zIndex: hovered ? 30 : undefined }}>
      <OrgLogo
        logo={org.logo}
        settings={org.logoConfig ? { logoConfig: org.logoConfig } : undefined}
        primaryColor={org.primaryColor}
        size={ORG_SQUARE}
      />
      {hovered && (
        <View
          className="absolute bg-slate-900 dark:bg-slate-700 rounded-lg px-2.5 py-1.5 shadow-lg"
          style={{ left: ORG_SQUARE + 8, top: 2 }}
          pointerEvents="none"
        >
          <Text className="font-inter text-[11px] text-white" numberOfLines={1} style={{ whiteSpace: 'nowrap' } as any}>
            {org.name}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Marks a team that withdrew after playing. Slate rather than amber or orange: it is neither
 * waiting for anything nor playing — it is history, and should read quieter than both.
 */
function WithdrawnFlag() {
  return (
    <View className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/15">
      <Text className="font-inter-bold text-[9px] uppercase tracking-wider text-slate-600 dark:text-slate-300">
        Withdrawn
      </Text>
    </View>
  );
}

/**
 * Marks a placeholder at a glance. It used to be a word in the grey line under the name, which
 * read the same as an age group; a placeholder is a slot waiting for a real team, and an organiser
 * scanning the list needs to see those before the day, not find them by reading every row.
 *
 * Amber rather than the brand orange, because orange on this table already means *playing* — a
 * placeholder can be either, and the two marks must not be confused. The light-mode pair is
 * amber-800 on amber-100, which clears the contrast rule; amber-400 does not on white.
 */
function PlaceholderFlag() {
  return (
    <View className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-400/15 border border-amber-300 dark:border-amber-400/40">
      <Text className="font-inter-bold text-[9px] uppercase tracking-wider text-amber-800 dark:text-amber-300">
        Placeholder
      </Text>
    </View>
  );
}
