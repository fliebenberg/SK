import { SocketAction } from '@sk/shared';
import pool from '../db';
import { dataManager } from '../DataManager';
import { accessManager } from '../managers/AccessManager';

/**
 * Who may write a person record.
 *
 * `org_profiles` is the identity the permission layer works in: `AccessManager` resolves a user
 * into a set of profile ids by `user_id` **or verified email**, and a profile's memberships are what
 * confer org rights. So a write to a profile is a write to *identity*, and until 2026-09-03 all four
 * of the actions below ran with no check at all (`PEOPLE-2`).
 *
 * That was not merely untidy. Two of them handed over an admin membership to anybody signed in:
 *
 *  - `LINK_USER_PROFILE` sets a profile's email. Point an org admin's profile at your own verified
 *    address and `getOrganizationRole` matches you to their membership.
 *  - `UPDATE_ORG_PROFILE` could write `user_id`, which is the same takeover by the other matching
 *    rule. Profile ids are not secret — `search_people` returns them to any signed-in user.
 *
 * **The rule: a person record is created, edited, deleted or re-linked by an admin or staff member
 * of the organisation that holds it** (`AccessManager.canManageOrgPeople`, which is the same pair
 * every other "manage this org's things" check uses, and the pair the people screen has always
 * allowed). Applying to an org never creates a confirmed profile on its own (`MEMBER-1`), and a
 * profile is not a membership either way (`MEMBER-2`).
 *
 * **One deliberate exception, on creation only.** Someone who may organise an event may create a
 * profile in the org **hosting that event**. That is the organiser picker's third tier — appointing
 * a convenor who is not on the app at all — and it follows U12: an event organiser does within the
 * tournament what an org admin can. It is narrow on purpose: creation only, the payload must name
 * the event, and that event must be hosted by the org the profile is going into. Editing, deleting
 * and re-linking an existing person stay with the org itself, because those are the operations that
 * can take something away from somebody.
 *
 * Gated here rather than inside `UserManager`, so the server's own callers — the invite flow's
 * `lastInviteSentAt` write, the claim flow's link — keep working. They are not requests.
 */

/** The profile writes this gate covers. */
const PROFILE_ACTIONS: SocketAction[] = [
  SocketAction.ADD_ORG_PROFILE,
  SocketAction.UPDATE_ORG_PROFILE,
  SocketAction.DELETE_ORG_PROFILE,
  SocketAction.LINK_USER_PROFILE,
];

export function isProfileAction(type: SocketAction): boolean {
  return PROFILE_ACTIONS.includes(type);
}

/** The org a payload's profile belongs to, or null when it names nothing that exists. */
async function orgOfPayload(type: SocketAction, payload: any): Promise<string | null> {
  if (type === SocketAction.ADD_ORG_PROFILE) return payload?.orgId ?? null;

  const profileId = type === SocketAction.LINK_USER_PROFILE ? payload?.orgProfileId : payload?.id;
  if (!profileId) return null;
  const profile = await dataManager.getOrgProfile(profileId);
  return profile?.orgId ?? null;
}

/**
 * Authorize one profile write, or throw the refusal the client sees.
 *
 * A non-profile action passes straight through, exactly as the tournament gate does.
 */
export async function enforceProfileAction(
  userId: string | null,
  type: SocketAction,
  payload: any
): Promise<void> {
  if (!isProfileAction(type)) return;

  if (!userId) {
    throw new Error('Unauthorized: You must be signed in to change a person record.');
  }

  const orgId = await orgOfPayload(type, payload);
  if (!orgId) {
    throw new Error(`Bad request: ${type} does not name a person record that exists.`);
  }

  // Covers app admins too — `canManageOrgPeople` short-circuits on them.
  if (await accessManager.canManageOrgPeople(userId, orgId)) return;

  if (type === SocketAction.ADD_ORG_PROFILE && payload?.eventId) {
    const res = await pool.query('SELECT org_id FROM events WHERE id = $1', [payload.eventId]);
    const hostOrgId = res.rows[0]?.org_id;
    // The event must be hosted by the org the profile is going into. Without that check, organising
    // any event anywhere would let you write into any organisation's people list.
    if (hostOrgId === orgId && (await accessManager.canOrganizeEvent(userId, payload.eventId))) return;
  }

  throw new Error("Unauthorized: Only an organisation's admins and staff may change its people.");
}
