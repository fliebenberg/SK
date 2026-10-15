import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Game, GameSummary, GameSummaryParticipant, TournamentStandingRow } from '@sk/shared';
import { TournamentCard, QuietTag } from '../tournament/TournamentBits';
import { FixtureCrest, RowTag, sideScores } from '../events/EventBits';
import { EditLink } from '../ReadCard';
import { EventLogFeed } from '../sports/shared/EventLogFeed';
import { DynamicScoringProvider } from '../sports/shared/DynamicScoringContext';
import { LineupPlayer } from '../../hooks/useGameLineups';
import { useLiveRoom } from '../../hooks/useLiveRoom';
import { formatInstantDate, formatKickoffTime } from '../../utils/dates';

/**
 * The pieces of the game page (stage 3, agreed 2026-10-14 on `mockups/game-read-first.html`,
 * option B revised): the scoreboard with its buttons, and the Teams, Match events, When & where and
 * division cards. The page itself is `games/[gameId]/index.tsx`; decisions in docs/events.md §9.
 */

/** Where a game has got to, in the words the page uses. */
export type GameMoment = 'notPlaced' | 'tbc' | 'before' | 'live' | 'done' | 'cancelled';

/**
 * A tournament fixture with no time or no court is **not placed** — "No time yet", as on the
 * Schedule. A single match with a date and no time is **TBC**. Those are different things: TBC means
 * the day is fixed and the time is not (agreed 2026-10-15).
 */
export function gameMoment(summary: GameSummary, isFixture: boolean): GameMoment {
  if (summary.status === 'Cancelled') return 'cancelled';
  if (summary.status === 'Live') return 'live';
  if (summary.status === 'Finished') return 'done';
  const when = summary.scheduledStartTime || summary.startTime;
  if (isFixture && (!when || summary.timeTbd || !summary.facilityId)) return 'notPlaced';
  if (!when || summary.timeTbd) return 'tbc';
  return 'before';
}

/** "Valley Prep U13 A": the organisation and the team, unless the team's name already says it. */
export function sideLabel(p?: GameSummaryParticipant): string {
  if (!p) return 'TBC';
  const team = p.name || p.entrantLabel || 'TBC';
  const org = p.orgName || p.orgShortName;
  return org && !team.startsWith(org) ? `${org} ${team}` : team;
}

/* ------------------------------------------------------------------------------------------------ */
/* The scoreboard                                                                                    */
/* ------------------------------------------------------------------------------------------------ */

export interface ScoreboardAction {
  label: string;
  onPress: () => void;
  /** The next step for this viewer — the one highlighted. */
  primary?: boolean;
}

/**
 * The two teams and, between them, the kick-off or the score. Above them a line back to where the
 * game belongs (the sport for a match; tournament · division · round for a fixture) and its status;
 * below them when and where once, and the buttons, in the order things happen.
 */
