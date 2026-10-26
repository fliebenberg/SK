import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Event, EventOrgInvitation, GameSummary, eventFormatLabel, isScoreNotProvided } from '@sk/shared';
import {
  DateTile,
  FixtureLine,
  FixtureSideFitted,
  RowTag,
  TournamentMark,
  fixtureSideNames,
  sideScores,
} from './EventBits';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import { calendarRangeTile, eventDayOfRange, formatKickoffTime, instantTile } from '../../utils/dates';
import { formatDistance } from '../../utils/distance';

/**
 * The rows of a list of fixtures and events (docs/events.md): a single match or any game
 * (`MatchRow`), a tournament (`TournamentRow`), and an event of a type the app does not know.
 * Used by the Fixtures & Events list (workspace and public) and by Home, which adds how far away
 * each one is (`km`).
 */

/**
 * The Where column on a wide row. Narrow on purpose: a venue is "Main Campus" over "A Field", and
 * the room is worth more to the teams' names, which step down to short codes when they run out.
 */
const WHERE_WIDTH = 160;


export interface RowBase {
  isWide: boolean;
  /** The organisation whose list this is: its own teams print without its name. None on Home. */
  orgId?: string;
  /** Kilometres from the viewer, on Home. */
  km?: number | null;
  canCreate: boolean;
  sportName: (id?: string) => string;
  siteName: (id?: string | null) => string;
  facilityName: (id?: string | null) => string;
  today: string;
  first: boolean;
  away: boolean;
  convening: boolean;
  onPress: () => void;
}

function RoleTags({ away, convening }: { away: boolean; convening: boolean }) {
  if (!away && !convening) return null;
  return (
    <View className="flex-row gap-1">
      {away ? <RowTag tone="away" label="Away" /> : null}
      {convening ? <RowTag tone="convening" label="Convening" /> : null}
    </View>
  );
}

/**
 * A fixture: a single match in the Events view, any game in All games. Wide: the date, both teams
 * with their crests, the sport (and the competition in All games), where, and the time, score or
 * state. Phone: a scoreboard line — home, the time or score, away — in short codes, with where and
 * the sport underneath.
 */
