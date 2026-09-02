import { BaseManager } from "./BaseManager";

export class AccessManager extends BaseManager {
  async isAppAdmin(userId: string): Promise<boolean> {
    const res = await this.query(`
      SELECT 1 FROM org_memberships om
      JOIN org_profiles op ON om.org_profile_id = op.id
      WHERE op.user_id = $1 AND om.org_id = 'org-system-admins' AND (om.end_date IS NULL OR om.end_date > NOW())
    `, [userId]);
    return res.rows.length > 0;
  }

  async getOrganizationRole(userId: string, orgId: string): Promise<string | null> {
    const res = await this.query(`
      SELECT role_id 
      FROM org_memberships om
      WHERE org_profile_id IN (
        SELECT id FROM org_profiles WHERE user_id = $1 OR email IN (
          SELECT email FROM user_emails WHERE user_id = $1 AND verified_at IS NOT NULL
          UNION
          SELECT email FROM users WHERE id = $1
        )
      ) AND org_id = $2 AND (om.end_date IS NULL OR om.end_date > NOW())
      ORDER BY CASE WHEN role_id = 'role-org-admin' THEN 0 ELSE 1 END
      LIMIT 1
    `, [userId, orgId]);
    
    return res.rows[0]?.role_id || null;
  }

  async isOrganizationAdmin(userId: string, orgId: string): Promise<boolean> {
    if (await this.isAppAdmin(userId)) return true;
    
    const roleId = await this.getOrganizationRole(userId, orgId);
    return roleId === 'role-org-admin';
  }

  /**
   * Any current membership of the org, of any role. This is the read gate for
   * rooms carrying an org's personal data (member lists, rosters) — distinct
   * from `isOrganizationAdmin`, which gates writes.
   */
  async isOrgMember(userId: string, orgId: string): Promise<boolean> {
    if (await this.isAppAdmin(userId)) return true;
    return (await this.getOrganizationRole(userId, orgId)) !== null;
  }

  /**
   * Every org this user currently belongs to, in one query.
   *
   * Answering "is this user in org X" one org at a time costs two queries each
   * (`isAppAdmin` plus `getOrganizationRole`), which a socket joining several
   * rooms pays over and over. This resolves the whole identity once, so the
   * per-room checks become in-memory set lookups.
   *
   * The two matching rules the app already uses are deliberately different and
   * both are reproduced here rather than unified:
   *  - membership of an org matches a profile by `user_id` OR by a verified
   *    email, exactly as `getOrganizationRole` does;
   *  - app-admin matches by `user_id` only, exactly as `isAppAdmin` does, so an
   *    unclaimed profile carrying an admin's email never confers it.
   */
  async getMembershipSnapshot(userId: string): Promise<{ orgIds: Set<string>; isAppAdmin: boolean }> {
    const res = await this.query(`
      SELECT DISTINCT om.org_id as "orgId", (op.user_id = $1) as "byUserId"
      FROM org_memberships om
      JOIN org_profiles op ON om.org_profile_id = op.id
      WHERE (
        op.user_id = $1
        OR op.email IN (
          SELECT email FROM user_emails WHERE user_id = $1 AND verified_at IS NOT NULL
          UNION
          SELECT email FROM users WHERE id = $1
        )
      ) AND (om.end_date IS NULL OR om.end_date > NOW())
    `, [userId]);

    const orgIds = new Set<string>();
    let isAppAdmin = false;
    for (const row of res.rows) {
      orgIds.add(row.orgId);
      if (row.orgId === 'org-system-admins' && row.byUserId) isAppAdmin = true;
    }
    return { orgIds, isAppAdmin };
  }


