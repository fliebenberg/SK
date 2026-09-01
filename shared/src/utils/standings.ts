import { Game } from "../models/event/Game";
import { GameParticipant } from "../models/event/GameParticipant";
import { MatchTopology } from "../models/sport/Sport";
import {
  DEFAULT_SCORING_SYSTEM,
  DEFAULT_TIEBREAKERS,
  ScoringSystem,
  TiebreakFactor,
  TournamentAdjustment,
  TournamentStandingRow,
} from "../models/event/Tournament";

/**
 * One competitor a table ranks.
 *
 * `id` is what a fixture's participants are matched on, and it is whatever the table is *about* —
 * an entrant, a team, or an organisation. That is `scoringSubject` in the data model, resolved by
 * the caller: to rank organisations, pass organisations here and map each participant onto its org.
 */
export interface StandingsSubject {
  id: string;
  name: string;
  /**
   * The division entrant this subject is, when the table ranks entrants. Adjustments are keyed by
   * entrant, so this is what a `division_adjustments` row is matched against; it defaults to `id`.
   */
  entrantId?: string;
  orgId?: string;
  /** Pool tables are distinguished by this on the row rather than by separate storage. */
  poolKey?: string;
}

export interface StandingsOptions {
  /** Division overrides event overrides 3/1/0 (data model §6). Resolved by the caller. */
  scoring?: ScoringSystem;
  /** Ordered; the engine walks it until one factor separates. Defaults to `DEFAULT_TIEBREAKERS`. */
  tiebreakers?: TiebreakFactor[];
  /** Folded into `points` after the fixtures are counted (D29), and reported as `adjustment`. */
  adjustments?: TournamentAdjustment[];
  /** Disciplinary points by subject id, for the `fewestCards` factor. Absent means nobody has any. */
  disciplinaryPoints?: Record<string, number>;
  /**
   * The sport's topology (`SPORT-10`), which decides one thing here: whether the legacy two-sided
   * `finalScoreData.home` / `.away` shape may be read as a score source. A race between eight
   * competitors has no home and no away, so under `MULTI_COMPETITOR` that shape is refused rather
   * than silently applied to whichever two participants happen to sort first.
   */
  matchTopology?: MatchTopology;
  /**
   * Skip any fixture involving a competitor this table does not rank. Off by default, because a
   * league season must still count a game against a team that has left it; on for the head-to-head
   * mini-league, which is by definition only the games among the tied entrants.
   */
  requireAllSidesRanked?: boolean;
}

/** A side of a fixture once we know who it is and what it scored. */
interface ScoredSide {
  subject?: StandingsSubject;
  score: number;
}

const ZERO_ROW = {
  played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  pointsDifference: 0,
  points: 0,
};

/** Float arithmetic on weightings and split placing points should not leak 0.30000000000000004. */
function round(n: number, dp = 3): number {
  const f = Math.pow(10, dp);
  return Math.round((n + Number.EPSILON) * f) / f;
}

function isPlainObject(v: any): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Which competitor a side of a fixture is, or `undefined` while it is still a placeholder.
 *
 * D7: a fixture with an unresolved side has not been played by anybody, so it is skipped entirely
 * rather than scored as a bye.
 */
function participantKey(p: Partial<GameParticipant>): string | undefined {
  return p.entrantId || p.teamId || p.orgProfileId || undefined;
}

/**
 * Every side's score, or `undefined` when the fixture has no result to read.
 *
 * Three shapes, in the order of how final they are. `finalScoreData` is the recorded result and
 * outranks the live state in whichever of its two shapes it arrives — participant-keyed `scores`,
 * or the legacy two-sided `{ home, away }` the event screen's quick-score modal still writes.
 * Failing both, scores are read from `liveState.scores[gameParticipantId]`, which is where the
 * scoring screens and the final-score override put them.
 */
function sideScores(
  game: Game,
  participants: Array<Partial<GameParticipant>>,
  topology: MatchTopology
): Record<string, number> | undefined {
  const final = game.finalScoreData;

  if (isPlainObject(final?.scores)) return final.scores as Record<string, number>;

  // A ranked meet may record finishing order and nothing else. That is still a result, and the
  // placings carry it; every side simply scores 0 in the for/against columns.
  if (isPlainObject(final?.placings)) return {};

  const hasHomeAway =
    isPlainObject(final) && (typeof final.home === 'number' || typeof final.away === 'number');
  if (hasHomeAway && topology === MatchTopology.HEAD_TO_HEAD && participants.length === 2) {
    const ordered = [...participants].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.id).localeCompare(String(b.id))
    );
    return {
      [String(ordered[0].id)]: final.home ?? 0,
      [String(ordered[1].id)]: final.away ?? 0,
    };
  }

  if (isPlainObject(game.liveState?.scores)) {
    return game.liveState!.scores as Record<string, number>;
  }
  return undefined;
}

