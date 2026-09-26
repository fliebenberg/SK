/**
 * Guardians, and whether a minor's membership carries a member's privileges (`MEMBER-3`).
 *
 * The rules live here so the server, which enforces them in SQL, and the screens, which explain
 * them, cannot disagree. The server's SQL (`AccessManager.MEMBER_PRIVILEGED`) must match
 * {@link memberAccess} — the tests below are the definition of both.
 *
 * See docs/guardians-implementation-plan.md §0.3 for why the rule is shaped this way.
 */
import { normalizeEmail } from './memberInvite';
import { calendarDateParts, type CalendarDate } from './calendarDate';

/** The age below which a player is a minor, when the organisation has not set one. */
export const DEFAULT_MINOR_AGE = 18;
export const MIN_MINOR_AGE = 1;
export const MAX_MINOR_AGE = 21;

/**
 * An organisation's minors settings, held at `organizations.settings.minors`.
 *
 * **Off by default**: an organisation that has never answered gives no minor a member's privileges.
 */
export interface OrgMinorsSettings {
  /** "Minors may have their own ScoreKeeper account". While false, no minor gets member privileges. */
  accountsAllowed: boolean;
  /** Younger than this, by birthdate, is a minor. */
  minorAge: number;
}

/** The organisation's settings with every gap filled by its default. Never throws on junk. */
export function minorsSettingsOf(settings: Record<string, any> | null | undefined): OrgMinorsSettings {
  const raw = settings?.minors;
  const age = Number(raw?.minorAge);
  return {
    accountsAllowed: raw?.accountsAllowed === true,
    minorAge: isValidMinorAge(age) ? age : DEFAULT_MINOR_AGE,
  };
}

export function isValidMinorAge(age: unknown): age is number {
  return typeof age === 'number' && Number.isInteger(age) && age >= MIN_MINOR_AGE && age <= MAX_MINOR_AGE;
}

/**
 * A birthdate is a {@link CalendarDate} — `YYYY-MM-DD`, the same day for everybody. Anything else
 * (a timestamp, a half-typed value) is not a birthdate we know, and reads as `null`.
 */
function calendarParts(birthdate: CalendarDate | null | undefined): [number, number, number] | null {
  const parts = calendarDateParts(birthdate);
  return parts ? [parts[0], parts[1] - 1, parts[2]] : null;
}

/**
 * Younger than `years` on `today`? An unknown birthdate is never under age.
 *
 * Someone comes of age **on** their birthday. A 29 February birthday comes of age on 1 March in a
 * non-leap year — `new Date(y, 1, 29)` rolls over — which is also what the server's SQL gives
 * (`birthdate > CURRENT_DATE - make_interval(years => n)`).
 */
export function isUnderAge(birthdate: CalendarDate | null | undefined, years: number, today: Date = new Date()): boolean {
  const parts = calendarParts(birthdate);
  if (!parts) return false;
  const [y, m, d] = parts;
  const comesOfAge = new Date(y + years, m, d);
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return day < comesOfAge;
}

/**
 * Is this player a minor in this organisation? Younger than the org's minor age, **or** anyone
 * with an active guardian, whatever their age — whoever answers for them decides.
 *
 * A player with no birthdate and no guardian is treated as an adult.
 */
export function isMinorIn(
  birthdate: string | null | undefined,
  settings: OrgMinorsSettings,
  hasActiveGuardian: boolean,
  today: Date = new Date()
): boolean {
  return hasActiveGuardian || isUnderAge(birthdate, settings.minorAge, today);
}

export type RestrictedReason =
  /** The organisation does not allow minors their own account. */
  | 'org-off'
  /** The organisation does, but the minor's own setting says no. */
  | 'minor-off';

export type MemberAccess = { access: 'full' } | { access: 'restricted'; reason: RestrictedReason };

/**
 * Does this person's membership carry a member's privileges?
 *
 * 1. Not a minor → full.
 * 2. A minor and the organisation's switch is off → restricted, whatever the guardians say.
 * 3. Otherwise full, **unless** the minor's own setting is an explicit `false`. `null` (never set)
 *    follows the organisation, which allows them.
 *
 * A restricted member is still a member — linked, and shown the organisation as theirs — but is
 * treated as an outsider by every org-wide privilege check. Team duties (coach, scorer) are
 * separate and unaffected (plan §0.3).
 */
export function memberAccess(
  person: { birthdate?: string | null; ownAccountAllowed?: boolean | null },
  settings: OrgMinorsSettings,
  hasActiveGuardian: boolean,
  today: Date = new Date()
): MemberAccess {
  if (!isMinorIn(person.birthdate, settings, hasActiveGuardian, today)) return { access: 'full' };
  if (!settings.accountsAllowed) return { access: 'restricted', reason: 'org-off' };
  if (person.ownAccountAllowed === false) return { access: 'restricted', reason: 'minor-off' };
  return { access: 'full' };
}

/** Is a link, or a membership, current? Mirrors the `end_date` test used across the schema. */
export function isActiveLink(link: { endDate?: string | null }, now: Date = new Date()): boolean {
  if (!link.endDate) return true;
  const ends = new Date(link.endDate);
  return Number.isNaN(ends.getTime()) ? true : ends > now;
}

/**
 * Who may set a minor's own-account value: any active guardian of theirs, or an org Admin **only
 * while the minor has no active guardian**. Once a guardian exists, the value an Admin set stays,
 * but only guardians can change it.
 */
export function maySetMinorAccess(
  actor: { isActiveGuardian: boolean; isOrgAdmin: boolean },
  playerHasActiveGuardian: boolean
): boolean {
  if (actor.isActiveGuardian) return true;
  return actor.isOrgAdmin && !playerHasActiveGuardian;
}

/** Why a guardian link cannot be made, or `null` if it can. */
export function guardianLinkProblem(
  guardian: { id: string; orgId: string; email?: string | null },
  player: { id: string; orgId: string; email?: string | null },
  orgId: string
): string | null {
  if (guardian.id === player.id) return 'A person cannot be their own guardian.';
  if (guardian.orgId !== orgId || player.orgId !== orgId) {
    return 'A guardian must be recorded in the same organisation as the player.';
  }
  // Access is matched by email, so a shared address would make the guardian *be* the child in every
  // access check — and the child the guardian.
  const guardianEmail = normalizeEmail(guardian.email);
  if (guardianEmail && guardianEmail === normalizeEmail(player.email)) {
    return 'A guardian cannot share the player’s email address. Give each their own.';
  }
  return null;
}
