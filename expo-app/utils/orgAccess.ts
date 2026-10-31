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
  /**
   * How much of the workspace is theirs (docs/permissions.md P1, `PERM-4`): `full` for those who run
   * the org, `team` for a team duty (coach, assistant coach, team scorer) — their teams and their
   * fixtures — and `null` for everyone else, a plain Member included.
   */
  workspace: 'full' | 'team' | null;
  /** Admin or Staff there (or a system admin): they run it, rather than only belong to it. */
  canManage: boolean;
  /** Admin there (or a system admin): the org's own record, its settings and who holds which role
   *  (docs/permissions.md §2.2). */
  isAdmin: boolean;
  /** The teams there they coach or assistant-coach: a coach's rights hold whatever their org role. */
  coachedTeamIds: string[];
  /** The teams there they hold a duty for — coach, assistant coach or scorer — which opens the workspace. */
  dutyTeamIds: string[];
}

const ROLE_LABELS: Record<string, OrgRoleLabel> = {
  'role-org-admin': 'Admin',
  'role-org-staff': 'Staff',
  'role-org-member': 'Member',
};

/** Team roles that carry a coach's rights over their team (docs/permissions.md §2.2). */
export const COACH_ROLES = ['role-coach', 'role-assistant-coach'];
/** Team roles that give their holder part of the workspace: the coaches, and the team's scorer. */
export const DUTY_ROLES = [...COACH_ROLES, 'role-scorer'];

/**
 * Do they run this org — Admin or Staff, with member privileges, today? For lists that ask it of
 * many orgs at once, such as which invitations they may answer. One org on screen: `orgAccess`.
 */
export function managesOrg(orgId: string | undefined, orgMemberships: OrgMembership[] | undefined): boolean {
  return !!orgId && (orgMemberships || []).some((m: any) =>
    m.orgId === orgId &&
    (m.roleId === 'role-org-admin' || m.roleId === 'role-org-staff') &&
    !m.restrictedReason &&
    (!m.endDate || new Date(m.endDate) > new Date())
  );
}

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
  // hold there, which the server still honours.
  const teamsWith = (roles: string[]) => orgId
    ? (teamMemberships || [])
      .filter((t: any) => t.orgId === orgId && roles.includes(t.roleId) && (!t.endDate || new Date(t.endDate) > new Date()))
      .map(t => t.teamId)
    : [];
  const coachedTeamIds = teamsWith(COACH_ROLES);
  const dutyTeamIds = teamsWith(DUTY_ROLES);
  const isRestricted = !!membership?.restrictedReason && dutyTeamIds.length === 0;
  const memberRole = membership ? ROLE_LABELS[membership.roleId] ?? null : null;
  const role = memberRole ?? (isGlobalAdmin ? 'Admin' : null);
  // Org-wide rights need a membership that carries member privileges. A team duty lets a restricted
  // minor into the workspace for their team; it never makes their org role count.
  const privileged = !!membership && !membership.restrictedReason;

  const canManage = isGlobalAdmin || (privileged && (memberRole === 'Admin' || memberRole === 'Staff'));
  // A plain Member runs nothing, so has no workspace (`PERM-4`); a team duty opens its part.
  const workspace = canManage ? 'full' : membership && dutyTeamIds.length ? 'team' : null;

  return {
    membership,
    role,
    isRestricted,
    canOpenWorkspace: workspace !== null,
    workspace,
    canManage,
    isAdmin: isGlobalAdmin || (privileged && memberRole === 'Admin'),
    coachedTeamIds,
    dutyTeamIds,
  };
}
