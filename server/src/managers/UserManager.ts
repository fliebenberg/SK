import { OrgProfile, OrgMembership, User, UserEmail, OrgMember, OrgPeoplePage, OrgGuardianPerson, PaginatedResponse, assertCalendarDates, cellphoneKey, cellphoneSearchDigits, normalizeEmail, parseCellphone } from "@sk/shared";
import { randomBytes } from "crypto";
import { BaseManager } from "./BaseManager";
import { memberPrivilegedSql, restrictedReasonSql } from "./minorAccess";
import { deactivateIfNoPartLeft, reactivateOrgProfile } from './orgProfileStatus';
import { organizationManager } from "./OrganizationManager";
import { imageService } from "../services/ImageService";

/** Each word of a search, as an ILIKE pattern with its own wildcards taken literally. */
const searchWords = (search?: string) => String(search ?? '').trim().split(/\s+/).filter(Boolean)
  .map(word => `%${word.replace(/[\\%_]/g, '\\$&')}%`);

/** A member row, for a query with `org_memberships om` joined to `org_profiles op`. */
const memberColumns = `
  om.id as "membershipId", om.role_id as "roleId", om.start_date as "startDate", om.end_date as "endDate",
  op.id, op.name, op.email, op.cellphone, op.birthdate, op.national_id as "nationalId",
  op.identifier as "personOrgId",
  op.org_id as "orgId", op.user_id as "userId", op.image, op.primary_role_id as "primaryRoleId",
  op.last_invite_sent_at as "lastInviteSentAt", op.last_invite_email as "lastInviteEmail",
  op.own_account_allowed as "ownAccountAllowed", op.own_account_set_at as "ownAccountSetAt", op.own_account_set_by as "ownAccountSetBy",
  ${restrictedReasonSql('op', 'om.org_id')} as "restrictedReason",
  (
    op.user_id IS NOT NULL
    OR EXISTS (SELECT 1 FROM users u WHERE u.email = op.email)
    OR EXISTS (SELECT 1 FROM user_emails ue WHERE ue.email = op.email AND ue.verified_at IS NOT NULL)
  ) as "hasAccount"`;

/** A birthdate is a calendar date, never a timestamp (date-formatting skill, DATE-1). */
const PROFILE_DATE_FIELDS = { birthdate: 'Birthdate' };

/**
 * A cellphone number as it is stored — international form, `+27825550100` — or the refusal a person
 * reads when it cannot be read (`parseCellphone`, decided 2026-09-30). Blank stores nothing.
 */
function storedCellphone(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = parseCellphone(String(value));
  if (!parsed) return null;
  if (!parsed.ok) throw new Error(`Cellphone: ${parsed.problem}`);
  return parsed.value;
}

/**
 * An org ID identifies one person in an organisation, so a write that would give it to a second is
 * refused rather than merged (`PEOPLE-7`). The message names nobody: `namingRecordHolder` in
 * `profileGate` adds the name for those who may see it.
 */
export class OrgIdInUseError extends Error {
  constructor(readonly orgId: string, readonly identifier: string, readonly holderName: string | null) {
    super(`Org ID ${identifier} is already in use.`);
  }
}

/**
 * So is an email (`MEMBER-7`): access follows the address (`AccessManager`), so one login would hold
 * both people's memberships and roles. A number may be shared; an address may not.
 */
export class EmailInUseError extends Error {
  constructor(readonly orgId: string, readonly email: string, readonly holderName: string | null) {
    super(`${email} is already in use in this organisation. Each person needs their own email.`);
  }
}

/** Did this write hit the database's own guard on that rule? Only two saves at once get this far. */
export const isEmailClash = (error: any): boolean => error?.code === '23505' && error?.constraint === 'idx_org_profiles_one_email';

/** For a write with no one email to name: what to say when it hit that guard. */
export function rethrowEmailClash(error: unknown): never {
  if (isEmailClash(error)) throw new Error('Someone else in this organisation was just given one of these emails. Nothing was saved; check it and try again.');
  throw error;
}

/**
 * `restrictedReason` is an explicit `null` on a membership with full privileges, never absent: the
 * screens merge an updated row over the old one, and an absent key would leave a reason that no
 * longer applies in place.
 */
export function withReason<T extends { restrictedReason?: unknown }>(row: T): T {
  if (row.restrictedReason === undefined) row.restrictedReason = null;
  return row;
}

export class UserManager extends BaseManager {
  // --- Account Management (Users Table) ---
  private USER_COLUMNS = 'id, name, email, email_verified as "emailVerified", image, password_hash as "passwordHash", global_role as "globalRole", created_at as "createdAt", updated_at as "updatedAt", preferences, force_password_reset as "forcePasswordReset"';
  private USER_EMAIL_COLUMNS = 'id, user_id as "userId", email, is_primary as "isPrimary", verified_at as "verifiedAt", created_at as "createdAt"';
  private ORG_PROFILE_COLUMNS = 'id, org_id as "orgId", user_id as "userId", name, email, cellphone, birthdate, national_id as "nationalId", identifier, image, primary_role_id as "primaryRoleId", last_invite_sent_at as "lastInviteSentAt", last_invite_email as "lastInviteEmail", own_account_allowed as "ownAccountAllowed", own_account_set_at as "ownAccountSetAt", own_account_set_by as "ownAccountSetBy"';
  private ORG_MEMBERSHIP_COLUMNS = 'id, org_profile_id as "orgProfileId", org_id as "orgId", role_id as "roleId", start_date as "startDate", end_date as "endDate"';

