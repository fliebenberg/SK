import { describe, expect, it } from 'vitest';
import { entryLockGaps } from './entryLock';
import { TournamentEntrant } from '../models/event/Tournament';
import { entrantStatusShown } from '../models/event/Tournament';

const entrant = (id: string, status: TournamentEntrant['status'], orgId?: string): TournamentEntrant =>
  ({ id, divisionId: 'div-1', status, orgId } as TournamentEntrant);

const event = {
  orgId: 'host',
  participatingOrgs: [
    { id: 'host', invitation: 'accepted' as const },
    { id: 'in', invitation: 'accepted' as const },
    { id: 'asked', invitation: 'invited' as const },
    { id: 'later', invitation: 'not_invited' as const },
  ],
};

describe('entryLockGaps (FIX-31)', () => {
  it('is empty when every team has answered and every organisation has accepted', () => {
    const gaps = entryLockGaps([entrant('a', 'accepted', 'host'), entrant('b', 'accepted', 'in'), entrant('c', 'declined', 'asked')], event);
    expect(gaps.total).toBe(0);
  });

  it('counts teams still to answer, and which of them are not invited yet', () => {
    const gaps = entryLockGaps([entrant('a', 'invited', 'asked'), entrant('b', 'invited', 'later')], event);
    expect(gaps.invited.map(e => e.id)).toEqual(['a', 'b']);
    expect(gaps.notInvited.map(e => e.id)).toEqual(['b']);
    expect(gaps.total).toBe(2);
  });

  it('counts a request waiting, and a team in play whose organisation has not accepted', () => {
    const gaps = entryLockGaps([entrant('a', 'requested', 'in'), entrant('b', 'accepted', 'asked')], event);
    expect(gaps.requested.map(e => e.id)).toEqual(['a']);
    expect(gaps.orgNotIn.map(e => e.id)).toEqual(['b']);
    expect(gaps.total).toBe(2);
  });

  it('never counts a placeholder or the host against the lock', () => {
    expect(entryLockGaps([entrant('a', 'accepted'), entrant('b', 'accepted', 'host')], event).total).toBe(0);
  });
});

describe('entrantStatusShown (FIX-31 rules 5 and 7)', () => {
  it('reads Not invited yet while the organisation is not invited', () => {
    expect(entrantStatusShown('invited', 'not_invited', false)).toBe('not_invited');
  });
  it('shows an accept as Invited to outsiders until the organisation accepts, but not a decline', () => {
    expect(entrantStatusShown('accepted', 'invited', false)).toBe('invited');
    expect(entrantStatusShown('declined', 'invited', false)).toBe('declined');
    expect(entrantStatusShown('accepted', 'accepted', false)).toBe('accepted');
  });
  it("shows the organisation's own people the answer as given", () => {
    expect(entrantStatusShown('accepted', 'invited', true)).toBe('accepted');
  });
});
