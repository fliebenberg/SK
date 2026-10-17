import { Event, EventOrgBadge, GameSummary, TournamentDivision, TournamentStandingRow } from '@sk/shared';
import { whenMs } from '../../utils/dates';

/**
 * What the Standings tab and its pages work out from data they already hold (stage 4, docs/events.md
 * §10): the last results each entrant had, whose table names a leader, and what a row is called.
 * The tables themselves are the server's (D30); none of this ranks anybody.
 */

export type FormResult = 'W' | 'D' | 'L';

/**
 * Whether the tournament's tables have a points column. *Wins / draws / losses* awards none
 * (`SCORE-18`): its tables rank by wins, then draws, and every division follows the tournament.
 */
export function awardsPoints(event: Pick<Event, 'settings'> | undefined): boolean {
  return event?.settings?.scoring?.mode !== 'winsDrawsLosses';
}

/** Where a row stands, for the line under a results page's name: its points, or its record. */
export function standingSummary(row: Pick<TournamentStandingRow, 'points' | 'wins' | 'draws' | 'losses'>, points: boolean): string {
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (points) return count(row.points, 'point', 'points');
  return [count(row.wins, 'win', 'wins'), count(row.draws, 'draw', 'draws'), count(row.losses, 'loss', 'losses')].join(', ');
}

/**
 * Each entrant's results, oldest first, from the finished fixtures that recorded a score. A fixture
 * finished without one (`resultNotProvided`) says nothing about who won, so it is left out.
 */
export function formByEntrant(games: GameSummary[]): Map<string, FormResult[]> {
  const form = new Map<string, FormResult[]>();
  const finished = games
    .filter(g => g.status === 'Finished' && !g.resultNotProvided && (g.participants || []).length === 2)
    .sort((a, b) => whenMs(a.startTime || a.scheduledStartTime) - whenMs(b.startTime || b.scheduledStartTime));
  for (const g of finished) {
    const [home, away] = g.participants;
    const homeScore = g.scores?.[home.id] ?? 0;
    const awayScore = g.scores?.[away.id] ?? 0;
    const add = (entrantId: string | undefined, mine: number, theirs: number) => {
      if (!entrantId) return;
      form.set(entrantId, [...(form.get(entrantId) || []), mine > theirs ? 'W' : mine < theirs ? 'L' : 'D']);
    };
    add(home.entrantId, homeScore, awayScore);
    add(away.entrantId, awayScore, homeScore);
  }
  return form;
}

/**
 * A division's whole table names its leader only when that table is the competition: one stage
 * that is not a knockout. Pools, or pools then a knockout, are decided by the stages, which the
 * division page shows; adding them into one ranking would name the wrong winner.
 */
export function hasOneTable(division: TournamentDivision): boolean {
  const shapes = division.stageShapes || [];
  return shapes.length <= 1 && !shapes.some(s => s.format === 'Knockout' || s.format === 'Plate')
    && !shapes.some(s => (s.settings?.pools?.length || 0) > 1);
}

/** An entrant's name in a table: its organisation, then its team ("Doringkloof U14 A"). */
export function entrantName(row: Pick<TournamentStandingRow, 'orgId' | 'teamName'>, orgs: EventOrgBadge[] | undefined, short: boolean): string {
  const org = orgs?.find(o => o.id === row.orgId);
  if (!org) return row.teamName;
  return `${short ? org.shortName : org.name} ${row.teamName}`.trim();
}

/** An organisation's name on the leaderboard, whose rows carry its short name. */
export function orgName(row: Pick<TournamentStandingRow, 'orgId' | 'teamName'>, orgs: EventOrgBadge[] | undefined, short: boolean): string {
  const org = orgs?.find(o => o.id === row.orgId);
  return org ? (short ? org.shortName : org.name) : row.teamName;
}

/** The crest a table row draws, in the shape `FixtureCrest` takes. */
export function crestOf(orgId: string | undefined, orgs: EventOrgBadge[] | undefined) {
  const org = orgs?.find(o => o.id === orgId);
  if (!org) return undefined;
  return { id: org.id, orgId: org.id, orgLogo: org.logo, orgLogoConfig: org.logoConfig, orgPrimaryColor: org.primaryColor };
}
