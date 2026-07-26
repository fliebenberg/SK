import { Game, Event, OrgMembership, TeamMembership } from '@sk/types';
import { User } from '../store/authStore';

export interface MatchPermissions {
  canView: boolean;
  canEdit: boolean;
  canScore: boolean;
}

export function getMatchPermissions(params: {
  game: Game | null;
  event: Event | null;
  currentOrgId?: string;
  user: User | null;
  orgMemberships: OrgMembership[];
  teamMemberships: TeamMembership[];
}): MatchPermissions {
  const { game, event, currentOrgId, user, orgMemberships, teamMemberships } = params;

  // View is accessible to everyone
  const canView = true;

  if (user?.globalRole === 'admin') {
    return { canView, canEdit: true, canScore: true };
  }

  // Check if event owner / org admin
  const isEventOwner = !!(
    (event && currentOrgId && event.orgId === currentOrgId) ||
    (event && orgMemberships?.some(m => m.orgId === event.orgId && (m.roleId === 'role-org-admin' || m.roleId === 'role-org-staff')))
  );

  const canEdit = isEventOwner;

  let canScore = isEventOwner;

  if (!canScore && game) {
    const homeTeamId = game.participants?.[0]?.teamId;
    const awayTeamId = game.participants?.[1]?.teamId;

    const isCoachOfHome = !!(homeTeamId && teamMemberships?.some(m => m.teamId === homeTeamId && (m.roleId === 'role-coach' || m.roleId === 'role-assistant-coach')));
    const isCoachOfAway = !!(awayTeamId && teamMemberships?.some(m => m.teamId === awayTeamId && (m.roleId === 'role-coach' || m.roleId === 'role-assistant-coach')));

    if (isCoachOfHome || isCoachOfAway) {
      canScore = true;
    } else {
      const homeOrgId = (game.participants?.[0] as any)?.orgId || game.participants?.[0]?.orgProfileId;
      const awayOrgId = (game.participants?.[1] as any)?.orgId || game.participants?.[1]?.orgProfileId;

      const isAdminOfHomeOrg = !!(homeOrgId && orgMemberships?.some(m => m.orgId === homeOrgId && (m.roleId === 'role-org-admin' || m.roleId === 'role-org-staff')));
      const isAdminOfAwayOrg = !!(awayOrgId && orgMemberships?.some(m => m.orgId === awayOrgId && (m.roleId === 'role-org-admin' || m.roleId === 'role-org-staff')));

      if (isAdminOfHomeOrg || isAdminOfAwayOrg) {
        canScore = true;
      }
    }
  }

  return {
    canView,
    canEdit,
    canScore
  };
}
