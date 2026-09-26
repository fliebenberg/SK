import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MINOR_AGE,
  guardianLinkProblem,
  isActiveLink,
  isMinorIn,
  isUnderAge,
  isValidMinorAge,
  maySetMinorAccess,
  memberAccess,
  minorsSettingsOf,
} from './guardians';

// Local dates throughout: the rule is about calendar days, never instants.
const on = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe('coming of age', () => {
  it('is on the birthday itself, not the day after', () => {
    expect(isUnderAge('2008-09-26', 18, on(2026, 9, 25))).toBe(true);
    expect(isUnderAge('2008-09-26', 18, on(2026, 9, 26))).toBe(false);
  });

  it('comes on 1 March for a 29 February birthday in a non-leap year', () => {
    expect(isUnderAge('2008-02-29', 18, on(2026, 2, 28))).toBe(true);
    expect(isUnderAge('2008-02-29', 18, on(2026, 3, 1))).toBe(false);
  });

  it('never makes an unknown or unreadable birthdate under age', () => {
    expect(isUnderAge(undefined, 18)).toBe(false);
    expect(isUnderAge(null, 18)).toBe(false);
    expect(isUnderAge('', 18)).toBe(false);
    expect(isUnderAge('not a date', 18)).toBe(false);
  });

  it('reads only a calendar date, never a timestamp', () => {
    // A timestamp is an instant, and which day it falls on depends on where it is read (DATE-1).
    expect(isUnderAge('2012-01-01T00:00:00.000Z', 14, on(2025, 12, 31))).toBe(false);
    expect(isUnderAge('2012-01-01', 14, on(2025, 12, 31))).toBe(true);
  });
});

describe("an organisation's minors settings", () => {
  it('are off, with a minor age of 18, when never set', () => {
    expect(minorsSettingsOf(undefined)).toEqual({ accountsAllowed: false, minorAge: DEFAULT_MINOR_AGE });
    expect(minorsSettingsOf({})).toEqual({ accountsAllowed: false, minorAge: 18 });
  });

  it('only count as on when explicitly true', () => {
    expect(minorsSettingsOf({ minors: { accountsAllowed: 'yes' } }).accountsAllowed).toBe(false);
    expect(minorsSettingsOf({ minors: { accountsAllowed: true } }).accountsAllowed).toBe(true);
  });

  it('fall back to 18 for a minor age that is not a sensible whole number', () => {
    expect(minorsSettingsOf({ minors: { minorAge: 16 } }).minorAge).toBe(16);
    expect(minorsSettingsOf({ minors: { minorAge: 0 } }).minorAge).toBe(18);
    expect(minorsSettingsOf({ minors: { minorAge: 30 } }).minorAge).toBe(18);
    expect(minorsSettingsOf({ minors: { minorAge: 16.5 } }).minorAge).toBe(18);
    expect(isValidMinorAge(21)).toBe(true);
    expect(isValidMinorAge(22)).toBe(false);
  });
});

describe('who is a minor', () => {
  const settings = { accountsAllowed: true, minorAge: 18 };
  const today = on(2026, 9, 26);

  it('is anyone younger than the organisation’s minor age', () => {
    expect(isMinorIn('2012-01-01', settings, false, today)).toBe(true);
    expect(isMinorIn('2000-01-01', settings, false, today)).toBe(false);
  });

  it('moves with the organisation’s minor age', () => {
    expect(isMinorIn('2009-01-01', { ...settings, minorAge: 16 }, false, today)).toBe(false);
    expect(isMinorIn('2009-01-01', { ...settings, minorAge: 18 }, false, today)).toBe(true);
  });

  it('includes an adult who has a guardian', () => {
    expect(isMinorIn('1990-01-01', settings, true, today)).toBe(true);
  });

  it('treats someone with no birthdate and no guardian as an adult', () => {
    expect(isMinorIn(undefined, settings, false, today)).toBe(false);
  });
});

