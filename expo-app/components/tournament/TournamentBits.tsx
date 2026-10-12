import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventOrgInvitation, GameSummary, OrgBadge, Sport, TournamentDivision, TournamentEntrant, drawChanges, isEntrantEntered } from '@sk/shared';
import { FixtureCrest } from '../events/EventBits';
import { formatLabel, formatOfStages } from './DivisionDialogs';
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
 * scoring running on the unconfirmed default, some divisions drawn. There is no *Not needed*: every
 * section applies to every tournament, and one that may be switched off says so with an option of
 * its own (2026-10-10).
 */
export type StepState = 'done' | 'part' | 'none';

export const isFinished = (state: StepState) => state === 'done';

const STATE_LABEL: Record<StepState, string> = {
  done: 'Done',
  part: 'In progress',
  none: 'Not started',
};

const SEGMENT_FILL: Record<StepState, string> = {
  done: 'bg-success',
  part: 'bg-warning',
  none: 'bg-line-strong',
};
const SEGMENT_TEXT: Record<StepState, string> = {
  done: 'text-success-ink',
  part: 'text-warning-ink',
  none: 'text-ink-muted',
};

/**
 * How far setting up has got, in the banner (2026-10-09): "Setting up · 2 of 5 done", then one
 * segment per section — green finished, amber in progress, grey not started — each labelled on a
 * wide screen and each a way to its card.
 */