export function Scoreboard({ summary, moment, isWide, kicker, statusRight, whereLine, homeSides, actions }: {
  summary: GameSummary;
  moment: GameMoment;
  isWide: boolean;
  /** The line above the teams; links in it are the caller's. */
  kicker: React.ReactNode;
  /** The status at the top right, if it is not already said in the middle. */
  statusRight?: React.ReactNode;
  /** "Sat 24 Oct 2026 · 10:00 · Valley Prep Main Campus · Field 1". */
  whereLine: string;
  /** Participant ids playing at their own organisation's site (*Home*). */
  homeSides: Set<string>;
  actions: ScoreboardAction[];
}) {
  const [home, away] = summary.participants || [];
  const when = summary.scheduledStartTime || summary.startTime;
  const scores = sideScores(summary);
  const crest = isWide ? 52 : 40;

  let middle: React.ReactNode;
  if (moment === 'cancelled') {
    middle = (
      <>
        <RowTag tone="cancelled" label="Cancelled" />
        {when ? <Text className="font-inter text-xs text-ink-muted mt-1">{formatInstantDate(when)}</Text> : null}
      </>
    );
  } else if ((moment === 'live' || moment === 'done') && scores) {
    middle = (
      <>
        <Text accessibilityLabel={`Score ${scores[0]} to ${scores[1]}`} className={`font-inter-bold ${moment === 'live' ? 'text-danger-ink' : 'text-ink'}`} style={{ fontSize: isWide ? 46 : 32, lineHeight: isWide ? 52 : 38 }}>
          {scores[0]} – {scores[1]}
        </Text>
        <Text className="font-inter text-xs text-ink-muted mt-1">{moment === 'done' ? 'Full time' : summary.periodLabel || 'Live'}</Text>
      </>
    );
  } else if (moment === 'done' && summary.resultNotProvided) {
    middle = <Text className="font-inter-semibold text-sm text-ink-muted">No score</Text>;
  } else if (moment === 'notPlaced' || moment === 'tbc') {
    middle = (
      <>
        <Text className="font-inter-bold text-[15px] text-warning-ink">{moment === 'notPlaced' ? 'No time yet' : 'Time TBC'}</Text>
        {when && moment === 'tbc' ? <Text className="font-inter text-xs text-ink-muted mt-1">{formatInstantDate(when)}</Text> : null}
      </>
    );
  } else {
    middle = (
      <>
        <Text className="font-inter-bold text-ink" style={{ fontSize: isWide ? 26 : 21 }}>{formatKickoffTime(when)}</Text>
        <Text className="font-inter text-xs text-ink-muted mt-1">{formatInstantDate(when)}</Text>
      </>
    );
  }

  const side = (p: GameSummaryParticipant | undefined, right: boolean) => (
    <View className={`flex-1 min-w-0 items-center gap-2 ${isWide ? (right ? 'flex-row-reverse' : 'flex-row') : ''}`}>
      <FixtureCrest participant={p} size={crest} />
      <View className={`min-w-0 gap-1 ${isWide ? `flex-1 ${right ? 'items-end' : 'items-start'}` : 'self-stretch items-center'}`}>
        <Text className={`font-inter-bold text-ink ${isWide ? `text-xl ${right ? 'text-right' : ''}` : 'text-[15px] text-center'}`} numberOfLines={2}>
          {isWide ? sideLabel(p) : p?.name || p?.entrantLabel || 'TBC'}
        </Text>
        {!isWide && p?.orgName ? <Text className="font-inter text-xs text-ink-muted text-center" numberOfLines={2}>{p.orgName}</Text> : null}
        {p && homeSides.has(p.id) ? <QuietTag label="Home" /> : null}
      </View>
    </View>
  );

  return (
    <View className="rounded-2xl border border-line bg-card p-4 gap-3.5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">{kicker}</View>
        {statusRight}
      </View>
      <View className="flex-row items-center gap-2">
        {side(home, false)}
        <View className="items-center px-1" style={{ minWidth: isWide ? 120 : 84 }}>{middle}</View>
        {side(away, true)}
      </View>
      <Text className="font-inter text-sm text-ink-soft text-center">{whereLine}</Text>
      {actions.length ? (
        <View className={`border-t border-line-soft pt-3.5 gap-2 ${isWide ? 'flex-row flex-wrap justify-center' : 'flex-row'}`}>
          {actions.map(a => (
            <TouchableOpacity
              key={a.label}
              onPress={a.onPress}
              accessibilityRole="button"
              className={`rounded-xl items-center justify-center ${isWide ? 'px-4 py-2' : 'flex-1 px-1 py-2'} ${a.primary ? 'bg-primary' : 'border border-line bg-card'}`}
            >
              <Text className={`font-inter-bold ${isWide ? 'text-sm' : 'text-[13px]'} ${a.primary ? 'text-on-primary' : 'text-ink-soft'}`} numberOfLines={1}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Teams                                                                                            */
/* ------------------------------------------------------------------------------------------------ */

/**
 * Both sides' team sheets — in full, or (`summary`) one line a side with the number picked, for the
 * phone's Overview. *Who played* sits under a side from the draw, for whoever may edit; picking a
 * team is the scoreboard's button, so it is not offered here again (say it once).
 */
export function TeamsCard({ summary, lineups, homeSides, sideBySide, compact, started, onOpen, onWhoPlayed }: {
  summary: GameSummary;
  /** Live or finished: a side with no sheet had none, rather than is still to be picked. */
  started?: boolean;
  lineups: Record<string, LineupPlayer[] | null>;
  homeSides: Set<string>;
  /** Wide: the two sheets next to each other. */
  sideBySide?: boolean;
  /** One line a side, with a link to the full sheets. */
  compact?: boolean;
  onOpen?: () => void;
  onWhoPlayed?: (participantId: string) => void;
}) {
  const sides = (summary.participants || []).slice(0, 2);
  if (compact) {
    return (
      <TournamentCard title="Teams" right={onOpen ? <EditLink label="View" icon={null} onPress={onOpen} /> : undefined}>
        <View>
          {sides.map((p, i) => {
            const sheet = lineups[p.id];
            return (
              <View key={p.id} className={`flex-row items-center gap-2.5 py-2 ${i ? 'border-t border-line-soft' : ''}`}>
                <FixtureCrest participant={p} size={22} />
                <Text className="flex-1 font-inter-semibold text-sm text-ink" numberOfLines={1}>{sideLabel(p)}</Text>
                {homeSides.has(p.id) ? <QuietTag label="Home" /> : null}
                {sheet === null || sheet === undefined ? null : sheet.length
                  ? <Text className="font-inter text-xs text-ink-muted">{plural(sheet.length, 'player')}</Text>
                  : started ? <QuietTag label="No team sheet" /> : <RowTag tone="setup" label="Not picked" />}
              </View>
            );
          })}
        </View>
      </TournamentCard>
    );
  }
  return (
    <TournamentCard title="Teams">
      <View className={sideBySide ? 'flex-row gap-4' : 'gap-4'}>
        {sides.map(p => {
          const sheet = lineups[p.id];
          return (
            <View key={p.id} className={`gap-1.5 min-w-0 ${sideBySide ? 'flex-1' : ''}`}>
              <View className="flex-row items-center gap-2">
                <FixtureCrest participant={p} size={22} />
                <Text className="flex-1 font-inter-bold text-sm text-ink" numberOfLines={1}>{sideLabel(p)}</Text>
                {sheet && sheet.length ? <Text className="font-inter text-xs text-ink-muted">{plural(sheet.length, 'player')}</Text> : null}
              </View>
              {sheet === null || sheet === undefined ? (
                <Text className="font-inter text-xs text-ink-muted">Loading…</Text>
              ) : sheet.length ? (
                <View className="flex-row flex-wrap">
                  {sheet.map((pl, i) => (
                    <View key={pl.orgProfileId || i} className="flex-row gap-2 py-0.5" style={{ width: '50%' }}>
                      <Text className="font-inter text-[13px] text-ink-faint" style={{ width: 22 }}>{pl.jerseyNumber || i + 1}</Text>
                      <Text className="flex-1 font-inter text-[13px] text-ink-soft" numberOfLines={1}>{pl.name || 'Player'}{pl.isReserve ? ' (reserve)' : ''}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View className="rounded-xl border border-dashed border-line-strong px-3 py-2">
                  <Text className="font-inter text-[13px] text-ink-muted">{started ? 'No team sheet' : 'Not picked yet'}</Text>
                </View>
              )}
              {onWhoPlayed && p.entrantId ? (
                <TouchableOpacity onPress={() => onWhoPlayed(p.id)} accessibilityRole="button" className="self-start pt-0.5">
                  <Text className="font-inter-semibold text-[13px] text-ink-muted">Who played</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>
    </TournamentCard>
  );
}

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

/* ------------------------------------------------------------------------------------------------ */
/* Match events                                                                                     */
/* ------------------------------------------------------------------------------------------------ */

/** The game's log, once it has started. Wide, it scrolls inside a fixed height so *When & where* fits under it. */
export function MatchEventsCard({ game, height }: { game: Game; height: number }) {
  return (
    <TournamentCard title="Match events">
      <View style={{ height }}>
        <DynamicScoringProvider game={game}>
          <EventLogFeed gameId={game.id} game={game} canManage={false} plain />
        </DynamicScoringProvider>
      </View>
    </TournamentCard>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* When & where                                                                                     */
/* ------------------------------------------------------------------------------------------------ */

export function WhereCard({ moment, whenText, siteName, facilityName, facilityWord, sportName, onEdit, onPlace }: {
  moment: GameMoment;
  whenText: string;
  siteName?: string;
  facilityName?: string;
  /** "Field", "Court" — what the facility is called. */
  facilityWord: string;
  sportName?: string;
  /** Present for whoever may change it. */
  onEdit?: () => void;
  /** The way to give a game with no time one: *Set the time* (a match) or *Place it* (a fixture). */
  onPlace?: () => void;
}) {
  const unset = moment === 'tbc' || moment === 'notPlaced';
  const row = (k: string, v: React.ReactNode) => (
    <View className="flex-row gap-4">
      <Text className="font-inter text-sm text-ink-muted" style={{ width: 52 }}>{k}</Text>
      <View className="flex-1 min-w-0">{typeof v === 'string' ? <Text className="font-inter text-sm text-ink">{v}</Text> : v}</View>
    </View>
  );
  return (
    <TournamentCard title="When & where" right={onEdit && moment !== 'cancelled' ? <EditLink onPress={onEdit} /> : undefined}>
      <View className="gap-1.5">
        {row('When', unset ? (
          <Text className="font-inter text-sm text-ink">
            {whenText ? `${whenText} · ` : ''}
            <Text className="text-warning-ink">{moment === 'notPlaced' ? 'no time or court yet' : 'time to be confirmed'}</Text>
            {onPlace ? <Text className="font-inter-bold text-primary-ink" onPress={onPlace}>{` · ${moment === 'notPlaced' ? 'Place it' : 'Set the time'}`}</Text> : null}
          </Text>
        ) : whenText)}
        {row('Where', siteName || '—')}
        {facilityName ? row(facilityWord, facilityName) : null}
        {sportName ? row('Sport', sportName) : null}
      </View>
    </TournamentCard>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* The division                                                                                     */
/* ------------------------------------------------------------------------------------------------ */

/** A tournament fixture's division: where both teams stand in it, and the way to it. */
export function DivisionCard({ divisionId, title, subtitle, summary, onOpen }: {
  divisionId: string;
  title: string;
  subtitle?: string;
  summary: GameSummary;
  onOpen: () => void;
}) {
  const { items: stages } = useLiveRoom<{ stageId: string; rows: TournamentStandingRow[] }>(
    `division:${divisionId}:standings`,
    {
      reduce: (m) => m.type === 'DIVISION_STANDINGS_UPDATED' && m.data?.divisionId === divisionId
        ? { kind: 'replace', items: m.data?.stages || [] }
        : { kind: 'ignore' },
      getId: (s) => s.stageId,
    },
  );
  const stage = stages.find(s => s.stageId === summary.stageId) || stages[0];
  const rows = stage?.rows || [];
  const sides = (summary.participants || []).slice(0, 2);
  const placeOf = (entrantId?: string) => rows.find(r => r.entrantId === entrantId);
  const ordinal = (n: number) => {
    const teen = n % 100 >= 11 && n % 100 <= 13;
    return `${n}${teen ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
  };
  return (
    <TournamentCard title={title} right={<EditLink label="Open" icon={null} onPress={onOpen} />}>
      {subtitle ? <Text className="font-inter text-xs text-ink-muted -mt-1.5">{subtitle}</Text> : null}
      <View>
        {sides.map((p, i) => {
          const r = placeOf(p.entrantId);
          return (
            <View key={p.id} className={`flex-row items-center gap-2.5 py-2 ${i ? 'border-t border-line-soft' : ''}`}>
              <FixtureCrest participant={p} size={20} />
              <Text className="flex-1 font-inter-semibold text-sm text-ink" numberOfLines={1}>{sideLabel(p)}</Text>
              {r ? <Text className="font-inter text-xs text-ink-muted">{r.rank ? `${ordinal(r.rank)} · ` : ''}{r.points} pts</Text> : null}
            </View>
          );
        })}
      </View>
    </TournamentCard>
  );
}
