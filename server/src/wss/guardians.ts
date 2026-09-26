import { guardianManager } from '../managers/GuardianManager';
import { teamManager } from '../managers/TeamManager';
import { userManager } from '../managers/UserManager';
import { broadcast } from './broadcast';
import { publishUserMemberships } from './memberships';
import { orgMembersRoom, teamMembersRoom } from './rooms';

/**
 * Publishing a change to a player's guardians, or to whether their membership carries privileges
 * (`MEMBER-3`). Data, not a nudge — each message carries what changed (live-data rule 1).
 *
 * One change reaches four audiences:
 *  - **the org's people screens** (`org:{id}:members`): the player's whole current guardian list,
 *    and the player's member row, whose `restrictedReason` a guardian link can change (a link
 *    makes the player a minor whatever their age);
 *  - **the player's rosters** (`team:{id}:members`), which show the same reason;
 *  - **the player's own account** and **every guardian's**, through `USER_MEMBERSHIPS_UPDATED`,
 *    which also drops their cached access so a restriction takes effect at once rather than after
 *    the 30-second cache (`broadcast()` keys that off the type).
 */
export async function publishPlayerChange(orgId: string, playerProfileId: string, options: { guardians?: boolean } = {}): Promise<void> {
  const room = orgMembersRoom(orgId);

  if (options.guardians !== false) {
    broadcast(room, 'PROFILE_GUARDIANS_UPDATED', {
      playerProfileId,
      guardians: await guardianManager.getGuardiansForPlayer(playerProfileId),
    });
  }

  const members = await userManager.getOrganizationMembers(orgId);
  for (const member of members.filter(m => m.id === playerProfileId)) {
    broadcast(room, 'ORG_MEMBER_UPDATED', member);
  }

  const teams = await userManager.getUserTeamMembershipsForProfile(playerProfileId);
  for (const teamId of new Set(teams.map(t => t.teamId))) {
    broadcast(teamMembersRoom(teamId), 'TEAM_MEMBERS_SYNC', await teamManager.getTeamMembers(teamId));
  }

  for (const userId of await guardianManager.getAffectedUserIds(playerProfileId)) {
    await publishUserMemberships(userId);
  }
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
