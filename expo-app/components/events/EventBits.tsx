import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GameSummary, GameSummaryParticipant, hasLiveScore, orgColors, resolveFixtureSide } from '@sk/shared';
import { OrgLogo } from '../OrgLogo';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/**
 * Small pieces of the Fixtures & Events list (docs/events.md), kept apart from the screen so the
 * event and game pages can show a fixture the same way when they are redesigned (rule 14).
 */

/** One side of a fixture, as the rows print it. */
export interface FixtureSideNames {
  /** A wide row: our own team by its name, another organisation's as "Menlopark U15A". */
  full: string;
  /** A phone row: "MPK U15A" — the organisation's and the team's short codes. */
  short: string;
  /** Nobody is playing this side yet — "Pool A winner", "TBC". Drawn with a dashed crest. */
  isPlaceholder: boolean;
  /**
   * Every way to print the side, longest first, for a row to step down through until one fits:
   * "Test Riverbend High School U16 A", "RBH U16 A", "RBH U16A", "U16A". Our own team has no
   * organisation to drop: "U16 A", "U16A". Past the last one the name is cut short.
   */
  steps: string[];
  /** The same for a phone, which starts at the short codes: "RBH U16A", "U16A". */
  shortSteps: string[];
}

/** The list without a repeat of the entry before it — a team with no short name has fewer steps. */
const distinctSteps = (steps: Array<string | undefined>) =>
  steps.filter((s, i, all): s is string => !!s && s !== all[i - 1]);

export function fixtureSideNames(participant: GameSummaryParticipant | undefined, ownOrgId?: string): FixtureSideNames {
  const side = resolveFixtureSide({ participant });
  if (side.isPlaceholder || !participant?.name) {
    return { full: side.label, short: side.label, isPlaceholder: side.isPlaceholder, steps: [side.label], shortSteps: [side.label] };
  }
  const team = participant.name;
  const teamShort = participant.teamShortName?.trim() || team;
  const code = participant.orgShortName;
  const isOwn = !!ownOrgId && participant.orgId === ownOrgId;
  const orgName = participant.orgName || code;
  const full = isOwn || !orgName ? team : `${orgName} ${team}`;
  const short = [code, teamShort].filter(Boolean).join(' ');
  return {
    full,
    short,
    isPlaceholder: false,
    steps: isOwn
      ? distinctSteps([team, teamShort])
      : distinctSteps([full, code ? `${code} ${team}` : undefined, code ? short : undefined, teamShort]),
    shortSteps: distinctSteps([short, teamShort]),
  };
}

/* ---------------------------------------------------------------------------------------------
 * Fitting a name to its room
 * ------------------------------------------------------------------------------------------- */

/**
 * Invisible copies of some texts, drawn at their natural width so a row can learn how wide each
 * version of a name would be before choosing one — the measuring `SegmentedControl` does for its
 * counts. `className` must be the class the shown text uses, or the widths are for the wrong font.
 */
function useTextWidths(texts: string[], className: string): [Record<string, number>, React.ReactNode] {
  const [widths, setWidths] = React.useState<Record<string, number>>({});
  const unique = Array.from(new Set(texts));
  const measurer = (
    <View pointerEvents="none" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }} aria-hidden>
      <View style={{ width: 10000, alignItems: 'flex-start' }}>
        {unique.map(text => (
          <Text
            key={text}
            numberOfLines={1}
            className={className}
            onLayout={e => {
              const w = Math.ceil(e.nativeEvent.layout.width);
              setWidths(prev => (prev[text] === w ? prev : { ...prev, [text]: w }));
            }}
          >
            {text}
          </Text>
        ))}
      </View>
    </View>
  );
  return [widths, measurer];
}

/**
 * Which step of each side's name to print so the two fit in `room` together. Both start at their
 * longest; while they do not fit, the side currently printing the wider name steps down, so a short
 * name is not shortened for a long one. When both are at their last step, the last is used and the
 * text cuts itself short. `null` until every width is known, when the caller shows the longest.
 */
