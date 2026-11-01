import { guardianManager } from '../managers/GuardianManager';
import { teamManager } from '../managers/TeamManager';
import { userManager } from '../managers/UserManager';
import { broadcast } from './broadcast';
import { publishUserMemberships } from './memberships';
import { orgGuardiansRoom, orgMembersRoom, teamGuardiansRoom, teamMembersRoom } from './rooms';

/**
 * Publishing a change to a player's guardians, or to whether their membership carries privileges
 * (`MEMBER-3`). Data, not a nudge — each message carries what changed (live-data rule 1).
 *
 * One change reaches four audiences:
 *  - **the org's people screens**: the player's whole current guardian list on `org:{id}:guardians`
 *    (and `team:{id}:guardians`, for their coaches),
 *    and the player's member row on `org:{id}:members`, whose `restrictedReason` a guardian link can
 *    change (a link makes the player a minor whatever their age);
 *  - **the player's rosters** (`team:{id}:members`), which show the same reason;
 *  - **the player's own account** and **every guardian's**, through `USER_MEMBERSHIPS_UPDATED`,
 *    which also drops their cached access so a restriction takes effect at once rather than after
 *    the 30-second cache (`broadcast()` keys that off the type).
 */
export async function publishPlayerChange(orgId: string, playerProfileId: string, options: { guardians?: boolean } = {}): Promise<void> {
  const room = orgMembersRoom(orgId);

  if (options.guardians !== false) await publishGuardianList(orgId, playerProfileId);

  const members = await userManager.getOrganizationMembers(orgId);
  for (const member of members.filter(m => m.id === playerProfileId)) {
    broadcast(room, 'ORG_MEMBER_UPDATED', member);
  }

  await publishProfileToRosters(playerProfileId);

  for (const userId of await guardianManager.getAffectedUserIds(playerProfileId)) {
    await publishUserMemberships(userId);
  }
}

/** A person's rows on every roster they are on, which their coaches read them from (`PEOPLE-8`). */
export async function publishProfileToRosters(profileId: string): Promise<void> {
  const teams = await userManager.getUserTeamMembershipsForProfile(profileId);
  for (const teamId of new Set(teams.map(t => t.teamId))) {
    broadcast(teamMembersRoom(teamId), 'TEAM_MEMBERS_SYNC', await teamManager.getTeamMembers(teamId));
  }
}

/** The guardians of a team's players: what `team:{id}:guardians` holds. */
export async function teamGuardians(teamId: string, orgId: string) {
  const players = new Set((await teamManager.getTeamMembers(teamId)).map(m => m.id));
  return (await guardianManager.getGuardiansForOrg(orgId)).filter(link => players.has(link.playerProfileId));
}

/**
 * An org's minors settings changed: every member row may have a new `restrictedReason`, so the
 * whole list goes out, and every minor and guardian account hears. `widestMinorAge` is the larger of
 * the old and new ages — raising it restricts players who were adults a moment ago.
 */
export async function publishOrgMinorsChange(orgId: string, widestMinorAge: number): Promise<void> {
  broadcast(orgMembersRoom(orgId), 'ORG_MEMBERS_SYNC', await userManager.getOrganizationMembers(orgId));
  for (const userId of await guardianManager.getMinorsAffectedByOrgChange(orgId, widestMinorAge)) {
    await publishUserMemberships(userId);
  }
}

/** One player's whole current guardian list, on the org's guardians room. */
export async function publishGuardianList(orgId: string, playerProfileId: string): Promise<void> {
  const list = { playerProfileId, guardians: await guardianManager.getGuardiansForPlayer(playerProfileId) };
  broadcast(orgGuardiansRoom(orgId), 'PROFILE_GUARDIANS_UPDATED', list);
  const teams = await userManager.getUserTeamMembershipsForProfile(playerProfileId);
  for (const teamId of new Set(teams.map(t => t.teamId))) {
    broadcast(teamGuardiansRoom(teamId), 'PROFILE_GUARDIANS_UPDATED', list);
  }
}

/**
 * A guardian's own profile changed — a name, an email, an invite sent. Every guardian list they
 * appear in carries those fields, so each is republished whole.
 */
export async function publishGuardianProfileChange(guardianProfileId: string): Promise<void> {
  for (const link of await guardianManager.getActiveLinksOfGuardian(guardianProfileId)) {
    await publishGuardianList(link.orgId, link.playerProfileId);
  }
}
