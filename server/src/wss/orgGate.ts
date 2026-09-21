import { SocketAction } from '@sk/shared';
import pool from '../db';
import { accessManager } from '../managers/AccessManager';

/**
 * Who may write an organisation's things — its teams, sites, facilities, members, leagues and
 * events — and a handful of actions that were open to anybody at all.
 *
 * **Until 2026-09-21 none of the actions below checked anything.** Not a role, not even a sign-in:
 * the handler went straight to the manager. That was the same gap `PEOPLE-2` closed for person
 * records, on the half nobody had got to, and it was not a theoretical one. `ADD_ORG_MEMBER` let
 * anybody add their own profile to any organisation *as an admin*; `DELETE_ORG`, `DELETE_TEAM` and
 * `UPDATE_ORG` would act on anybody's; `CLAIM_ORG` took the claimant from the payload and so handed
 * any unclaimed organisation to whoever was named; and `RESET_CACHE` broadcast a refresh to every
 * connected client on request.
 *
 * **The rule, stated once and applied by the table below.** Each action says how to find the
 * organisation it touches and what the caller must be. The point of a table rather than a check in
 * each handler is that a rule you can read in one line is a rule somebody will notice is wrong, and
 * a handler added later without an entry here is refused rather than silently open (see
 * {@link isOrgAction} and the closing check in `index.ts`).
 *
 * **Admin or staff** is "manages this organisation" everywhere below, because it is the pair
 * `canManageOrgPeople`, `canEditEventOrGame` and `canScoreGame` already use and the pair the
 * screens have always allowed. The org's own identity — renaming it, deleting it, deciding who is
 * an admin — is **admin only**, because those are the operations that can take the organisation
 * away from the people who run it.
 *
 * **One deliberate exception: an unclaimed organisation** (settled 2026-09-21). Nobody owns it, so
 * nobody else *can* add its teams or people — and letting an outsider do so is an incentive for
 * somebody from that school to claim it and fill in the rest. So any signed-in user may create a
 * team or a person in an unclaimed org, **with the payload cut down to the minimum** (a team's
 * name, sport and age group; a person's name). Everything past that waits for an owner. The
 * person-record half of this lives in `profileGate.ts`, beside the rest of that rule.
 *
 * Gated here rather than inside the managers, so the server's own callers keep working — they are
 * not requests.
 */

type OrgResolver = (payload: any) => Promise<string | null>;

type Rule =
  /** Admin or staff of the organisation. */
  | { kind: 'manage-org'; org: OrgResolver }
  /** Admin of the organisation — its identity and who runs it. */
  | { kind: 'admin-org'; org: OrgResolver }
  /** Manage-org; or, for an **unclaimed** org, anybody signed in, with the payload cut to `keep`. */
  | { kind: 'create-in-org'; org: OrgResolver; keep: string[] }
  /** Manage-org to add or change a membership; admin to hand out the admin role. */
  | { kind: 'grant-role'; org: OrgResolver }
  /** Adding a fixture: an event organiser, or the convenor of the stage's division. */
  | { kind: 'organize-fixture' }
  | { kind: 'app-admin' }
  | { kind: 'signed-in' }
  /** A payload that names a user must name the caller. */
  | { kind: 'self'; field: 'userId' }
  /** The notification must be the caller's own. */
  | { kind: 'own-notification' }
  /** The token in the payload is the authorisation, and the pages that send it work signed out. */
  | { kind: 'token' };

// -------------------------------------------------------------------------------------------------
// Where each payload's organisation is
// -------------------------------------------------------------------------------------------------

const one = async (sql: string, value: unknown): Promise<string | null> => {
  if (!value) return null;
  const res = await pool.query(sql, [value]);
  return res.rows[0]?.org_id ?? null;
};

const orgId: OrgResolver = async p => p?.orgId ?? null;
const orgById: OrgResolver = async p => p?.id ?? null;
const teamOrg = (field: string): OrgResolver => p => one('SELECT org_id FROM teams WHERE id = $1', p?.[field]);
const siteOrg = (field: string): OrgResolver => p => one('SELECT org_id FROM sites WHERE id = $1', p?.[field]);
const facilityOrg: OrgResolver = p =>
  one('SELECT s.org_id FROM facilities f JOIN sites s ON s.id = f.site_id WHERE f.id = $1', p?.id);
const teamMemberOrg: OrgResolver = p =>
  one('SELECT t.org_id FROM team_memberships tm JOIN teams t ON t.id = tm.team_id WHERE tm.id = $1', p?.id);
const orgMemberOrg: OrgResolver = p => one('SELECT org_id FROM org_memberships WHERE id = $1', p?.id);
const profileOrg: OrgResolver = p => one('SELECT org_id FROM org_profiles WHERE id = $1', p?.memberId);
const leagueOrg = (field: string): OrgResolver => p =>
  one('SELECT org_id FROM leagues WHERE id = $1', p?.[field]);
