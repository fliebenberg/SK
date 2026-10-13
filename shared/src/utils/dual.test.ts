import { describe, expect, it } from 'vitest';
import type { GameSummary } from '../models/event/GameSummary';
import { dualOutcome, dualTally, dualUnpaired, pairInNameOrder } from './dual';

const name = (s: string) => s;

describe('pairing a Head to Head in name order (H2H-1)', () => {
  it('pairs A with A and B with B', () => {
    const { pairs, unpaired } = pairInNameOrder(['U13B', 'U13A'], ['U13A', 'U13B'], name);
    expect(pairs).toEqual([['U13A', 'U13A'], ['U13B', 'U13B']]);
    expect(unpaired).toEqual([]);
  });

  it('leaves the teams with no counterpart unpaired, from either side', () => {
    expect(pairInNameOrder(['U13A', 'U13B', 'U13C'], ['U13A', 'U13B'], name).unpaired).toEqual(['U13C']);
    expect(pairInNameOrder(['U11A'], ['U11A', 'U11B'], name).unpaired).toEqual(['U11B']);
  });

  it('reads numbers as numbers, and ignores case', () => {
    expect(pairInNameOrder(['U10A', 'U9A'], ['u9a', 'u10a'], name).pairs).toEqual([['U9A', 'u9a'], ['U10A', 'u10a']]);
  });

  it('pairs nothing when a side has no teams', () => {
    expect(pairInNameOrder([], ['U13A'], name)).toEqual({ pairs: [], unpaired: ['U13A'] });
  });
});

const game = (status: GameSummary['status'], host: number, guest: number, hostFirst = true, extra: Partial<GameSummary> = {}): GameSummary => {
  const h = { id: 'gp-h', orgId: 'org-host' };
  const g = { id: 'gp-g', orgId: 'org-guest' };
  return {
    id: `g-${Math.random()}`,
    eventId: 'e',
    sportId: 's',
    status,
    participants: hostFirst ? [h, g] : [g, h],
    scores: { 'gp-h': host, 'gp-g': guest },
    ...extra,
  };
};

describe('a Head to Head game’s outcome', () => {
  it('is won by the higher score, whichever side is listed first', () => {
    expect(dualOutcome(game('Finished', 24, 10), 'org-host')).toBe('host');
    expect(dualOutcome(game('Finished', 12, 17, false), 'org-host')).toBe('guest');
    expect(dualOutcome(game('Finished', 5, 5), 'org-host')).toBe('drawn');
  });

  it('is live while live, and not played before or with no score recorded', () => {
    expect(dualOutcome(game('Live', 1, 0), 'org-host')).toBe('live');
    expect(dualOutcome(game('Scheduled', 0, 0), 'org-host')).toBe('notPlayed');
    expect(dualOutcome(game('Finished', 0, 0, true, { resultNotProvided: true }), 'org-host')).toBe('notPlayed');
  });
});

describe('a Head to Head’s tally', () => {
  it('counts games won by each side and drawn, leaving out cancelled ones', () => {
    const t = dualTally([
      game('Finished', 2, 1),
      game('Finished', 0, 0),
      game('Finished', 9, 11),
      game('Live', 1, 1),
      game('Scheduled', 0, 0),
      game('Cancelled', 0, 0),
    ], 'org-host');
    expect(t).toEqual({ host: 1, guest: 1, drawn: 1, live: 1, played: 3, total: 5 });
  });
});

describe('a Head to Head division’s teams with no game', () => {
  it('are the entered teams no game names, leaving out those that left', () => {
    const entrants = [
      { id: 'a', status: 'accepted' },
      { id: 'b', status: 'invited' },
      { id: 'c', status: 'accepted' },
      { id: 'd', status: 'declined' },
    ];
    const games = [
      { status: 'Scheduled' as const, participants: [{ id: '1', entrantId: 'a' }, { id: '2', entrantId: 'b' }] },
      { status: 'Cancelled' as const, participants: [{ id: '3', entrantId: 'c' }] },
    ];
    expect(dualUnpaired(entrants, games).map(e => e.id)).toEqual(['c']);
  });
});
