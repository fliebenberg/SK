import { Person, OrganizationMembership, User, UserEmail } from "@sk/types";
import { randomBytes } from "crypto";
import { BaseManager } from "./BaseManager";
import { organizationManager } from "./OrganizationManager";

export class UserManager extends BaseManager {
  // --- Account Management (Users Table) ---

  async getUser(id: string): Promise<User | undefined> {
    const res = await this.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    // Check primary email in users table, OR secondary emails in user_emails
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
    
    // Auto-create primary email entry
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
    return res.rows.map(r => r.email);
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
    // 1. Transfer Emails
    await this.query('UPDATE user_emails SET user_id = $1, is_primary = false WHERE user_id = $2', [primaryUserId, secondaryUserId]);

    // 2. Transfer Memberships (Org & Team)
    // Avoid duplicates if they are already in the same org/team
    await this.query(`
      UPDATE organization_memberships 
      SET person_id = $1 
      WHERE person_id = $2 
      AND NOT EXISTS (
        SELECT 1 FROM organization_memberships om2 
        WHERE om2.person_id = $1 AND om2.organization_id = organization_memberships.organization_id
      )
    `, [primaryUserId, secondaryUserId]);

    await this.query(`
      UPDATE team_memberships 
      SET person_id = $1 
      WHERE person_id = $2 
      AND NOT EXISTS (
        SELECT 1 FROM team_memberships tm2 
        WHERE tm2.person_id = $1 AND tm2.team_id = team_memberships.team_id AND tm2.role_id = team_memberships.role_id
      )
    `, [primaryUserId, secondaryUserId]);

    // 3. Transfer Favorites
    await this.query(`
      UPDATE user_favorites 
      SET user_id = $1 
      WHERE user_id = $2 
      AND NOT EXISTS (
        SELECT 1 FROM user_favorites uf2 
        WHERE uf2.user_id = $1 AND uf2.entity_type = user_favorites.entity_type AND uf2.entity_id = user_favorites.entity_id
      )
    `, [primaryUserId, secondaryUserId]);

    // 4. Delete Secondary User
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

  // --- Existing Logic (Persons & Memberships) ---

  async addPerson(person: Omit<Person, 'id'> & { id?: string }): Promise<Person> {
    const id = person.id || `person-${Date.now()}`;
    const res = await this.query(
      `INSERT INTO persons (id, name, email, birthdate, national_id) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (id) DO UPDATE SET 
         name = EXCLUDED.name,
         email = COALESCE(persons.email, EXCLUDED.email),
         birthdate = COALESCE(persons.birthdate, EXCLUDED.birthdate),
         national_id = COALESCE(persons.national_id, EXCLUDED.national_id)
       RETURNING id, name, email, birthdate, national_id as "nationalId"`, 
      [id, person.name, person.email, person.birthdate, person.nationalId]
    );
    return res.rows[0];
  }

  async updatePerson(id: string, data: Partial<Person>): Promise<Person | null> {
    const keys = Object.keys(data).filter(k => k !== 'id');
    if (keys.length === 0) return null;

    const map: Record<string, string> = {
      name: 'name',
      email: 'email',
      birthdate: 'birthdate',
      nationalId: 'national_id'
    };

    const clauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    keys.forEach(key => {
      if (map[key]) {
        clauses.push(`${map[key]} = $${idx}`);
        values.push((data as any)[key]);
        idx++;
      }
    });

    if (clauses.length === 0) return null;

    values.push(id);
    const res = await this.query(
      `UPDATE persons SET ${clauses.join(', ')} WHERE id = $${idx} RETURNING id, name, email, birthdate, national_id as "nationalId"`,
      values
    );
    return res.rows[0] || null;
  }

  // --- Person Identifiers (Org-specific IDs) ---

  async getPersonIdentifiers(personId: string): Promise<any[]> {
    const res = await this.query(
      `SELECT id, person_id as "personId", organization_id as "organizationId", identifier 
       FROM person_identifiers WHERE person_id = $1`,
      [personId]
    );
    return res.rows;
  }

  async setPersonIdentifier(personId: string, organizationId: string, identifier: string): Promise<any> {
    const id = `pi-${Date.now()}`;
    const res = await this.query(
      `INSERT INTO person_identifiers (id, person_id, organization_id, identifier)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, identifier) DO UPDATE SET person_id = EXCLUDED.person_id
       RETURNING id, person_id as "personId", organization_id as "organizationId", identifier`,
      [id, personId, organizationId, identifier]
    );
    return res.rows[0];
  }

  async getOrganizationMembers(organizationId: string): Promise<any[]> {
    const res = await this.query(`
        SELECT 
            om.id as "membershipId", om.role_id as "roleId", om.start_date as "startDate", om.end_date as "endDate",
            p.id, p.name, p.email, p.birthdate, p.national_id as "nationalId",
            pi.identifier as "personOrgId",
            om.organization_id as "organizationId"
        FROM organization_memberships om
        JOIN persons p ON om.person_id = p.id
        LEFT JOIN person_identifiers pi ON p.id = pi.person_id AND pi.organization_id = om.organization_id
        WHERE om.organization_id = $1 AND (om.end_date IS NULL OR om.end_date > NOW())
    `, [organizationId]);
    
    const members = res.rows.map(row => ({
        ...row,
        roleName: organizationManager.getOrganizationRole(row.roleId)?.name
    }));
    console.log(`UserManager: Found ${members.length} members for org ${organizationId}`);
    return members;
  }

  async getOrganizationMembership(id: string): Promise<OrganizationMembership | undefined> {
    const res = await this.query('SELECT id, person_id as "personId", organization_id as "organizationId", role_id as "roleId", start_date as "startDate", end_date as "endDate" FROM organization_memberships WHERE id = $1', [id]);
    return res.rows[0];
  }

  async addOrganizationMember(personId: string, organizationId: string, roleId: string, id?: string): Promise<OrganizationMembership> {
    const existing = await this.query(
       `SELECT * FROM organization_memberships WHERE person_id = $1 AND organization_id = $2 AND (end_date IS NULL OR end_date > NOW())`,
       [personId, organizationId]
    );
    if (existing.rowCount! > 0) {
        const mId = existing.rows[0].id;
        await this.query('UPDATE organization_memberships SET role_id = $1 WHERE id = $2', [roleId, mId]);
        await organizationManager.syncClaimedStatus(organizationId);
        return { ...existing.rows[0], roleId };
    }

    const finalId = id || `org-mem-${Date.now()}`;
    const res = await this.query(
        `INSERT INTO organization_memberships (id, person_id, organization_id, role_id, start_date)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id, person_id as "personId", organization_id as "organizationId", role_id as "roleId", start_date as "startDate", end_date as "endDate"`,
         [finalId, personId, organizationId, roleId]
    );
    await organizationManager.syncClaimedStatus(organizationId);
    return res.rows[0];
  }

  async updateOrganizationMember(membershipId: string, roleId: string): Promise<OrganizationMembership | null> {
      const res = await this.query(
          `UPDATE organization_memberships SET role_id = $1 WHERE id = $2 RETURNING id, person_id as "personId", organization_id as "organizationId", role_id as "roleId", start_date as "startDate", end_date as "endDate"`,
          [roleId, membershipId]
    );
    if (res.rows[0]) {
        await organizationManager.syncClaimedStatus(res.rows[0].organizationId);
    }
    return res.rows[0] || null;
  }

  async removeOrganizationMember(membershipId: string): Promise<OrganizationMembership | null> {
      const res = await this.query(
          `UPDATE organization_memberships SET end_date = NOW() WHERE id = $1 RETURNING id, person_id as "personId", organization_id as "organizationId", role_id as "roleId", start_date as "startDate", end_date as "endDate"`,
          [membershipId]
      );
      if (res.rows[0]) {
          await organizationManager.syncClaimedStatus(res.rows[0].organizationId);
      }
      return res.rows[0] || null;
  }

  // --- User-Centric Membership Queries ---

  async getUserOrgMemberships(userId: string): Promise<OrganizationMembership[]> {
    const res = await this.query(`
      SELECT id, person_id as "personId", organization_id as "organizationId", role_id as "roleId", start_date as "startDate", end_date as "endDate"
      FROM organization_memberships
      WHERE person_id IN (
        SELECT id FROM persons WHERE email IN (
          SELECT email FROM user_emails WHERE user_id = $1 AND verified_at IS NOT NULL
          UNION
          SELECT email FROM users WHERE id = $1
        ) OR id = $1
      ) AND (end_date IS NULL OR end_date > NOW())
    `, [userId]);
    return res.rows;
  }

  async getUserTeamMemberships(userId: string): Promise<any[]> {
    const res = await this.query(`
      SELECT 
        tm.id, tm.person_id as "personId", tm.team_id as "teamId", tm.role_id as "roleId", tm.start_date as "startDate", tm.end_date as "endDate",
        t.organization_id as "organizationId"
      FROM team_memberships tm
      JOIN teams t ON tm.team_id = t.id
      WHERE tm.person_id IN (
        SELECT id FROM persons WHERE email IN (
          SELECT email FROM user_emails WHERE user_id = $1 AND verified_at IS NOT NULL
          UNION
          SELECT email FROM users WHERE id = $1
        ) OR id = $1
      ) AND (tm.end_date IS NULL OR tm.end_date > NOW())
    `, [userId]);
    return res.rows;
  }

  // --- Search & Matching ---

  async searchPeople(searchTerm: string, organizationId?: string, orgDomain?: string): Promise<any[]> {
    // Term should be at least 2 chars
    if (!searchTerm || searchTerm.trim().length < 2) return [];

    const queryStr = `
      WITH search_results AS (
        SELECT 
          p.id, p.name, p.email, p.birthdate, p.national_id as "nationalId",
          similarity(p.name, $1) as name_sim,
          similarity(p.email, $1) as email_sim,
          EXISTS(SELECT 1 FROM organization_memberships om WHERE om.person_id = p.id AND om.organization_id = $2 AND (om.end_date IS NULL OR om.end_date > NOW())) as is_member,
          (CASE WHEN p.email ILIKE $4 THEN 1 ELSE 0 END) as domain_match,
          (SELECT identifier FROM person_identifiers pi WHERE pi.person_id = p.id AND pi.organization_id = $2 LIMIT 1) as "personOrgId"
        FROM persons p
        WHERE p.name % $1 OR p.email % $1 OR p.name ILIKE $3 OR p.email ILIKE $3
      )
      SELECT *,
        (GREATEST(name_sim, email_sim) + (CASE WHEN is_member THEN 0.5 ELSE 0 END) + (CASE WHEN domain_match = 1 THEN 0.3 ELSE 0 END)) as final_score
      FROM search_results
      ORDER BY final_score DESC
      LIMIT 10
    `;

    const domainPattern = orgDomain ? `%@${orgDomain}%` : '%@no-domain.com%';
    const res = await this.query(queryStr, [searchTerm, organizationId || null, `%${searchTerm}%`, domainPattern]);
    return res.rows;
  }

  async findMatchingUser(email?: string, name?: string, birthdate?: string): Promise<User | null> {
    if (!email && !birthdate) return null;

    // Primarily match by email
    if (email) {
      const user = await this.getUserByEmail(email);
      if (user) return user;
    }

    // Secondary match: same name AND same birthdate
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

  async linkUserToPerson(email: string, personId: string): Promise<Person | null> {
    // Explicitly update the person's email to match the user's email, establishing the link
    return this.updatePerson(personId, { email });
  }

  /**
   * Finds or creates a Person record for a user in the context of a specific organization.
   * This respects the idea that a user can have multiple identities (one per org).
   */
  async ensurePersonForUserInOrg(userId: string, organizationId: string): Promise<string> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");

    const emails = await this.getVerifiedEmails(userId);
    
    // 1. Look for an existing person with one of these emails ALREADY in this organization
    const existingPersonRes = await this.query(`
      SELECT p.id 
      FROM persons p
      JOIN organization_memberships om ON p.id = om.person_id
      WHERE (p.email = ANY($1) OR p.id = $2)
        AND om.organization_id = $3
      LIMIT 1
    `, [emails, userId, organizationId]);

    if (existingPersonRes.rows.length > 0) {
      return existingPersonRes.rows[0].id;
    }

    // 2. If not found, create a NEW person for this organization context
    const personId = `p-${randomBytes(8).toString('hex')}`;
    await this.addPerson({
      id: personId,
      name: user.name || user.email || "Unknown User",
      email: user.email // Use primary email
    });

    return personId;
  }

  async deletePerson(id: string): Promise<Person | null> {
      const person = (await this.query('SELECT * FROM persons WHERE id = $1', [id])).rows[0];
      if (!person) return null;

      // Clean up dependencies
      await this.query('DELETE FROM team_memberships WHERE person_id = $1', [id]);
      await this.query('DELETE FROM organization_memberships WHERE person_id = $1', [id]);
      await this.query('DELETE FROM person_identifiers WHERE person_id = $1', [id]);

      await this.query('DELETE FROM persons WHERE id = $1', [id]);
      return person;
  }
}

export const userManager = new UserManager();
