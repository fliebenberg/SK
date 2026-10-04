import React, { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OrgBadge, Sport, TournamentDivision, TournamentEntrant, TournamentFormat } from '@sk/shared';
import { FixtureCrest } from '../events/EventBits';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/**
 * Pieces of the read-first tournament page (docs/events.md, stage 2): the setting-up steps and
 * their progress, the one-sport-at-a-time Sports & divisions, and the schools taking part.
 */

/* ---------------------------------------------------------------------------------------------
 * Setting up
 * ------------------------------------------------------------------------------------------- */

/**
 * Where a setup step stands. `part` is under way but not finished — teams entered with gaps left,
 * scoring running on the unconfirmed default, some divisions drawn. `skip` is a step the organiser
 * said this tournament does not need (`settings.dismissedSetupSteps`); it counts as finished.
 */
export type StepState = 'done' | 'part' | 'none' | 'skip';

export const isFinished = (state: StepState) => state === 'done' || state === 'skip';

const STATE_LABEL: Record<StepState, string> = {
  done: 'Done',
  part: 'In progress',
  none: 'Not started',
  skip: 'Not needed',
};

/** One segment per step, with gaps: green finished, amber in progress, grey not started. */
export function StepProgressBar({ states }: { states: StepState[] }) {
  return (
    <View className="flex-row gap-1 flex-1" style={{ maxWidth: 300, minWidth: 120 }} accessibilityElementsHidden>
      {states.map((state, i) => (
        <View
          key={i}
          className={`flex-1 h-1.5 rounded-full ${isFinished(state) ? 'bg-success' : state === 'part' ? 'bg-warning' : 'bg-line-strong'}`}
        />
      ))}
    </View>
  );
}

/**
 * A step's number in a ring, in its state's colour — a tick on green once finished. The number is
 * text and stays at a readable shade in every state (`ink-muted` at the least); only the ring of a
 * step not started is the quiet line colour (design_system.md: never fade content).
 */
export function StepNumber({ index, state }: { index: number; state: StepState }) {
  const isDark = useActiveTheme() === 'dark';
  if (isFinished(state)) {
    return (
      <View className="w-6 h-6 rounded-full bg-success items-center justify-center flex-shrink-0">
        <Ionicons name="checkmark" size={14} color={themeColor(isDark, 'on-success')} />
      </View>
    );
  }
  const ring = state === 'part' ? 'border-warning' : 'border-line-strong';
  const text = state === 'part' ? 'text-warning-ink' : 'text-ink-muted';
  return (
    <View className={`w-6 h-6 rounded-full border-2 items-center justify-center flex-shrink-0 ${ring}`}>
      <Text className={`font-inter-bold text-xs ${text}`}>{index + 1}</Text>
    </View>
  );
}

