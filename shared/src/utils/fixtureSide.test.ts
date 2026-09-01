import { describe, expect, it } from 'vitest';
import {
  AWAITING_ENTRANT_LABEL,
  EMPTY_SIDE_LABEL,
  describeParticipantSource,
  ordinal,
  resolveFixtureSide,
} from './fixtureSide';

/**
 * The three states of a fixture side (data model §2.0). Every surface renders one of them, so the
 * text is derived here once and every screen is checked against these cases.
 */

describe('a known competitor', () => {
  it('prints the team name', () => {
    expect(resolveFixtureSide({ participant: { teamId: 'team-1', name: 'Northcliff u14A' } }))
      .toEqual({ state: 'known', label: 'Northcliff u14A', isPlaceholder: false });
  });

  it('prefixes the org short name, as a fixtures list does', () => {
    const side = resolveFixtureSide({
      participant: { teamId: 'team-1', name: '1st XV' },
      orgShortName: 'SBHS',
    });
    expect(side.label).toBe('SBHS 1st XV');
  });

  it('takes the name from an entrant when the participant carries none', () => {
    const side = resolveFixtureSide({
      participant: { entrantId: 'ent-1' },
      entrant: { id: 'ent-1', teamId: 'team-1', label: 'Parktown u14A' },
    });
    expect(side).toMatchObject({ state: 'known', isPlaceholder: false, label: 'Parktown u14A' });
  });

  it('is still known when the name has not arrived yet', () => {
    // A resolved side must never read as TBC just because this payload did not carry the name.
    const side = resolveFixtureSide({ participant: { teamId: 'team-1' } });
    expect(side).toMatchObject({ state: 'known', isPlaceholder: false, label: EMPTY_SIDE_LABEL });
  });

  it('is indistinguishable from a slot that was never a placeholder, once filled', () => {
    // Resolution writes the team and clears the rule; a stale rule must not win over a real team.
    const side = resolveFixtureSide({
      participant: {
        teamId: 'team-1',
        name: 'Northcliff u14A',
        sourceGameId: 'game-qf1',
        sourceRule: { type: 'winnerOf' },
      },
      names: { games: { 'game-qf1': 'QF1' } },
    });
    expect(side).toEqual({ state: 'known', label: 'Northcliff u14A', isPlaceholder: false });
  });
});

describe('an entrant awaiting a person', () => {
  it('prints the entrant label', () => {
    const side = resolveFixtureSide({
      participant: { entrantId: 'ent-4' },
      entrant: { id: 'ent-4', label: 'Fourth school - to be confirmed' },
    });
    expect(side).toEqual({
      state: 'awaitingEntrant',
      label: 'Fourth school - to be confirmed',
      isPlaceholder: true,
    });
  });

  it('falls back to the standard wording when the entrant carries no label', () => {
    const side = resolveFixtureSide({ participant: { entrantId: 'ent-4' } });
    expect(side).toEqual({
      state: 'awaitingEntrant',
      label: AWAITING_ENTRANT_LABEL,
      isPlaceholder: true,
    });
  });

  it('reads as an unfilled slot when nothing is entered and nothing is ruled', () => {
    expect(resolveFixtureSide({ participant: { id: 'gp-1', gameId: 'g-1' } })).toEqual({
      state: 'awaitingEntrant',
      label: EMPTY_SIDE_LABEL,
      isPlaceholder: true,
    });
    expect(resolveFixtureSide()).toMatchObject({ label: EMPTY_SIDE_LABEL });
  });
});

describe('a side awaiting a result', () => {
  const names = {
    games: { 'game-qf1': 'QF1', 'game-sf2': 'SF2' },
    stages: { 'stg-pools': 'Group Stage' },
    pools: { A: 'Pool A' },
  };

  it('derives "Winner QF1" from the rule, with nothing stored', () => {
    const side = resolveFixtureSide({
      participant: { sourceGameId: 'game-qf1', sourceRule: { type: 'winnerOf' } },
      names,
    });
    expect(side).toEqual({ state: 'awaitingResult', label: 'Winner QF1', isPlaceholder: true });
  });

  it('derives the plate side from a loserOf rule', () => {
    const side = resolveFixtureSide({
      participant: { sourceGameId: 'game-sf2', sourceRule: { type: 'loserOf' } },
      names,
    });
    expect(side.label).toBe('Loser SF2');
  });

  it('names a pool winner and a pool position', () => {
    expect(
      describeParticipantSource({ type: 'standing', poolKey: 'A', position: 1 }, {
        sourceStageId: 'stg-pools',
        names,
      })
    ).toBe('Pool A winner');

    expect(
      describeParticipantSource({ type: 'standing', poolKey: 'C', position: 3 }, {
        sourceStageId: 'stg-pools',
        names,
      })
    ).toBe('3rd in Pool C');
  });

  it('names a whole-stage position when the rule has no pool', () => {
    expect(
      describeParticipantSource({ type: 'standing', position: 2 }, {
        sourceStageId: 'stg-pools',
        names,
      })
    ).toBe('2nd in Group Stage');
  });

  it('degrades without breaking when the caller has no names to hand', () => {
    expect(describeParticipantSource({ type: 'winnerOf' }, { sourceGameId: 'game-qf1' }))
      .toBe('Winner of an earlier fixture');
    expect(describeParticipantSource({ type: 'standing', position: 1 }, {})).toBe('Stage winner');
    expect(describeParticipantSource({ type: 'standing', poolKey: 'B', position: 1 }, {}))
      .toBe('Pool B winner');
  });

  it('has nothing to describe without a rule', () => {
    expect(describeParticipantSource(undefined)).toBeUndefined();
  });
});

describe('ordinal', () => {
  it('handles the teens, which are the ones that catch a naive rule', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st',
    ]);
  });
});
