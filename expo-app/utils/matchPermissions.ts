import { Event, EventCapabilities, OrgMembership, TeamMembership } from '@sk/shared';
import { User } from '../store/authStore';

/**
 * Only the participants decide a match permission, so this takes the shape
 * rather than a concrete type - a full `Game` and the `GameSummary` a fixtures
 * list holds both satisfy it.
 */
export type MatchPermissionsGame = {
  participants?: { teamId?: string; orgId?: string }[];
  /** Which division's fixture this is, where the screen knows. Null on a single match. */
  divisionId?: string;
};

export interface MatchPermissions {
  canView: boolean;
  canEdit: boolean;
  canScore: boolean;
  canSelectLineup: boolean;
  canEditTeam1Lineup: boolean;
  canEditTeam2Lineup: boolean;
}

export function getMatchPermissions(params: {
  game: MatchPermissionsGame | null;
  event: Event | null;
  currentOrgId?: string;
  user: User | null;
  orgMemberships: OrgMembership[];
  teamMemberships: TeamMembership[];
  teamsMap?: Record<string, any>;
  /**
   * What the **server** says this user may do in this tournament, from
   * `get_data { type: 'event_capabilities', eventId }`.
   *
   * Optional, because most callers are single matches where org membership is the whole answer.
   * Where it is present it can only *widen* what follows: an appointed organiser and a division
   * convenor hold rights that no org membership expresses, so without this the screen would hide
   * the edit and scoring controls from somebody the server would happily let through — the server
   * being right and the screen being wrong, which is the worse of the two failures because it is
   * invisible.
   */
  capabilities?: EventCapabilities | null;
}): MatchPermissions {
  const {
    game,
    event,
    currentOrgId,
    user,
    orgMemberships,
    teamMemberships,
    teamsMap,
    capabilities,
  } = params;

  // View is accessible to everyone
  const canView = true;

  /**
   * Tournament grants (D33), which are *not* org memberships and do not behave like them.
   *
   * Deliberately not subject to the workspace constraint below. A grant is computed from the user
   * and the event, never from the `orgId` in the route (UI doc §1) — an external convenor holds no
   * membership anywhere, so "are you standing in the event's own workspace" is a question with no
   * meaningful answer for them. Where the grant applies, this matches exactly what the server will
   * permit when the write arrives.
   */
  const organisesEvent = !!capabilities?.canEditEvent && capabilities.eventId === event?.id;
  const convenesThisDivision = !!(
    game?.divisionId &&
    capabilities?.eventId === event?.id &&
    capabilities?.convenesDivisionIds?.includes(game.divisionId)
  );
  const hasTournamentGrant = organisesEvent || convenesThisDivision;

  // Editing event/match details belongs to the organization the event was
  // created under, acting from that organization's own workspace — a
  // participating (guest) org can see the event but not edit it. Mirrors
  // AccessManager.canEditEventOrGame, which applies the workspace constraint to
  // app admins as well.
  const isEventOrgWorkspace = !!event?.orgId && (!currentOrgId || currentOrgId === event.orgId);

  if (user?.globalRole === 'admin') {
    return {
      canView,
      canEdit: isEventOrgWorkspace,
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

  const canEdit = (isEventOrgWorkspace && isAdminOfEventOrg) || hasTournamentGrant;
  let canScore = isEventOwner || hasTournamentGrant;

  let canEditTeam1Lineup = isEventOwner || hasTournamentGrant;
  let canEditTeam2Lineup = isEventOwner || hasTournamentGrant;

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

    // A summary names each participant's org directly; a raw `Game` does not,
    // so fall back to the caller's team lookup.
    const homeOrgId =
      game.participants?.[0]?.orgId ||
      (homeTeamId ? teamsMap?.[homeTeamId]?.orgId : undefined);
    const awayOrgId =
      game.participants?.[1]?.orgId ||
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