  async getUser(id: string): Promise<User | undefined> {
    const res = await this.query(`SELECT ${this.USER_COLUMNS} FROM users WHERE id = $1`, [id]);
    return res.rows[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const res = await this.query(`
      SELECT u.id, u.name, u.email, u.email_verified as "emailVerified", u.image, u.password_hash as "passwordHash", u.global_role as "globalRole", u.created_at as "createdAt", u.updated_at as "updatedAt", u.preferences, u.force_password_reset as "forcePasswordReset"
      FROM users u
      LEFT JOIN user_emails ue ON u.id = ue.user_id
      WHERE u.email = $1 OR ue.email = $1
      LIMIT 1
    `, [email]);
    return res.rows[0];
  }

  async createUser(user: Partial<User>): Promise<User> {
    const id = user.id || `user-${Date.now()}`;
    const res = await this.query(
      `INSERT INTO users (id, name, email, image, password_hash, global_role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${this.USER_COLUMNS}`,
      [id, user.name, user.email, user.image, user.passwordHash, user.globalRole || 'user']
    );
    
    if (user.email) {
      await this.addEmail(id, user.email, true, true);
    }

    return res.rows[0];
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | null> {
    const keys = Object.keys(data).filter(k => k !== 'id' && k !== 'passwordHash');
    if (keys.length === 0) return this.getUser(id).then(r => r || null);

    const map: Record<string, string> = {
      name: 'name', email: 'email', image: 'image', globalRole: 'global_role', preferences: 'preferences',
      customImage: 'custom_image', avatarSource: 'avatar_source'
    };

    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    keys.forEach(key => {
      if (map[key]) {
        setClauses.push(`${map[key]} = $${idx}`);
        values.push((data as any)[key]);
        idx++;
      }
    });

    values.push(id);
    const res = await this.query(
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING ${this.USER_COLUMNS}`,
        values
      );
    return res.rows[0] || null;
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
  }

  // --- Multi-Email Management ---

  async getUserEmails(userId: string): Promise<UserEmail[]> {
    const res = await this.query(`SELECT ${this.USER_EMAIL_COLUMNS} FROM user_emails WHERE user_id = $1`, [userId]);
    return res.rows;
  }

  async getVerifiedEmails(userId: string): Promise<string[]> {
    const res = await this.query(`
      SELECT email FROM user_emails WHERE user_id = $1 AND verified_at IS NOT NULL
      UNION
      SELECT email FROM users WHERE id = $1
    `, [userId]);
    return res.rows.map((r: any) => r.email);
  }

  async addEmail(userId: string, email: string, isPrimary = false, verified = false): Promise<UserEmail> {
    const id = `email-${Date.now()}`;
    const res = await this.query(
      `INSERT INTO user_emails (id, user_id, email, is_primary, verified_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${this.USER_EMAIL_COLUMNS}`,
      [id, userId, email, isPrimary, verified ? new Date() : null]
    );
    return res.rows[0];
  }

  async setPrimaryEmail(userId: string, emailId: string): Promise<void> {
    await this.query('UPDATE user_emails SET is_primary = false WHERE user_id = $1', [userId]);
    await this.query('UPDATE user_emails SET is_primary = true WHERE id = $1 AND user_id = $2', [emailId, userId]);
    
    const emailRes = await this.query('SELECT email FROM user_emails WHERE id = $1', [emailId]);
    if (emailRes.rows[0]) {
      await this.updateUser(userId, { email: emailRes.rows[0].email });
    }
  }

  // --- Consolidation / Merging ---

  async mergeAccounts(primaryUserId: string, secondaryUserId: string): Promise<void> {
    await this.query('UPDATE user_emails SET user_id = $1, is_primary = false WHERE user_id = $2', [primaryUserId, secondaryUserId]);

    await this.query(`
      UPDATE org_memberships 
      SET org_profile_id = (SELECT id FROM org_profiles WHERE user_id = $1 AND org_id = org_memberships.org_id LIMIT 1)
      WHERE org_profile_id IN (SELECT id FROM org_profiles WHERE user_id = $2)
    `, [primaryUserId, secondaryUserId]);

    await this.query(`
      UPDATE team_memberships 
      SET org_profile_id = (
          SELECT op.id 
          FROM org_profiles op
          JOIN teams t ON t.org_id = op.org_id 
          WHERE op.user_id = $1 AND t.id = team_memberships.team_id LIMIT 1
      )
      WHERE org_profile_id IN (SELECT id FROM org_profiles WHERE user_id = $2)
    `, [primaryUserId, secondaryUserId]);

    await this.query(`
      UPDATE user_favorites 
      SET user_id = $1 
      WHERE user_id = $2 
      AND NOT EXISTS (
        SELECT 1 FROM user_favorites uf2 
        WHERE uf2.user_id = $1 AND uf2.entity_type = user_favorites.entity_type AND uf2.entity_id = user_favorites.entity_id
      )
    `, [primaryUserId, secondaryUserId]);

    const secondary = (await this.query('SELECT image, custom_image FROM users WHERE id = $1', [secondaryUserId])).rows[0];
    await this.query('DELETE FROM users WHERE id = $1', [secondaryUserId]);
    await imageService.release('profiles', secondary?.custom_image);
    await imageService.release('profiles', secondary?.image);
  }

  // --- Profile / Personalization ---

  async getFavorites(userId: string): Promise<any[]> {
    const res = await this.query('SELECT id, user_id as "userId", entity_type as "entityType", entity_id as "entityId", created_at as "createdAt" FROM user_favorites WHERE user_id = $1', [userId]);
    return res.rows;
  }

  async addFavorite(userId: string, entityType: string, entityId: string): Promise<void> {
    await this.query(
      `INSERT INTO user_favorites (id, user_id, entity_type, entity_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [`fav-${Date.now()}`, userId, entityType, entityId]
    );
  }

  async removeFavorite(userId: string, entityType: string, entityId: string): Promise<void> {
    await this.query(
      'DELETE FROM user_favorites WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3',
      [userId, entityType, entityId]
    );
  }

  // --- Password Reset ---

  async createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    const id = `prt-${Date.now()}`;
    await this.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [id, userId, tokenHash, expiresAt]
    );
  }

  async verifyPasswordResetToken(userId: string, tokenHash: string): Promise<boolean> {
    const res = await this.query(
      `SELECT 1 FROM password_reset_tokens 
       WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()
       LIMIT 1`,
      [userId, tokenHash]
    );
    return res.rowCount! > 0;
  }

  async deletePasswordResetToken(userId: string): Promise<void> {
    await this.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
  }

  async setForcePasswordReset(userId: string, force: boolean): Promise<void> {
    await this.query('UPDATE users SET force_password_reset = $1 WHERE id = $2', [force, userId]);
  }

  // --- Org Profiles (Replacement for Persons) ---
  
  async getOrgProfile(id: string): Promise<OrgProfile | undefined> {
    const res = await this.query('SELECT id, org_id as "orgId", user_id as "userId", name, email, cellphone, birthdate, national_id as "nationalId", identifier, image, primary_role_id as "primaryRoleId", last_invite_sent_at as "lastInviteSentAt", last_invite_email as "lastInviteEmail", own_account_allowed as "ownAccountAllowed", own_account_set_at as "ownAccountSetAt", own_account_set_by as "ownAccountSetBy" FROM org_profiles WHERE id = $1', [id]);
    return res.rows[0];
  }

  async addOrgProfile(profile: Omit<OrgProfile, 'id'> & { id?: string }): Promise<OrgProfile> {
    assertCalendarDates(profile as Record<string, unknown>, PROFILE_DATE_FIELDS);
    const cellphone = storedCellphone(profile.cellphone);
    if (profile.email) await this.assertEmailFree(profile.orgId, profile.email, profile.id);
    const id = profile.id || `op-${Date.now()}`;
    const image = await imageService.stage('profiles', profile.image || undefined);
    const processedImage = image.value ?? null;

    let res;
    try {
      res = await this.query(
        `INSERT INTO org_profiles (id, org_id, user_id, name, email, cellphone, birthdate, national_id, identifier, image, primary_role_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, org_id as "orgId", user_id as "userId", name, email, cellphone, birthdate, national_id as "nationalId", identifier, image, primary_role_id as "primaryRoleId", last_invite_sent_at as "lastInviteSentAt", last_invite_email as "lastInviteEmail", own_account_allowed as "ownAccountAllowed", own_account_set_at as "ownAccountSetAt", own_account_set_by as "ownAccountSetBy"`,
        [
          id,
          profile.orgId,
          profile.userId,
          profile.name,
          profile.email,
          cellphone,
          profile.birthdate,
          profile.nationalId,
          profile.identifier,
          processedImage,
          profile.primaryRoleId
        ]
      );
    } catch (error) {
      await image.discard();
      throw await this.uniqueClash(error, profile.orgId, profile.identifier, profile.email);
    }
    await image.commit(null);
    return res.rows[0];
  }

  /** Refuse an address on someone else's record in this organisation. Compared normalised. */
  async assertEmailFree(orgId: string, email: string, exceptProfileId?: string): Promise<void> {
    const holder = (await this.query(
      `SELECT name FROM org_profiles WHERE org_id = $1 AND inactive_at IS NULL AND LOWER(TRIM(email)) = $2 AND id IS DISTINCT FROM $3 ORDER BY name LIMIT 1`,
      [orgId, normalizeEmail(email), exceptProfileId ?? null]
    )).rows[0];
    if (holder) throw new EmailInUseError(orgId, email.trim(), holder.name);
  }

  /**
   * Who else in this organisation has this number. Only ever pointed out, never refused: people do
   * share a phone (`MEMBER-7`). Compared in one form, as old numbers are as they were typed; the
   * digits only narrow down which rows to compare.
   */
  async getCellphoneHolders(orgId: string, cellphone: string, exceptProfileId?: string): Promise<string[]> {
    const parsed = parseCellphone(cellphone);
    if (!parsed?.ok) return [];
    const res = await this.query(
      `SELECT name, cellphone FROM org_profiles
        WHERE org_id = $1 AND inactive_at IS NULL AND id IS DISTINCT FROM $2 AND regexp_replace(COALESCE(cellphone, ''), '\\D', '', 'g') LIKE $3
        ORDER BY name`,
      [orgId, exceptProfileId ?? null, `%${parsed.value.slice(-7)}`]
    );
    return res.rows.filter((r: any) => cellphoneKey(r.cellphone) === parsed.value).map((r: any) => r.name);
  }

  /** The refusal for a write that hit the unique org ID or email, as two saves at once can; any other error as it came. */
  private async uniqueClash(error: any, orgId: string, identifier?: string | null, email?: string | null): Promise<unknown> {
    if (isEmailClash(error) && email) {
      const holder = (await this.query('SELECT name FROM org_profiles WHERE org_id = $1 AND inactive_at IS NULL AND LOWER(TRIM(email)) = $2', [orgId, normalizeEmail(email)])).rows[0];
      return new EmailInUseError(orgId, email.trim(), holder?.name ?? null);
    }
    if (error?.code !== '23505' || error?.constraint !== 'idx_org_profiles_one_org_id' || !identifier) return error;
    const holder = (await this.query('SELECT name FROM org_profiles WHERE org_id = $1 AND inactive_at IS NULL AND identifier = $2', [orgId, identifier])).rows[0];
    return new OrgIdInUseError(orgId, identifier, holder?.name ?? null);
  }

  async updateOrgProfile(id: string, data: Partial<OrgProfile>): Promise<OrgProfile | null> {
    const keys = Object.keys(data).filter(k => k !== 'id' && k !== 'orgId');
    if (keys.length === 0) return null;
    assertCalendarDates(data as Record<string, unknown>, PROFILE_DATE_FIELDS);
    // A number saved before numbers were checked is left as it is while the edit does not touch it,
    // so an old record can still be saved; a new or changed one is stored in international form.
    if (typeof data.cellphone === 'string' && data.cellphone.trim()) {
      const current = (await this.query('SELECT cellphone FROM org_profiles WHERE id = $1', [id])).rows[0]?.cellphone;
      if (data.cellphone !== current) data = { ...data, cellphone: storedCellphone(data.cellphone) ?? undefined };
    }
    if (typeof data.email === 'string' && data.email.trim()) {
      const current = (await this.query('SELECT org_id FROM org_profiles WHERE id = $1', [id])).rows[0];
      if (current) await this.assertEmailFree(current.org_id, data.email, id);
    }

    const map: Record<string, string> = {
      userId: 'user_id',
      name: 'name',
      email: 'email',
      cellphone: 'cellphone',
      birthdate: 'birthdate',
      nationalId: 'national_id',
      identifier: 'identifier',
      image: 'image',
      primaryRoleId: 'primary_role_id',
      lastInviteSentAt: 'last_invite_sent_at',
      lastInviteEmail: 'last_invite_email'
    };

    const clauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const previousImage = data.image !== undefined
      ? (await this.query('SELECT image FROM org_profiles WHERE id = $1', [id])).rows[0]?.image
      : undefined;
    const image = await imageService.stage('profiles', data.image);

    keys.forEach(key => {
      if (map[key]) {
        clauses.push(`${map[key]} = $${idx}`);
        let val = (data as any)[key];
        if (key === 'image') {
          val = image.value;
        }
        values.push(val);
        idx++;
      }
    });

    if (clauses.length === 0) return null;

    values.push(id);
    let res;
    try {
      res = await this.query(
        `UPDATE org_profiles SET ${clauses.join(', ')} WHERE id = $${idx} RETURNING id, org_id as "orgId", user_id as "userId", name, email, cellphone, birthdate, national_id as "nationalId", identifier, image, primary_role_id as "primaryRoleId", last_invite_sent_at as "lastInviteSentAt", last_invite_email as "lastInviteEmail", own_account_allowed as "ownAccountAllowed", own_account_set_at as "ownAccountSetAt", own_account_set_by as "ownAccountSetBy"`,
        values
      );
    } catch (error) {
      await image.discard();
      const orgId = (await this.query('SELECT org_id FROM org_profiles WHERE id = $1', [id])).rows[0]?.org_id;
      throw await this.uniqueClash(error, orgId, data.identifier, data.email);
    }
    await image.commit(previousImage);
    return res.rows[0] || null;
  }

  /**
   * One page of an organisation's People (okf/live_rooms.md: static). Every word searched for must
   * match the name, email or org ID. `roleCounts` and `guardianCount` are across the whole
   * organisation, whatever the filter, for the filter's counts.
   *
   * The list is members. Guardians hold no membership (docs/identity_structure.md §5.1), so they join
   * it in two ways only (`PEOPLE-9`): `view: 'guardians'` lists everyone who is a guardian, members
   * among them, and finds them by contact details or by a child's name as well; and a search with no
   * role filter also finds guardians with no membership, for the People screen (`withGuardians`), so
   * nobody has to know which list to look in. The team pickers read members only.
   */
  async getOrgPeoplePage(orgId: string, params: { page?: number; limit?: number; search?: string; roleId?: string; sort?: string; view?: string; withGuardians?: boolean }): Promise<OrgPeoplePage> {
    const page = Math.max(1, Math.floor(Number(params.page)) || 1);
    const limit = Math.min(Math.max(1, Math.floor(Number(params.limit)) || 100), 100);
    const words = searchWords(params.search);
    const guardiansView = params.view === 'guardians';
    const isGuardian = `EXISTS (SELECT 1 FROM profile_guardians gl WHERE gl.guardian_profile_id = op.id AND (gl.end_date IS NULL OR gl.end_date > NOW()))`;
    const args: unknown[] = [orgId];
    const where = ['op.org_id = $1', 'op.inactive_at IS NULL'];
    if (guardiansView) {
      where.push(isGuardian);
    } else if (params.roleId) {
      args.push(params.roleId);
      where.push(`om.role_id = $${args.length}`);
    } else {
      where.push(words.length && params.withGuardians ? `(om.id IS NOT NULL OR ${isGuardian})` : 'om.id IS NOT NULL');
    }
    for (const word of words) {
      args.push(word);
      const n = `$${args.length}`;
      where.push(guardiansView
        ? `(op.name ILIKE ${n} OR op.email ILIKE ${n} OR op.identifier ILIKE ${n} OR op.cellphone ILIKE ${n}
             OR EXISTS (SELECT 1 FROM profile_guardians cl JOIN org_profiles c ON c.id = cl.player_profile_id
                         WHERE cl.guardian_profile_id = op.id AND (cl.end_date IS NULL OR cl.end_date > NOW()) AND c.name ILIKE ${n}))`
        : `(op.name ILIKE ${n} OR op.email ILIKE ${n} OR op.identifier ILIKE ${n})`);
    }
    const from = `FROM org_profiles op
      LEFT JOIN org_memberships om ON om.org_profile_id = op.id AND om.org_id = op.org_id AND (om.end_date IS NULL OR om.end_date > NOW())
      WHERE ${where.join(' AND ')}`;
    const byName = 'LOWER(op.name), op.id';
    const order = params.sort === 'role' && !guardiansView
      ? `CASE om.role_id WHEN 'role-org-admin' THEN 0 WHEN 'role-org-staff' THEN 1 ELSE 2 END, ${byName}`
      : byName;

    const [count, rows, roles, guardians] = await Promise.all([
      this.query(`SELECT COUNT(*)::int AS total ${from}`, args),
      this.query(
        `SELECT ${memberColumns},
                ARRAY(SELECT g.name FROM profile_guardians pg JOIN org_profiles g ON g.id = pg.guardian_profile_id
                       WHERE pg.player_profile_id = op.id AND (pg.end_date IS NULL OR pg.end_date > NOW())
                       ORDER BY pg.is_primary DESC, pg.start_date, pg.id) AS "guardianNames",
                ARRAY(SELECT c.name FROM profile_guardians cl JOIN org_profiles c ON c.id = cl.player_profile_id
                       WHERE cl.guardian_profile_id = op.id AND (cl.end_date IS NULL OR cl.end_date > NOW())
                       ORDER BY LOWER(c.name)) AS "childNames"
         ${from}
         ORDER BY ${order}
         LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
        [...args, limit, (page - 1) * limit],
      ),
      this.query(
        `SELECT role_id AS "roleId", COUNT(*)::int AS total FROM org_memberships
          WHERE org_id = $1 AND (end_date IS NULL OR end_date > NOW()) GROUP BY role_id`,
        [orgId],
      ),
      this.query(
        `SELECT COUNT(DISTINCT pg.guardian_profile_id)::int AS total FROM profile_guardians pg
          WHERE pg.org_id = $1 AND (pg.end_date IS NULL OR pg.end_date > NOW())`,
        [orgId],
      ),
    ]);
    return {
      items: rows.rows.map((row: any) => withReason({ ...row, roleName: organizationManager.getOrganizationRole(row.roleId)?.name })),
      total: count.rows[0].total,
      page,
      limit,
      roleCounts: Object.fromEntries(roles.rows.map((r: any) => [r.roleId, r.total])),
      guardianCount: guardians.rows[0].total,
    };
  }

  /**
   * A guardian's page, by their org profile as they may hold no membership (`PEOPLE-9`): their
   * details and the children they answer for. Nothing if they are not a guardian here any more.
   */
  async getOrgGuardian(orgId: string, profileId: string): Promise<OrgGuardianPerson | null> {
    const res = await this.query(
      `SELECT ${memberColumns}
         FROM org_profiles op
         LEFT JOIN org_memberships om ON om.org_profile_id = op.id AND om.org_id = op.org_id AND (om.end_date IS NULL OR om.end_date > NOW())
        WHERE op.org_id = $1 AND op.id = $2 AND op.inactive_at IS NULL`,
      [orgId, profileId],
    );
    const row = res.rows[0];
    if (!row) return null;
    const children = await this.query(
      `SELECT pg.id AS "linkId", c.id, c.name, c.image, pg.relationship, pg.is_primary AS "isPrimary",
              (SELECT om.id FROM org_memberships om
                WHERE om.org_profile_id = c.id AND om.org_id = pg.org_id AND (om.end_date IS NULL OR om.end_date > NOW())
                LIMIT 1) AS "membershipId"
         FROM profile_guardians pg JOIN org_profiles c ON c.id = pg.player_profile_id
        WHERE pg.guardian_profile_id = $1 AND (pg.end_date IS NULL OR pg.end_date > NOW())
        ORDER BY LOWER(c.name)`,
      [profileId],
    );
    if (!children.rows.length) return null;
    return withReason({ ...row, roleName: organizationManager.getOrganizationRole(row.roleId)?.name, children: children.rows });
  }

  /**
   * Someone who left this organisation with this email or org ID, for "is this them?" on the add
   * forms (docs/people.md §9). Admin and Staff only, by the read's room.
   */
  async getFormerPerson(orgId: string, given: { email?: string; identifier?: string }): Promise<OrgProfile | null> {
    const email = given.email ? normalizeEmail(given.email) : null;
    const identifier = given.identifier?.trim() || null;
    if (!email && !identifier) return null;
    const res = await this.query(
      `SELECT id, org_id AS "orgId", user_id AS "userId", name, email, cellphone, to_char(birthdate, 'YYYY-MM-DD') AS birthdate,
              national_id AS "nationalId", identifier, image, inactive_at AS "inactiveAt"
         FROM org_profiles
        WHERE org_id = $1 AND inactive_at IS NOT NULL
          AND (LOWER(TRIM(email)) = $2 OR identifier = $3)
        ORDER BY inactive_at DESC LIMIT 1`,
      [orgId, email, identifier],
    );
    return res.rows[0] ?? null;
  }

  /** One profile's member row in this organisation: nothing if they are not a member (a guardian, say). */
  async getOrgMemberOfProfile(orgId: string, profileId: string): Promise<OrgMember | null> {
    const res = await this.query(
      `SELECT ${memberColumns}
         FROM org_memberships om JOIN org_profiles op ON om.org_profile_id = op.id
        WHERE om.org_id = $1 AND op.id = $2 AND (om.end_date IS NULL OR om.end_date > NOW())`,
      [orgId, profileId],
    );
    const row = res.rows[0];
    return row ? withReason({ ...row, roleName: organizationManager.getOrganizationRole(row.roleId)?.name }) : null;
  }

  /** One person's page, by their membership of this organisation: nothing if it is not one of its. */
  async getOrgPerson(orgId: string, membershipId: string): Promise<(OrgMember & { ownAccountSetByName?: string | null }) | null> {
    const res = await this.query(
      `SELECT ${memberColumns},
              (SELECT s.name FROM org_profiles s WHERE s.id = op.own_account_set_by) AS "ownAccountSetByName"
         FROM org_memberships om JOIN org_profiles op ON om.org_profile_id = op.id
        WHERE om.org_id = $1 AND om.id = $2 AND (om.end_date IS NULL OR om.end_date > NOW())`,
      [orgId, membershipId],
    );
    const row = res.rows[0];
    return row ? withReason({ ...row, roleName: organizationManager.getOrganizationRole(row.roleId)?.name }) : null;
  }

  async getOrganizationMembers(orgId: string): Promise<OrgMember[]> {
    const res = await this.query(`
        SELECT ${memberColumns}
        FROM org_memberships om
        JOIN org_profiles op ON om.org_profile_id = op.id
        WHERE om.org_id = $1 AND (om.end_date IS NULL OR om.end_date > NOW())
    `, [orgId]);
    
    const members: OrgMember[] = res.rows.map((row: any) => withReason({
        ...row,
        roleName: organizationManager.getOrganizationRole(row.roleId)?.name
    }));
    return members;
  }

  /** Who is in the organisation, by name and photo, a page at a time: enough for a coach to pick someone (`PEOPLE-8`). */
  async getOrgPeopleNames(orgId: string, params: { page?: number; limit?: number; search?: string } = {}): Promise<PaginatedResponse<Pick<OrgMember, 'id' | 'membershipId' | 'name' | 'image'>>> {
    const page = Math.max(1, Math.floor(Number(params.page)) || 1);
    const limit = Math.min(Math.max(1, Math.floor(Number(params.limit)) || 100), 100);
    const args: unknown[] = [orgId];
    const where = ['om.org_id = $1', '(om.end_date IS NULL OR om.end_date > NOW())'];
    for (const word of searchWords(params.search)) {
      args.push(word);
      where.push(`op.name ILIKE $${args.length}`);
    }
    const from = `FROM org_memberships om JOIN org_profiles op ON om.org_profile_id = op.id WHERE ${where.join(' AND ')}`;
    const [count, rows] = await Promise.all([
      this.query(`SELECT COUNT(*)::int AS total ${from}`, args),
      this.query(
        `SELECT op.id, om.id as "membershipId", op.name, op.image ${from}
         ORDER BY LOWER(op.name), op.id LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
        [...args, limit, (page - 1) * limit],
      ),
    ]);
    return { items: rows.rows, total: count.rows[0].total, page, limit };
  }

  async getOrgMembership(id: string): Promise<OrgMembership | undefined> {
    const res = await this.query('SELECT id, org_profile_id as "orgProfileId", org_id as "orgId", role_id as "roleId", start_date as "startDate", end_date as "endDate" FROM org_memberships WHERE id = $1', [id]);
    return res.rows[0];
  }

  /** This person's current membership of the organisation, if they have one. */
  async getCurrentOrgMembership(orgProfileId: string, orgId: string): Promise<OrgMembership | undefined> {
    const res = await this.query(
      `SELECT ${this.ORG_MEMBERSHIP_COLUMNS} FROM org_memberships WHERE org_profile_id = $1 AND org_id = $2 AND (end_date IS NULL OR end_date > NOW())`,
      [orgProfileId, orgId]
    );
    return res.rows[0];
  }

  async addOrganizationMember(orgProfileId: string, orgId: string, roleId: string, id?: string): Promise<OrgMembership> {
    if (!orgProfileId) {
        throw new Error("Cannot add organisation member: orgProfileId is required");
    }
    // Someone returning: whoever adds them has said it is the same person (docs/people.md §9).
    await reactivateOrgProfile((text, params) => this.query(text, params) as any, orgProfileId);
    const existing = await this.query(
       `SELECT ${this.ORG_MEMBERSHIP_COLUMNS} FROM org_memberships WHERE org_profile_id = $1 AND org_id = $2 AND (end_date IS NULL OR end_date > NOW())`,
       [orgProfileId, orgId]
    );
    if (existing.rowCount! > 0) {
        const mId = existing.rows[0].id;
        await this.query('UPDATE org_memberships SET role_id = $1 WHERE id = $2', [roleId, mId]);
        await organizationManager.syncClaimedStatus(orgId);
        return { ...existing.rows[0], roleId, orgProfileId };
    }

    const finalId = id || `org-mem-${Date.now()}`;
    const res = await this.query(
        `INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id, org_profile_id as "orgProfileId", org_id as "orgId", role_id as "roleId", start_date as "startDate", end_date as "endDate"`,
         [finalId, orgProfileId, orgId, roleId]
    );
    await organizationManager.syncClaimedStatus(orgId);

    return res.rows[0];
  }

  async updateOrganizationMember(membershipId: string, roleId: string): Promise<OrgMembership | null> {
      const res = await this.query(
          `UPDATE org_memberships SET role_id = $1 WHERE id = $2 RETURNING id, org_profile_id as "orgProfileId", org_id as "orgId", role_id as "roleId", start_date as "startDate", end_date as "endDate"`,
          [roleId, membershipId]
    );
    if (res.rows[0]) {
        await organizationManager.syncClaimedStatus(res.rows[0].orgId);
    }
    return res.rows[0] || null;
  }

  /**
   * Someone leaves the organisation (docs/people.md §9). Their membership and team roles end, and so
   * do the links to their guardians, as nobody answers for someone who has left. Each guardian with
   * no other part in the organisation, and the person themselves if they have none, then has their
   * org profile made inactive. Being a guardian of someone else is a part, so a parent who was also
   * staff stays on as a guardian. Their user account is not touched.
   *
   * Returns what the caller must tell: the teams they left and the guardians they had.
   */
  async removeOrganizationMember(membershipId: string): Promise<(OrgMembership & { teamIds: string[]; guardianProfileIds: string[] }) | null> {
    const removed = await this.transaction(async (tx) => {
      const membership = (await tx(
        `UPDATE org_memberships SET end_date = NOW() WHERE id = $1 RETURNING ${this.ORG_MEMBERSHIP_COLUMNS}`,
        [membershipId]
      )).rows[0];
      if (!membership) return null;
      const profileId = membership.orgProfileId;
      const teams = await tx(
        `UPDATE team_memberships SET end_date = NOW()
          WHERE org_profile_id = $1 AND (end_date IS NULL OR end_date > NOW())
            AND team_id IN (SELECT id FROM teams WHERE org_id = $2)
          RETURNING team_id AS "teamId"`,
        [profileId, membership.orgId]
      );
      const guardians = await tx(
        `UPDATE profile_guardians SET end_date = NOW(), is_primary = false
          WHERE player_profile_id = $1 AND (end_date IS NULL OR end_date > NOW())
          RETURNING guardian_profile_id AS "guardianProfileId"`,
        [profileId]
      );
      const guardianProfileIds: string[] = guardians.rows.map((r: any) => r.guardianProfileId);
      for (const guardianId of guardianProfileIds) await deactivateIfNoPartLeft(tx, guardianId);
      await deactivateIfNoPartLeft(tx, profileId);
      return { ...membership, teamIds: [...new Set<string>(teams.rows.map((r: any) => r.teamId))], guardianProfileIds };
    });
    if (removed) await organizationManager.syncClaimedStatus(removed.orgId);
    return removed;
  }

  // --- User-Centric Membership Queries ---

  /**
   * Every org the user belongs to — **identity, not privilege**. A restricted minor's membership is
   * listed like any other, carrying `restrictedReason`, so the app shows the org as theirs and keeps
   * them out of the admin area (`MEMBER-3`). Privileges come from `AccessManager`, never from here.
   */
  async getUserOrgMemberships(userId: string): Promise<OrgMembership[]> {
    const res = await this.query(`
      SELECT om.id, om.org_profile_id as "orgProfileId", om.org_id as "orgId", om.role_id as "roleId",
             om.start_date as "startDate", om.end_date as "endDate",
             ${restrictedReasonSql('op', 'om.org_id')} as "restrictedReason"
      FROM org_memberships om
      JOIN org_profiles op ON op.id = om.org_profile_id
      WHERE (op.user_id = $1 OR op.email IN (
          SELECT email FROM user_emails WHERE user_id = $1 AND verified_at IS NOT NULL
          UNION
          SELECT email FROM users WHERE id = $1
        )) AND (om.end_date IS NULL OR om.end_date > NOW())
    `, [userId]);
    return res.rows.map(withReason);
  }

  async getUserTeamMemberships(userId: string): Promise<any[]> {
    const res = await this.query(`
      SELECT
        tm.id, tm.org_profile_id as "orgProfileId", tm.team_id as "teamId", tm.role_id as "roleId", tm.start_date as "startDate", tm.end_date as "endDate",
        t.org_id as "orgId", t.name as "teamName",
        ${restrictedReasonSql('op', 't.org_id')} as "restrictedReason"
      FROM team_memberships tm
      JOIN teams t ON tm.team_id = t.id
      JOIN org_profiles op ON op.id = tm.org_profile_id
      WHERE (op.user_id = $1 OR op.email IN (
          SELECT email FROM user_emails WHERE user_id = $1 AND verified_at IS NOT NULL
          UNION
          SELECT email FROM users WHERE id = $1
        )) AND (tm.end_date IS NULL OR tm.end_date > NOW())
    `, [userId]);
    return res.rows.map(withReason);
  }

  /** One profile's current team memberships — for publishing a change to that person's rosters. */
  async getUserTeamMembershipsForProfile(orgProfileId: string): Promise<{ id: string; teamId: string }[]> {
    const res = await this.query(
      `SELECT id, team_id as "teamId" FROM team_memberships
        WHERE org_profile_id = $1 AND (end_date IS NULL OR end_date > NOW())`,
      [orgProfileId]
    );
    return res.rows;
  }

  async isAdminOrCoach(userId: string, globalRole: string): Promise<boolean> {
    if (globalRole === 'admin') return true;

    // Check org memberships for 'role-org-admin' — one that carries privileges (`MEMBER-3`). The
    // coach half below is a team duty, which a restricted minor keeps.
    const orgRes = await this.query(`
      SELECT 1 FROM org_memberships om
      JOIN org_profiles op ON op.id = om.org_profile_id
      WHERE (op.user_id = $1 OR op.email IN (
          SELECT email FROM user_emails WHERE user_id = $1 AND verified_at IS NOT NULL
          UNION
          SELECT email FROM users WHERE id = $1
        )) AND om.role_id = 'role-org-admin' AND (om.end_date IS NULL OR om.end_date > NOW())
        AND ${memberPrivilegedSql('op', 'om.org_id')}
      LIMIT 1
    `, [userId]);

    if (orgRes.rowCount && orgRes.rowCount > 0) return true;

    // Check team memberships for coach roles
    const teamRes = await this.query(`
      SELECT 1 FROM team_memberships
      WHERE org_profile_id IN (
        SELECT id FROM org_profiles WHERE user_id = $1 OR email IN (
          SELECT email FROM user_emails WHERE user_id = $1 AND verified_at IS NOT NULL
          UNION
          SELECT email FROM users WHERE id = $1
        )
      ) AND role_id IN ('role-coach', 'role-assistant-coach') AND (end_date IS NULL OR end_date > NOW())
      LIMIT 1
    `, [userId]);

    return (teamRes.rowCount && teamRes.rowCount > 0) || false;
  }

  // --- Search & Matching ---

  /**
   * Find a person, by name, email or phone.
   *
   * **Two projections, and which one you get is an authorization decision** (`PEOPLE-1`). The org
   * filter here has always been optional — `op.org_id = $2 OR $2 IS NULL` — so an unscoped call
   * searches every profile in the system, which is legitimately what "find somebody to invite"
   * needs. What was wrong was that it answered with `cellphone`, `birthdate` and `national_id`
   * for arbitrary people in organisations the caller has nothing to do with.
   *
   * So: contact and identity fields come back only when the search is scoped to an org **and the
   * caller belongs to it** — the caller decides that and passes `lean: false`; every other search
   * gets name, organisation and image, which is all a picker needs to tell two people apart. The
   * `LIMIT 10` was never a defence against this: it caps one response, not repeated probing.
   *
   * Matching is unchanged in both modes, including matching on an email or a phone number the
   * lean projection will not return — searching by a value you already know is how you confirm you
   * have the right person, and it discloses nothing you did not type.
   */
  async searchProfiles(
    searchTerm: string,
    orgId?: string,
    orgDomain?: string,
    options?: { lean?: boolean; orgIds?: string[]; includeInactive?: boolean }
  ): Promise<OrgProfile[]> {
    if (!searchTerm || searchTerm.trim().length < 2) return [];

    const lean = options?.lean !== false;
    const orgIds = options?.orgIds && options.orgIds.length ? options.orgIds : null;

    // `$5` narrows to a *set* of orgs — the organiser picker's first tier is "the host and the
    // participating orgs", which is several. Null means the filter does not apply, exactly as
    // null `$2` already means for the single-org case.
    const projection = lean
      ? `id, "orgId", name, image, "orgName", "orgShortName"`
      : `id, "orgId", "userId", name, email, cellphone, birthdate, "nationalId", identifier, image, "primaryRoleId", "inactiveAt", "orgName", "orgShortName"`;
    // Only where someone is adding a person, who may be returning. Every other picker offers the active.
    const inactiveFilter = options?.includeInactive && !lean && orgId ? '' : 'AND op.inactive_at IS NULL';

    const queryStr = `
      WITH search_results AS (
        SELECT
          op.id, op.org_id as "orgId", op.user_id as "userId", op.name, op.email, op.cellphone, op.birthdate, op.national_id as "nationalId", op.identifier, op.image, op.primary_role_id as "primaryRoleId", op.inactive_at as "inactiveAt",
          o.name as "orgName", o.short_name as "orgShortName",
          similarity(op.name, $1) as name_sim,
          similarity(op.email, $1) as email_sim,
          EXISTS(SELECT 1 FROM org_memberships om WHERE om.org_profile_id = op.id AND om.org_id = $2 AND (om.end_date IS NULL OR om.end_date > NOW())) as is_member,
          (CASE WHEN op.email ILIKE $4 THEN 1 ELSE 0 END) as domain_match
        FROM org_profiles op
        LEFT JOIN organizations o ON o.id = op.org_id
        WHERE (op.name % $1 OR op.email % $1 OR op.name ILIKE $3 OR op.email ILIKE $3 OR op.cellphone ILIKE $3
               OR ($6::text IS NOT NULL AND regexp_replace(COALESCE(op.cellphone, ''), '\\D', '', 'g') LIKE $6::text))
          AND (op.org_id = $2 OR $2 IS NULL)
          AND ($5::text[] IS NULL OR op.org_id = ANY($5))
          ${inactiveFilter}
      )
      SELECT ${projection},
        (GREATEST(name_sim, email_sim) + (CASE WHEN is_member THEN 0.5 ELSE 0 END) + (CASE WHEN domain_match = 1 THEN 0.3 ELSE 0 END)) as final_score
      FROM search_results
      ORDER BY final_score DESC
      LIMIT 10
    `;

    const domainPattern = orgDomain ? `%@${orgDomain}%` : `%@no-domain.com%`;
    // Numbers are stored as +27825550100 (`parseCellphone`): `082 555` is looked for as `82555`.
    const phoneDigits = cellphoneSearchDigits(searchTerm);
    const res = await this.query(queryStr, [searchTerm, orgId || null, `%${searchTerm}%`, domainPattern, orgIds, phoneDigits ? `%${phoneDigits}%` : null]);
    return res.rows;
  }

  /**
   * The organiser picker's search (implementation plan §0.1), in two tiers.
   *
   * Tier 1 — `orgIds` set to the host and the participating organisations — covers the ordinary
   * case in one search. Tier 2 passes none, which searches everybody: available, because a
   * specialist official may be on the app under an org that is not here, but never the default,
   * since a global list of people is a privacy surface rather than a convenience. Tier 3, creating
   * a person who is on the app at all, is `ADD_ORG_PROFILE` and not a search.
   *
   * Lean in both tiers. Nothing about appointing a convenor needs their date of birth.
   */
  async searchOrganizerCandidates(searchTerm: string, orgIds?: string[]): Promise<OrgProfile[]> {
    return this.searchProfiles(searchTerm, undefined, undefined, { lean: true, orgIds });
  }

  searchPeople = this.searchProfiles;

  async linkUserToProfile(email: string, orgProfileId: string): Promise<OrgProfile | null> {
    return this.updateOrgProfile(orgProfileId, { email });
  }

  async ensureProfileForUserInOrg(userId: string, orgId: string): Promise<string> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");

    const emails = await this.getVerifiedEmails(userId);
    
    // Look for an existing profile with user_id or matching emails IN THIS ORG
    const existingProfileRes = await this.query(`
      SELECT id FROM org_profiles
      WHERE (user_id = $1 OR LOWER(TRIM(email)) = ANY($2))
        AND org_id = $3
      ORDER BY inactive_at IS NOT NULL, id
      LIMIT 1
    `, [userId, emails.map(email => normalizeEmail(email)), orgId]);

    if (existingProfileRes.rows.length > 0) {
      // Ensure user_id is set
      const profileId = existingProfileRes.rows[0].id;
      await reactivateOrgProfile((text, params) => this.query(text, params) as any, profileId);
      await this.updateOrgProfile(profileId, { userId });
      return profileId;
    }

    // Create a NEW profile for this organization
    const profile = await this.addOrgProfile({
      orgId: orgId,
      userId,
      name: user.name || user.email || "Unknown User",
      email: user.email,
      image: user.image
    });

    return profile.id;
  }
}

export const userManager = new UserManager();
