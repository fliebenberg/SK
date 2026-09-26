import { userManager } from '../managers/UserManager';
import { guardianManager } from '../managers/GuardianManager';
import { broadcast } from './broadcast';
import { userMembershipsRoom } from './rooms';

/**
 * Publishing a change to what a user belongs to.
 *
 * `USER_MEMBERSHIPS_UPDATED` used to be broadcast with `data: {}` from six different call sites,
 * and the client answered it with a `get_data user_memberships` — the notify-then-refetch pattern
 * live-data rule 1 exists to remove, and the only message in the system that could not be merged
 * into client state at all (`LIVE-15`). A message carrying no data can be neither replayed to a
 * late subscriber nor collapsed into a stored snapshot; it can only trigger another round trip.
 *
 * So it carries the memberships. The shape is deliberately the same `{ orgs, teams }` the
 * `user_memberships` query returns, because `authStore.setMemberships(orgs, teams)` is the one
 * consumer and it should not care which path the data arrived by.
 *
 * **`broadcast()` keys room revalidation off this type** — it drops the user's cached identity and
 * re-applies `canJoinRoom` to the rooms their sockets already hold, so a withdrawn membership stops
 * delivering at once rather than at the next reconnect. That behaviour belongs to the type name and
 * the `user:` topic, both of which are unchanged here; any future replacement has to keep them or a
 * revoked member keeps reading.
 */
export async function publishUserMemberships(userId?: string | null): Promise<void> {
  if (!userId) return;
  broadcast(userMembershipsRoom(userId), 'USER_MEMBERSHIPS_UPDATED', await getUserMemberships(userId));
}

/**
 * What a user belongs to — the payload of `USER_MEMBERSHIPS_UPDATED` and the answer to `get_data
 * user_memberships`, one shape for both.
 *
 * `dependants` (`MEMBER-3`) are the children this user is an active guardian of. They ride here
 * rather than in a room of their own because the same changes move them — a link added or ended,
 * a minor's access changed — and they are the user's own, like the rest of this message.
 */
export async function getUserMemberships(userId: string) {
  const [orgs, teams, dependants] = await Promise.all([
    userManager.getUserOrgMemberships(userId),
    userManager.getUserTeamMemberships(userId),
    guardianManager.getDependants(userId),
  ]);
  return { orgs, teams, dependants };
}