/**
 * Standard competition ranking over a game's sides: 1, 2, 2, 4.
 *
 * Explicit placings on `finalScoreData.placings` win, because a timed event records finishing
 * order directly and there a lower number is the better result; otherwise order descends by score.
 */
function placingsFor(
  game: Game,
  sides: Array<{ participantId: string; score: number }>
): Record<string, number> {
  const explicit = isPlainObject(game.finalScoreData?.placings)
    ? (game.finalScoreData.placings as Record<string, number>)
    : undefined;
  if (explicit && sides.every(s => typeof explicit[s.participantId] === 'number')) {
    const out: Record<string, number> = {};
    sides.forEach(s => { out[s.participantId] = explicit[s.participantId]; });
    return out;
  }

  const ordered = [...sides].sort((a, b) => b.score - a.score);
  const out: Record<string, number> = {};
  let position = 1;
  ordered.forEach((side, i) => {
    if (i > 0 && side.score !== ordered[i - 1].score) position = i + 1;
    out[side.participantId] = position;
  });
  return out;
}

/**
 * Points for a finishing position, splitting a tie across the positions it occupies.
 *
 * Two competitors tied for second share the second- and third-place points, which is what a meet
 * does with a dead heat and the only rule that keeps the total awarded constant.
 */
function placingPoints(
  scoring: Extract<ScoringSystem, { mode: 'byPlacing' }>,
  position: number,
  tiedCount: number
): number {
  const at = (pos: number) => scoring.pointsByPosition[pos - 1] ?? scoring.pointsBeyond ?? 0;
  if (tiedCount <= 1) return at(position);
  let total = 0;
  for (let i = 0; i < tiedCount; i++) total += at(position + i);
  return round(total / tiedCount);
}

/**
 * Count the fixtures. One pass, N sides, both scoring modes.
 *
 * Returns rows by subject id with no adjustments folded in and no ranking applied — the two things
 * that need the whole table rather than one fixture at a time.
 */
function tally(
  games: Game[],
  subjects: StandingsSubject[],
  options: StandingsOptions
): Map<string, TournamentStandingRow> {
  const scoring = options.scoring ?? DEFAULT_SCORING_SYSTEM;
  const topology = options.matchTopology ?? MatchTopology.HEAD_TO_HEAD;

  const rows = new Map<string, TournamentStandingRow>();
  const index = new Map<string, StandingsSubject>();
  subjects.forEach(s => {
    rows.set(s.id, {
      ...ZERO_ROW,
      teamId: s.id,
      teamName: s.name,
      entrantId: s.entrantId ?? s.id,
      orgId: s.orgId,
      poolKey: s.poolKey,
    });
    index.set(s.id, s);
    if (s.entrantId) index.set(s.entrantId, s);
  });

  games.forEach(game => {
    if (game.status !== 'Finished') return;

    const participants = game.participants ?? [];
    if (participants.length < 2) return;

    // D7 — never a bye.
    if (participants.some(p => !participantKey(p))) return;

    const scores = sideScores(game, participants, topology);
    if (!scores) return;

    const sides: ScoredSide[] = participants.map(p => ({
      subject: index.get(participantKey(p)!),
      score: scores[p.id] ?? 0,
    }));

    if (options.requireAllSidesRanked && sides.some(s => !s.subject)) return;
    if (!sides.some(s => s.subject)) return;

    const total = sides.reduce((sum, s) => sum + s.score, 0);
    const best = Math.max(...sides.map(s => s.score));
    const winners = sides.filter(s => s.score === best).length;

    const placings =
      scoring.mode === 'byPlacing'
        ? placingsFor(
            game,
            participants.map((p, i) => ({ participantId: p.id, score: sides[i].score }))
          )
        : undefined;
    const tiedAt = (position: number) =>
      placings ? Object.keys(placings).filter(k => placings[k] === position).length : 1;

    sides.forEach((side, i) => {
      if (!side.subject) return;
      const row = rows.get(side.subject.id);
      if (!row) return;

      row.played++;
      row.pointsFor += side.score;
      row.pointsAgainst += total - side.score;
      row.pointsDifference = row.pointsFor - row.pointsAgainst;

      if (scoring.mode === 'byPlacing') {
        const position = placings![participants[i].id];
        row.points = round(row.points + placingPoints(scoring, position, tiedAt(position)));
        if (position === 1 && tiedAt(1) === 1) row.wins++;
        else if (position === 1) row.draws++;
        else row.losses++;
        return;
      }

      const isWinner = side.score === best;
      if (isWinner && winners === 1) {
        row.wins++;
        row.points += scoring.pointsPerWin;
      } else if (isWinner) {
        row.draws++;
        row.points += scoring.pointsPerDraw;
      } else {
        row.losses++;
        row.points += scoring.pointsPerLoss;
      }
    });
  });

  return rows;
}