  /**
   * Every org with a stake in a game: the org hosting the event, the orgs
   * registered on it, and the orgs owning the participating teams. The third
   * source is why this is not simply `getGameOrgId` — a team's org can be
   * playing without the event ever recording it (see `FIX-5`).
   */
  async getGameOrgIds(gameId: string): Promise<string[]> {
    const res = await this.query(`
      SELECT e.org_id AS "orgId" FROM games g JOIN events e ON g.event_id = e.id WHERE g.id = $1
      UNION
      SELECT eo.org_id FROM games g JOIN event_organizations eo ON eo.event_id = g.event_id WHERE g.id = $1
      UNION
      SELECT t.org_id FROM game_participants gp JOIN teams t ON t.id = gp.team_id WHERE gp.game_id = $1
    `, [gameId]);
    return res.rows.map((r: any) => r.orgId).filter(Boolean);
  }

  /**
   * Orgs with a stake in a division: the hosting org, every org registered on the event, and
   * every org whose team is entered in the division.
   *
   * The third source is there for the same reason it is on `getGameOrgIds` — a school's teams can
   * be entered in a division that never made it into `event_organizations` (`FIX-5`), and its
   * staff must still be able to read the roster their own teams are in.
   */
  async getDivisionOrgIds(divisionId: string): Promise<string[]> {
    const res = await this.query(`
      SELECT e.org_id AS "orgId"
        FROM tournament_divisions d JOIN events e ON e.id = d.event_id
       WHERE d.id = $1
      UNION
      SELECT eo.org_id
        FROM tournament_divisions d JOIN event_organizations eo ON eo.event_id = d.event_id
       WHERE d.id = $1
      UNION
      SELECT de.org_id FROM division_entrants de WHERE de.division_id = $1
    `, [divisionId]);
    return res.rows.map((r: any) => r.orgId).filter(Boolean);
  }

  /** True when the user belongs to any org with a stake in the game. */
  async canViewGameInternals(userId: string, gameId: string): Promise<boolean> {
    if (await this.isAppAdmin(userId)) return true;
    const orgIds = await this.getGameOrgIds(gameId);
    for (const orgId of orgIds) {
      if ((await this.getOrganizationRole(userId, orgId)) !== null) return true;
    }
    return false;
  }

