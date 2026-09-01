import { describe, expect, it } from 'vitest';
import { Game } from '../models/event/Game';
import { MatchTopology } from '../models/sport/Sport';
import { ScoringSystem, TournamentAdjustment } from '../models/event/Tournament';
import {
  StandingsSubject,
  calculateStandings,
  rollUpByOrganisation,
} from './standings';

/**
 * The regression net for every later phase that touches scoring, and for `LeagueManager`, which
 * calls the same function. Ranks are asserted rather than "it did not throw": the whole point of
 * `rank` is that it is definite, because `{ type: 'standing', poolKey: 'A', position: 1 }` resolves
 * against it and a knockout semi-final is generated from the answer.
 */

interface Side {
  teamId?: string;
  entrantId?: string;
  orgProfileId?: string;
  score?: number;
  /** Set to make this side an unresolved placeholder (D7). */
  placeholder?: boolean;
}

function fixture(id: string, sides: Side[], extra: Partial<Game> = {}): Game {
  const participants = sides.map((s, i) => ({
    id: `${id}-p${i}`,
    gameId: id,
    sortOrder: i,
    ...(s.placeholder
      ? { sourceGameId: 'game-qf1', sourceRule: { type: 'winnerOf' as const } }
      : { teamId: s.teamId, entrantId: s.entrantId, orgProfileId: s.orgProfileId }),
  }));

  const scores: Record<string, number> = {};
  participants.forEach((p, i) => {
    if (sides[i].score !== undefined) scores[p.id] = sides[i].score!;
  });

  return {
    id,
    eventId: 'evt-1',
    sportId: 'rugby',
    status: 'Finished',
    participants,
    liveState: { scores },
    ...extra,
  };
}

/** A two-sided fixture, which is every fixture in every format except a ranked meet. */
function h2h(id: string, home: string, homeScore: number, away: string, awayScore: number): Game {
  return fixture(id, [
    { teamId: home, score: homeScore },
    { teamId: away, score: awayScore },
  ]);
}

const team = (id: string, name = id.toUpperCase()): StandingsSubject => ({ id, name });

const THREE_ONE_ZERO: ScoringSystem = {
  mode: 'byResult',
  pointsPerWin: 3,
  pointsPerDraw: 1,
  pointsPerLoss: 0,
};

const byId = (rows: Array<{ teamId: string }>, id: string) => rows.find(r => r.teamId === id)!;

// ---------------------------------------------------------------------------------------------

describe('a two-team round robin', () => {
  const subjects = [team('a', 'Alpha'), team('b', 'Bravo')];
  const games = [h2h('g1', 'a', 10, 'b', 5), h2h('g2', 'b', 7, 'a', 7)];

  it('counts a win and a draw, and ranks them', () => {
    const rows = calculateStandings(games, subjects, { scoring: THREE_ONE_ZERO });

    expect(rows.map(r => r.teamId)).toEqual(['a', 'b']);
    expect(byId(rows, 'a')).toMatchObject({
      played: 2, wins: 1, draws: 1, losses: 0,
      pointsFor: 17, pointsAgainst: 12, pointsDifference: 5,
      points: 4, rank: 1,
    });
    expect(byId(rows, 'b')).toMatchObject({
      played: 2, wins: 0, draws: 1, losses: 1,
      pointsFor: 12, pointsAgainst: 17, pointsDifference: -5,
      points: 1, rank: 2,
    });
  });

  it('ignores a fixture that has not finished, and one with no result to read', () => {
    const notFinished = h2h('g3', 'a', 40, 'b', 0);
    notFinished.status = 'Live';
    const noResult: Game = { ...h2h('g4', 'a', 0, 'b', 0), liveState: undefined };

    const rows = calculateStandings([...games, notFinished, noResult], subjects, {
      scoring: THREE_ONE_ZERO,
    });
    expect(byId(rows, 'a').played).toBe(2);
    expect(byId(rows, 'a').pointsFor).toBe(17);
  });
});