/** The value a factor compares on, and which direction is better. */
function factorValue(
  factor: TiebreakFactor,
  row: TournamentStandingRow,
  ctx: { headToHead: Map<string, number>; disciplinaryPoints?: Record<string, number> }
): { value: number; higherIsBetter: boolean } {
  switch (factor) {
    case 'pointsDifference':
      return { value: row.pointsDifference, higherIsBetter: true };
    case 'pointsFor':
      return { value: row.pointsFor, higherIsBetter: true };
    case 'headToHead':
      return { value: ctx.headToHead.get(row.teamId) ?? 0, higherIsBetter: true };
    case 'mostWins':
      return { value: row.wins, higherIsBetter: true };
    case 'fewestCards':
      return { value: ctx.disciplinaryPoints?.[row.teamId] ?? 0, higherIsBetter: false };
  }
}

/**
 * Separate one group of entrants that are level, walking the factors in order.
 *
 * Returns the group as a list of sub-groups, each a set of entrants no remaining factor could tell
 * apart, which will share a rank. Head-to-head is computed *within the group* — a mini-league over
 * the fixtures the tied entrants played against each other, which is the only reading of it that
 * generalises past a pair and the only one that cannot produce a non-transitive ordering.
 */
function separate(
  group: TournamentStandingRow[],
  factors: TiebreakFactor[],
  games: Game[],
  subjectsById: Map<string, StandingsSubject>,
  options: StandingsOptions
): TournamentStandingRow[][] {
  if (group.length <= 1 || factors.length === 0) return [group];

  const [factor, ...rest] = factors;

  const headToHead = new Map<string, number>();
  if (factor === 'headToHead') {
    const groupSubjects = group
      .map(r => subjectsById.get(r.teamId))
      .filter((s): s is StandingsSubject => !!s);
    tally(games, groupSubjects, { ...options, adjustments: undefined, requireAllSidesRanked: true })
      .forEach((row, id) => headToHead.set(id, row.points));
  }

  const ctx = { headToHead, disciplinaryPoints: options.disciplinaryPoints };
  const valueOf = (row: TournamentStandingRow) => factorValue(factor, row, ctx);

  const sorted = [...group].sort((a, b) => {
    const va = valueOf(a);
    const vb = valueOf(b);
    if (va.value === vb.value) return 0;
    return va.higherIsBetter ? vb.value - va.value : va.value - vb.value;
  });

  const buckets: TournamentStandingRow[][] = [];
  sorted.forEach(row => {
    const last = buckets[buckets.length - 1];
    if (last && valueOf(last[0]).value === valueOf(row).value) last.push(row);
    else buckets.push([row]);
  });

  // A factor that separated nothing must not consume itself: recurse the whole group on the rest.
  if (buckets.length === 1) return separate(group, rest, games, subjectsById, options);

  const out: TournamentStandingRow[][] = [];
  buckets.forEach(bucket => {
    separate(bucket, rest, games, subjectsById, options).forEach(sub => out.push(sub));
  });
  return out;
}

/**
 * Order the table and stamp a definite `rank` on every row.
 *
 * Points first, then the configured factors. Entrants no factor could separate **share** a rank
 * (1, 2, 2, 4) and are listed in a stable order by name — a shared rank is the honest answer, and
 * D29's manual override is how a person breaks it when progression needs one.
 */
