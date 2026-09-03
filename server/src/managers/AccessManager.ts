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
   * May this user write the organisation's person records — create, edit, delete, re-link?
   *
   * **Admin or staff**, which is the same pair `canEditEventOrGame` and `canScoreGame` use for
   * "manage this org's things", and the same pair the people screen has always allowed to add a
   * member. The rule as first stated was "org admins only"; it is widened by one role here rather
   * than silently, because narrowing it would take an ability staff already exercise every day —
   * and staff are insiders, not the outsiders `PEOPLE-2` is about. One line to narrow if that is
   * wanted.
   *
   * A profile is the identity the permission layer resolves users into, so this is the gate on
   * identity writes; `wss/profileGate.ts` is what enforces it, and holds the one exception.
   */
  async canManageOrgPeople(userId: string, orgId: string): Promise<boolean> {
    if (!userId || !orgId) return false;
    if (await this.isAppAdmin(userId)) return true;
    const role = await this.getOrganizationRole(userId, orgId);
    return role === 'role-org-admin' || role === 'role-org-staff';
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
    let targetEventId: string | null = eventId || null;
    if (eventId) {
      const res = await this.query('SELECT org_id FROM events WHERE id = $1', [eventId]);
      if (res.rows[0]) eventOrgId = res.rows[0].org_id;
    } else if (gameId) {
      const res = await this.query(
        'SELECT e.id, e.org_id FROM games g JOIN events e ON g.event_id = e.id WHERE g.id = $1',
        [gameId]
      );
      if (res.rows[0]) {
        eventOrgId = res.rows[0].org_id;
        targetEventId = res.rows[0].id;
      }
    }

    if (!eventOrgId) return false;

    // An appointed organiser is checked *before* the workspace constraint, and deliberately
    // outside it (D33). The constraint exists to stop membership-derived rights leaking across
    // workspaces — acting from org A must not let you edit org B's event. A grant is not derived
    // from a membership at all: it names one event, and the appointee may hold no membership
    // anywhere, so there is no workspace for them to act from and requiring one would make an
    // external convenor permanently unable to do the job they were appointed to.
    if (targetEventId && (await this.getEventGrants(userId, targetEventId)).isEventOrganizer) return true;

    if (requestingOrgId !== eventOrgId) return false;

    if (await this.isAppAdmin(userId)) return true;

    const role = await this.getOrganizationRole(userId, eventOrgId);
    return role === 'role-org-admin' || role === 'role-org-staff';
  }

  // --- Tournament organiser grants (D33) ---------------------------------------------------
  //
  // A fourth source of authority, beside membership role, app-admin and the public tiers: a
  // person named on one event or one division. Three properties shape every query below.
  //
  //  - **Grants are keyed on the profile, not the user account.** `AccessManager` already turns a
  //    user into a set of profile ids, matching by `user_id` or verified email, so the check is
  //    "is any of my profile ids granted this?" over machinery that exists — not a second identity
  //    lookup. It is also what lets a convenor be appointed before they have an account: when they
  //    later claim it, the email match picks the grant up with no row being touched.
  //  - **A grant is not a membership.** It confers exactly the tournament rights and nothing else,
  //    which is what makes an external specialist — a profile in the hosting org with no
  //    `org_memberships` row — safe to appoint.
  //  - **The write path never caches.** These run on every mutation, deliberately (`LIVE-1`).
  //    `getGrantSnapshot` is the read-path counterpart and is the only one that may be cached.

  /**
   * The profiles a user acts through. Identical to the matching rule in `getOrganizationRole` and
   * `ownsOrgProfile`, written once here because four grant queries need it.
   *
   * `$1` is the user id in every query that embeds it.
   */
  private readonly PROFILE_IDS_FOR_USER = `
    SELECT id FROM org_profiles WHERE user_id = $1 OR email IN (
      SELECT email FROM user_emails WHERE user_id = $1 AND verified_at IS NOT NULL
      UNION
      SELECT email FROM users WHERE id = $1
    )
  `;

  /**
   * Both scopes of grant this user holds on one event, in one query.
   *
   * `convenesDivisionIds` is populated even for someone who is *also* an event organiser. Their
   * rights are unchanged by it — an event organiser's scope strictly contains a convenor's — but
   * the division rows carry intent ("this person is the netball convenor"), which is what the role
   * chips print. Authorization asks `isEventOrganizer`; display asks both.
   */
  async getEventGrants(
    userId: string,
    eventId: string
  ): Promise<{ isEventOrganizer: boolean; convenesDivisionIds: string[] }> {
    if (!userId || !eventId) return { isEventOrganizer: false, convenesDivisionIds: [] };

    const res = await this.query(`
      SELECT 'event' AS scope, eo.event_id AS id
        FROM event_organizers eo
       WHERE eo.event_id = $2 AND eo.org_profile_id IN (${this.PROFILE_IDS_FOR_USER})
      UNION ALL
      SELECT 'division' AS scope, dorg.division_id AS id
        FROM division_organizers dorg
        JOIN tournament_divisions d ON d.id = dorg.division_id
       WHERE d.event_id = $2 AND dorg.org_profile_id IN (${this.PROFILE_IDS_FOR_USER})
    `, [userId, eventId]);

    return {
      isEventOrganizer: res.rows.some((r: any) => r.scope === 'event'),
      convenesDivisionIds: res.rows.filter((r: any) => r.scope === 'division').map((r: any) => r.id),
    };
  }

  /**
   * True when this user may organise `eventId` — asked without a workspace.
   *
   * `canEditEventOrGame` takes the org the caller is acting from, because a membership-derived
   * right is scoped to its workspace. Several callers have no workspace to offer: a read gate, a
   * capability flag, an appointment made from a personal view. They ask this instead, which
   * supplies the event's own org and so answers "may this person edit this event at all" —
   * still the same function underneath, not a second rulebook.
   */
  async canOrganizeEvent(userId: string, eventId: string): Promise<boolean> {
    if (!userId || !eventId) return false;
    const res = await this.query('SELECT org_id FROM events WHERE id = $1', [eventId]);
    const orgId = res.rows[0]?.org_id;
    if (!orgId) return false;
    return this.canEditEventOrGame(userId, orgId, eventId);
  }

  /**
   * True when this user may organise the whole of `divisionId`.
   *
   * Widened on 2026-09-03 from D31's "fixtures and results only": a convenor runs their division
   * end to end — entrants, stages, fixtures, results and adjustments — so that an event organiser
   * can hand a division over and stop thinking about it. What the grant does *not* carry is
   * anything above the division (the event's own settings, its other divisions) or the power to
   * appoint further organisers, which stays with the people who can withdraw them.
   */
  async canOrganizeDivision(userId: string, divisionId: string): Promise<boolean> {
    if (!userId || !divisionId) return false;

    const eventId = await this.getDivisionEventId(divisionId);
    if (!eventId) return false;

    // Anyone who may edit the event may edit anything in it — checked first because it is the
    // ordinary case, and because an event organiser holds no division row to find.
    if (await this.canOrganizeEvent(userId, eventId)) return true;

    return this.hasDivisionGrant(userId, divisionId);
  }

  /** Is this user named on this division? The narrow question, without the event-wide checks. */
  async hasDivisionGrant(userId: string, divisionId: string): Promise<boolean> {
    if (!userId || !divisionId) return false;
    const res = await this.query(
      `SELECT 1 FROM division_organizers
        WHERE division_id = $2 AND org_profile_id IN (${this.PROFILE_IDS_FOR_USER}) LIMIT 1`,
      [userId, divisionId]
    );
    return res.rows.length > 0;
  }

  /**
   * Every grant this user holds, anywhere — the read-path counterpart to `getEventGrants`.
   *
   * Resolved once per user and cached beside the membership snapshot in `roomAccess`, for the same
   * reason: a screen joins several rooms at once and resolving the identity per room means a query
   * per room. **Read path only.** Writes call `getEventGrants` / `canOrganizeDivision`, which
   * query every time, so no cached grant can authorize a mutation.
   */
  async getGrantSnapshot(userId: string): Promise<{ eventIds: Set<string>; divisionIds: Set<string> }> {
    const res = await this.query(`
      SELECT 'event' AS scope, eo.event_id AS id
        FROM event_organizers eo
       WHERE eo.org_profile_id IN (${this.PROFILE_IDS_FOR_USER})
      UNION ALL
      SELECT 'division' AS scope, dorg.division_id AS id
        FROM division_organizers dorg
       WHERE dorg.org_profile_id IN (${this.PROFILE_IDS_FOR_USER})
    `, [userId]);

    const eventIds = new Set<string>();
    const divisionIds = new Set<string>();
    for (const row of res.rows) {
      (row.scope === 'event' ? eventIds : divisionIds).add(row.id);
    }
    return { eventIds, divisionIds };
  }

  /**
   * Every grant this user holds, shaped for a *list* of events rather than one of them.
   *
   * `getEventCapabilities` answers the authoritative question for one event, and the event screen
   * asks it. A fixtures list cannot: role chips on thirty cards would be thirty round trips, which
   * is exactly the "notify, then everybody refetches" cost the live-data design exists to remove —
   * relocated to a screen load.
   *
   * So the list gets the one thing it genuinely cannot derive. UI doc §4 is explicit that hosting
   * and attending *are* client-derivable — the client already holds the user's memberships, each
   * event's own org and its participating orgs — and that convening is not, because division
   * grants appear on no payload the client holds. This is that gap and nothing else: one query, no
   * per-event cost, and no permission decision, since every write is gated server-side regardless
   * of what a chip says.
   *
   * Division grants carry their event id because that is the join the client would otherwise have
   * to make by fetching every event's divisions.
   */
  async getMyGrants(userId: string): Promise<{
    eventIds: string[];
    divisions: Array<{ divisionId: string; eventId: string }>;
  }> {
    if (!userId) return { eventIds: [], divisions: [] };

    const [events, divisions] = await Promise.all([
      this.query(
        `SELECT event_id AS "eventId"
           FROM event_organizers
          WHERE org_profile_id IN (${this.PROFILE_IDS_FOR_USER})`,
        [userId]
      ),
      this.query(
        `SELECT dorg.division_id AS "divisionId", d.event_id AS "eventId"
           FROM division_organizers dorg
           JOIN tournament_divisions d ON d.id = dorg.division_id
          WHERE dorg.org_profile_id IN (${this.PROFILE_IDS_FOR_USER})`,
        [userId]
      ),
    ]);

    return {
      eventIds: events.rows.map((r: any) => r.eventId),
      divisions: divisions.rows.map((r: any) => ({ divisionId: r.divisionId, eventId: r.eventId })),
    };
  }

  /**
   * What *this user* may do in *this tournament* (UI doc §4).
   *
   * Computed from the user and the event, never from the `orgId` in the route: `canEditEvent` is
   * `canEditEventOrGame` asked with the event's own org, so the flag the client renders and the
   * gate the server enforces are the same function rather than two implementations free to drift.
   */
  async getEventCapabilities(userId: string, eventId: string): Promise<{
    eventId: string;
    canEditEvent: boolean;
    convenesDivisionIds: string[];
  }> {
    const empty = { eventId, canEditEvent: false, convenesDivisionIds: [] as string[] };
    if (!userId || !eventId) return empty;

    const [canEditEvent, grants] = await Promise.all([
      this.canOrganizeEvent(userId, eventId),
      this.getEventGrants(userId, eventId),
    ]);
    return { eventId, canEditEvent, convenesDivisionIds: grants.convenesDivisionIds };
  }

  /**
   * The orgs with a stake in an event: the host, and every org registered on it.
   *
   * Deliberately *not* the third source `getGameOrgIds` and `getDivisionOrgIds` use — the orgs
   * whose teams are playing. Those exist to widen a *read* for staff whose team is involved. This
   * one scopes the organiser picker's first tier, where the question is "whose people would you
   * plausibly appoint", and the answer is the organisations running the day.
   */
  async getEventOrgIds(eventId: string): Promise<string[]> {
    const res = await this.query(`
      SELECT org_id AS "orgId" FROM events WHERE id = $1
      UNION
      SELECT org_id FROM event_organizations WHERE event_id = $1
    `, [eventId]);
    return res.rows.map((r: any) => r.orgId).filter(Boolean);
  }

  /**
   * Which profile to record as having made an appointment.
   *
   * Well defined rather than arbitrary (implementation plan §0.1): **the profile through which the
   * actor's own permission was derived** — their `event_organizers` row if they are an appointed
   * organiser, otherwise their profile in the hosting org whose admin or staff rights they used.
   *
   * Null is a legitimate answer, not a failure: an app admin acting globally may hold no profile in
   * any org involved, and the column is nullable for exactly that case. The field exists to be
   * *read* on an audit line, so it names a person as their organisation knows them rather than
   * naming a user account.
   */
  async resolveGrantingProfile(userId: string, eventId: string): Promise<string | null> {
    if (!userId || !eventId) return null;

    const granted = await this.query(
      `SELECT eo.org_profile_id AS "profileId"
         FROM event_organizers eo
        WHERE eo.event_id = $2 AND eo.org_profile_id IN (${this.PROFILE_IDS_FOR_USER})
        LIMIT 1`,
      [userId, eventId]
    );
    if (granted.rows[0]) return granted.rows[0].profileId;

    // Otherwise the profile in the hosting org their role comes from. A current membership sorts
    // first, so an old unclaimed duplicate never wins over the profile actually in use.
    const hosted = await this.query(
      `SELECT op.id AS "profileId"
         FROM org_profiles op
         JOIN events e ON e.id = $2 AND e.org_id = op.org_id
        WHERE op.id IN (${this.PROFILE_IDS_FOR_USER})
        ORDER BY EXISTS (
          SELECT 1 FROM org_memberships om
           WHERE om.org_profile_id = op.id AND (om.end_date IS NULL OR om.end_date > NOW())
        ) DESC, op.id
        LIMIT 1`,
      [userId, eventId]
    );
    return hosted.rows[0]?.profileId || null;
  }

  /**
   * The user accounts behind a profile, so a grant change can reach their sockets.
   *
   * Empty for an unclaimed profile, which is not an error: appointing someone who has no account
   * yet is a normal thing to do, and there is simply nobody to notify until they claim it.
   */
  async getUserIdsForOrgProfile(orgProfileId: string): Promise<string[]> {
    const res = await this.query(`
      SELECT DISTINCT u.id
        FROM org_profiles op
        JOIN users u ON u.id = op.user_id
             OR EXISTS (SELECT 1 FROM user_emails ue
                         WHERE ue.user_id = u.id AND ue.email = op.email
                           AND ue.verified_at IS NOT NULL)
             OR u.email = op.email
       WHERE op.id = $1
    `, [orgProfileId]);
    return res.rows.map((r: any) => r.id);
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

  /**
   * The event a division belongs to, and the event a fixture belongs to.
   *
   * Both duplicate a line of `TournamentManager` / `EventManager` on purpose: the read gate is
   * consulted on every room join, and having it reach into a feature manager for one column would
   * put an import cycle between authorization and the thing it authorizes.
   */
  async getDivisionEventId(divisionId: string): Promise<string | null> {
    if (!divisionId) return null;
    const res = await this.query('SELECT event_id FROM tournament_divisions WHERE id = $1', [divisionId]);
    return res.rows[0]?.event_id || null;
  }

  async getGameEventId(gameId: string): Promise<string | null> {
    if (!gameId) return null;
    const res = await this.query('SELECT event_id FROM games WHERE id = $1', [gameId]);
    return res.rows[0]?.event_id || null;
  }

  /**
   * The division a fixture belongs to, through the stage it was generated into.
   *
   * Null for a fixture with no stage — a single match, or a tournament fixture added outside the
   * structure — which is the right answer rather than a missing one: a convenor's grant names a
   * division, so a fixture that is in none of them is not theirs to run.
   */
  async getGameDivisionId(gameId: string): Promise<string | null> {
    if (!gameId) return null;
    const res = await this.query(
      `SELECT s.division_id AS "divisionId"
         FROM games g JOIN division_stages s ON s.id = g.stage_id
        WHERE g.id = $1`,
      [gameId]
    );
    return res.rows[0]?.divisionId || null;
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

    // Entering results is half of what a convenor was appointed to do, so the grant is checked
    // here as well as on the tournament writes. Event scope covers every fixture in the
    // tournament; division scope covers the fixtures of that division and no others.
    if ((await this.getEventGrants(userId, eventId)).isEventOrganizer) return true;
    const gameDivisionId = await this.getGameDivisionId(gameId);
    if (gameDivisionId && (await this.hasDivisionGrant(userId, gameDivisionId))) return true;

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