export function SetupProgress({ sections, phone, onJump }: {
  sections: Array<{ key: string; title: string; state: StepState }>;
  phone: boolean;
  onJump: (key: string) => void;
}) {
  const done = sections.filter(s => isFinished(s.state)).length;
  return (
    <View className="border-t border-line-soft pt-3 gap-2">
      <View className="flex-row items-baseline gap-2.5">
        <Text className="font-inter-bold text-[13px] text-ink">Setting up</Text>
        <Text className="font-inter text-[13px] text-ink-muted">{done} of {sections.length} done</Text>
      </View>
      <View className="flex-row gap-1.5">
        {sections.map(s => (
          <TouchableOpacity
            key={s.key}
            onPress={() => onJump(s.key)}
            accessibilityRole="link"
            accessibilityLabel={`${s.title}, ${STATE_LABEL[s.state]}`}
            className="flex-1 min-w-0 gap-1.5 py-1"
          >
            <View className={`h-1.5 rounded-full ${SEGMENT_FILL[s.state]}`} />
            {phone ? null : <Text className={`font-inter-semibold text-xs ${SEGMENT_TEXT[s.state]}`} numberOfLines={1}>{s.title}</Text>}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/** A section's state in words, on its heading while the tournament is being set up. */
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

/**
 * How a division is played, from its stages — "Round robin", or "Pools & knockout" for the
 * two-stage shape. The tournament's own `format` is not this: every tournament is created a
 * Festival and the real formats live on each division's stages.
 */
export function divisionFormatLabel(division: TournamentDivision): string {
  // The same words as the division's page (`FIX-27`), from the outline its record carries.
  const stages = division.stages?.length ? division.stages : division.stageShapes || [];
  if (!stages.length) return 'No format yet';
  return formatLabel(formatOfStages(stages), stages);
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
 * Where a division has got to, in a few words — one rule for its tile on the tournament page and
 * its own page, so the two always say the same (`FIX-27`).
 *
 * While setting up (an organiser, before any of its games has started): *Needs more teams*, *Not
 * drawn yet*, *Changed since the draw*, *Draw made*. Otherwise: *N live · x of y played*,
 * *Fixtures to come*, *Finished*, *x of y played*, *N fixtures*.
 *
 * `entrants` is the whole roster, withdrawn teams included — a withdrawn team still in the draw is
 * one of the two changes `drawChanges` looks for.
 */
export function divisionStateOf({ setupMode, games, entrants, firstStageId, afterDayEnd = 0 }: {
  setupMode: boolean;
  /** The division's own fixtures. */
  games: GameSummary[];
  entrants: TournamentEntrant[];
  firstStageId?: string | null;
  /** Its fixtures placed after its last day's end (Phase 7) — a warning. */
  afterDayEnd?: number;
}): DivisionState {
  const live = games.filter(g => g.status === 'Live').length;
  const played = games.filter(g => g.status === 'Finished').length;
  const started = live > 0 || played > 0;
  if (setupMode && !started) {
    if (entrants.filter(e => isEntrantEntered(e.status)).length < 2) return { tone: 'wait', label: 'Needs more teams' };
    if (!games.length) return { tone: 'mute', label: 'Not drawn yet' };
    if (drawChanges(firstStageId, games, entrants).count > 0) return { tone: 'wait', label: 'Changed since the draw' };
    // Phase 7: drawn is half of it; Fixtures is done once every fixture has a time and a facility.
    const unscheduled = games.filter(g => g.status !== 'Cancelled' && (!g.startTime || !!g.timeTbd || !g.facilityId)).length;
    if (unscheduled === games.length) return { tone: 'mute', label: 'Draw made · not scheduled' };
    if (unscheduled) return { tone: 'wait', label: `${plural(unscheduled, 'fixture')} without a time` };
    if (afterDayEnd) return { tone: 'wait', label: `${afterDayEnd} after the day ends` };
    return { tone: 'ok', label: 'Scheduled' };
  }
  if (live) return { tone: 'live', label: `${live} live · ${played} of ${games.length} played` };
  if (!games.length) return { tone: 'mute', label: 'Fixtures to come' };
  if (played === games.length) return { tone: 'ok', label: 'Finished' };
  if (played) return { tone: 'ok', label: `${played} of ${games.length} played` };
  return { tone: 'ok', label: plural(games.length, 'fixture') };
}

/** A division's state as its tile and its page show it: a coloured dot and the words. */
export function DivisionStateLine({ state, large }: { state: DivisionState; large?: boolean }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={`w-2 h-2 rounded-full ${DOT[state.tone]}`} />
      <Text className={`font-inter-semibold ${large ? 'text-sm' : 'text-xs'} ${STATE_TEXT[state.tone]}`} numberOfLines={1}>{state.label}</Text>
    </View>
  );
}

/** Below this width a card's heading actions use their short labels ("＋ Add" for "＋ Add organisation"). */
const NARROW_CARD = 560;

/**
 * A section's heading: the title larger than anything inside the card and on a line of its own, so
 * each section reads as one (agreed 2026-10-09, `mockups/tournament-cards.html`; design_system.md,
 * *Section headings*). The status sits beside the title whenever it fits (2026-10-10). On a phone
 * the actions take a second line; on a wider screen they share the title's line when they fit and
 * drop to a second line when they do not — the title never wraps into them.
 */
export function SectionHeading({ title, count, status, right, caret, onToggle, phone, accessibilityLabel }: {
  title: React.ReactNode;
  count?: number | string;
  /** Where a setup section stands — only while the tournament is being set up. */
  status?: StepState | null;
  right?: React.ReactNode;
  /** A folding card's chevron, on the title's line. */
  caret?: 'open' | 'closed';
  onToggle?: () => void;
  phone: boolean;
  accessibilityLabel?: string;
}) {
  const isDark = useActiveTheme() === 'dark';
  // The status rides with the title, wrapping under it only when the two do not fit on one line.
  const titleEl = (
    <View className="flex-row flex-wrap items-center gap-x-2.5 gap-y-1 flex-shrink min-w-0">
      <View className="flex-row items-baseline gap-2 flex-shrink min-w-0">
        {typeof title === 'string' ? (
          <Text className="font-inter-bold text-[18px] text-ink flex-shrink" numberOfLines={1}>{title}</Text>
        ) : title}
        {count !== undefined ? <Text className="font-inter text-[15px] text-ink-muted">{count}</Text> : null}
      </View>
      {status ? <StepPills state={status} /> : null}
    </View>
  );
  const chevron = caret ? (
    <Ionicons name={caret === 'open' ? 'chevron-up' : 'chevron-down'} size={16} color={themeColor(isDark, 'ink-muted')} />
  ) : null;
  const meta = right ? (
    <View className="flex-row items-center gap-3.5 flex-wrap justify-end" style={{ flexGrow: 1 }}>{right}</View>
  ) : null;
  // The title's line toggles a folding card; the actions beside it stay their own buttons.
  const titleLine = onToggle ? (
    <TouchableOpacity onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: caret === 'open' }} accessibilityLabel={accessibilityLabel} className="flex-row items-center gap-2.5">
      {titleEl}
      <View className="flex-1" />
      {chevron}
    </TouchableOpacity>
  ) : (
    <View className="flex-row items-center gap-2.5">{titleEl}<View className="flex-1" />{chevron}</View>
  );
  if (phone) return <View className="gap-1.5">{titleLine}{meta}</View>;
  return (
    <View className="flex-row flex-wrap items-center gap-x-2.5 gap-y-1.5">
      {onToggle ? <View style={{ flexShrink: 1, minWidth: 0 }}>{titleLine}</View> : titleEl}
      {meta}
    </View>
  );
}

/**
 * The heading of a section's full page (`events/[eventId]/sports`, `…/organisations`): the card's
 * own heading, larger — title, count, status and actions — so the page reads as that card opened up.
 */
export function SectionPageHeading({ title, count, status, right, phone }: {
  title: string;
  count?: number;
  status?: StepState | null;
  right?: React.ReactNode;
  phone: boolean;
}) {
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-2 px-0.5">
      <View className="flex-row items-baseline gap-2 flex-shrink min-w-0">
        <Text className="font-inter-bold text-ink" style={{ fontSize: phone ? 21 : 24 }} numberOfLines={2}>{title}</Text>
        {count !== undefined ? <Text className="font-inter text-base text-ink-muted">{count}</Text> : null}
      </View>
      {status ? <StepPills state={status} /> : null}
      <View className="flex-1" />
      {right ? <View className="flex-row items-center gap-3 flex-wrap">{right}</View> : null}
    </View>
  );
}

/**
 * A card on the tournament's pages: a section heading (title, count, status, actions) and its body.
 * The tournament page, its full pages and the division page all build from it. `right` may be a
 * function, given whether the card is narrow, so an action can shorten its label before it wraps.
 * `folded` shows only the heading and `summary`.
 */
export function TournamentCard({ title, count, right, status, folded, summary, onToggle, children }: {
  title: React.ReactNode;
  count?: number | string;
  right?: React.ReactNode | ((narrow: boolean) => React.ReactNode);
  status?: StepState | null;
  /** Folding, on a phone while setting up: `undefined` for a card that does not fold. */
  folded?: boolean;
  summary?: string;
  onToggle?: () => void;
  children?: React.ReactNode;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const narrow = width > 0 && width < NARROW_CARD;
  const folds = folded !== undefined && !!onToggle;
  return (
    <View className="rounded-2xl border border-line bg-card p-4 gap-3" onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      <SectionHeading
        title={title}
        count={count}
        status={status}
        right={typeof right === 'function' ? right(narrow) : right}
        caret={folds ? (folded ? 'closed' : 'open') : undefined}
        onToggle={folds ? onToggle : undefined}
        phone={windowWidth < 768}
        accessibilityLabel={typeof title === 'string' ? `${title}${summary ? `, ${summary}` : ''}` : undefined}
      />
      {folds && folded ? (
        summary ? <Text className="font-inter text-[13px] text-ink-muted -mt-1.5" numberOfLines={2}>{summary}</Text> : null
      ) : children}
    </View>
  );
}

/**
 * A row of chips that never shows a scrollbar (agreed 2026-10-09): one line that scrolls sideways,
 * with ‹ › only when there is more than fits, each gone at its end. A swipe works too. `focusX` is
 * brought into view, so choosing never leaves the chosen chip behind an arrow.
 */
export function ChipCarousel({ children, focusX }: { children: React.ReactNode; focusX?: number }) {
  const isDark = useActiveTheme() === 'dark';
  const ref = useRef<ScrollView>(null);
  const [x, setX] = useState(0);
  const [viewW, setViewW] = useState(0);
  const [contentW, setContentW] = useState(0);
  const overflows = contentW > viewW + 1;
  const atStart = x <= 1;
  const atEnd = x + viewW >= contentW - 1;
  useEffect(() => {
    if (focusX === undefined || !viewW) return;
    if (focusX < x || focusX > x + viewW - 80) ref.current?.scrollTo({ x: Math.max(0, focusX - 8), animated: true });
    // Only when the chosen chip changes, not on every scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusX, viewW]);
  const arrow = (dir: -1 | 1) => (
    <TouchableOpacity
      onPress={() => ref.current?.scrollTo({ x: Math.max(0, x + dir * viewW * 0.8), animated: true })}
      accessibilityLabel={dir < 0 ? 'Earlier' : 'More'}
      className="w-8 h-8 rounded-full border border-line bg-card items-center justify-center"
    >
      <Ionicons name={dir < 0 ? 'chevron-back' : 'chevron-forward'} size={14} color={themeColor(isDark, 'ink-soft')} />
    </TouchableOpacity>
  );
  return (
    <View className="flex-row items-center gap-1.5">
      {overflows && !atStart ? arrow(-1) : null}
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={e => setX(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={32}
        onLayout={e => setViewW(e.nativeEvent.layout.width)}
        onContentSizeChange={w => setContentW(w)}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 6, paddingVertical: 2, paddingHorizontal: 2 }}
      >
        {children}
      </ScrollView>
      {overflows && !atEnd ? arrow(1) : null}
    </View>
  );
}

/** One sport's chip: its name, its division count, and a dot when it needs seeing to. */
export function SportChip({ name, count, on, dot, onPress, onLayout }: {
  name: string;
  count: number;
  on: boolean;
  dot?: 'wait' | 'live' | null;
  onPress: () => void;
  onLayout?: (x: number) => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      onLayout={onLayout ? e => onLayout(e.nativeEvent.layout.x) : undefined}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      className={`flex-row items-center gap-2 rounded-xl border px-3 py-2 ${on ? 'bg-raised border-line-selected shadow-sm' : 'bg-card border-line shadow-none'}`}
    >
      <Text className={`font-inter-semibold text-sm ${on ? 'text-ink' : 'text-ink-muted'}`}>{name}</Text>
      <Text className="font-inter text-xs text-ink-muted">{count}</Text>
      {dot ? <View className={`w-2 h-2 rounded-full ${dot === 'live' ? 'bg-danger' : 'bg-warning'}`} /> : null}
    </TouchableOpacity>
  );
}

/** A division tile's least width, and the gap between tiles (`gap-2.5`). */
const MIN_TILE = 160;
const TILE_GAP = 10;

/**
 * One sport: its heading (name, divisions and teams, its ⋯) and its divisions as tiles, with
 * ＋ Add a … division while setting up. The same on the Sports & divisions card, which shows the
 * chosen sport, and on the full page, which shows every sport.
 */
export function SportBlock({ sportId, sportName, divisions, entrantsByDivision, divisionState, onOpenDivision, onAddDivision, canAddDivision, sportMenu }: {
  sportId: string;
  sportName: string;
  /** This sport's divisions. */
  divisions: TournamentDivision[];
  entrantsByDivision: Map<string, TournamentEntrant[]>;
  divisionState: (division: TournamentDivision) => DivisionState;
  onOpenDivision: (division: TournamentDivision) => void;
  onAddDivision?: (sportId: string) => void;
  /** Which sports offer the ＋ — all of them unless said; a sport's organiser has only their own. */
  canAddDivision?: (sportId: string) => boolean;
  sportMenu?: (sportId: string) => React.ReactNode;
}) {
  const teamsIn = (d: TournamentDivision) => (entrantsByDivision.get(d.id) || []).filter(e => isEntrantEntered(e.status)).length;
  const teamTotal = divisions.reduce((sum, d) => sum + teamsIn(d), 0);
  /*
   * As many tiles across as fit at about 160px each, from two (a phone) to six (the full page on a
   * wide screen) — measured, so a card in a column and the full page both fill their width
   * (2026-10-11). Two across until the first measure.
   */
  const [rowWidth, setRowWidth] = useState(0);
  const across = Math.max(2, Math.min(6, Math.floor((rowWidth + TILE_GAP) / (MIN_TILE + TILE_GAP))));
  const tileWidth = rowWidth ? (rowWidth - TILE_GAP * (across - 1)) / across : '48.5%';
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2.5">
        <View className="flex-1 min-w-0">
          <Text className="font-inter-bold text-base text-ink">{sportName}</Text>
          <Text className="font-inter text-xs text-ink-muted">{plural(divisions.length, 'division')} · {plural(teamTotal, 'team')}</Text>
        </View>
        {sportMenu ? sportMenu(sportId) : null}
      </View>
      <View className="flex-row flex-wrap gap-2.5" onLayout={e => setRowWidth(e.nativeEvent.layout.width)}>
        {divisions.map(d => (
          <TouchableOpacity
            key={d.id}
            onPress={() => onOpenDivision(d)}
            accessibilityRole="link"
            className="rounded-2xl border border-line bg-card p-3 gap-1.5"
            style={{ width: tileWidth, minHeight: 104 }}
          >
            <Text className="font-inter-bold text-[15px] text-ink" numberOfLines={1}>{d.name}</Text>
            <Text className="font-inter text-xs text-ink-muted" numberOfLines={2}>
              {divisionFormatLabel(d)}{'\n'}{d.ageGroup || 'Any age'} · {plural(teamsIn(d), 'team')}
            </Text>
            <View className="mt-auto">
              <DivisionStateLine state={divisionState(d)} />
            </View>
          </TouchableOpacity>
        ))}
        {onAddDivision && (canAddDivision?.(sportId) ?? true) ? (
          <TouchableOpacity
            onPress={() => onAddDivision(sportId)}
            accessibilityRole="button"
            className="rounded-2xl border border-dashed border-line-strong items-center justify-center p-3"
            style={{ width: tileWidth, minHeight: 104 }}
          >
            <Text className="font-inter-bold text-sm text-primary-ink text-center">＋ Add a {sportName} division</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Sports & divisions, one sport at a time (agreed 2026-10-04): the sports as a carousel of chips,
 * then the chosen sport. Adding a sport is the card's heading action, never a chip, and there is no
 * *All N* list any more (2026-10-09): the arrows and the card's *See all ›* page cover jumping.
 */
export function SportsDivisions({
  sports, sportIds, divisions, entrantsByDivision, divisionState, isWide, attention, onOpenDivision, onAddDivision, canAddDivision, sportMenu,
}: {
  sports: Sport[];
  /** The tournament's sports, in its order. */
  sportIds: string[];
  divisions: TournamentDivision[];
  entrantsByDivision: Map<string, TournamentEntrant[]>;
  divisionState: (division: TournamentDivision) => DivisionState;
  isWide: boolean;
  /** A sport with something to see to — a dot on its chip. */
  attention: (sportId: string) => 'wait' | 'live' | null;
  onOpenDivision: (division: TournamentDivision) => void;
  onAddDivision?: (sportId: string) => void;
  /** Which sports offer the ＋ — all of them unless said; a sport's organiser has only their own. */
  canAddDivision?: (sportId: string) => boolean;
  /** The ⋯ on the chosen sport's heading, for an organiser. */
  sportMenu?: (sportId: string) => React.ReactNode;
}) {
  const [selected, setSelected] = useState<string | undefined>(sportIds[0]);
  const chipX = useRef<Record<string, number>>({});
  const [focusX, setFocusX] = useState<number | undefined>(undefined);
  const current = sportIds.includes(selected || '') ? selected! : sportIds[0];
  const sportName = (id: string) => sports.find(s => s.id === id)?.name || 'Sport';
  const divisionsOf = (id: string) => divisions.filter(d => d.sportId === id);

  if (!sportIds.length) {
    return (
      <Text className="font-inter text-sm text-ink-muted">
        No sports yet. Choose the sports being played — each gets its first division straight away.
      </Text>
    );
  }
  return (
    <View className="gap-3">
      <ChipCarousel focusX={focusX}>
        {sportIds.map(id => (
          <SportChip
            key={id}
            name={sportName(id)}
            count={divisionsOf(id).length}
            on={id === current}
            dot={attention(id)}
            onPress={() => { setSelected(id); setFocusX(chipX.current[id]); }}
            onLayout={x => { chipX.current[id] = x; }}
          />
        ))}
      </ChipCarousel>
      <SportBlock
        sportId={current}
        sportName={sportName(current)}
        divisions={divisionsOf(current)}
        entrantsByDivision={entrantsByDivision}
        divisionState={divisionState}
        onOpenDivision={onOpenDivision}
        onAddDivision={onAddDivision}
        canAddDivision={canAddDivision}
        sportMenu={sportMenu}
      />
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
  withdrawal_pending: 'Withdrawal pending',
  withdrawn: 'Withdrawn',
};
const INVITATION_TONE: Record<EventOrgInvitation, string> = {
  not_invited: 'bg-warning-soft text-warning-ink',
  invited: 'bg-info-soft text-info-ink',
  accepted: 'bg-success-soft text-success-ink',
  declined: 'bg-danger-soft text-danger-ink',
  withdrawal_pending: 'bg-warning-soft text-warning-ink',
  withdrawn: 'bg-danger-soft text-danger-ink',
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
  /** Its teams' answers (`FIX-31`): still to answer, declined, and requests waiting for the organisers. */
  toAnswer?: number;
  declinedTeams?: number;
  requests?: number;
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
export function OrgsList({ rows, isWide, showInvitations, onOpen, highlightOrgId, beforeDivisions, fullEntries }: {
  rows: OrgRow[];
  isWide: boolean;
  showInvitations: boolean;
  onOpen?: (orgId: string) => void;
  highlightOrgId?: string;
  /** Nothing can be entered yet, so the second line says so rather than counting nothing. */
  beforeDivisions?: boolean;
  /** The full page has room: every entry, wrapping, rather than the line that steps down to fit. */
  fullEntries?: boolean;
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
        ) : entered && fullEntries ? (
          <Text className="font-inter text-xs text-ink-muted">
            {[...enteredVersions(row)[0], ...(contact ? [contact] : [])].map((part, k) =>
              typeof part === 'string' ? part : <Text key={k} className="font-inter-semibold text-ink-soft">{part.strong}</Text>)}
          </Text>
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
              {showInvitations && (row.toAnswer || row.requests || row.declinedTeams) ? (
                // How its teams stand (`FIX-31`): what waits in the warning colour, a decline plainly.
                <Text className="font-inter text-xs text-ink-muted" numberOfLines={1}>
                  {[
                    row.toAnswer ? <Text key="a" className="font-inter-semibold text-warning-ink">{plural(row.toAnswer, 'team')} to answer</Text> : null,
                    row.requests ? <Text key="r" className="font-inter-semibold text-warning-ink">{plural(row.requests, 'request')} to answer</Text> : null,
                    row.declinedTeams ? <Text key="d">{row.declinedTeams} declined</Text> : null,
                  ].filter(Boolean).flatMap((part, k) => (k ? [' · ', part] : [part]))}
                </Text>
              ) : null}
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
 * How many things need seeing to, as a small amber count — "⚠ 2" — on a section's heading. The
 * warnings themselves are listed in the section, one a line (2026-10-09: listed, not folded away
 * behind the badge, now that the section is a card of its own).
 */
export function WarningsCount({ count }: { count: number }) {
  const isDark = useActiveTheme() === 'dark';
  if (!count) return null;
  return (
    <View className="flex-row items-center gap-1 rounded-full bg-warning-soft px-2.5 py-0.5" accessibilityLabel={plural(count, 'warning')}>
      <Ionicons name="warning-outline" size={12} color={themeColor(isDark, 'warning-ink')} />
      <Text className="font-inter-bold text-xs text-warning-ink">{count}</Text>
    </View>
  );
}

/** The warnings, one a line, each with where to put it right. `limit` shows the first few and how many more. */
export function WarningsList({ warnings, limit, onMore }: { warnings: StepWarning[]; limit?: number; onMore?: () => void }) {
  const isDark = useActiveTheme() === 'dark';
  if (!warnings.length) return null;
  const shown = limit && warnings.length > limit ? warnings.slice(0, limit) : warnings;
  const hidden = warnings.length - shown.length;
  return (
    <View className="rounded-xl bg-warning-soft px-3 py-1">
      {shown.map((w, i) => (
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
      {hidden > 0 && onMore ? (
        <TouchableOpacity onPress={onMore} accessibilityRole="link" className="py-2 border-t border-warning/30">
          <Text className="font-inter-bold text-[13px] text-warning-ink">{plural(hidden, 'more warning')} ›</Text>
        </TouchableOpacity>
      ) : null}
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
