import React, { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventOrgInvitation, OrgBadge, Sport, TournamentDivision, TournamentEntrant, TournamentFormat } from '@sk/shared';
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

/**
 * The step's state in words. No *Next* beside it (2026-10-05, `FIX-26`): the steps are numbered,
 * which already says what order they go in, and the step to do next is the one that starts open.
 */
export function StepPills({ state }: { state: StepState }) {
  const box = isFinished(state) ? 'bg-success-soft' : state === 'part' ? 'bg-warning-soft' : 'bg-sunken';
  const text = isFinished(state) ? 'text-success-ink' : state === 'part' ? 'text-warning-ink' : 'text-ink-muted';
  return (
    <View className={`rounded-full px-2 py-0.5 flex-shrink-0 ${box}`}>
      <Text className={`font-inter-bold text-[11px] ${text}`}>{STATE_LABEL[state]}</Text>
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
  // Arrows only when the sports do not fit: measured against the room left without them, so showing
  // the arrows cannot itself make the strip fit and flip them off again.
  const [rowW, setRowW] = useState(0);
  const [allW, setAllW] = useState(0);
  const [stripW, setStripW] = useState(0);
  const overflows = stripW > rowW - allW - 6;

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

  return (
    <View className="gap-3">
      {/* The sports, one line that scrolls sideways; "All" stays put at its end. */}
      <View className="flex-row items-center gap-1.5" onLayout={e => setRowW(e.nativeEvent.layout.width)}>
        {isWide && overflows ? (
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
          onContentSizeChange={w => setStripW(w)}
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
        {isWide && overflows ? (
          <TouchableOpacity onPress={() => stripRef.current?.scrollTo({ x: scrollX.current + 220, animated: true })} accessibilityLabel="More sports" className="w-8 h-8 rounded-full border border-line bg-card items-center justify-center">
            <Ionicons name="chevron-forward" size={14} color={themeColor(isDark, 'ink-soft')} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => setPickerOpen(true)} onLayout={e => setAllW(e.nativeEvent.layout.width)} accessibilityRole="button" accessibilityLabel="All sports" className="flex-row items-center gap-1 rounded-xl border border-line bg-card px-2.5 py-2">
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
 * Organisations (FIX-26 — "organisations", never "schools": clubs take part too)
 * ------------------------------------------------------------------------------------------- */

const INVITATION_LABEL: Record<EventOrgInvitation, string> = {
  not_invited: 'Not invited yet',
  invited: 'Invited',
  accepted: 'Accepted',
  declined: 'Declined',
};
const INVITATION_TONE: Record<EventOrgInvitation, string> = {
  not_invited: 'bg-warning-soft text-warning-ink',
  invited: 'bg-info-soft text-info-ink',
  accepted: 'bg-success-soft text-success-ink',
  declined: 'bg-danger-soft text-danger-ink',
};

export const invitationLabel = (invitation: EventOrgInvitation) => INVITATION_LABEL[invitation];

/**
 * Where an organisation's invitation stands, as a badge. *Not invited yet* is a warning. `large`
 * beside a name in a banner, where the small one read as an afterthought.
 */
export function InvitationBadge({ invitation, large }: { invitation: EventOrgInvitation; large?: boolean }) {
  const [box, text] = INVITATION_TONE[invitation].split(' ');
  return (
    <View className={`rounded-full flex-shrink-0 ${large ? 'px-3 py-1' : 'px-2 py-0.5'} ${box}`}>
      <Text className={`${large ? 'font-inter-bold text-[13px]' : 'font-inter-semibold text-[11px]'} ${text}`}>{INVITATION_LABEL[invitation]}</Text>
    </View>
  );
}

/** A small grey tag beside a name: Host, You, No contact yet. */
export function QuietTag({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-sunken px-2 py-0.5 flex-shrink-0">
      <Text className="font-inter-semibold text-[11px] text-ink-muted">{label}</Text>
    </View>
  );
}

/** One piece of a line: plain text, or text in the stronger ink (a sport's name). */
export type LinePart = string | { strong: string };

/**
 * The longest of several versions of a line that fits on one line — the organisation rows'
 * "Netball U12 ×2, U13 · Rugby U10" → "Netball 3 · Rugby 2" → "2 sports · 5 teams". Each version
 * is drawn once, hidden, at its natural width (as the events list measures its names); until every
 * width is known the last, shortest one shows.
 */
export function FittedLine({ versions, className = 'font-inter text-xs text-ink-muted', strongClassName = 'font-inter-semibold text-ink-soft' }: {
  versions: LinePart[][];
  className?: string;
  strongClassName?: string;
}) {
  const [room, setRoom] = useState(0);
  const [widths, setWidths] = useState<Record<number, number>>({});
  const draw = (parts: LinePart[]) =>
    parts.map((part, i) => (typeof part === 'string' ? part : <Text key={i} className={strongClassName}>{part.strong}</Text>));
  const known = room > 0 && versions.every((_, i) => widths[i] !== undefined);
  const fits = known ? versions.findIndex((_, i) => widths[i] <= room) : -1;
  // None fits: the shortest, which then cuts itself short.
  const pick = fits === -1 ? versions.length - 1 : fits;
  return (
    <View className="min-w-0" onLayout={e => setRoom(Math.floor(e.nativeEvent.layout.width))}>
      <View pointerEvents="none" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }} aria-hidden>
        <View style={{ width: 10000, alignItems: 'flex-start' }}>
          {versions.map((parts, i) => (
            <Text
              key={i}
              numberOfLines={1}
              className={className}
              onLayout={e => {
                const w = Math.ceil(e.nativeEvent.layout.width);
                setWidths(prev => (prev[i] === w ? prev : { ...prev, [i]: w }));
              }}
            >
              {draw(parts)}
            </Text>
          ))}
        </View>
      </View>
      <Text numberOfLines={1} className={className}>{draw(versions[pick] || [])}</Text>
    </View>
  );
}

/** An organisation taking part, as the step and the Overview list it. */
export interface OrgRow {
  org: Pick<OrgBadge, 'id' | 'name'> & Partial<Pick<OrgBadge, 'logo' | 'logoConfig' | 'primaryColor' | 'isClaimed'>>;
  isHost: boolean;
  /** Absent for the host, whose row is not an invitation. */
  invitation?: EventOrgInvitation;
  /** Its active entrants, by sport in the tournament's order: `[sport, division names]`. */
  bySport: Array<[string, string[]]>;
  /** Of those, how many are teams (or players, in an individual sport) and how many are places to be named. */
  teams: number;
  players: number;
  toBeNamed: number;
}

/** "Netball U12 ×2, U13 · Rugby U10" and the two shorter versions of it. */
function enteredVersions(row: OrgRow): LinePart[][] {
  const tail = row.toBeNamed ? [` · ${row.toBeNamed} to be named`] : [];
  const full: LinePart[] = [];
  const counts: LinePart[] = [];
  row.bySport.forEach(([sport, names], i) => {
    const seen = new Map<string, number>();
    names.forEach(n => seen.set(n, (seen.get(n) || 0) + 1));
    if (i) { full.push(' · '); counts.push(' · '); }
    full.push({ strong: sport }, ` ${Array.from(seen).map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', ')}`);
    counts.push({ strong: sport }, ` ${names.length}`);
  });
  const total = [
    plural(row.bySport.length, 'sport'),
    row.teams ? plural(row.teams, 'team') : '',
    row.players ? plural(row.players, 'player') : '',
  ].filter(Boolean).join(' · ');
  return [[...full, ...tail], [...counts, ...tail], [total, ...tail]];
}

/**
 * The organisations taking part, the host first: crest, name, its invitation (for an organiser),
 * and what it has entered on one line. A row opens that organisation's dialog when `onOpen` is
 * given. `isWide` puts the team count at the right; on a phone the shortest version of the line
 * carries it, so the name keeps the first line's width.
 */
export function OrgsList({ rows, isWide, showInvitations, onOpen, highlightOrgId, beforeDivisions }: {
  rows: OrgRow[];
  isWide: boolean;
  showInvitations: boolean;
  onOpen?: (orgId: string) => void;
  highlightOrgId?: string;
  /** Nothing can be entered yet, so the second line says so rather than counting nothing. */
  beforeDivisions?: boolean;
}) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <View>
      {rows.map((row, i) => {
        const entered = row.teams + row.players + row.toBeNamed;
        const noContact = row.org.isClaimed === false && !row.isHost;
        const tags = (
          <>
            {row.isHost ? <QuietTag label="Host" /> : showInvitations && row.invitation ? <InvitationBadge invitation={row.invitation} /> : null}
            {row.org.id === highlightOrgId ? <QuietTag label="You" /> : null}
            {noContact && showInvitations && isWide ? <QuietTag label="No contact yet" /> : null}
          </>
        );
        const contact = noContact && showInvitations && !isWide ? ' · No contact yet' : '';
        const second = beforeDivisions ? (
          <Text className="font-inter text-xs text-ink-muted">{row.isHost ? 'Hosting' : 'Nothing to enter yet'}</Text>
        ) : entered ? (
          <FittedLine versions={enteredVersions(row).map(v => [...v, ...(contact ? [contact] : [])])} />
        ) : (
          <Text className="font-inter text-xs text-ink-muted" numberOfLines={1}>
            <Text className="font-inter-semibold text-warning-ink">No teams yet</Text>{contact}
          </Text>
        );
        const content = (
          <>
            <FixtureCrest
              participant={{ id: row.org.id, orgId: row.org.id, orgLogo: row.org.logo, orgLogoConfig: row.org.logoConfig, orgPrimaryColor: row.org.primaryColor }}
              size={26}
            />
            <View className="flex-1 min-w-0 gap-0.5">
              <View className="flex-row items-center gap-1.5 min-w-0">
                <Text className="flex-shrink font-inter-semibold text-sm text-ink" numberOfLines={1}>{row.org.name}</Text>
                {tags}
              </View>
              {second}
            </View>
            {isWide && !beforeDivisions && entered ? (
              <Text className="font-inter text-xs text-ink-muted">{plural(row.teams + row.players, row.players && !row.teams ? 'player' : 'team')}</Text>
            ) : null}
            {onOpen ? <Ionicons name="chevron-forward" size={14} color={themeColor(isDark, 'ink-muted')} /> : null}
          </>
        );
        const rowClass = `flex-row items-center gap-2.5 py-2 ${i ? 'border-t border-line-soft' : ''}`;
        return onOpen ? (
          <TouchableOpacity key={row.org.id} onPress={() => onOpen(row.org.id)} accessibilityRole="button" accessibilityLabel={`${row.org.name}, open its teams`} className={rowClass}>
            {content}
          </TouchableOpacity>
        ) : (
          <View key={row.org.id} className={rowClass}>{content}</View>
        );
      })}
    </View>
  );
}

/** A competitor entered under nobody's organisation yet — *Winner of the regional qualifier*. */
export function UnnamedList({ entrants, divisionName, onOpen }: {
  entrants: TournamentEntrant[];
  divisionName: (divisionId: string) => string;
  onOpen?: (entrant: TournamentEntrant) => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  if (!entrants.length) return null;
  return (
    <View className="gap-0.5">
      <Text className="font-inter-bold text-[11px] text-ink-muted uppercase tracking-wider mt-1">Still to be named</Text>
      {entrants.map((e, i) => (
        <TouchableOpacity
          key={e.id}
          disabled={!onOpen}
          onPress={() => onOpen?.(e)}
          accessibilityRole="link"
          className={`flex-row items-center gap-2.5 py-2 ${i ? 'border-t border-line-soft' : ''}`}
        >
          <FixtureCrest placeholder size={26} />
          <View className="flex-1 min-w-0">
            <Text className="font-inter italic text-sm text-ink" numberOfLines={1}>{e.label || e.name || 'To be named'}</Text>
            <Text className="font-inter text-xs text-ink-muted" numberOfLines={1}>{divisionName(e.divisionId)} · named on the division page</Text>
          </View>
          {onOpen ? <Ionicons name="chevron-forward" size={14} color={themeColor(isDark, 'ink-muted')} /> : null}
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** Something that keeps a step from being done, with where to put it right. */
export interface StepWarning {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * What needs seeing to, as one badge — "⚠ 3 warnings" — that opens the list, one warning a line,
 * each with where to fix it (agreed 2026-10-05: a paragraph of gaps did not fit a phone).
 */
export function WarningsBadge({ warnings, open, onToggle }: { warnings: StepWarning[]; open: boolean; onToggle: () => void }) {
  const isDark = useActiveTheme() === 'dark';
  if (!warnings.length) return null;
  return (
    <TouchableOpacity
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      className="flex-row items-center gap-1.5 self-start rounded-full bg-warning-soft px-2.5 py-1"
    >
      <Ionicons name="warning-outline" size={13} color={themeColor(isDark, 'warning-ink')} />
      <Text className="font-inter-bold text-xs text-warning-ink">{plural(warnings.length, 'warning')}</Text>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={12} color={themeColor(isDark, 'warning-ink')} />
    </TouchableOpacity>
  );
}

export function WarningsList({ warnings }: { warnings: StepWarning[] }) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <View className="rounded-xl bg-warning-soft px-3 py-1">
      {warnings.map((w, i) => (
        <View key={i} className={`flex-row items-start gap-2 py-2 ${i ? 'border-t border-warning/30' : ''}`}>
          <Ionicons name="warning-outline" size={14} color={themeColor(isDark, 'warning-ink')} style={{ marginTop: 1 }} />
          <Text className="flex-1 font-inter text-[13px] text-ink-soft">{w.text}</Text>
          {w.actionLabel && w.onAction ? (
            <TouchableOpacity onPress={w.onAction} accessibilityRole="button" hitSlop={6}>
              <Text className="font-inter-bold text-[13px] text-primary-ink">{w.actionLabel} ›</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/**
 * Organisations added but not invited yet: the count and *Invite all* on one line, what that means
 * on one quiet line under it.
 */
export function NotInvitedBox({ count, nobodyYet, onInviteAll }: { count: number; nobodyYet: boolean; onInviteAll: () => void }) {
  if (!count) return null;
  return (
    <View className="rounded-xl border border-line px-3 py-2.5 gap-0.5">
      <View className="flex-row items-center gap-2.5">
        <Text className="flex-1 font-inter-bold text-sm text-ink">{nobodyYet ? 'Nobody invited yet' : `${count} not invited yet`}</Text>
        <TouchableOpacity onPress={onInviteAll} accessibilityRole="button" className="rounded-xl bg-primary px-3 py-1.5">
          <Text className="font-inter-bold text-[13px] text-on-primary">{count === 1 ? 'Invite' : `Invite all ${count}`}</Text>
        </TouchableOpacity>
      </View>
      <Text className="font-inter text-xs text-ink-muted">{count === 1 ? 'It' : 'They'} can't see this tournament until invited.</Text>
    </View>
  );
}