function chooseSteps(sides: string[][], widths: Record<string, number>, room: number): number[] | null {
  if (!room || sides.some(steps => steps.some(s => widths[s] === undefined))) return null;
  const levels = sides.map(() => 0);
  const total = () => levels.reduce((sum, level, i) => sum + widths[sides[i][level]], 0);
  while (total() > room) {
    const order = levels
      .map((level, i) => ({ i, w: widths[sides[i][level]], canStep: level < sides[i].length - 1 }))
      .filter(s => s.canStep)
      .sort((a, b) => b.w - a.w);
    if (!order.length) break;
    levels[order[0].i] += 1;
  }
  return levels;
}

/**
 * A fixture's two sides on one line, for a wide row: crest, name, "vs", crest, name, then any tags.
 * The names step down (`FixtureSideNames.steps`) until the line fits.
 */
export function FixtureLine({ home, away, homeParticipant, awayParticipant, struck, tags }: {
  home: FixtureSideNames;
  away: FixtureSideNames;
  homeParticipant?: GameSummaryParticipant;
  awayParticipant?: GameSummaryParticipant;
  struck?: boolean;
  tags?: React.ReactNode;
}) {
  const nameClass = 'font-inter-semibold text-[15px]';
  const [widths, measurer] = useTextWidths([...home.steps, ...away.steps], nameClass);
  const [lineWidth, setLineWidth] = React.useState(0);
  const [fixedWidth, setFixedWidth] = React.useState({ vs: 0, tags: 0 });
  const CREST = 26;
  const GAP = 8;
  // Everything on the line that is not a name: two crests with their gaps, "vs", the tags, and the
  // gaps between the parts.
  const parts = tags ? 4 : 3;
  const fixed = 2 * (CREST + GAP) + fixedWidth.vs + fixedWidth.tags + GAP * (parts - 1);
  const levels = chooseSteps([home.steps, away.steps], widths, lineWidth - fixed - 2);
  const label = (names: FixtureSideNames, level: number | undefined) => names.steps[level ?? 0];

  const side = (names: FixtureSideNames, participant: GameSummaryParticipant | undefined, level: number | undefined) => (
    <View className="flex-row items-center gap-2 min-w-0 flex-shrink">
      <FixtureCrest participant={participant} size={CREST} placeholder={names.isPlaceholder} />
      <Text
        numberOfLines={1}
        className={`flex-shrink ${names.isPlaceholder ? 'font-inter italic text-[15px] text-ink-muted' : `${nameClass} ${struck ? 'line-through text-ink-muted' : 'text-ink'}`}`}
      >
        {label(names, level)}
      </Text>
    </View>
  );

  return (
    <View className="flex-row items-center gap-2 min-w-0" onLayout={e => setLineWidth(e.nativeEvent.layout.width)}>
      {measurer}
      {side(home, homeParticipant, levels?.[0])}
      <Text
        className="font-inter text-[13px] text-ink-muted"
        onLayout={e => { const vs = Math.ceil(e.nativeEvent.layout.width); setFixedWidth(f => (f.vs === vs ? f : { ...f, vs })); }}
      >
        vs
      </Text>
      {side(away, awayParticipant, levels?.[1])}
      {tags ? (
        <View
          className="flex-shrink-0"
          onLayout={e => { const t = Math.ceil(e.nativeEvent.layout.width); setFixedWidth(f => (f.tags === t ? f : { ...f, tags: t })); }}
        >
          {tags}
        </View>
      ) : null}
    </View>
  );
}

/**
 * One side of a phone row's scoreboard line, in half the row: its name steps down
 * (`FixtureSideNames.shortSteps`) until it fits beside the crest.
 */
export function FixtureSideFitted({ names, participant, align, struck }: {
  names: FixtureSideNames;
  participant?: GameSummaryParticipant;
  align: 'left' | 'right';
  struck?: boolean;
}) {
  const nameClass = names.isPlaceholder ? 'font-inter italic text-[13px]' : 'font-inter-bold text-[13px]';
  const [widths, measurer] = useTextWidths(names.shortSteps, nameClass);
  const [width, setWidth] = React.useState(0);
  const CREST = 24;
  const GAP = 6;
  const levels = chooseSteps([names.shortSteps], widths, width - CREST - GAP - 2);
  const crest = <FixtureCrest participant={participant} size={CREST} placeholder={names.isPlaceholder} />;
  return (
    <View
      className={`flex-1 min-w-0 flex-row items-center gap-1.5 ${align === 'right' ? 'justify-end' : ''}`}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
    >
      {measurer}
      {align === 'left' ? crest : null}
      <Text
        numberOfLines={1}
        className={`flex-shrink ${nameClass} ${names.isPlaceholder ? 'text-ink-muted' : struck ? 'line-through text-ink-muted' : 'text-ink'}`}
      >
        {names.shortSteps[levels?.[0] ?? 0]}
      </Text>
      {align === 'right' ? crest : null}
    </View>
  );
}

