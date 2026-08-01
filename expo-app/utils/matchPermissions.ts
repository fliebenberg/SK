import { Game, Event, OrgMembership, TeamMembership } from '@sk/types';
import { User } from '../store/authStore';

export interface MatchPermissions {
  canView: boolean;
  canEdit: boolean;
  canScore: boolean;
  canSelectLineup: boolean;
  canEditTeam1Lineup: boolean;
  canEditTeam2Lineup: boolean;
}

export function getMatchPermissions(params: {
  game: Game | null;
  event: Event | null;
  currentOrgId?: string;
  user: User | null;
  orgMemberships: OrgMembership[];
  teamMemberships: TeamMembership[];
  teamsMap?: Record<string, any>;
}): MatchPermissions {
  const { game, event, currentOrgId, user, orgMemberships, teamMemberships, teamsMap } = params;

  // View is accessible to everyone
  const canView = true;

  if (user?.globalRole === 'admin') {
    return {
      canView,
      canEdit: true,
      canScore: true,
      canSelectLineup: true,
      canEditTeam1Lineup: true,
      canEditTeam2Lineup: true,
    };
  }

  // Check if user is an Org Admin / Staff of the current active org or event host org
  const isAdminOfCurrentOrg = !!(
    currentOrgId &&
    orgMemberships?.some(
      (m) =>
        m.orgId === currentOrgId &&
        (m.roleId === 'role-org-admin' || m.roleId === 'role-org-staff')
    )
  );

  const isAdminOfEventOrg = !!(
    event?.orgId &&
    orgMemberships?.some(
      (m) =>
        m.orgId === event.orgId &&
        (m.roleId === 'role-org-admin' || m.roleId === 'role-org-staff')
    )
  );

  const isEventOwner = isAdminOfCurrentOrg || isAdminOfEventOrg;

  const canEdit = isEventOwner;
  let canScore = isEventOwner;

  let canEditTeam1Lineup = isEventOwner;
  let canEditTeam2Lineup = isEventOwner;

  if (game) {
    const homeTeamId = game.participants?.[0]?.teamId;
    const awayTeamId = game.participants?.[1]?.teamId;

    const isCoachOfHome = !!(
      homeTeamId &&
      teamMemberships?.some(
        (m) =>
          m.teamId === homeTeamId &&
          (m.roleId === 'role-coach' || m.roleId === 'role-assistant-coach')
      )
    );
    const isCoachOfAway = !!(
      awayTeamId &&
      teamMemberships?.some(
        (m) =>
          m.teamId === awayTeamId &&
          (m.roleId === 'role-coach' || m.roleId === 'role-assistant-coach')
      )
    );

    const homeOrgId =
      (game.participants?.[0] as any)?.orgId ||
      (homeTeamId ? teamsMap?.[homeTeamId]?.orgId : undefined);
    const awayOrgId =
      (game.participants?.[1] as any)?.orgId ||
      (awayTeamId ? teamsMap?.[awayTeamId]?.orgId : undefined);

    const isAdminOfHomeOrg = !!(
      homeOrgId &&
      orgMemberships?.some(
        (m) =>
          m.orgId === homeOrgId &&
          (m.roleId === 'role-org-admin' || m.roleId === 'role-org-staff')
      )
    );
    const isAdminOfAwayOrg = !!(
      awayOrgId &&
      orgMemberships?.some(
        (m) =>
          m.orgId === awayOrgId &&
          (m.roleId === 'role-org-admin' || m.roleId === 'role-org-staff')
      )
    );

    if (isCoachOfHome || isAdminOfHomeOrg) {
      canEditTeam1Lineup = true;
      canScore = true;
    }
    if (isCoachOfAway || isAdminOfAwayOrg) {
      canEditTeam2Lineup = true;
      canScore = true;
    }
  }

  const canSelectLineup = canEditTeam1Lineup || canEditTeam2Lineup;

  return {
    canView,
    canEdit,
    canScore,
    canSelectLineup,
    canEditTeam1Lineup,
    canEditTeam2Lineup,
  };
}