describe("a minor's member access", () => {
  const today = on(2026, 9, 26);
  const minor = { birthdate: '2012-04-10' };
  const off = { accountsAllowed: false, minorAge: 18 };
  const on_ = { accountsAllowed: true, minorAge: 18 };

  it('is always full for an adult, whatever the organisation says', () => {
    expect(memberAccess({ birthdate: '1990-01-01' }, off, false, today)).toEqual({ access: 'full' });
  });

  it('is restricted while the organisation has minors switched off, whatever the minor’s own setting', () => {
    expect(memberAccess({ ...minor, ownAccountAllowed: true }, off, true, today))
      .toEqual({ access: 'restricted', reason: 'org-off' });
  });

  it('is full by default once the organisation allows minors', () => {
    expect(memberAccess({ ...minor, ownAccountAllowed: null }, on_, true, today)).toEqual({ access: 'full' });
    expect(memberAccess(minor, on_, false, today)).toEqual({ access: 'full' });
  });

  it('is restricted when the minor’s own setting is an explicit no — and only then', () => {
    expect(memberAccess({ ...minor, ownAccountAllowed: false }, on_, true, today))
      .toEqual({ access: 'restricted', reason: 'minor-off' });
    expect(memberAccess({ ...minor, ownAccountAllowed: true }, on_, true, today)).toEqual({ access: 'full' });
  });

  it('returns when the organisation lowers the minor age below the player', () => {
    const sixteen = { birthdate: '2009-06-01' };
    expect(memberAccess(sixteen, { accountsAllowed: false, minorAge: 18 }, false, today).access).toBe('restricted');
    expect(memberAccess(sixteen, { accountsAllowed: false, minorAge: 16 }, false, today).access).toBe('full');
  });

  it('keeps an adult with a guardian under the same rule as a minor', () => {
    expect(memberAccess({ birthdate: '1990-01-01' }, off, true, today).access).toBe('restricted');
  });
});

describe('who may set a minor’s own-account value', () => {
  it('is any active guardian', () => {
    expect(maySetMinorAccess({ isActiveGuardian: true, isOrgAdmin: false }, true)).toBe(true);
  });

  it('is an organisation admin only while the minor has no guardian', () => {
    expect(maySetMinorAccess({ isActiveGuardian: false, isOrgAdmin: true }, false)).toBe(true);
    expect(maySetMinorAccess({ isActiveGuardian: false, isOrgAdmin: true }, true)).toBe(false);
  });

  it('is nobody else', () => {
    expect(maySetMinorAccess({ isActiveGuardian: false, isOrgAdmin: false }, false)).toBe(false);
  });
});

describe('a guardian link', () => {
  const player = { id: 'p1', orgId: 'org', email: 'thabo@school.test' };

  it('can be made between two people in the same organisation', () => {
    expect(guardianLinkProblem({ id: 'g1', orgId: 'org', email: 'mom@home.test' }, player, 'org')).toBeNull();
    expect(guardianLinkProblem({ id: 'g1', orgId: 'org' }, { id: 'p1', orgId: 'org' }, 'org')).toBeNull();
  });

  it('cannot make a person their own guardian', () => {
    expect(guardianLinkProblem({ id: 'p1', orgId: 'org' }, player, 'org')).toMatch(/own guardian/);
  });

  it('cannot cross organisations', () => {
    expect(guardianLinkProblem({ id: 'g1', orgId: 'other' }, player, 'org')).toMatch(/same organisation/);
    expect(guardianLinkProblem({ id: 'g1', orgId: 'org' }, player, 'other')).toMatch(/same organisation/);
  });

  it('cannot share the player’s email, however it is written', () => {
    expect(guardianLinkProblem({ id: 'g1', orgId: 'org', email: ' Thabo@School.test ' }, player, 'org'))
      .toMatch(/email/);
  });

  it('is current until its end date passes', () => {
    const now = new Date('2026-09-26T12:00:00Z');
    expect(isActiveLink({ endDate: null }, now)).toBe(true);
    expect(isActiveLink({ endDate: '2026-09-27T00:00:00Z' }, now)).toBe(true);
    expect(isActiveLink({ endDate: '2026-09-26T11:00:00Z' }, now)).toBe(false);
  });
});