/**
 * A side's crest at list size: its organisation's logo, or a shield in the organisation's colour
 * when it has none — the same mark as the Teams list (`TeamCrest`), without the short-name band,
 * which is unreadable this small. A side nobody is playing yet gets a dashed outline.
 */
export function FixtureCrest({ participant, size = 26, placeholder }: {
  participant?: GameSummaryParticipant;
  size?: number;
  placeholder?: boolean;
}) {
  const radius = Math.round(size * 0.27);
  if (placeholder || !participant?.orgId) {
    return (
      <View
        style={{ width: size, height: size, borderRadius: radius, borderStyle: 'dashed', borderWidth: 1.5 }}
        className="items-center justify-center border-ink-faint"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text className="font-inter-bold text-[10px] text-ink-faint">?</Text>
      </View>
    );
  }
  const { primary } = orgColors({ primaryColor: participant.orgPrimaryColor });
  return (
    <View
      style={{ width: size, height: size, borderRadius: radius }}
      className="items-center justify-center overflow-hidden border border-line bg-card"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {participant.orgLogo ? (
        <OrgLogo logo={participant.orgLogo} settings={{ logoConfig: participant.orgLogoConfig || undefined }} size={Math.round(size * 0.86)} />
      ) : (
        <Ionicons name="shield" size={Math.round(size * 0.72)} color={primary} />
      )}
    </View>
  );
}

/** The date tile at the start of a row — weekday, day, month — the same tile as the team and site pages. */
export function DateTile({ tile, width = 44 }: { tile: { weekday: string; day: string; month: string } | null; width?: number }) {
  if (!tile) return <View style={{ width }} />;
  const isRange = tile.day.includes('–');
  return (
    <View style={{ width }} className="items-center flex-shrink-0">
      <Text className="font-inter-semibold text-[10px] text-ink-muted uppercase">{tile.weekday}</Text>
      <Text className={`font-inter-bold text-ink ${isRange ? 'text-[13px]' : 'text-[17px]'}`} numberOfLines={1}>{tile.day}</Text>
      <Text className="font-inter text-[10px] text-ink-muted uppercase" numberOfLines={1}>{tile.month}</Text>
    </View>
  );
}

/** A tournament's mark, the size of a crest, where a match has its teams' crests. */
export function TournamentMark({ size = 26 }: { size?: number }) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.27) }} className="items-center justify-center bg-primary-soft">
      <Ionicons name="trophy" size={Math.round(size * 0.55)} color={themeColor(isDark, 'primary-ink')} />
    </View>
  );
}

export type RowTagTone = 'away' | 'convening' | 'cancelled' | 'setup' | 'live';

const TAG_CLASSES: Record<RowTagTone, { box: string; text: string }> = {
  away: { box: 'bg-info-soft', text: 'text-info-ink' },
  convening: { box: 'bg-special-soft', text: 'text-special-ink' },
  cancelled: { box: 'bg-danger-soft', text: 'text-danger-ink' },
  setup: { box: 'bg-warning-soft', text: 'text-warning-ink' },
  live: { box: 'bg-danger', text: 'text-on-fill' },
};

/** A small rounded tag — Away, Convening, Cancelled, No fixtures yet, Live. */
export function RowTag({ tone, label }: { tone: RowTagTone; label: string }) {
  const c = TAG_CLASSES[tone];
  return (
    <View className={`rounded-full px-2 py-0.5 flex-shrink-0 ${c.box}`}>
      <Text className={`font-inter-semibold text-[11px] ${c.text}`} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Each side's score, in participant order — `null` before kick-off or when no score was recorded. */
export function sideScores(game?: GameSummary): [number, number] | null {
  if (!game || !hasLiveScore(game)) return null;
  const [home, away] = game.participants || [];
  if (!home || !away) return null;
  return [game.scores?.[home.id] ?? 0, game.scores?.[away.id] ?? 0];
}
