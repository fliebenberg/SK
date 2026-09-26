import {
  GuardianRelationship,
  GUARDIAN_RELATIONSHIPS,
  OrgProfile,
  ProfileGuardian,
  RestrictedReason,
  guardianLinkProblem,
} from "@sk/shared";
import { BaseManager, Tx } from "./BaseManager";
import { accessManager } from "./AccessManager";
import { restrictedReasonSql } from "./minorAccess";

/**
 * Guardians of players (`MEMBER-3`, docs/guardians-implementation-plan.md).
 *
 * A guardian is an ordinary org profile in the player's organisation, linked by `profile_guardians`.
 * **Being a guardian is derived from an active link and is never an `org_memberships` row** — a
 * membership row is a permission, and a guardian answers for one child, not for the organisation.
 */

/** A child as their guardian sees them, pushed in `USER_MEMBERSHIPS_UPDATED.dependants`. */
export interface Dependant {
  playerProfileId: string;
  /** The guardian's own profile the link hangs off — theirs, in the child's org. */
  guardianProfileId: string;
  orgId: string;
  orgName: string;
  name: string;
  image?: string | null;
  imageConfig?: { scale: number; x: number; y: number } | null;
  relationship: GuardianRelationship;
  isPrimary: boolean;
  ownAccountAllowed: boolean | null;
  ownAccountSetAt?: string | null;
  /** `null` when the child's membership carries full privileges. */
  restrictedReason: RestrictedReason | null;
  /** Whether the child has an account of their own. */
  hasAccount: boolean;
  teams: { teamId: string; name: string; roleId: string }[];
}

const LINK_COLUMNS = `
  pg.id, pg.org_id as "orgId", pg.guardian_profile_id as "guardianProfileId",
  pg.player_profile_id as "playerProfileId", pg.relationship, pg.is_primary as "isPrimary",
  pg.start_date as "startDate", pg.end_date as "endDate", pg.created_by_profile_id as "createdByProfileId",
  g.name as "guardianName", g.email as "guardianEmail", g.cellphone as "guardianCellphone",
  g.image as "guardianImage", g.image_config as "guardianImageConfig",
  g.last_invite_sent_at as "guardianLastInviteSentAt", g.last_invite_email as "guardianLastInviteEmail",
  (
    g.user_id IS NOT NULL
    OR EXISTS (SELECT 1 FROM users u WHERE u.email = g.email)
    OR EXISTS (SELECT 1 FROM user_emails ue WHERE ue.email = g.email AND ue.verified_at IS NOT NULL)
  ) as "guardianHasAccount"
`;

const ACTIVE = `(pg.end_date IS NULL OR pg.end_date > NOW())`;

export class GuardianError extends Error {}

export class GuardianManager extends BaseManager {
  /** A player's guardians, primary first. Active only, unless `includeEnded`. */
  async getGuardiansForPlayer(playerProfileId: string, includeEnded = false, tx?: Tx): Promise<ProfileGuardian[]> {
    const run = tx ?? ((text: string, params?: any[]) => this.query(text, params));
    const res = await run(
      `SELECT ${LINK_COLUMNS}
         FROM profile_guardians pg JOIN org_profiles g ON g.id = pg.guardian_profile_id
        WHERE pg.player_profile_id = $1 ${includeEnded ? '' : `AND ${ACTIVE}`}
        ORDER BY pg.is_primary DESC, pg.start_date, pg.id`,
      [playerProfileId]
    );
    return res.rows.map(stripNulls);
  }

  /** Every active link in an organisation, for lists that show "Guardian: …" beside a player. */
  async getGuardiansForOrg(orgId: string): Promise<ProfileGuardian[]> {
    const res = await this.query(
      `SELECT ${LINK_COLUMNS}
         FROM profile_guardians pg JOIN org_profiles g ON g.id = pg.guardian_profile_id
        WHERE pg.org_id = $1 AND ${ACTIVE}
        ORDER BY pg.player_profile_id, pg.is_primary DESC, pg.start_date, pg.id`,
      [orgId]
    );
    return res.rows.map(stripNulls);
  }

  async getLink(id: string): Promise<ProfileGuardian | null> {
    const res = await this.query(
      `SELECT ${LINK_COLUMNS}
         FROM profile_guardians pg JOIN org_profiles g ON g.id = pg.guardian_profile_id
        WHERE pg.id = $1`,
      [id]
    );
    return res.rows[0] ? stripNulls(res.rows[0]) : null;
  }