/** The step's state in words, and Next beside the step to do next. */
export function StepPills({ state, isNext }: { state: StepState; isNext: boolean }) {
  const isDark = useActiveTheme() === 'dark';
  const box = isFinished(state) ? 'bg-success-soft' : state === 'part' ? 'bg-warning-soft' : 'bg-sunken';
  const text = isFinished(state) ? 'text-success-ink' : state === 'part' ? 'text-warning-ink' : 'text-ink-muted';
  return (
    <View className="flex-row items-center gap-1.5 flex-shrink-0">
      <View className={`rounded-full px-2 py-0.5 ${box}`}>
        <Text className={`font-inter-bold text-[11px] ${text}`}>{STATE_LABEL[state]}</Text>
      </View>
      {isNext ? (
        <View className="rounded-full px-2 py-0.5 bg-ink">
          <Text className="font-inter-bold text-[11px]" style={{ color: themeColor(isDark, 'card') }}>Next</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Divisions
 * ------------------------------------------------------------------------------------------- */

const FORMAT_LABEL: Record<TournamentFormat, string> = {
  RoundRobin: 'Round robin',
  Knockout: 'Knockout',
  Festival: 'Festival',
  Plate: 'Plate',
  Swiss: 'Swiss',
};

/**
 * How a division is played, from its stages — "Round robin", or "Pools & knockout" for the
 * two-stage shape. The tournament's own `format` is not this: every tournament is created a
 * Festival and the real formats live on each division's stages.
 */
export function divisionFormatLabel(division: TournamentDivision): string {
  const stages = [...(division.stages || [])].sort((a, b) => a.sequence - b.sequence);
  if (!stages.length) return 'No format yet';
  if (stages.length === 2 && stages[0].format === 'RoundRobin' && stages[1].format === 'Knockout') return 'Pools & knockout';
  return stages.map(s => FORMAT_LABEL[s.format] || s.format).join(' then ');
}

/** Where a division has got to, for its tile: a tone and a few words. */
export interface DivisionState {
  tone: 'ok' | 'wait' | 'mute' | 'live';
  label: string;
}

const DOT: Record<DivisionState['tone'], string> = {
  ok: 'bg-success',
  wait: 'bg-warning',
  mute: 'bg-line-strong',
  live: 'bg-danger',
};
const STATE_TEXT: Record<DivisionState['tone'], string> = {
  ok: 'text-success-ink',
  wait: 'text-warning-ink',
  mute: 'text-ink-muted',
  live: 'text-danger-ink',
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Sports & divisions, one sport at a time (agreed 2026-10-04). The sports are one line that
 * scrolls sideways and never wraps — arrows on a wide screen, a swipe on a phone — with "All N ▾"
 * fixed at its end for a quick jump. Under it, only the chosen sport: its heading and its
 * divisions as tiles. A sport with one division shows it whole, as one wide panel, rather than a
 * grid of one.
 */
export function SportsDivisions({
  sports, sportIds, divisions, entrantsByDivision, divisionState, isWide, canEdit, setupMode,
  attention, onOpenDivision, onAddDivision, onAddSport, sportMenu,
}: {
  sports: Sport[];
  /** The tournament's sports, in its order. */
  sportIds: string[];
  divisions: TournamentDivision[];
  entrantsByDivision: Map<string, TournamentEntrant[]>;
  divisionState: (division: TournamentDivision) => DivisionState;
  isWide: boolean;
  canEdit: boolean;
  /** While setting up: the explanation, the add tiles and the ＋ Sport chip. */
  setupMode: boolean;
  /** A sport with something to see to — a dot on its chip. */
  attention: (sportId: string) => 'wait' | 'live' | null;
  onOpenDivision: (division: TournamentDivision) => void;
  onAddDivision?: (sportId: string) => void;
  onAddSport?: () => void;
  /** The ⋯ on the chosen sport's heading, for an organiser. */
  sportMenu?: (sportId: string) => React.ReactNode;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [selected, setSelected] = useState<string | undefined>(sportIds[0]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const stripRef = useRef<ScrollView>(null);
  const chipX = useRef<Record<string, number>>({});
  const scrollX = useRef(0);

  const current = sportIds.includes(selected || '') ? selected! : sportIds[0];
  const sportName = (id: string) => sports.find(s => s.id === id)?.name || 'Sport';
  const divisionsOf = (id: string) => divisions.filter(d => d.sportId === id);
  const teamsIn = (d: TournamentDivision) => (entrantsByDivision.get(d.id) || []).filter(e => e.status !== 'withdrawn').length;

  const choose = (id: string) => {
    setSelected(id);
    setPickerOpen(false);
    const x = chipX.current[id];
    if (x !== undefined) stripRef.current?.scrollTo({ x: Math.max(0, x - 40), animated: true });
  };

  if (!sportIds.length) {
    return (
      <Text className="font-inter text-sm text-ink-muted">
        No sports yet. Choose the sports being played — each gets its first division straight away.
      </Text>
    );
  }

  const chosen = divisionsOf(current);
  const teamTotal = chosen.reduce((sum, d) => sum + teamsIn(d), 0);
  const dot = (tone: 'wait' | 'live' | null) => (tone ? <View className={`w-2 h-2 rounded-full ${tone === 'live' ? 'bg-danger' : 'bg-warning'}`} /> : null);

  const chip = (id: string) => {
    const on = id === current;
    return (
      <TouchableOpacity
        key={id}
        onPress={() => choose(id)}
        onLayout={e => { chipX.current[id] = e.nativeEvent.layout.x; }}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        className={`flex-row items-center gap-2 rounded-xl border px-3 py-2 ${on ? 'bg-raised border-line-selected shadow-sm' : 'bg-card border-line shadow-none'}`}
      >
        <Text className={`font-inter-semibold text-sm ${on ? 'text-ink' : 'text-ink-muted'}`}>{sportName(id)}</Text>
        <Text className="font-inter text-xs text-ink-muted">{divisionsOf(id).length}</Text>
        {dot(attention(id))}
      </TouchableOpacity>
    );
  };

  const tile = (d: TournamentDivision) => {
    const state = divisionState(d);
    return (
      <TouchableOpacity
        key={d.id}
        onPress={() => onOpenDivision(d)}
        accessibilityRole="link"
        className="rounded-2xl border border-line bg-card p-3 gap-1.5"
        style={{ width: isWide ? '31.8%' : '48.5%', minHeight: 104 }}
      >
        <Text className="font-inter-bold text-lg text-ink" numberOfLines={1}>{d.name}</Text>
        <Text className="font-inter text-xs text-ink-muted" numberOfLines={2}>
          {divisionFormatLabel(d)}{'\n'}{d.ageGroup || 'Any age'} · {plural(teamsIn(d), 'team')}
        </Text>
        <View className="flex-row items-center gap-1.5 mt-auto">
          <View className={`w-2 h-2 rounded-full ${DOT[state.tone]}`} />
          <Text className={`font-inter-semibold text-xs ${STATE_TEXT[state.tone]}`} numberOfLines={1}>{state.label}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const one = chosen.length === 1 ? chosen[0] : null;

  return (
    <View className="gap-3">
      {/* The sports, one line that scrolls sideways; "All" stays put at its end. */}
      <View className="flex-row items-center gap-1.5">
        {isWide ? (
          <TouchableOpacity onPress={() => stripRef.current?.scrollTo({ x: Math.max(0, scrollX.current - 220), animated: true })} accessibilityLabel="Earlier sports" className="w-8 h-8 rounded-full border border-line bg-card items-center justify-center">
            <Ionicons name="chevron-back" size={14} color={themeColor(isDark, 'ink-soft')} />
          </TouchableOpacity>
        ) : null}
        <ScrollView
          ref={stripRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={e => { scrollX.current = e.nativeEvent.contentOffset.x; }}
          scrollEventThrottle={32}
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 6, paddingVertical: 2, paddingHorizontal: 2 }}
        >
          {sportIds.map(chip)}
          {setupMode && canEdit && onAddSport ? (
            <TouchableOpacity onPress={onAddSport} accessibilityRole="button" className="flex-row items-center gap-1 rounded-xl border border-dashed border-line-strong px-3 py-2">
              <Ionicons name="add" size={14} color={themeColor(isDark, 'primary-ink')} />
              <Text className="font-inter-bold text-sm text-primary-ink">Sport</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
        {isWide ? (
          <TouchableOpacity onPress={() => stripRef.current?.scrollTo({ x: scrollX.current + 220, animated: true })} accessibilityLabel="More sports" className="w-8 h-8 rounded-full border border-line bg-card items-center justify-center">
            <Ionicons name="chevron-forward" size={14} color={themeColor(isDark, 'ink-soft')} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => setPickerOpen(true)} accessibilityRole="button" accessibilityLabel="All sports" className="flex-row items-center gap-1 rounded-xl border border-line bg-card px-2.5 py-2">
          <Text className="font-inter-semibold text-[13px] text-ink-soft">All {sportIds.length}</Text>
          <Ionicons name="chevron-down" size={13} color={themeColor(isDark, 'ink-muted')} />
        </TouchableOpacity>
      </View>

      {/* The chosen sport. */}
      <View className="flex-row items-center gap-2.5">
        <View className="flex-1 min-w-0">
          <Text className="font-inter-bold text-base text-ink">{sportName(current)}</Text>
          <Text className="font-inter text-xs text-ink-muted">{plural(chosen.length, 'division')} · {plural(teamTotal, 'team')}</Text>
        </View>
        {sportMenu ? sportMenu(current) : null}
      </View>

      {one ? (
        <View className="rounded-2xl border border-line bg-card p-3.5 gap-2.5">
          <TouchableOpacity onPress={() => onOpenDivision(one)} accessibilityRole="link" className="gap-2.5">
          <View className="flex-row items-center gap-2.5">
            <Text className="font-inter-bold text-lg text-ink">{one.name}</Text>
            <View className={`w-2 h-2 rounded-full ${DOT[divisionState(one).tone]}`} />
            <Text className={`font-inter-semibold text-xs ${STATE_TEXT[divisionState(one).tone]}`}>{divisionState(one).label}</Text>
            <View className="flex-1" />
            <Ionicons name="chevron-forward" size={16} color={themeColor(isDark, 'ink-muted')} />
          </View>
          <View className="flex-row flex-wrap">
            {[['Format', divisionFormatLabel(one)], ['Who can play', one.ageGroup || 'Any age'], ['Teams', String(teamsIn(one))]].map(([k, v]) => (
              <View key={k} style={{ marginRight: 24, marginBottom: 4 }}>
                <Text className="font-inter-semibold text-[11px] text-ink-muted uppercase tracking-wider">{k}</Text>
                <Text className="font-inter text-sm text-ink-soft">{v}</Text>
              </View>
            ))}
          </View>
          </TouchableOpacity>
          {setupMode && canEdit && onAddDivision ? (
            <View className="flex-row flex-wrap items-center gap-2 pt-2.5 border-t border-line-soft">
              <Text className="font-inter text-[13px] text-ink-muted flex-1">All {sportName(current)} teams play in this one division.</Text>
              <TouchableOpacity onPress={() => onAddDivision(current)} accessibilityRole="button">
                <Text className="font-inter-bold text-[13px] text-primary-ink">＋ Split into divisions</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2.5">
          {chosen.map(tile)}
          {setupMode && canEdit && onAddDivision ? (
            <TouchableOpacity
              onPress={() => onAddDivision(current)}
              accessibilityRole="button"
              className="rounded-2xl border border-dashed border-line-strong items-center justify-center p-3"
              style={{ width: isWide ? '31.8%' : '48.5%', minHeight: 104 }}
            >
              <Text className="font-inter-bold text-sm text-primary-ink text-center">＋ Add a {sportName(current)} division</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* "All ▾": every sport at once, to jump straight to one. */}
      <Modal transparent visible={pickerOpen} animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable onPress={() => setPickerOpen(false)} className="flex-1 bg-overlay/60 items-center justify-center px-6">
          <Pressable onPress={() => {}} className="w-full max-w-sm rounded-2xl overflow-hidden bg-card border border-line p-1.5">
            <Text className="font-inter-bold text-xs text-ink-muted uppercase tracking-wider px-3 pt-2.5 pb-1.5">Sports</Text>
            {sportIds.map(id => (
              <TouchableOpacity key={id} onPress={() => choose(id)} className={`flex-row items-center gap-2.5 px-3 py-2.5 rounded-xl ${id === current ? 'bg-sunken' : ''}`}>
                <Text className={`text-sm flex-1 ${id === current ? 'font-inter-bold text-ink' : 'font-inter text-ink'}`}>{sportName(id)}</Text>
                {dot(attention(id))}
                <Text className="font-inter text-xs text-ink-muted">{plural(divisionsOf(id).length, 'division')}</Text>
              </TouchableOpacity>
            ))}
            {setupMode && canEdit && onAddSport ? (
              <TouchableOpacity onPress={() => { setPickerOpen(false); onAddSport(); }} className="px-3 py-2.5 border-t border-line-soft mt-1">
                <Text className="font-inter-bold text-sm text-primary-ink">＋ Add a sport</Text>
              </TouchableOpacity>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Schools
 * ------------------------------------------------------------------------------------------- */

export interface SchoolRow {
  org: Pick<OrgBadge, 'id' | 'name'> & Partial<Pick<OrgBadge, 'logo' | 'logoConfig' | 'primaryColor'>>;
  teams: number;
  isHost: boolean;
}

/** The schools taking part, the host first, each with its crest and how many teams it has entered. */
export function SchoolsList({ rows, highlightOrgId }: { rows: SchoolRow[]; highlightOrgId?: string }) {
  return (
    <View>
      {rows.map((row, i) => {
        const isYou = row.org.id === highlightOrgId;
        return (
          <View key={row.org.id} className={`flex-row items-center gap-2.5 py-2 ${i ? 'border-t border-line-soft' : ''}`}>
            <FixtureCrest
              participant={{ id: row.org.id, orgId: row.org.id, orgLogo: row.org.logo, orgLogoConfig: row.org.logoConfig, orgPrimaryColor: row.org.primaryColor }}
              size={26}
            />
            <Text className="flex-1 font-inter-semibold text-sm text-ink" numberOfLines={1}>{row.org.name}</Text>
            {isYou ? (
              <View className="rounded-full bg-sunken px-2 py-0.5"><Text className="font-inter-semibold text-[11px] text-ink-muted">You</Text></View>
            ) : null}
            {row.isHost ? (
              <View className="rounded-full bg-sunken px-2 py-0.5"><Text className="font-inter-semibold text-[11px] text-ink-muted">Host</Text></View>
            ) : null}
            <Text className="font-inter text-xs text-ink-muted">{row.teams ? plural(row.teams, 'team') : row.isHost ? 'No teams yet' : 'Invited · no teams yet'}</Text>
          </View>
        );
      })}
    </View>
  );
}
