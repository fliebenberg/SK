import { useAuthStore } from '../store/authStore';
import { orgAccess, OrgAccess } from '../utils/orgAccess';

/**
 * What the signed-in viewer is to one organisation — the one place a screen asks "may they manage
 * this org?", "are they its admin?" or "which of its teams do they coach?" (`PERM-1`). The rules are
 * [orgAccess](file:///c:/Fred/Coding/SK/expo-app/utils/orgAccess.ts); the server's are in
 * `AccessManager`, and docs/permissions.md is the product view of both.
 */
export function useOrgAccess(orgId: string | undefined): OrgAccess {
  const isGlobalAdmin = useAuthStore(state => state.user?.globalRole === 'admin');
  const orgMemberships = useAuthStore(state => state.orgMemberships);
  const teamMemberships = useAuthStore(state => state.teamMemberships);
  return orgAccess(orgId, isGlobalAdmin, orgMemberships, teamMemberships);
}
