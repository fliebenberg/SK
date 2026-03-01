import { OrgProfile, OrgMembership, User, UserEmail } from "@sk/types";
import { randomBytes } from "crypto";
import { BaseManager } from "./BaseManager";
import { organizationManager } from "./OrganizationManager";
import { imageService } from "../services/ImageService";

export class UserManager extends BaseManager {
  // --- Account Management (Users Table) ---

  async getUser(id: string): Promise<User | undefined> {
    const res = await this.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const res = await this.query(`
      SELECT u.* FROM users u
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
       RETURNING *`,
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
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );
    return res.rows[0] || null;
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
  }

  // --- Multi-Email Management ---

  async getUserEmails(userId: string): Promise<UserEmail[]> {
    const res = await this.query('SELECT * FROM user_emails WHERE user_id = $1', [userId]);
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
       RETURNING *`,
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

    await this.query('DELETE FROM users WHERE id = $1', [secondaryUserId]);
  }

  // --- Profile / Personalization ---

  async getFavorites(userId: string): Promise<any[]> {
    const res = await this.query('SELECT * FROM user_favorites WHERE user_id = $1', [userId]);
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
      `SELECT * FROM password_reset_tokens 
       WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()
       LIMIT 1`,
      [userId, tokenHash]
    );
    return res.rowCount! > 0;
  }

  async deletePasswordResetToken(userId: string): Promise<void> {
    await this.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
  }

  // --- Org Profiles (Replacement for Persons) ---
  
  async getOrgProfile(id: string): Promise<OrgProfile | undefined> {
    const res = await this.query('SELECT id, org_id as "orgId", user_id as "userId", name, email, birthdate, national_id as "nationalId", identifier, image, primary_role_id as "primaryRoleId" FROM org_profiles WHERE id = $1', [id]);
    return res.rows[0];
  }

  async addOrgProfile(profile: Omit<OrgProfile, 'id'> & { id?: string }): Promise<OrgProfile> {
    const id = profile.id || `op-${Date.now()}`;
    let processedImage: string | null = null;

    if (profile.image && profile.image.startsWith('data:image')) {
        processedImage = await imageService.processProfileImage(profile.image, id);
    } else {
        processedImage = profile.image || null;
    }

    const res = await this.query(
      `INSERT INTO org_profiles (id, org_id, user_id, name, email, birthdate, national_id, identifier, image, primary_role_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
       ON CONFLICT (org_id, identifier) DO UPDATE SET 
         user_id = EXCLUDED.user_id,
         name = EXCLUDED.name,
         email = COALESCE(org_profiles.email, EXCLUDED.email),
         birthdate = COALESCE(org_profiles.birthdate, EXCLUDED.birthdate),
         national_id = COALESCE(org_profiles.national_id, EXCLUDED.national_id),
         image = COALESCE(EXCLUDED.image, org_profiles.image),
         primary_role_id = COALESCE(EXCLUDED.primary_role_id, org_profiles.primary_role_id)
       RETURNING id, org_id as "orgId", user_id as "userId", name, email, birthdate, national_id as "nationalId", identifier, image, primary_role_id as "primaryRoleId"`, 
      [id, profile.orgId, profile.userId, profile.name, profile.email, profile.birthdate, profile.nationalId, profile.identifier, processedImage, profile.primaryRoleId]
    );
    return res.rows[0];
  }

  async updateOrgProfile(id: string, data: Partial<OrgProfile>): Promise<OrgProfile | null> {
    const keys = Object.keys(data).filter(k => k !== 'id' && k !== 'orgId');
    if (keys.length === 0) return null;

    let processedImage: string | undefined = undefined;
    if (data.image) {
        if (data.image.startsWith('data:image')) {
            processedImage = await imageService.processProfileImage(data.image, id);
        } else {
            processedImage = data.image; // e.g. a deletion or keeping it same
        }
    }

    const map: Record<string, string> = {
      userId: 'user_id',
      name: 'name',
      email: 'email',
      birthdate: 'birthdate',
      nationalId: 'national_id',
      identifier: 'identifier',
      image: 'image',
      primaryRoleId: 'primary_role_id'
    };

    const clauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    // Optional: Delete old image if it changed
    if (processedImage !== undefined) {
        const oldProfile = (await this.query('SELECT image FROM org_profiles WHERE id = $1', [id])).rows[0];
        if (oldProfile && oldProfile.image && oldProfile.image !== processedImage) {
            await this.safeDeleteProfileImage(oldProfile.image);
        }
    }

    keys.forEach(key => {
      if (map[key]) {
        clauses.push(`${map[key]} = $${idx}`);
        values.push(key === 'image' && processedImage !== undefined ? processedImage : (data as any)[key]);
        idx++;
      }
    });

    if (clauses.length === 0) return null;

    values.push(id);
    const res = await this.query(
      `UPDATE org_profiles SET ${clauses.join(', ')} WHERE id = $${idx} RETURNING id, org_id as "orgId", user_id as "userId", name, email, birthdate, national_id as "nationalId", identifier, image, primary_role_id as "primaryRoleId"`,
      values
    );
    return res.rows[0] || null;
  }

  async getOrganizationMembers(orgId: string): Promise<any[]> {
    const res = await this.query(`
        SELECT 
            om.id as "membershipId", om.role_id as "roleId", om.start_date as "startDate", om.end_date as "endDate",
            op.id, op.name, op.email, op.birthdate, op.national_id as "nationalId",
            op.identifier as "personOrgId",
            op.org_id as "orgId", op.user_id as "userId", op.image, op.primary_role_id as "primaryRoleId"
        FROM org_memberships om
        JOIN org_profiles op ON om.org_profile_id = op.id
        WHERE om.org_id = $1 AND (om.end_date IS NULL OR om.end_date > NOW())
    `, [orgId]);
    
    const members = res.rows.map((row: any) => ({
        ...row,
        roleName: organizationManager.getOrganizationRole(row.roleId)?.name
    }));
    return members;
  }

  async getOrgMembership(id: string): Promise<OrgMembership | undefined> {
    const res = await this.query('SELECT id, org_profile_id as "orgProfileId", org_id as "orgId", role_id as "roleId", start_date as "startDate", end_date as "endDate" FROM org_memberships WHERE id = $1', [id]);
    return res.rows[0];
  }

  async addOrganizationMember(orgProfileId: string, orgId: string, roleId: string, id?: string): Promise<OrgMembership> {
    if (!orgProfileId) {
        throw new Error("Cannot add organization member: orgProfileId is required");
    }
    const existing = await this.query(
       `SELECT * FROM org_memberships WHERE org_profile_id = $1 AND org_id = $2 AND (end_date IS NULL OR end_date > NOW())`,
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
    
    // Increment member count
    await this.query(
        `UPDATE organizations SET member_count = member_count + 1 WHERE id = $1`,
        [orgId]
    );

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

  async removeOrganizationMember(membershipId: string): Promise<OrgMembership | null> {
      const res = await this.query(
          `UPDATE org_memberships SET end_date = NOW() WHERE id = $1 RETURNING id, org_profile_id as "orgProfileId", org_id as "orgId", role_id as "roleId", start_date as "startDate", end_date as "endDate"`,
          [membershipId]
      );
      if (res.rows[0]) {
          const membership = res.rows[0];
          await organizationManager.syncClaimedStatus(membership.orgId);
          // Decrement member count
          await this.query(
              `UPDATE organizations SET member_count = member_count - 1 WHERE id = $1`,
              [membership.orgId]
          );
      }
      return res.rows[0] || null;
  }

  // --- User-Centric Membership Queries ---

  async getUserOrgMemberships(userId: string): Promise<OrgMembership[]> {
    const res = await this.query(`
      SELECT id, org_profile_id as "orgProfileId", org_id as "orgId", role_id as "roleId", start_date as "startDate", end_date as "endDate"
      FROM org_memberships
      WHERE org_profile_id IN (
        SELECT id FROM org_profiles WHERE user_id = $1 OR email IN (
          SELECT email FROM user_emails WHERE user_id = $1 AND verified_at IS NOT NULL
          UNION
          SELECT email FROM users WHERE id = $1
        )
      ) AND (end_date IS NULL OR end_date > NOW())
    `, [userId]);
    return res.rows;
  }

  async getUserTeamMemberships(userId: string): Promise<any[]> {
    const res = await this.query(`
      SELECT 
        tm.id, tm.org_profile_id as "orgProfileId", tm.team_id as "teamId", tm.role_id as "roleId", tm.start_date as "startDate", tm.end_date as "endDate",
        t.org_id as "orgId"
      FROM team_memberships tm
      JOIN teams t ON tm.team_id = t.id
      WHERE tm.org_profile_id IN (
        SELECT id FROM org_profiles WHERE user_id = $1 OR email IN (
          SELECT email FROM user_emails WHERE user_id = $1 AND verified_at IS NOT NULL
          UNION
          SELECT email FROM users WHERE id = $1
        )
      ) AND (tm.end_date IS NULL OR tm.end_date > NOW())
    `, [userId]);
    return res.rows;
  }

  // --- Search & Matching ---

  async searchProfiles(searchTerm: string, orgId?: string, orgDomain?: string): Promise<any[]> {
    if (!searchTerm || searchTerm.trim().length < 2) return [];

    const queryStr = `
      WITH search_results AS (
        SELECT 
          op.id, op.name, op.email, op.birthdate, op.national_id as "nationalId", op.identifier,
          similarity(op.name, $1) as name_sim,
          similarity(op.email, $1) as email_sim,
          EXISTS(SELECT 1 FROM org_memberships om WHERE om.org_profile_id = op.id AND om.org_id = $2 AND (om.end_date IS NULL OR om.end_date > NOW())) as is_member,
          (CASE WHEN op.email ILIKE $4 THEN 1 ELSE 0 END) as domain_match
        FROM org_profiles op
        WHERE (op.name % $1 OR op.email % $1 OR op.name ILIKE $3 OR op.email ILIKE $3)
          AND (op.org_id = $2 OR $2 IS NULL)
      )
      SELECT *,
        (GREATEST(name_sim, email_sim) + (CASE WHEN is_member THEN 0.5 ELSE 0 END) + (CASE WHEN domain_match = 1 THEN 0.3 ELSE 0 END)) as final_score
      FROM search_results
      ORDER BY final_score DESC
      LIMIT 10
    `;

    const domainPattern = orgDomain ? `%@${orgDomain}%` : '%@no-domain.com%';
    const res = await this.query(queryStr, [searchTerm, orgId || null, `%${searchTerm}%`, domainPattern]);
    return res.rows;
  }

  searchPeople = this.searchProfiles;

  async findMatchingUser(email?: string, name?: string, birthdate?: string): Promise<User | null> {
    if (!email && !birthdate) return null;

    if (email) {
      const user = await this.getUserByEmail(email);
      if (user) return user;
    }

    if (name && birthdate) {
      const res = await this.query(`
        SELECT * FROM users 
        WHERE name ILIKE $1 AND preferences->>'birthdate' = $2
        LIMIT 1
      `, [name, birthdate]);
      if (res.rows[0]) return res.rows[0];
    }

    return null;
  }

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
      WHERE (user_id = $1 OR email = ANY($2))
        AND org_id = $3
      LIMIT 1
    `, [userId, emails, orgId]);

    if (existingProfileRes.rows.length > 0) {
      // Ensure user_id is set
      const profileId = existingProfileRes.rows[0].id;
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

  async safeDeleteProfileImage(imagePath: string): Promise<void> {
    if (!imagePath || imagePath.startsWith('http') || imagePath.startsWith('data:')) return;
    
    // Check if any org_profile still uses it
    const profileRes = await this.query('SELECT 1 FROM org_profiles WHERE image = $1 LIMIT 1', [imagePath]);
    if (profileRes.rowCount! > 0) return;

    // Check if any user still uses it
    const userRes = await this.query('SELECT 1 FROM users WHERE image = $1 LIMIT 1', [imagePath]);
    if (userRes.rowCount! > 0) return;

    // Okay to delete
    await imageService.deleteProfileImage(imagePath);
  }

  async deleteOrgProfile(id: string): Promise<OrgProfile | null> {
      const profile = (await this.query('SELECT * FROM org_profiles WHERE id = $1', [id])).rows[0];
      if (!profile) return null;

      // Get active memberships to decrement count
      const activeMemberships = await this.query(
          `SELECT COUNT(*)::int as count FROM org_memberships 
           WHERE org_profile_id = $1 AND (end_date IS NULL OR end_date > NOW())`,
          [id]
      );
      const activeCount = activeMemberships.rows[0].count;

      await this.query('DELETE FROM team_memberships WHERE org_profile_id = $1', [id]);
      await this.query('DELETE FROM org_memberships WHERE org_profile_id = $1', [id]);

      await this.query('DELETE FROM org_profiles WHERE id = $1', [id]);

      if (activeCount > 0) {
          await this.query(
              `UPDATE organizations SET member_count = member_count - $1 WHERE id = $2`,
              [activeCount, profile.orgId]
          );
      }

      // Attempt safe delete of image
      if (profile.image) {
          await this.safeDeleteProfileImage(profile.image);
      }

      return profile;
  }
}

export const userManager = new UserManager();
