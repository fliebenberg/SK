import type { OrgMembership, TeamMembership } from '@sk/shared';

export type OrgRoleLabel = 'Admin' | 'Staff' | 'Member';

export interface OrgAccess {
  /** The viewer's own membership there, if any. */
  membership?: OrgMembership;
  /** Their role there, as shown on a badge; a system admin reads as Admin everywhere. */
  role: OrgRoleLabel | null;
  /** A membership that carries no member privileges (`MEMBER-3`) and no team duty to make up for it. */
  isRestricted: boolean;
  /** The org workspace (`/admin/[orgId]`) is open to them — the rule `AuthGuard` applies. */
  canOpenWorkspace: boolean;
  /** Admin or Staff there (or a system admin): they run it, rather than only belong to it. */
  canManage: boolean;
}

const ROLE_LABELS: Record<string, OrgRoleLabel> = {
  'role-org-admin': 'Admin',
  'role-org-staff': 'Staff',
  'role-org-member': 'Member',
};

/** What the signed-in viewer is to one organisation, from their own memberships. */
export function orgAccess(
  orgId: string | undefined,
  isGlobalAdmin: boolean,
  orgMemberships: OrgMembership[] | undefined,
  teamMemberships: TeamMembership[] | undefined,
): OrgAccess {
  const membership = orgId ? (orgMemberships || []).find(m => m.orgId === orgId) : undefined;
  // A minor whose membership carries no member privileges (`MEMBER-3`) is still a member, but the
  // server refuses them everything org-wide — so the workspace is theirs only for a team duty they
  // hold there (coach or assistant coach), which the server still honours.
  const holdsTeamDuty = !!orgId && (teamMemberships || []).some(
    (t: any) => t.orgId === orgId && (t.roleId === 'role-coach' || t.roleId === 'role-assistant-coach')
  );
  const isRestricted = !!membership?.restrictedReason && !holdsTeamDuty;
  const memberRole = membership ? ROLE_LABELS[membership.roleId] ?? null : null;
  const role = memberRole ?? (isGlobalAdmin ? 'Admin' : null);

  return {
    membership,
    role,
    isRestricted,
    canOpenWorkspace: isGlobalAdmin || (!!membership && !isRestricted),
    canManage: isGlobalAdmin || (!isRestricted && (memberRole === 'Admin' || memberRole === 'Staff')),
  };
}
