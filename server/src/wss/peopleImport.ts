import { dataManager } from '../DataManager';
import { guardianManager } from '../managers/GuardianManager';
import { notificationManager } from '../managers/NotificationManager';
import { organizationManager } from '../managers/OrganizationManager';
import { PeopleImportEffects, peopleImportManager } from '../managers/PeopleImportManager';
import { teamManager } from '../managers/TeamManager';
import { userManager } from '../managers/UserManager';
import { broadcast } from './broadcast';
import { publishGuardianList } from './guardians';
import { publishUserMemberships } from './memberships';
import { orgMembersRoom, teamMembersRoom, userNotificationsRoom } from './rooms';

/**
 * Publishing an import of people (`IMPORT_ORG_PEOPLE`), once it is committed.
 *
 * **Once, whole, per audience** — the batch rule (`wss/batch.ts`, rule 3). Two thousand
 * `ORG_MEMBER_UPDATED`s would move to every open People screen exactly the cost the batch saves on
 * the server, so the members room gets the list itself, as it does when it is joined:
 *  - **the org's People screens**: `ORG_MEMBERS_SYNC`, the whole list;
 *  - **guardian lists**: every player given a guardian, and every player whose guardian's details
 *    changed, on `org:{id}:guardians`;
 *  - **rosters** showing a person whose details changed or who gained a guardian;
 *  - **accounts**: everyone whose access changed — a new membership or role, a changed email, a new
 *    guardian link on either side — through `USER_MEMBERSHIPS_UPDATED`, and a notification for
 *    each account added to the organisation, the same one `ADD_ORG_MEMBER` sends.
 *
 * **Never throws.** The import is already committed when this runs; a failure here must not tell the
 * admin it was not, which would invite a retry that adds everyone without an ID or email twice.
 */
export async function publishPeopleImport(effects: PeopleImportEffects): Promise<void> {
  const { orgId } = effects;
  try {
    broadcast(orgMembersRoom(orgId), 'ORG_MEMBERS_SYNC', await userManager.getOrganizationMembers(orgId));

    const accessChanged = [
      ...effects.newMemberships.map(m => m.profileId),
      ...effects.roleChangedProfileIds,
      ...effects.updatedProfileIds,
    ];
    const targets = await peopleImportManager.publishTargets([
      ...new Set([...accessChanged, ...effects.playersWithNewGuardians]),
    ]);

    for (const playerId of new Set([...effects.playersWithNewGuardians, ...targets.guardianListPlayerIds])) {
      await publishGuardianList(orgId, playerId);
    }
    for (const teamId of targets.teamIds) {
      broadcast(teamMembersRoom(teamId), 'TEAM_MEMBERS_SYNC', await teamManager.getTeamMembers(teamId));
    }

    const userIds = new Set(targets.accounts.map(a => a.userId));
    for (const playerId of effects.playersWithNewGuardians) {
      for (const userId of await guardianManager.getAffectedUserIds(playerId)) userIds.add(userId);
    }
    for (const userId of userIds) await publishUserMemberships(userId);

    const org = await dataManager.getOrganization(orgId);
    if (!org) return;
    for (const membership of effects.newMemberships) {
      const role = organizationManager.getOrganizationRole(membership.roleId);
      for (const account of targets.accounts.filter(a => a.profileId === membership.profileId)) {
        const notification = await notificationManager.createNotification(
          account.userId,
          'New Organization Added',
          `You have been added to ${org.name} as a ${role?.name || 'Member'}.`,
          'org_added',
          `/admin/organizations/${org.id}`
        );
        if (notification) broadcast(userNotificationsRoom(account.userId), 'NOTIFICATION_ADDED', notification);
      }
    }
  } catch (err) {
    console.error(`[PeopleImport] The import into ${orgId} was saved, but publishing it failed:`, err);
  }
}