  /**
   * True when the team is one of the two sides in the game.
   *
   * Used to widen a roster read from "a member of the team's org" to "a member of any
   * org with a stake in the game" — the scoring screen legitimately needs both sides'
   * player lists, and the scorer belongs to only one of them. The check is what keeps
   * that from becoming "name any game and read any team": the caller's game must
   * actually be the one the team is playing in.
   */
  async gameHasTeam(gameId: string, teamId: string): Promise<boolean> {
    if (!gameId || !teamId) return false;
    const res = await this.query(
      'SELECT 1 FROM game_participants WHERE game_id = $1 AND team_id = $2 LIMIT 1',
      [gameId, teamId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Organization owning a team, or null if the team does not exist. */
  async getTeamOrgId(teamId: string): Promise<string | null> {
    const res = await this.query('SELECT org_id FROM teams WHERE id = $1', [teamId]);
    return res.rows[0]?.org_id || null;
  }

  async canManageTeam(userId: string, teamId: string): Promise<boolean> {
    if (await this.isAppAdmin(userId)) return true;
    
    // Check if they are admin of the organization that owns the team
    const res = await this.query(`
      SELECT org_id FROM teams WHERE id = $1
    `, [teamId]);
    if (res.rows[0]) {
      return this.isOrganizationAdmin(userId, res.rows[0].org_id);
    }
    return false;
  }

  /**
   * Event and match details may be edited by an admin or staff member of the
   * organization the event belongs to — the org it was created under. A
   * participating (guest) org's staff can see the event but not edit it.
   *
   * `requestingOrgId` is the workspace the caller is acting from; it must match
   * the event's owning org, so acting from another org's workspace never grants
   * edit rights (this is what constrains app admins too).
   */
  async canEditEventOrGame(userId: string, requestingOrgId: string, eventId?: string, gameId?: string): Promise<boolean> {
    let eventOrgId: string | null = null;
    if (eventId) {
      const res = await this.query('SELECT org_id FROM events WHERE id = $1', [eventId]);
      if (res.rows[0]) eventOrgId = res.rows[0].org_id;
    } else if (gameId) {
      eventOrgId = await this.getGameOrgId(gameId);
    }

    if (!eventOrgId) return false;
    if (requestingOrgId !== eventOrgId) return false;

    if (await this.isAppAdmin(userId)) return true;

    const role = await this.getOrganizationRole(userId, eventOrgId);
    return role === 'role-org-admin' || role === 'role-org-staff';
  }

  /**
   * True when `orgProfileId` is one of the profiles this user legitimately acts
   * through. Deliberately mirrors the matching rule in
   * `UserManager.getUserOrgMemberships`, so the server accepts exactly the
   * profile ids it hands out to that user and nothing else.
   */
  async ownsOrgProfile(userId: string, orgProfileId: string): Promise<boolean> {
    const res = await this.query(`
      SELECT 1 FROM org_profiles
      WHERE id = $2 AND (
        user_id = $1
        OR email IN (
          SELECT email FROM user_emails WHERE user_id = $1 AND verified_at IS NOT NULL
          UNION
          SELECT email FROM users WHERE id = $1
        )
      )
    `, [userId, orgProfileId]);
    return res.rows.length > 0;
  }

  /** Organization that owns the event a game belongs to. */
  async getGameOrgId(gameId: string): Promise<string | null> {
    const res = await this.query(`
      SELECT e.org_id FROM games g
      JOIN events e ON g.event_id = e.id
      WHERE g.id = $1
    `, [gameId]);
    return res.rows[0]?.org_id || null;
  }

  async canScoreGame(userId: string, gameId: string): Promise<boolean> {
    if (await this.isAppAdmin(userId)) return true;

    // 1. Get event details
    const gameRes = await this.query('SELECT event_id FROM games WHERE id = $1', [gameId]);
    if (!gameRes.rows[0]) return false;
    const eventId = gameRes.rows[0].event_id;

    const eventRes = await this.query('SELECT org_id FROM events WHERE id = $1', [eventId]);
    if (eventRes.rows[0]) {
      const eventOrgId = eventRes.rows[0].org_id;
      // Admin *and* staff of the hosting org may score, matching the client's
      // permission model (utils/matchPermissions.ts) and the staff allowance
      // already granted below for participating teams' organizations.
      const eventOrgRole = await this.getOrganizationRole(userId, eventOrgId);
      if (eventOrgRole === 'role-org-admin' || eventOrgRole === 'role-org-staff') return true;
    }

    // 2. Check if official SCORER for the game
    const scorerRes = await this.query(`
      SELECT 1 FROM game_officials
      WHERE game_id = $1 AND role = 'SCORER' AND org_profile_id IN (
        SELECT id FROM org_profiles WHERE user_id = $2
      )
    `, [gameId, userId]);
    if (scorerRes.rows[0]) return true;

    // 3. Check if coach of any participating team or admin/staff of that team's organization
    const participantsRes = await this.query(`
      SELECT team_id FROM game_participants WHERE game_id = $1 AND team_id IS NOT NULL
    `, [gameId]);

    for (const row of participantsRes.rows) {
      const teamId = row.team_id;
      const coachRes = await this.query(`
        SELECT 1 FROM team_memberships
        WHERE team_id = $1 AND role_id IN ('role-coach', 'role-assistant-coach') AND org_profile_id IN (
          SELECT id FROM org_profiles WHERE user_id = $2
        ) AND (end_date IS NULL OR end_date > NOW())
      `, [teamId, userId]);
      if (coachRes.rows[0]) return true;

      const teamOrgRes = await this.query('SELECT org_id FROM teams WHERE id = $1', [teamId]);
      if (teamOrgRes.rows[0]) {
        const teamOrgId = teamOrgRes.rows[0].org_id;
        const isTeamOrgAdmin = await this.getOrganizationRole(userId, teamOrgId);
        if (isTeamOrgAdmin === 'role-org-admin' || isTeamOrgAdmin === 'role-org-staff') return true;
      }
    }

    return false;
  }
}

export const accessManager = new AccessManager();