  /**
   * Would giving `profileId` this email make it share an address with someone it is linked to, as
   * guardian or as child? Compared normalised, as `guardianLinkProblem` compares.
   */
  async linkedEmailClash(profileId: string, email: string): Promise<boolean> {
    const res = await this.query(
      `SELECT 1 FROM profile_guardians pg
         JOIN org_profiles other ON other.id = CASE WHEN pg.guardian_profile_id = $1 THEN pg.player_profile_id ELSE pg.guardian_profile_id END
        WHERE (pg.guardian_profile_id = $1 OR pg.player_profile_id = $1) AND ${ACTIVE}
          AND LOWER(TRIM(other.email)) = LOWER(TRIM($2))
        LIMIT 1`,
      [profileId, email]
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** The players this profile is currently a guardian of. */
  async getActiveLinksOfGuardian(guardianProfileId: string): Promise<{ orgId: string; playerProfileId: string }[]> {
    const res = await this.query(
      `SELECT pg.org_id AS "orgId", pg.player_profile_id AS "playerProfileId"
         FROM profile_guardians pg WHERE pg.guardian_profile_id = $1 AND ${ACTIVE}`,
      [guardianProfileId]
    );
    return res.rows;
  }

  async hasActiveGuardian(playerProfileId: string): Promise<boolean> {
    const res = await this.query(
      `SELECT 1 FROM profile_guardians pg WHERE pg.player_profile_id = $1 AND ${ACTIVE} LIMIT 1`,
      [playerProfileId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * The caller's own guardian profile for this player, if they are an active guardian of theirs.
   * Matched by identity (user id or verified email), like every "is this profile mine" check.
   */
  async getCallersGuardianProfileId(userId: string, playerProfileId: string): Promise<string | null> {
    const res = await this.query(
      `SELECT pg.guardian_profile_id AS id
         FROM profile_guardians pg
        WHERE pg.player_profile_id = $2 AND ${ACTIVE}
          AND pg.guardian_profile_id IN (${accessManager.PROFILE_IDS_FOR_USER})
        LIMIT 1`,
      [userId, playerProfileId]
    );
    return res.rows[0]?.id ?? null;
  }

  /** The caller's profile in an organisation, to record who made a change. Null for an app admin. */
  async getCallersProfileIdInOrg(userId: string, orgId: string): Promise<string | null> {
    const res = await this.query(
      `SELECT op.id FROM org_profiles op
        WHERE op.org_id = $2 AND op.id IN (${accessManager.PROFILE_IDS_FOR_USER})
        ORDER BY EXISTS (
          SELECT 1 FROM org_memberships om
           WHERE om.org_profile_id = op.id AND (om.end_date IS NULL OR om.end_date > NOW())
        ) DESC, op.id
        LIMIT 1`,
      [userId, orgId]
    );
    return res.rows[0]?.id ?? null;
  }

  async addGuardian(input: {
    id?: string;
    playerProfileId: string;
    guardianProfileId: string;
    relationship?: GuardianRelationship;
    isPrimary?: boolean;
    createdByProfileId?: string | null;
  }): Promise<ProfileGuardian> {
    const relationship = input.relationship ?? 'parent';
    if (!GUARDIAN_RELATIONSHIPS.includes(relationship)) {
      throw new GuardianError(`"${relationship}" is not a guardian relationship.`);
    }

    const profiles = await this.query(
      `SELECT id, org_id as "orgId", email FROM org_profiles WHERE id = ANY($1)`,
      [[input.playerProfileId, input.guardianProfileId]]
    );
    const player = profiles.rows.find((r: any) => r.id === input.playerProfileId) as Pick<OrgProfile, 'id' | 'orgId' | 'email'> | undefined;
    const guardian = profiles.rows.find((r: any) => r.id === input.guardianProfileId) as Pick<OrgProfile, 'id' | 'orgId' | 'email'> | undefined;
    if (!player) throw new GuardianError('That player does not exist.');
    if (!guardian) throw new GuardianError('That guardian does not exist.');
    const problem = guardianLinkProblem(guardian, player, player.orgId);
    if (problem) throw new GuardianError(problem);

    const id = input.id || `pg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const linkId = await this.transaction(async (tx) => {
      const existing = await tx(
        `SELECT id FROM profile_guardians pg
          WHERE pg.guardian_profile_id = $1 AND pg.player_profile_id = $2 AND ${ACTIVE}`,
        [guardian.id, player.id]
      );
      // An idempotent retry of the same add, or a genuine duplicate: either way there is already one.
      if (existing.rows[0]) {
        if (existing.rows[0].id === id) return id;
        throw new GuardianError('That person is already recorded as this player’s guardian.');
      }

      // The first guardian a player gets is their primary one unless the caller says otherwise, so a
      // player with guardians always has a default contact.
      const others = await tx(
        `SELECT 1 FROM profile_guardians pg WHERE pg.player_profile_id = $1 AND ${ACTIVE} LIMIT 1`,
        [player.id]
      );
      const isPrimary = input.isPrimary ?? (others.rowCount ?? 0) === 0;
      if (isPrimary) await demotePrimary(tx, player.id);

      await tx(
        `INSERT INTO profile_guardians
           (id, org_id, guardian_profile_id, player_profile_id, relationship, is_primary, start_date, created_by_profile_id)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
        [id, player.orgId, guardian.id, player.id, relationship, isPrimary, input.createdByProfileId ?? null]
      );
      return id;
    });
    return (await this.getLink(linkId))!;
  }

  async updateGuardian(id: string, data: { relationship?: GuardianRelationship; isPrimary?: boolean }): Promise<ProfileGuardian> {
    if (data.relationship !== undefined && !GUARDIAN_RELATIONSHIPS.includes(data.relationship)) {
      throw new GuardianError(`"${data.relationship}" is not a guardian relationship.`);
    }
    await this.transaction(async (tx) => {
      const res = await tx(`SELECT player_profile_id AS "playerProfileId" FROM profile_guardians pg WHERE pg.id = $1 AND ${ACTIVE}`, [id]);
      const link = res.rows[0];
      if (!link) throw new GuardianError('That guardian link has ended or does not exist.');

      if (data.relationship !== undefined) {
        await tx('UPDATE profile_guardians SET relationship = $1 WHERE id = $2', [data.relationship, id]);
      }
      if (data.isPrimary === true) {
        await demotePrimary(tx, link.playerProfileId);
        await tx('UPDATE profile_guardians SET is_primary = true WHERE id = $1', [id]);
      } else if (data.isPrimary === false) {
        await tx('UPDATE profile_guardians SET is_primary = false WHERE id = $1', [id]);
      }
    });
    return (await this.getLink(id))!;
  }

  /**
   * End a link. The row stays, with an `end_date`, so the history survives. Ending the primary
   * guardian hands primary to the longest-standing remaining one, so a player with guardians always
   * has a default contact.
   */
  async endGuardian(id: string): Promise<ProfileGuardian> {
    await this.transaction(async (tx) => {
      const res = await tx(
        `SELECT player_profile_id AS "playerProfileId", is_primary AS "isPrimary"
           FROM profile_guardians pg WHERE pg.id = $1 AND ${ACTIVE}`,
        [id]
      );
      const link = res.rows[0];
      if (!link) throw new GuardianError('That guardian link has already ended or does not exist.');
      await tx('UPDATE profile_guardians SET end_date = NOW(), is_primary = false WHERE id = $1', [id]);
      if (link.isPrimary) {
        await tx(
          `UPDATE profile_guardians SET is_primary = true
            WHERE id = (
              SELECT pg.id FROM profile_guardians pg
               WHERE pg.player_profile_id = $1 AND ${ACTIVE}
               ORDER BY pg.start_date, pg.id LIMIT 1
            )`,
          [link.playerProfileId]
        );
      }
    });
    return (await this.getLink(id))!;
  }

  /** Record a minor's own say. `setByProfileId` is the guardian's or admin's profile. */
  async setMinorAccountAccess(playerProfileId: string, allowed: boolean | null, setByProfileId: string | null): Promise<void> {
    const res = await this.query(
      `UPDATE org_profiles
          SET own_account_allowed = $2, own_account_set_at = NOW(), own_account_set_by = $3
        WHERE id = $1`,
      [playerProfileId, allowed, setByProfileId]
    );
    if (!res.rowCount) throw new GuardianError('That player does not exist.');
  }

  /**
   * The children this user is an active guardian of, as their guardian sees them. Matched by
   * identity, so a guardian linked by email sees their children the moment they sign up.
   */
  async getDependants(userId: string): Promise<Dependant[]> {
    const res = await this.query(
      `SELECT pg.player_profile_id AS "playerProfileId", pg.guardian_profile_id AS "guardianProfileId",
              pg.relationship, pg.is_primary AS "isPrimary",
              p.org_id AS "orgId", o.name AS "orgName", p.name, p.image, p.image_config AS "imageConfig",
              p.own_account_allowed AS "ownAccountAllowed", p.own_account_set_at AS "ownAccountSetAt",
              ${restrictedReasonSql('p', 'p.org_id')} AS "restrictedReason",
              (
                p.user_id IS NOT NULL
                OR EXISTS (SELECT 1 FROM users u WHERE u.email = p.email)
                OR EXISTS (SELECT 1 FROM user_emails ue WHERE ue.email = p.email AND ue.verified_at IS NOT NULL)
              ) AS "hasAccount",
              COALESCE((
                SELECT json_agg(json_build_object('teamId', t.id, 'name', t.name, 'roleId', tm.role_id) ORDER BY t.name)
                  FROM team_memberships tm JOIN teams t ON t.id = tm.team_id
                 WHERE tm.org_profile_id = p.id AND (tm.end_date IS NULL OR tm.end_date > NOW())
              ), '[]'::json) AS teams
         FROM profile_guardians pg
         JOIN org_profiles p ON p.id = pg.player_profile_id
         JOIN organizations o ON o.id = p.org_id
        WHERE ${ACTIVE} AND pg.guardian_profile_id IN (${accessManager.PROFILE_IDS_FOR_USER})
        ORDER BY p.name, o.name`,
      [userId]
    );
    return res.rows;
  }

  /**
   * Accounts that must hear about a change to an org's minors settings: every minor there — and
   * each of their guardians. The caller passes the **widest** minor age of the old and new settings,
   * since a raised age restricts players who were adults a moment ago.
   */
  async getMinorsAffectedByOrgChange(orgId: string, widestMinorAge: number): Promise<string[]> {
    return this.userIdsForPlayers(
      `SELECT op.id FROM org_profiles op
        WHERE op.org_id = $1 AND (
          EXISTS (SELECT 1 FROM profile_guardians pg WHERE pg.player_profile_id = op.id AND ${ACTIVE})
          OR COALESCE(op.birthdate > CURRENT_DATE - make_interval(years => $2::int), false)
        )`,
      [orgId, widestMinorAge]
    );
  }

  /**
   * Every account that must hear about a change to this player's guardians or access: the player's
   * own and each guardian's, active or not (an ended link must disappear from the guardian's view).
   */
  async getAffectedUserIds(playerProfileId: string): Promise<string[]> {
    return this.userIdsForPlayers('SELECT $1::text AS id', [playerProfileId]);
  }

  /**
   * The accounts behind a set of players and all their guardians, in one query. `playersSql` selects
   * a column `id` of player profile ids. Matched the way `getUserIdsForOrgProfile` matches: by
   * `user_id`, or by an account's own or verified email.
   */
  private async userIdsForPlayers(playersSql: string, params: any[]): Promise<string[]> {
    const res = await this.query(
      `WITH players AS (${playersSql}),
            profiles AS (
              SELECT id FROM players
              UNION
              SELECT pg.guardian_profile_id FROM profile_guardians pg WHERE pg.player_profile_id IN (SELECT id FROM players)
            ),
            people AS (SELECT op.user_id, op.email FROM org_profiles op WHERE op.id IN (SELECT id FROM profiles))
       SELECT user_id AS id FROM people WHERE user_id IS NOT NULL
       UNION
       SELECT u.id FROM users u JOIN people ON people.email = u.email
       UNION
       SELECT ue.user_id FROM user_emails ue JOIN people ON people.email = ue.email WHERE ue.verified_at IS NOT NULL`,
      params
    );
    return res.rows.map((r: any) => r.id);
  }
}

async function demotePrimary(tx: Tx, playerProfileId: string) {
  await tx(
    `UPDATE profile_guardians pg SET is_primary = false
      WHERE pg.player_profile_id = $1 AND pg.is_primary AND ${ACTIVE}`,
    [playerProfileId]
  );
}

function stripNulls<T extends Record<string, any>>(row: T): T {
  for (const key of Object.keys(row)) if (row[key] === null) delete row[key];
  return row;
}

export const guardianManager = new GuardianManager();
