import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GameSummary, isScoreNotProvided } from '@sk/shared';
import { OverflowMenu, OverflowMenuItem } from '../OverflowMenu';
import { Guardianship, GuardianshipTag, PersonAvatar } from '../people/PersonBits';
import { fixtureDateParts, whenMs } from '../../utils/dates';
import { Outcome, isUpcoming, opponentOf, outcomeOf, recordOf, scoresFor } from './TeamBits';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/**
 * The cards of the team page (docs/teams.md): a card shell with a count, a roster row, and the
 * Games card with its record strip.
 */

/** A card on the team page: a label with its count, an optional action, and its rows. */
export function SectionCard({ label, count, action, onAction, children }: {
  label: string;
  /** "22", or "1 of 22" while a search narrows the card. */
  count?: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <View className="rounded-2xl border p-4 gap-2.5 bg-card border-line">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="font-inter-bold text-sm text-ink-soft">
          {label}
          {count ? <Text className="font-inter text-ink-muted">{`  ${count}`}</Text> : null}
        </Text>
        {action && onAction ? (
          <TouchableOpacity onPress={onAction} hitSlop={12} accessibilityRole="button" className="flex-row items-center gap-1">
            <Ionicons name="add" size={15} color={themeColor(isDark, 'primary')} />
            <Text className="font-inter-bold text-sm text-primary-ink">{action}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** A quiet line in a card: what is missing, or what a search did not find. */
export function CardNote({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <Text className="font-inter text-sm text-ink-muted">
      {text}
      {action && onAction ? (
        <>
          {' '}
          <Text onPress={onAction} accessibilityRole="button" className="font-inter-bold text-primary-ink">{action}</Text>
        </>
      ) : null}
    </Text>
  );
}

/** A "Show all" / "Show fewer" link at the foot of a card. */
export function ShowMore({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" className="self-start pt-1">
      <Text className="font-inter-bold text-sm text-primary-ink">{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * One player or staff member. The row opens their person page; its one ⋯ menu holds the team's
 * own actions (design_system.md rule 15). A player shows the Minor or Dependant tag and org ID the
 * People list shows (rule 14); a staff member shows their role.
 */
export function RosterRow({ name, image, imageConfig, guardianship, orgPersonId, role, first, onPress, menu }: {
  name: string;
  image?: string | null;
  imageConfig?: any;
  guardianship?: Guardianship;
  orgPersonId?: string;
  role?: string;
  first: boolean;
  /** Absent when they have no membership to open. */
  onPress?: () => void;
  menu?: OverflowMenuItem[];
}) {
  return (
    <View className={`flex-row items-center gap-1 -mx-4 pl-4 pr-2 ${first ? '' : 'border-t border-line-soft'}`}>
      <TouchableOpacity
        onPress={onPress}
        disabled={!onPress}
        activeOpacity={0.7}
        accessibilityRole={onPress ? 'link' : undefined}
        className="flex-1 flex-row items-center gap-2.5 py-2 min-w-0"
      >
        <PersonAvatar name={name} image={image} imageConfig={imageConfig} size={32} />
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-1.5">
            <Text className="font-inter-semibold text-sm text-ink flex-shrink" numberOfLines={1}>{name}</Text>
            <GuardianshipTag kind={guardianship ?? null} />
            {orgPersonId ? (
              <Text className="ml-auto pl-2 font-inter text-xs text-ink-muted flex-shrink-0" style={{ fontVariant: ['tabular-nums'] }}>
                {orgPersonId}
              </Text>
            ) : null}
          </View>
          {role ? <Text className="font-inter text-xs text-ink-muted mt-0.5">{role}</Text> : null}
        </View>
      </TouchableOpacity>
      {menu?.length ? <OverflowMenu items={menu} title={name} accessibilityLabel={`Actions for ${name}`} /> : <View className="w-2" />}
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Games
 * --------------------------------------------------------------------------------------------- */

const SHOWN_PER_SECTION = 3;
/** The width the strip needs to keep Points on one line; narrower, Points is left out. */
const POINTS_MIN_WIDTH = 340;

/**
 * The record, then the next games and the results, each opening its game. While a search is on,
 * only the matching games are listed and the record counts only those — a head-to-head when the
 * search names an opponent.
 */
export function GamesCard({ games, total, teamId, eventNames, query, canEdit, onOpenGame, onPickTeam }: {
  /** The games to show — all of the team's, or those matching the search. */
  games: GameSummary[];
  total: number;
  teamId: string;
  eventNames: Map<string, string>;
  query: string;
  canEdit: boolean;
  onOpenGame: (game: GameSummary) => void;
  onPickTeam: (game: GameSummary) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const searching = !!query.trim();
  const count = searching ? `${games.length} of ${total}` : total ? String(total) : undefined;

  if (!total) {
    return (
      <SectionCard label="Games">
        <CardNote text="No games yet. Games are added to an event, and show here once this team is in one." />
      </SectionCard>
    );
  }
  if (!games.length) {
    return (
      <SectionCard label="Games" count={count}>
        <CardNote text={`No games match “${query.trim()}”.`} />
      </SectionCard>
    );
  }

  const upcoming = games.filter(isUpcoming).sort((a, b) => whenOf(a) - whenOf(b));
  const results = games.filter(g => !isUpcoming(g)).sort((a, b) => whenOf(b) - whenOf(a));
  const all = searching || showAll;
  const next = all ? upcoming : upcoming.slice(0, SHOWN_PER_SECTION);
  const past = all ? results : results.slice(0, SHOWN_PER_SECTION);
  const record = recordOf(results, teamId);
  const hidden = upcoming.length + results.length - next.length - past.length;

  return (
    <SectionCard label="Games" count={count}>
      {record.played ? (
        <View className="gap-1.5">
          {searching ? (
            <Text className="font-inter text-xs text-ink-muted">
              {record.played === 1 ? 'Record in this game' : `Record in these ${record.played} games`}
            </Text>
          ) : null}
          <RecordStrip record={record} />
        </View>
      ) : null}
      {next.length ? (
        <View>
          <SectionLabel text="Next" />
          {next.map((g, i) => (
            <GameRow key={g.id} game={g} teamId={teamId} eventName={eventNames.get(g.eventId)} first={i === 0} canEdit={canEdit} onOpen={onOpenGame} onPickTeam={onPickTeam} />
          ))}
        </View>
      ) : null}
      {past.length ? (
        <View>
          <SectionLabel text="Results" />
          {past.map((g, i) => (
            <GameRow key={g.id} game={g} teamId={teamId} eventName={eventNames.get(g.eventId)} first={i === 0} canEdit={canEdit} onOpen={onOpenGame} onPickTeam={onPickTeam} />
          ))}
        </View>
      ) : null}
      {!searching && (hidden > 0 || showAll) ? (
        <ShowMore label={showAll ? 'Show fewer games' : `Show all ${total} games`} onPress={() => setShowAll(v => !v)} />
      ) : null}
    </SectionCard>
  );
}

const whenOf = (g: GameSummary) => {
  const ms = whenMs(g.scheduledStartTime || g.startTime);
  return Number.isNaN(ms) ? 0 : ms;
};

function SectionLabel({ text }: { text: string }) {
  return <Text className="font-inter-bold text-xs uppercase tracking-wider text-ink-muted mt-1 mb-0.5">{text}</Text>;
}

function RecordStrip({ record }: { record: ReturnType<typeof recordOf> }) {
  const [width, setWidth] = useState(0);
  const cells: { label: string; value: string; tone?: string }[] = [
    { label: 'Played', value: String(record.played) },
    { label: 'Won', value: String(record.won), tone: 'text-success-ink' },
    { label: 'Drawn', value: String(record.drawn), tone: 'text-warning-ink' },
    { label: 'Lost', value: String(record.lost), tone: 'text-danger-ink' },
  ];
  // Points needs the most room; it is left out rather than wrapped when the strip is narrow.
  if (width >= POINTS_MIN_WIDTH) cells.push({ label: 'Points', value: `${record.pointsFor}–${record.pointsAgainst}` });
  return (
    <View className="flex-row gap-1.5" onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {cells.map(cell => (
        <View key={cell.label} className="flex-1 rounded-lg bg-sunken py-2 px-1 items-center">
          <Text
            numberOfLines={1}
            className={`font-orbitron-bold ${cell.label === 'Points' ? 'text-sm' : 'text-base'} ${cell.tone || 'text-ink'}`}
          >
            {cell.value}
          </Text>
          <Text className="font-inter text-[11px] text-ink-muted mt-0.5">{cell.label}</Text>
        </View>
      ))}
    </View>
  );
}

// colour-data: dark fills under a white letter, the same in both themes, so not theme tokens.
const OUTCOME: Record<Outcome, { letter: string; bg: string; label: string }> = {
  w: { letter: 'W', bg: '#065F46', label: 'Won' }, // colour-data: see above
  d: { letter: 'D', bg: '#92400E', label: 'Drawn' }, // colour-data: see above
  l: { letter: 'L', bg: '#991B1B', label: 'Lost' }, // colour-data: see above
};

function GameRow({ game, teamId, eventName, first, canEdit, onOpen, onPickTeam }: {
  game: GameSummary;
  teamId: string;
  eventName?: string;
  first: boolean;
  canEdit: boolean;
  onOpen: (game: GameSummary) => void;
  onPickTeam: (game: GameSummary) => void;
}) {
  const parts = fixtureDateParts(game.scheduledStartTime || game.startTime, { timeTbd: game.timeTbd });
  const upcoming = isUpcoming(game);
  const sub = [upcoming ? parts?.when : null, eventName].filter(Boolean).join(' · ');
  const outcome = outcomeOf(game, teamId);
  const { mine, theirs } = scoresFor(game, teamId);

  let right: React.ReactNode = null;
  if (game.status === 'Live') {
    right = <Text className="font-inter-bold text-[11px] text-on-danger bg-danger rounded-full px-2 py-0.5 overflow-hidden">LIVE</Text>;
  } else if (game.status === 'Scheduled') {
    right = canEdit ? (
      <TouchableOpacity onPress={() => onPickTeam(game)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Pick the team for ${opponentOf(game, teamId)}`}>
        <Text className="font-inter-bold text-sm text-primary-ink">Pick team</Text>
      </TouchableOpacity>
    ) : null;
  } else if (game.status === 'Cancelled') {
    right = <Text className="font-inter text-xs text-ink-muted">Cancelled</Text>;
  } else if (isScoreNotProvided(game)) {
    right = <Text className="font-inter text-xs text-ink-muted">No score</Text>;
  } else if (outcome) {
    const o = OUTCOME[outcome];
    right = (
      <View className="flex-row items-center gap-1.5" accessibilityLabel={`${o.label} ${mine} to ${theirs}`}>
        <Text className="font-inter-bold text-sm text-ink" style={{ fontVariant: ['tabular-nums'] }}>{mine}–{theirs}</Text>
        <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: o.bg }}>
          <Text className="font-inter-bold text-[11px] text-on-fill">{o.letter}</Text>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={() => onOpen(game)}
      activeOpacity={0.7}
      accessibilityRole="link"
      className={`flex-row items-center gap-2.5 py-2 ${first ? '' : 'border-t border-line-soft'}`}
    >
      <View className="w-11 items-center">
        {parts ? (
          <>
            <Text className="font-inter-bold text-base leading-tight text-ink">{parts.day}</Text>
            <Text className="font-inter text-[11px] uppercase text-ink-muted">{parts.month}</Text>
          </>
        ) : (
          <Text className="font-inter text-[11px] text-ink-muted">TBD</Text>
        )}
      </View>
      <View className="flex-1 min-w-0">
        <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>vs {opponentOf(game, teamId)}</Text>
        {sub ? <Text className="font-inter text-xs text-ink-muted mt-0.5" numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right}
    </TouchableOpacity>
  );
}
