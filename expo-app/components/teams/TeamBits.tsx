import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GameSummary, Organization, Team, isScoreNotProvided, orgColors, participantLabel } from '@sk/shared';
import { OrgLogo } from '../OrgLogo';
import { readableTextOn } from '../../utils/colorUtils';

/**
 * Small pieces the teams list and the team page share, so a row and the page it opens show a team
 * the same way (docs/teams.md).
 */

/** What a team is called in its crest: its short name, or its age group when it has none. */
export function crestLabel(team: Pick<Team, 'shortName' | 'ageGroup' | 'name'>): string {
  return team.shortName?.trim() || team.ageGroup || team.name.slice(0, 3).toUpperCase();
}

/**
 * A team's mark: its organisation's logo, with the team's short name in a band of the
 * organisation's colour underneath — where a person's photo sits on their banner. An organisation
 * with no logo (most) gets a shield in its colour instead. The band's text is black or white,
 * whichever reads better on that colour. The short name is not also written out beside the name:
 * the crest is where it is shown.
 */
export function TeamCrest({ team, org, size, inactive }: {
  team: Pick<Team, 'shortName' | 'ageGroup' | 'name'>;
  org: Pick<Organization, 'logo' | 'settings' | 'primaryColor' | 'secondaryColor'> | null;
  size: number;
  inactive?: boolean;
}) {
  const { primary } = orgColors(org);
  const band = Math.max(12, Math.round(size * 0.28));
  const art = size - band;
  return (
    <View
      className="rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.22), opacity: inactive ? 0.5 : 1 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View className="items-center justify-center" style={{ height: art }}>
        {org?.logo ? (
          <OrgLogo logo={org.logo} settings={org.settings} size={Math.round(art * 0.86)} />
        ) : (
          <Ionicons name="shield" size={Math.round(art * 0.72)} color={primary} />
        )}
      </View>
      <View className="items-center justify-center px-0.5" style={{ height: band, backgroundColor: primary }}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          className="font-inter-bold"
          style={{ color: readableTextOn(primary), fontSize: Math.max(8, Math.round(band * 0.62)), lineHeight: band }}
        >
          {crestLabel(team)}
        </Text>
      </View>
    </View>
  );
}

/**
 * The teams a picker offers: an inactive team is left out, unless it is the one already chosen —
 * editing an old game must not quietly drop the team it was played by (docs/teams.md).
 */
export function pickableTeams<T extends Pick<Team, 'id' | 'isActive'>>(teams: T[], chosen: (string | null | undefined)[] = []): T[] {
  return teams.filter(t => t.isActive !== false || chosen.includes(t.id));
}

/* ------------------------------------------------------------------------------------------------
 * Roles on a team
 * --------------------------------------------------------------------------------------------- */

export const PLAYER_ROLE = 'role-player';

/** The order staff are listed in — the coach first. */
const STAFF_ORDER = ['role-coach', 'role-assistant-coach', 'role-manager', 'role-scorer', 'role-medic', 'role-staff'];
export const staffRank = (roleId: string) => {
  const i = STAFF_ORDER.indexOf(roleId);
  return i === -1 ? STAFF_ORDER.length : i;
};

/* ------------------------------------------------------------------------------------------------
 * Games
 * --------------------------------------------------------------------------------------------- */

/** This team's score and its opponent's, from the summary's participant-keyed `scores`. */
export function scoresFor(game: GameSummary, teamId: string): { mine: number; theirs: number } {
  const mine = game.participants?.find(p => p.teamId === teamId);
  const theirs = game.participants?.find(p => p.teamId !== teamId);
  return {
    mine: mine ? (game.scores?.[mine.id] ?? 0) : 0,
    theirs: theirs ? (game.scores?.[theirs.id] ?? 0) : 0,
  };
}

/** Who the team plays — the summary names the side and its org, so an away side reads right. */
export function opponentOf(game: GameSummary, teamId: string): string {
  const opp = game.participants?.find(p => p.teamId !== teamId);
  return participantLabel(opp) || 'Opponent to be decided';
}

export type Outcome = 'w' | 'd' | 'l';

/** Won, drawn or lost — `null` for a game with no result to count (not finished, or no score). */
export function outcomeOf(game: GameSummary, teamId: string): Outcome | null {
  if (game.status !== 'Finished' || isScoreNotProvided(game)) return null;
  const { mine, theirs } = scoresFor(game, teamId);
  return mine > theirs ? 'w' : mine < theirs ? 'l' : 'd';
}

export interface TeamRecord {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
}

/**
 * The record over some games. A finished game whose score was recorded as not provided is left
 * out, as the standings leave it out: counting it would make it a 0–0 draw nobody reported.
 */
export function recordOf(games: GameSummary[], teamId: string): TeamRecord {
  const record: TeamRecord = { played: 0, won: 0, drawn: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 };
  for (const game of games) {
    const outcome = outcomeOf(game, teamId);
    if (!outcome) continue;
    const { mine, theirs } = scoresFor(game, teamId);
    record.played += 1;
    record.pointsFor += mine;
    record.pointsAgainst += theirs;
    if (outcome === 'w') record.won += 1;
    else if (outcome === 'l') record.lost += 1;
    else record.drawn += 1;
  }
  return record;
}

/** Still to come — scheduled or being played — rather than over. */
export const isUpcoming = (game: GameSummary) => game.status === 'Scheduled' || game.status === 'Live';