function rankRows(
  rows: TournamentStandingRow[],
  games: Game[],
  subjectsById: Map<string, StandingsSubject>,
  options: StandingsOptions
): TournamentStandingRow[] {
  const factors = options.tiebreakers ?? DEFAULT_TIEBREAKERS;

  const byPoints = new Map<number, TournamentStandingRow[]>();
  rows.forEach(row => {
    const bucket = byPoints.get(row.points);
    if (bucket) bucket.push(row);
    else byPoints.set(row.points, [row]);
  });

  const groups: TournamentStandingRow[][] = [];
  [...byPoints.keys()]
    .sort((a, b) => b - a)
    .forEach(points => {
      separate(byPoints.get(points)!, factors, games, subjectsById, options).forEach(group =>
        groups.push(group)
      );
    });

  const out: TournamentStandingRow[] = [];
  groups.forEach(group => {
    const rank = out.length + 1;
    [...group]
      .sort((a, b) => a.teamName.localeCompare(b.teamName) || a.teamId.localeCompare(b.teamId))
      .forEach(row => out.push({ ...row, rank }));
  });
  return out;
}

/**
 * The one standings answer, for tournaments and for league seasons alike (D19).
 *
 * N sides rather than two, both scoring modes, ordered tiebreakers producing a definite rank, and
 * manual adjustments folded in. There is deliberately no second implementation for the two-sided
 * case: a division's table, a pool's table and a season's table are the same computation, and two
 * of them disagreeing is exactly what progression cannot survive.
 *
 * To rank organisations rather than teams, pass organisations as the subjects and map each
 * participant onto its org — or use {@link rollUpByOrganisation} for the weighted multi-division
 * case (D6, D18).
 */
export function calculateStandings(
  games: Game[],
  subjects: StandingsSubject[],
  options: StandingsOptions = {}
): TournamentStandingRow[] {
  const subjectsById = new Map(subjects.map(s => [s.id, s]));
  const rows = tally(games, subjects, options);

  if (options.adjustments?.length) {
    const byEntrant = new Map<string, number>();
    options.adjustments.forEach(a => {
      byEntrant.set(a.entrantId, (byEntrant.get(a.entrantId) ?? 0) + a.pointsDelta);
    });
    rows.forEach(row => {
      const delta = byEntrant.get(row.entrantId) ?? byEntrant.get(row.teamId);
      if (delta === undefined) return;
      row.adjustment = round(delta);
      row.points = round(row.points + delta);
    });
  }

  return rankRows([...rows.values()], games, subjectsById, options);
}

/** One division's finished table, with the weight its points carry in the roll-up (D18). */
export interface WeightedDivisionStandings {
  divisionId?: string;
  /** Default 1.0. */
  weighting?: number;
  rows: TournamentStandingRow[];
}

/**
 * The organisation roll-up (D6): each division's competition points multiplied by its weighting
 * and summed by `org_id`. This is what `events.cached_standings` holds.
 *
 * Played, won, drawn and lost are counts of fixtures, so they sum unweighted — weighting an
 * appearance makes no sense. Only points, and the adjustments already inside them, are scaled.
 */
export function rollUpByOrganisation(
  divisions: WeightedDivisionStandings[],
  organisations: Array<{ id: string; name: string }>,
  options: Pick<StandingsOptions, 'tiebreakers' | 'disciplinaryPoints'> = {}
): TournamentStandingRow[] {
  const subjects: StandingsSubject[] = organisations.map(o => ({
    id: o.id,
    name: o.name,
    orgId: o.id,
  }));
  const rows = new Map<string, TournamentStandingRow>(
    subjects.map(s => [
      s.id,
      { ...ZERO_ROW, teamId: s.id, teamName: s.name, entrantId: s.id, orgId: s.id },
    ])
  );

  divisions.forEach(division => {
    const weighting = division.weighting ?? 1;
    division.rows.forEach(source => {
      if (!source.orgId) return;
      const row = rows.get(source.orgId);
      if (!row) return;
      row.played += source.played;
      row.wins += source.wins;
      row.draws += source.draws;
      row.losses += source.losses;
      row.pointsFor += source.pointsFor;
      row.pointsAgainst += source.pointsAgainst;
      row.pointsDifference = row.pointsFor - row.pointsAgainst;
      row.points = round(row.points + source.points * weighting);
      if (source.adjustment) {
        row.adjustment = round((row.adjustment ?? 0) + source.adjustment * weighting);
      }
    });
  });

  // No fixtures at this level: head-to-head between two schools across four divisions is not a
  // thing, so it separates nobody and the remaining factors carry the ordering.
  return rankRows([...rows.values()], [], new Map(subjects.map(s => [s.id, s])), options);
}