const seasonOrg = (field: string): OrgResolver => p =>
  one('SELECT l.org_id FROM seasons s JOIN leagues l ON l.id = s.league_id WHERE s.id = $1', p?.[field]);

/** What an outsider may set when creating a team in an unclaimed org — the three that decide
 *  which divisions it qualifies for, and the org it belongs to. */
const TEAM_MINIMUM = ['name', 'orgId', 'sportId', 'ageGroupId', 'isActive'];

const RULES: Partial<Record<SocketAction, Rule>> = {
  // The organisation itself.
  [SocketAction.ADD_ORG]: { kind: 'signed-in' },
  [SocketAction.UPDATE_ORG]: { kind: 'admin-org', org: orgById },
  [SocketAction.DELETE_ORG]: { kind: 'admin-org', org: orgById },
  // No client sends this, and it took the claimant from the payload. The real claim is by token.
  [SocketAction.CLAIM_ORG]: { kind: 'app-admin' },

  // Who runs it.
  [SocketAction.ADD_ORG_MEMBER]: { kind: 'grant-role', org: orgId },
  [SocketAction.UPDATE_ORG_MEMBER]: { kind: 'grant-role', org: orgMemberOrg },
  [SocketAction.REMOVE_ORG_MEMBER]: { kind: 'manage-org', org: orgMemberOrg },
  [SocketAction.SEND_MEMBER_INVITE]: { kind: 'manage-org', org: profileOrg },

  // Its things.
  [SocketAction.ADD_TEAM]: { kind: 'create-in-org', org: orgId, keep: TEAM_MINIMUM },
  [SocketAction.UPDATE_TEAM]: { kind: 'manage-org', org: teamOrg('id') },
  [SocketAction.DELETE_TEAM]: { kind: 'manage-org', org: teamOrg('id') },
  [SocketAction.ADD_TEAM_MEMBER]: { kind: 'manage-org', org: teamOrg('teamId') },
  [SocketAction.UPDATE_TEAM_MEMBER]: { kind: 'manage-org', org: teamMemberOrg },
  [SocketAction.REMOVE_TEAM_MEMBER]: { kind: 'manage-org', org: teamMemberOrg },
  [SocketAction.ADD_SITE]: { kind: 'manage-org', org: orgId },
  [SocketAction.UPDATE_SITE]: { kind: 'manage-org', org: siteOrg('id') },
  [SocketAction.DELETE_SITE]: { kind: 'manage-org', org: siteOrg('id') },
  [SocketAction.ADD_FACILITY]: { kind: 'manage-org', org: siteOrg('siteId') },
  [SocketAction.UPDATE_FACILITY]: { kind: 'manage-org', org: facilityOrg },
  [SocketAction.DELETE_FACILITY]: { kind: 'manage-org', org: facilityOrg },

  // Its competitions. A season belongs to the league's organisation, which is what decides who
  // may add a team to it — including a team from another organisation.
  [SocketAction.ADD_EVENT]: { kind: 'manage-org', org: orgId },
  [SocketAction.ADD_GAME]: { kind: 'organize-fixture' },
  [SocketAction.ADD_LEAGUE]: { kind: 'manage-org', org: orgId },
  [SocketAction.UPDATE_LEAGUE]: { kind: 'manage-org', org: leagueOrg('id') },
  [SocketAction.DELETE_LEAGUE]: { kind: 'manage-org', org: leagueOrg('id') },
  [SocketAction.ADD_SEASON]: { kind: 'manage-org', org: leagueOrg('leagueId') },
  [SocketAction.UPDATE_SEASON]: { kind: 'manage-org', org: seasonOrg('id') },
  [SocketAction.DELETE_SEASON]: { kind: 'manage-org', org: seasonOrg('id') },
  [SocketAction.ADD_SEASON_TEAM]: { kind: 'manage-org', org: seasonOrg('seasonId') },
  [SocketAction.REMOVE_SEASON_TEAM]: { kind: 'manage-org', org: seasonOrg('seasonId') },
  [SocketAction.ADD_GAME_TO_SEASON]: { kind: 'manage-org', org: seasonOrg('seasonId') },
  [SocketAction.REMOVE_GAME_FROM_SEASON]: { kind: 'manage-org', org: seasonOrg('seasonId') },

  // The caller's own things.
  [SocketAction.MARK_ALL_NOTIFICATIONS_READ]: { kind: 'self', field: 'userId' },
  [SocketAction.FEED_GET_HOME]: { kind: 'self', field: 'userId' },
  [SocketAction.GET_USER_BADGES]: { kind: 'self', field: 'userId' },
  [SocketAction.MARK_NOTIFICATION_READ]: { kind: 'own-notification' },
  [SocketAction.DELETE_NOTIFICATION]: { kind: 'own-notification' },

  // Anybody signed in.
  [SocketAction.SUBMIT_REPORT]: { kind: 'signed-in' },
  [SocketAction.REFER_ORG_CONTACT]: { kind: 'signed-in' },
  [SocketAction.GET_SYSTEM_SETTINGS]: { kind: 'signed-in' },
  // Claiming makes you an admin, so it needs a user to make one of; the token says which org.
  [SocketAction.CLAIM_ORG_VIA_TOKEN]: { kind: 'self', field: 'userId' },

  // The link in an email is the authorisation, and those pages are opened signed out.
  [SocketAction.DECLINE_CLAIM]: { kind: 'token' },
  [SocketAction.REFER_ORG_CONTACT_VIA_TOKEN]: { kind: 'token' },

  // A refresh broadcast to every connected client is an operator's lever, not a user's.
  [SocketAction.RESET_CACHE]: { kind: 'app-admin' },
  [SocketAction.GLOBAL_CACHE_REFRESH]: { kind: 'app-admin' },
};

