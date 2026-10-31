import { useAuthStore } from '../store/authStore';

/**
 * Whether the viewer may open an organisation's pages — its profile, its tournaments, its tables.
 *
 * Always, unless the organisation is private (`ORG-14`): then only its current members and app
 * admins may. Someone who played in one of its games after leaving it can still read that game
 * (the server keeps it for them), so a page that names the organisation asks this before linking
 * to pages that would refuse them — the name stays, the link goes.
 */
export function useCanOpenOrg(orgId: string | null | undefined, isPrivate: boolean | null | undefined): boolean {
  return useAuthStore((state: any) =>
    !isPrivate ||
    !orgId ||
    state.user?.globalRole === 'admin' ||
    state.orgMemberships.some((m: any) => m.orgId === orgId)
  );
}