export function MatchRow({ game, event, competition, showDate, isWide, orgId, km, sportName, siteName, facilityName, first, away, convening, onPress }: RowBase & {
  game: GameSummary;
  event?: Event;
  competition?: string;
  showDate: boolean;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [home, visitor] = game.participants || [];
  const homeNames = fixtureSideNames(home, orgId);
  const awayNames = fixtureSideNames(visitor, orgId);
  const scores = sideScores(game);
  const isLive = game.status === 'Live';
  const isCancelled = game.status === 'Cancelled' || event?.status === 'Cancelled';
  const noScore = isScoreNotProvided(game);
  const kickoff = game.scheduledStartTime || game.startTime;
  const time = game.timeTbd || !kickoff ? null : formatKickoffTime(kickoff);
  const where = [siteName(game.siteId || event?.siteId), facilityName(game.facilityId || event?.facilityId)].filter(Boolean).join(' · ');
  const sport = sportName(game.sportId);
  const distance = formatDistance(km);
  const facility = facilityName(game.facilityId || event?.facilityId);
  const tile = showDate ? instantTile(kickoff) || calendarRangeTile(event?.startDate) : null;
  const border = first ? '' : 'border-t border-line-soft';
  const label = `${homeNames.full} against ${awayNames.full}`;
  const struck = isCancelled ? 'line-through text-ink-muted' : '';

  if (!isWide) {
    const middle = isLive && scores
      ? <Text className="font-orbitron-bold text-[15px] text-danger-ink">{scores[0]} – {scores[1]}</Text>
      : scores
      ? <Text className="font-orbitron-bold text-[15px] text-ink">{scores[0]} – {scores[1]}</Text>
      : noScore
      ? <Text className="font-inter text-xs text-ink-muted">No score</Text>
      : <Text className={`font-inter-bold text-sm ${time ? 'text-ink' : 'text-ink-muted'} ${struck}`}>{time || 'TBD'}</Text>;
    const line2 = competition ?? [where, sport, distance].filter(Boolean).join(' · ');
    const right = isLive
      ? <Text className="font-inter-semibold text-xs text-danger-ink">● {game.periodLabel || 'Live'}</Text>
      : isCancelled
      ? <RowTag tone="cancelled" label="Cancelled" />
      : (away || convening)
      ? <RoleTags away={away} convening={convening} />
      : scores ? <Text className="font-inter text-[11px] text-ink-muted">Full time</Text> : null;
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="link" accessibilityLabel={label} className={`flex-row items-center gap-2.5 px-3 py-2.5 ${border}`}>
        {showDate ? <DateTile tile={tile} width={34} /> : null}
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2">
            <FixtureSideFitted names={homeNames} participant={home} align="left" struck={isCancelled} />
            <View className="items-center" style={{ minWidth: 44 }}>{middle}</View>
            <FixtureSideFitted names={awayNames} participant={visitor} align="right" struck={isCancelled} />
          </View>
          <View className="flex-row items-center gap-2 mt-1">
            <Text className="flex-1 font-inter text-xs text-ink-muted" numberOfLines={1}>{line2}</Text>
            {right}
          </View>
          {competition !== undefined && where ? (
            <Text className="font-inter text-xs text-ink-muted" numberOfLines={1}>{where}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }

  const end = isLive ? (
    <>
      <RowTag tone="live" label="● Live" />
      {scores ? <Text className="font-orbitron-bold text-[15px] text-danger-ink">{scores[0]} – {scores[1]}</Text> : null}
      {game.periodLabel ? <Text className="font-inter-semibold text-[11px] text-danger-ink">{game.periodLabel}</Text> : null}
    </>
  ) : isCancelled ? (
    <RowTag tone="cancelled" label="Cancelled" />
  ) : scores ? (
    <>
      <Text className="font-orbitron-bold text-[15px] text-ink">{scores[0]} – {scores[1]}</Text>
      <Text className="font-inter text-[11px] text-ink-muted">Full time</Text>
    </>
  ) : noScore ? (
    <Text className="font-inter text-xs text-ink-muted">No score</Text>
  ) : (
    <Text className={`font-inter-bold text-sm ${time ? 'text-ink' : 'text-ink-muted'}`}>{time || 'Time TBD'}</Text>
  );
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="link" accessibilityLabel={label} className={`flex-row items-center gap-3 px-4 py-3 ${border}`}>
      {showDate ? <DateTile tile={tile} /> : null}
      <View className="flex-1 min-w-0">
        <FixtureLine
          home={homeNames}
          away={awayNames}
          homeParticipant={home}
          awayParticipant={visitor}
          struck={isCancelled}
          tags={away || convening ? <RoleTags away={away} convening={convening} /> : undefined}
        />
        <Text className="font-inter text-xs text-ink-muted mt-0.5" style={{ marginLeft: 34 }} numberOfLines={1}>
          {[competition, sport].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={{ width: WHERE_WIDTH }}>
        <Text className="font-inter text-sm text-ink-soft" numberOfLines={1}>{siteName(game.siteId || event?.siteId) || ' '}</Text>
        {facility || distance ? (
          <Text className="font-inter text-xs text-ink-muted" numberOfLines={1}>{[facility, distance].filter(Boolean).join(' · ')}</Text>
        ) : null}
      </View>
      <View style={{ width: 112 }} className="items-end gap-0.5">{end}</View>
      <Ionicons name="chevron-forward" size={16} color={themeColor(isDark, 'ink-muted')} />
    </TouchableOpacity>
  );
}

/** A tournament: its name and format, the sports, where, and how many games — or that it is on now. */
export function TournamentRow({ event, games, sportIds, isPast, isWide, canCreate, km, sportName, siteName, today, first, away, convening, invitation, onPress }: RowBase & {
  event: Event;
  games: GameSummary[];
  sportIds: string[];
  isPast: boolean;
  /** This organisation's invitation, when it does not host — its answer leads the row (`FIX-30`). */
  invitation?: EventOrgInvitation;
}) {
  const isDark = useActiveTheme() === 'dark';
  const tile = calendarRangeTile(event.startDate, event.endDate);
  const liveCount = games.filter(g => g.status === 'Live').length;
  const dayOf = eventDayOfRange(event.startDate, event.endDate, today);
  const sports = sportIds.map(sportName).filter(Boolean).join(', ');
  const kind = [eventFormatLabel(event.format), sports].filter(Boolean).join(' · ');
  const where = siteName(event.siteId);
  const distance = formatDistance(km);
  const border = first ? '' : 'border-t border-line-soft';
  const isCancelled = event.status === 'Cancelled';
  const gamesLabel = `${games.length} ${games.length === 1 ? 'game' : 'games'}`;

  const end = isCancelled ? (
    <RowTag tone="cancelled" label="Cancelled" />
  ) : invitation === 'invited' && !isPast ? (
    <RowTag tone="setup" label="Answer needed" />
  ) : invitation === 'declined' || invitation === 'withdrawn' ? (
    <RowTag tone="cancelled" label={invitation === 'declined' ? 'Declined' : 'Withdrawn'} />
  ) : invitation === 'withdrawal_pending' ? (
    <RowTag tone="setup" label="Withdrawal pending" />
  ) : liveCount ? (
    <>
      <RowTag tone="live" label={`● ${liveCount} live`} />
      {dayOf ? <Text className="font-inter text-[11px] text-ink-muted">{dayOf}</Text> : null}
    </>
  ) : isPast ? (
    <>
      <Text className="font-inter-semibold text-[13px] text-ink">{gamesLabel}</Text>
      <Text className="font-inter text-[11px] text-ink-muted">Finished</Text>
    </>
  ) : !games.length ? (
    canCreate && !away ? <RowTag tone="setup" label="No fixtures yet" /> : <Text className="font-inter text-[11px] text-ink-muted">Fixtures to come</Text>
  ) : (
    <>
      <Text className="font-inter-semibold text-[13px] text-ink">{gamesLabel}</Text>
      {dayOf ? <Text className="font-inter text-[11px] text-ink-muted">{dayOf}</Text> : null}
    </>
  );
  const name = (
    <Text numberOfLines={1} className={`flex-shrink font-inter-semibold text-[15px] ${isCancelled ? 'line-through text-ink-muted' : 'text-ink'}`}>
      {event.name}
    </Text>
  );

  if (!isWide) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="link" accessibilityLabel={event.name} className={`flex-row items-center gap-2.5 px-3 py-2.5 ${border}`}>
        <DateTile tile={tile} width={34} />
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2 min-w-0">
            <TournamentMark size={24} />
            {name}
          </View>
          <View className="flex-row items-center gap-2 mt-1">
            <Text className="flex-1 font-inter text-xs text-ink-muted" numberOfLines={1}>{[kind, where, distance].filter(Boolean).join(' · ')}</Text>
            <RoleTags away={away} convening={convening} />
          </View>
        </View>
        <View className="items-end gap-0.5 self-start">{end}</View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="link" accessibilityLabel={event.name} className={`flex-row items-center gap-3 px-4 py-3 ${border}`}>
      <DateTile tile={tile} />
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-2 min-w-0">
          <TournamentMark />
          {name}
          <RoleTags away={away} convening={convening} />
        </View>
        <Text className="font-inter text-xs text-ink-muted mt-0.5" style={{ marginLeft: 34 }} numberOfLines={1}>{kind}</Text>
      </View>
      <View style={{ width: WHERE_WIDTH }}>
        <Text className="font-inter text-sm text-ink-soft" numberOfLines={1}>{where || ' '}</Text>
        {distance ? <Text className="font-inter text-xs text-ink-muted" numberOfLines={1}>{distance}</Text> : null}
      </View>
      <View style={{ width: 112 }} className="items-end gap-0.5">{end}</View>
      <Ionicons name="chevron-forward" size={16} color={themeColor(isDark, 'ink-muted')} />
    </TouchableOpacity>
  );
}

/** An event whose type the app does not recognise is shown as an error rather than guessed at (FIX-1 / U39). */
export function UnknownRow({ name, message, first }: { name: string; message: string; first: boolean }) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <View className={`flex-row items-start gap-3 px-4 py-3 bg-danger-soft ${first ? '' : 'border-t border-line-soft'}`}>
      <Ionicons name="alert-circle-outline" size={18} color={themeColor(isDark, 'danger-ink')} />
      <View className="flex-1 min-w-0">
        <Text className="font-inter-semibold text-[15px] text-ink">{name || 'Unnamed event'}</Text>
        <Text className="font-inter text-xs text-danger-ink mt-0.5">{message}</Text>
      </View>
    </View>
  );
}