// ---------------------------------------------------------------------------------------------

describe('a pool tie that each tiebreak factor in turn has to separate', () => {
  /**
   * Four entrants. D is clear on 6 points; A, B and C are level on 3 with identical points
   * difference and identical points for, so the first two factors decide nothing. Head-to-head
   * lifts A - it is the only one of the three to have beaten another of the three - and leaves B
   * and C level, which most wins also cannot split. Fewest cards is the last factor standing.
   */
  const subjects = [team('a', 'Alpha'), team('b', 'Bravo'), team('c', 'Charlie'), team('d', 'Delta')];
  const games = [
    h2h('g1', 'a', 10, 'b', 5),
    h2h('g2', 'd', 10, 'a', 5),
    h2h('g3', 'b', 10, 'd', 5),
    h2h('g4', 'c', 10, 'd', 5),
    h2h('g5', 'd', 10, 'c', 5),
  ];

  it('leaves the three genuinely level on points, difference and points for', () => {
    const rows = calculateStandings(games, subjects, { scoring: THREE_ONE_ZERO });
    ['a', 'b', 'c'].forEach(id => {
      expect(byId(rows, id)).toMatchObject({
        points: 3, pointsDifference: 0, pointsFor: 15, wins: 1,
      });
    });
    expect(byId(rows, 'd').points).toBe(6);
  });

  it('separates A on head-to-head and B from C on fewest cards', () => {
    const rows = calculateStandings(games, subjects, {
      scoring: THREE_ONE_ZERO,
      disciplinaryPoints: { b: 2, c: 0 },
    });

    expect(rows.map(r => r.teamId)).toEqual(['d', 'a', 'c', 'b']);
    expect(rows.map(r => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('shares a rank when no configured factor can separate two entrants', () => {
    // The same pool with no disciplinary record: B and C are genuinely inseparable, and saying so
    // is the honest answer. A shared rank is what tells progression a person has to decide.
    const rows = calculateStandings(games, subjects, { scoring: THREE_ONE_ZERO });

    expect(rows.map(r => r.teamId)).toEqual(['d', 'a', 'b', 'c']);
    expect(rows.map(r => r.rank)).toEqual([1, 2, 3, 3]);
  });

  it('stops at points difference when the organiser puts nothing after it', () => {
    const rows = calculateStandings(games, subjects, {
      scoring: THREE_ONE_ZERO,
      tiebreakers: ['pointsDifference'],
    });
    expect(rows.map(r => r.rank)).toEqual([1, 2, 2, 2]);
  });

  it('separates on points difference, and then on points for, when those do differ', () => {
    const pool = [team('a', 'Alpha'), team('b', 'Bravo'), team('c', 'Charlie'), team('z', 'Zulu')];

    const byDifference = calculateStandings(
      [h2h('m1', 'a', 30, 'z', 0), h2h('m2', 'b', 20, 'z', 0), h2h('m3', 'c', 10, 'z', 0)],
      pool,
      { scoring: THREE_ONE_ZERO }
    );
    expect(byDifference.map(r => r.teamId)).toEqual(['a', 'b', 'c', 'z']);
    expect(byDifference.map(r => r.rank)).toEqual([1, 2, 3, 4]);

    // Same margin for all three, so points difference cannot choose: points for does.
    const byPointsFor = calculateStandings(
      [h2h('m1', 'a', 30, 'z', 20), h2h('m2', 'b', 25, 'z', 15), h2h('m3', 'c', 20, 'z', 10)],
      pool,
      { scoring: THREE_ONE_ZERO }
    );
    expect(byPointsFor.map(r => r.pointsDifference).slice(0, 3)).toEqual([10, 10, 10]);
    expect(byPointsFor.map(r => r.teamId)).toEqual(['a', 'b', 'c', 'z']);
    expect(byPointsFor.map(r => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('separates on most wins when the aggregate measures cannot', () => {
    // Two entrants on 3 points with the same difference and the same points for: one won and lost,
    // the other drew three times. Most wins is the first factor that has anything to say.
    const pool = [team('a', 'Alpha'), team('b', 'Bravo'), team('y', 'Yankee'), team('z', 'Zulu')];
    const rows = calculateStandings(
      [
        h2h('m1', 'a', 10, 'y', 5),
        h2h('m2', 'z', 10, 'a', 5),
        h2h('m3', 'b', 5, 'y', 5),
        h2h('m4', 'b', 5, 'z', 5),
        h2h('m5', 'b', 5, 'y', 5),
      ],
      pool,
      { scoring: THREE_ONE_ZERO, tiebreakers: ['pointsDifference', 'pointsFor', 'mostWins'] }
    );

    expect(byId(rows, 'a')).toMatchObject({ points: 3, pointsDifference: 0, pointsFor: 15, wins: 1 });
    expect(byId(rows, 'b')).toMatchObject({ points: 3, pointsDifference: 0, pointsFor: 15, wins: 0 });
    expect(byId(rows, 'a').rank!).toBeLessThan(byId(rows, 'b').rank!);
  });
});

// ---------------------------------------------------------------------------------------------

describe('a division with an adjustment', () => {
  const subjects = [
    { id: 'ent-a', name: 'Alpha', entrantId: 'ent-a' },
    { id: 'ent-b', name: 'Bravo', entrantId: 'ent-b' },
  ];
  const games = [
    fixture('g1', [
      { entrantId: 'ent-a', score: 10 },
      { entrantId: 'ent-b', score: 5 },
    ]),
  ];
  const adjustments: TournamentAdjustment[] = [
    {
      id: 'adj-1',
      divisionId: 'div-1',
      entrantId: 'ent-a',
      pointsDelta: -3,
      reason: 'Ineligible player',
      createdAt: '2026-09-01T08:00:00Z',
    },
  ];

  it('folds the delta into points and reports it, without touching the match record', () => {
    const before = calculateStandings(games, subjects, { scoring: THREE_ONE_ZERO });
    expect(before.map(r => r.teamId)).toEqual(['ent-a', 'ent-b']);
    expect(byId(before, 'ent-a').points).toBe(3);

    const after = calculateStandings(games, subjects, { scoring: THREE_ONE_ZERO, adjustments });

    // The deduction levels the points but changes nothing about the fixture: Alpha still won it,
    // and points difference - the first tiebreak factor - keeps it top of a level pool.
    expect(byId(after, 'ent-a')).toMatchObject({ points: 0, adjustment: -3, wins: 1, rank: 1 });
    expect(byId(after, 'ent-b')).toMatchObject({ points: 0, losses: 1, rank: 2 });
    expect(byId(after, 'ent-b').adjustment).toBeUndefined();
  });

  it('changes the order once the deduction outweighs the win', () => {
    const rows = calculateStandings(games, subjects, {
      scoring: THREE_ONE_ZERO,
      adjustments: [{ ...adjustments[0], pointsDelta: -4 }],
    });
    expect(rows.map(r => r.teamId)).toEqual(['ent-b', 'ent-a']);
    expect(byId(rows, 'ent-a')).toMatchObject({ points: -1, adjustment: -4, rank: 2 });
  });

  it('sums several adjustments against the same entrant', () => {
    const rows = calculateStandings(games, subjects, {
      scoring: THREE_ONE_ZERO,
      adjustments: [...adjustments, { ...adjustments[0], id: 'adj-2', pointsDelta: 1 }],
    });
    expect(byId(rows, 'ent-a')).toMatchObject({ points: 1, adjustment: -2 });
  });
});

// ---------------------------------------------------------------------------------------------

describe('an unresolved fixture', () => {
  const subjects = [team('a', 'Alpha'), team('b', 'Bravo')];

  it('does not score, and is never a bye (D7)', () => {
    // A semi-final generated ahead of the quarter-final it waits on: one side is a rule, and the
    // other must not collect a walkover from it.
    const semi = fixture('sf1', [{ teamId: 'a', score: 0 }, { placeholder: true }]);
    const rows = calculateStandings([semi], subjects, { scoring: THREE_ONE_ZERO });

    expect(rows.every(r => r.played === 0)).toBe(true);
    expect(rows.every(r => r.points === 0)).toBe(true);
  });

  it('scores the moment the placeholder is filled in', () => {
    const resolved = fixture('sf1', [
      { teamId: 'a', score: 12 },
      { teamId: 'b', score: 7 },
    ]);
    const rows = calculateStandings([resolved], subjects, { scoring: THREE_ONE_ZERO });
    expect(byId(rows, 'a')).toMatchObject({ played: 1, wins: 1, points: 3, rank: 1 });
  });

  it('still counts a fixture against a competitor this table does not rank', () => {
    // A league season must count the game its team played against a side that has since left it.
    const rows = calculateStandings(
      [h2h('g1', 'a', 20, 'outsider', 3)],
      [team('a', 'Alpha')],
      { scoring: THREE_ONE_ZERO }
    );
    expect(byId(rows, 'a')).toMatchObject({ played: 1, wins: 1, pointsAgainst: 3, points: 3 });
  });
});

// ---------------------------------------------------------------------------------------------

describe('a byPlacing division', () => {
  const scoring: ScoringSystem = {
    mode: 'byPlacing',
    pointsByPosition: [8, 6, 4, 2],
    pointsBeyond: 1,
  };
  const subjects = [
    team('p1', 'Ama'),
    team('p2', 'Ben'),
    team('p3', 'Cara'),
    team('p4', 'Dinah'),
    team('p5', 'Eli'),
  ];

  it('awards points by finishing position across all N competitors', () => {
    const race = fixture('race-1', [
      { teamId: 'p1', score: 95 },
      { teamId: 'p2', score: 90 },
      { teamId: 'p3', score: 85 },
      { teamId: 'p4', score: 80 },
      { teamId: 'p5', score: 75 },
    ]);

    const rows = calculateStandings([race], subjects, {
      scoring,
      matchTopology: MatchTopology.MULTI_COMPETITOR,
    });

    expect(rows.map(r => r.teamId)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(rows.map(r => r.points)).toEqual([8, 6, 4, 2, 1]);
    expect(rows.map(r => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(byId(rows, 'p1')).toMatchObject({ played: 1, wins: 1, losses: 0 });
    expect(byId(rows, 'p5')).toMatchObject({ played: 1, wins: 0, losses: 1 });
  });

  it('reads an explicit finishing order, so a lower time can be the better result', () => {
    const race = fixture('race-2', [
      { teamId: 'p1' },
      { teamId: 'p2' },
      { teamId: 'p3' },
    ], {
      finalScoreData: { placings: { 'race-2-p0': 3, 'race-2-p1': 1, 'race-2-p2': 2 } },
    });

    const rows = calculateStandings([race], subjects.slice(0, 3), {
      scoring,
      matchTopology: MatchTopology.MULTI_COMPETITOR,
    });
    expect(rows.map(r => r.teamId)).toEqual(['p2', 'p3', 'p1']);
    expect(rows.map(r => r.points)).toEqual([8, 6, 4]);
  });

  it('splits a dead heat across the positions it occupies', () => {
    const race = fixture('race-3', [
      { teamId: 'p1', score: 95 },
      { teamId: 'p2', score: 90 },
      { teamId: 'p3', score: 90 },
      { teamId: 'p4', score: 80 },
    ]);

    const rows = calculateStandings([race], subjects.slice(0, 4), {
      scoring,
      matchTopology: MatchTopology.MULTI_COMPETITOR,
    });

    // Second and third place points, shared: (6 + 4) / 2.
    expect(byId(rows, 'p2').points).toBe(5);
    expect(byId(rows, 'p3').points).toBe(5);
    // Fourth place is still fourth - a dead heat above does not promote the competitor below it.
    expect(byId(rows, 'p4').points).toBe(2);
    expect(rows.map(r => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it('counts a shared first place as a draw for each of them', () => {
    const race = fixture('race-4', [
      { teamId: 'p1', score: 95 },
      { teamId: 'p2', score: 95 },
      { teamId: 'p3', score: 40 },
    ]);
    const rows = calculateStandings([race], subjects.slice(0, 3), {
      scoring,
      matchTopology: MatchTopology.MULTI_COMPETITOR,
    });
    expect(byId(rows, 'p1')).toMatchObject({ wins: 0, draws: 1, points: 7 });
    expect(byId(rows, 'p2')).toMatchObject({ wins: 0, draws: 1, points: 7 });
  });
});

// ---------------------------------------------------------------------------------------------

describe('the score source', () => {
  const subjects = [team('a', 'Alpha'), team('b', 'Bravo')];

  it('reads the legacy two-sided blob for a head-to-head sport', () => {
    const game: Game = {
      ...h2h('g1', 'a', 0, 'b', 0),
      liveState: undefined,
      finalScoreData: { home: 24, away: 10 },
    };
    const rows = calculateStandings([game], subjects, { scoring: THREE_ONE_ZERO });
    expect(byId(rows, 'a')).toMatchObject({ points: 3, pointsFor: 24, pointsAgainst: 10 });
  });

  it('refuses the two-sided blob for a multi-competitor sport (SPORT-10)', () => {
    // "home" and "away" mean nothing in a race, so they must not be applied to whichever two
    // participants happen to sort first.
    const game: Game = {
      ...h2h('g1', 'a', 0, 'b', 0),
      liveState: undefined,
      finalScoreData: { home: 24, away: 10 },
    };
    const rows = calculateStandings([game], subjects, {
      scoring: THREE_ONE_ZERO,
      matchTopology: MatchTopology.MULTI_COMPETITOR,
    });
    expect(rows.every(r => r.played === 0)).toBe(true);
  });

  it('prefers a stored final score over the live state', () => {
    const game = h2h('g1', 'a', 5, 'b', 30);
    game.finalScoreData = { scores: { 'g1-p0': 30, 'g1-p1': 5 } };
    const rows = calculateStandings([game], subjects, { scoring: THREE_ONE_ZERO });
    expect(byId(rows, 'a')).toMatchObject({ points: 3, pointsFor: 30 });
  });

  it('prefers the legacy blob over an empty live state', () => {
    // A game scored from the event screen's quick-score modal: the result is in `finalScoreData`
    // and `liveState.scores` is the empty object the game was created with. Reading the live state
    // first would score every such fixture 0-0 and call it a draw.
    const game = h2h('g1', 'a', 0, 'b', 0);
    game.liveState = { scores: {} };
    game.finalScoreData = { home: 24, away: 10 };
    const rows = calculateStandings([game], subjects, { scoring: THREE_ONE_ZERO });
    expect(byId(rows, 'a')).toMatchObject({ points: 3, wins: 1, pointsFor: 24, pointsAgainst: 10 });
  });

  it('matches a side by org profile, for an individual sport', () => {
    const game = fixture('g1', [
      { orgProfileId: 'prof-a', score: 11 },
      { orgProfileId: 'prof-b', score: 4 },
    ]);
    const rows = calculateStandings([game], [team('prof-a', 'Ama'), team('prof-b', 'Ben')], {
      scoring: THREE_ONE_ZERO,
    });
    expect(byId(rows, 'prof-a')).toMatchObject({ played: 1, wins: 1, points: 3, rank: 1 });
  });
});

// ---------------------------------------------------------------------------------------------

describe('a weighted two-division roll-up', () => {
  const orgs = [
    { id: 'org-north', name: 'Northcliff' },
    { id: 'org-park', name: 'Parktown' },
  ];

  const rugby = calculateStandings(
    [h2h('r1', 'north-1st', 20, 'park-1st', 12)],
    [
      { id: 'north-1st', name: 'Northcliff 1st XV', orgId: 'org-north' },
      { id: 'park-1st', name: 'Parktown 1st XV', orgId: 'org-park' },
    ],
    { scoring: THREE_ONE_ZERO }
  );

  const netball = calculateStandings(
    [h2h('n1', 'park-a', 30, 'north-a', 18)],
    [
      { id: 'north-a', name: 'Northcliff A', orgId: 'org-north' },
      { id: 'park-a', name: 'Parktown A', orgId: 'org-park' },
    ],
    { scoring: THREE_ONE_ZERO }
  );

  it('multiplies each division by its weighting and sums by organisation (D6, D18)', () => {
    const rows = rollUpByOrganisation(
      [
        { divisionId: 'div-rugby', weighting: 1, rows: rugby },
        { divisionId: 'div-netball', weighting: 0.5, rows: netball },
      ],
      orgs
    );

    // Northcliff: 3 from rugby at full weight, 0 from netball. Parktown: 0 + 3 x 0.5.
    expect(byId(rows, 'org-north')).toMatchObject({ points: 3, played: 2, wins: 1, losses: 1, rank: 1 });
    expect(byId(rows, 'org-park')).toMatchObject({ points: 1.5, played: 2, wins: 1, losses: 1, rank: 2 });
    expect(rows.map(r => r.teamId)).toEqual(['org-north', 'org-park']);
  });

  it('changes the winner when the weighting changes', () => {
    const rows = rollUpByOrganisation(
      [
        { divisionId: 'div-rugby', weighting: 0.5, rows: rugby },
        { divisionId: 'div-netball', weighting: 2, rows: netball },
      ],
      orgs
    );
    expect(byId(rows, 'org-park')).toMatchObject({ points: 6, rank: 1 });
    expect(byId(rows, 'org-north')).toMatchObject({ points: 1.5, rank: 2 });
  });

  it('defaults a missing weighting to 1.0, and counts appearances unweighted', () => {
    const rows = rollUpByOrganisation([{ rows: rugby }, { rows: netball }], orgs);
    expect(byId(rows, 'org-north')).toMatchObject({ points: 3, played: 2 });
    expect(byId(rows, 'org-park')).toMatchObject({ points: 3, played: 2 });
    // Level on points; points difference separates them.
    expect(byId(rows, 'org-park').pointsDifference).toBe(4);
    expect(byId(rows, 'org-north').pointsDifference).toBe(-4);
    expect(byId(rows, 'org-park').rank).toBe(1);
  });

  it('carries a division adjustment through at the division weight', () => {
    const penalised = calculateStandings(
      [h2h('r1', 'north-1st', 20, 'park-1st', 12)],
      [
        { id: 'north-1st', name: 'Northcliff 1st XV', orgId: 'org-north', entrantId: 'ent-n' },
        { id: 'park-1st', name: 'Parktown 1st XV', orgId: 'org-park', entrantId: 'ent-p' },
      ],
      {
        scoring: THREE_ONE_ZERO,
        adjustments: [
          {
            id: 'adj-1',
            divisionId: 'div-rugby',
            entrantId: 'ent-n',
            pointsDelta: -2,
            reason: 'Late arrival',
            createdAt: '2026-09-01T08:00:00Z',
          },
        ],
      }
    );

    const rows = rollUpByOrganisation([{ weighting: 0.5, rows: penalised }], orgs);
    expect(byId(rows, 'org-north')).toMatchObject({ points: 0.5, adjustment: -1 });
  });
});