export function isOrgAction(type: SocketAction): boolean {
  return type in RULES;
}

/** Deletes every key of `payload` not in `keep`. Mutates, because the handler reads the same object. */
function cutTo(payload: Record<string, unknown>, keep: string[]): void {
  for (const key of Object.keys(payload)) {
    if (!keep.includes(key)) delete payload[key];
  }
}

async function isUnclaimed(org: string): Promise<boolean> {
  const res = await pool.query('SELECT is_claimed FROM organizations WHERE id = $1', [org]);
  return res.rows.length > 0 && res.rows[0].is_claimed !== true;
}

/**
 * Authorize one action, or throw the refusal the client sees.
 *
 * An action with no rule here passes straight through, exactly as the tournament and profile
 * gates do; those actions are authorized by one of them, by the scoring gate, or in their handler.
 *
 * **May mutate `payload`** — the unclaimed-org path cuts it down to the fields an outsider may set,
 * and the handler then reads the cut-down object.
 */
export async function enforceOrgAction(userId: string | null, type: SocketAction, payload: any): Promise<void> {
  const rule = RULES[type];
  if (!rule) return;

  if (rule.kind === 'token') {
    if (!payload?.token) throw new Error(`Bad request: ${type} needs a token.`);
    return;
  }

  if (!userId) throw new Error('Unauthorized: You must be signed in to do that.');

  switch (rule.kind) {
    case 'signed-in':
      // Creating an organisation records who made it; that may only be the caller.
      if (type === SocketAction.ADD_ORG && payload?.creatorId && payload.creatorId !== userId) {
        throw new Error('Unauthorized: An organisation can only be created in your own name.');
      }
      return;

    case 'self':
      if (payload?.[rule.field] !== userId) {
        throw new Error("Unauthorized: That belongs to somebody else's account.");
      }
      return;

    case 'own-notification': {
      const res = await pool.query('SELECT user_id FROM notifications WHERE id = $1', [payload?.id]);
      if (res.rows[0]?.user_id !== userId) throw new Error('Unauthorized: That notification is not yours.');
      return;
    }

    case 'app-admin':
      if (!(await accessManager.isAppAdmin(userId))) {
        throw new Error('Unauthorized: Only an app administrator may do that.');
      }
      return;

    case 'organize-fixture': {
      if (payload?.eventId && (await accessManager.canOrganizeEvent(userId, payload.eventId))) return;
      // A convenor adds fixtures to their own division (`FIX-12`), which a hand-added fixture names
      // through its stage.
      if (payload?.stageId) {
        const res = await pool.query('SELECT division_id FROM division_stages WHERE id = $1', [payload.stageId]);
        const divisionId = res.rows[0]?.division_id;
        if (divisionId && (await accessManager.canOrganizeDivision(userId, divisionId))) return;
      }
      throw new Error('Unauthorized: Only an organiser of this event may add a fixture to it.');
    }
  }

  const org = await rule.org(payload);
  if (!org) throw new Error(`Bad request: ${type} does not name anything that exists.`);

  if (rule.kind === 'admin-org') {
    if (await accessManager.isOrganizationAdmin(userId, org)) return;
    throw new Error("Unauthorized: Only an organisation's admins may do that.");
  }

  if (await accessManager.canManageOrgPeople(userId, org)) {
    // Staff may add and change memberships, but not hand out the admin role: that is how a staff
    // member would make themselves an admin.
    if (rule.kind === 'grant-role' && payload?.roleId === 'role-org-admin') {
      if (!(await accessManager.isOrganizationAdmin(userId, org))) {
        throw new Error("Unauthorized: Only an organisation's admins may make somebody an admin.");
      }
    }
    return;
  }

  if (rule.kind === 'create-in-org' && (await isUnclaimed(org))) {
    cutTo(payload, rule.keep);
    return;
  }

  throw new Error("Unauthorized: Only an organisation's admins and staff may change its things.");
}
