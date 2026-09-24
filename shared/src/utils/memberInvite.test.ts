import { describe, expect, it } from 'vitest';
import {
  formatInviteWait,
  inviteCooldownHoursFrom,
  inviteCooldownRemainingHours,
  isValidEmail,
  normalizeEmail,
} from './memberInvite';

const HOUR = 1000 * 60 * 60;
const sentAt = '2026-09-24T10:00:00Z';
const at = (hoursLater: number) => new Date(sentAt).getTime() + hoursLater * HOUR;

describe('the invite cooldown', () => {
  const history = { lastInviteSentAt: sentAt, lastInviteEmail: 'hennie.steyn@doringkloof.test' };

  it('holds the same address for the whole cooldown', () => {
    expect(inviteCooldownRemainingHours(history, 'hennie.steyn@doringkloof.test', 168, at(1))).toBe(167);
    expect(inviteCooldownRemainingHours(history, 'hennie.steyn@doringkloof.test', 168, at(167.5))).toBe(1);
  });

  it('lets the same address go again once the cooldown is over', () => {
    expect(inviteCooldownRemainingHours(history, 'hennie.steyn@doringkloof.test', 168, at(168))).toBe(0);
  });

  it('never holds a different address, so a typo can be corrected at once', () => {
    expect(inviteCooldownRemainingHours(history, 'hennie@doringkloof.test', 168, at(1))).toBe(0);
  });

  it('is not fooled by case or spacing', () => {
    expect(inviteCooldownRemainingHours(history, '  Hennie.Steyn@Doringkloof.test ', 168, at(1))).toBe(167);
  });

  it('does not hold anyone who was never invited', () => {
    expect(inviteCooldownRemainingHours({}, 'hennie.steyn@doringkloof.test', 168, at(1))).toBe(0);
  });
});

describe('email addresses', () => {
  it('are compared trimmed and lower-case', () => {
    expect(normalizeEmail('  A.B@Example.COM ')).toBe('a.b@example.com');
    expect(normalizeEmail(undefined)).toBe('');
  });

  it('need an @ and a dot after it', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('the wait, in words', () => {
  it('counts days over a day, hours under', () => {
    expect(formatInviteWait(167)).toBe('7 days');
    expect(formatInviteWait(24)).toBe('24 hours');
    expect(formatInviteWait(1)).toBe('1 hour');
  });
});

describe('the cooldown setting', () => {
  it('reads the stored string and falls back to two weeks', () => {
    expect(inviteCooldownHoursFrom({ invite_cooldown_hours: '48' })).toBe(48);
    expect(inviteCooldownHoursFrom({})).toBe(336);
    expect(inviteCooldownHoursFrom(null)).toBe(336);
  });
});
