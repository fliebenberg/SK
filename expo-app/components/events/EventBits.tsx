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
}

export function fixtureSideNames(participant: GameSummaryParticipant | undefined, ownOrgId?: string): FixtureSideNames {
  const side = resolveFixtureSide({ participant });
  if (side.isPlaceholder || !participant?.name) {
    return { full: side.label, short: side.label, isPlaceholder: side.isPlaceholder };
  }
  const team = participant.name;
  const isOwn = !!ownOrgId && participant.orgId === ownOrgId;
  const orgName = participant.orgName || participant.orgShortName;
  return {
    full: isOwn || !orgName ? team : `${orgName} ${team}`,
    short: [participant.orgShortName, participant.teamShortName || team].filter(Boolean).join(' '),
    isPlaceholder: false,
  };
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
