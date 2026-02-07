import { Person, OrganizationMembership, User, UserEmail } from "@sk/types";
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

  async addPerson(person: Person): Promise<Person> {
    const res = await this.query('INSERT INTO persons (id, name) VALUES ($1, $2) RETURNING id, name', [person.id, person.name]);
    return res.rows[0];
  }

  async updatePerson(id: string, data: Partial<Person>): Promise<Person | null> {
     if (data.name) {
         const res = await this.query('UPDATE persons SET name = $1 WHERE id = $2 RETURNING id, name', [data.name, id]);
         return res.rows[0] || null;
     }
     return null;
  }

  async getOrganizationMembers(organizationId: string): Promise<any[]> {
    const res = await this.query(`
        SELECT 
            om.id as "membershipId", om.role_id as "roleId", om.start_date as "startDate", om.end_date as "endDate",
            p.id, p.name,
            om.organization_id as "organizationId"
        FROM organization_memberships om
        JOIN persons p ON om.person_id = p.id
        WHERE om.organization_id = $1 AND (om.end_date IS NULL OR om.end_date > NOW())
    `, [organizationId]);
    
    return res.rows.map(row => ({
        ...row,
        roleName: organizationManager.getOrganizationRole(row.roleId)?.name
    }));
  }

  async addOrganizationMember(personId: string, organizationId: string, roleId: string, id?: string): Promise<OrganizationMembership> {
    const existing = await this.query(
       `SELECT * FROM organization_memberships WHERE person_id = $1 AND organization_id = $2 AND (end_date IS NULL OR end_date > NOW())`,
       [personId, organizationId]
    );
    if (existing.rowCount! > 0) {
        const mId = existing.rows[0].id;
        await this.query('UPDATE organization_memberships SET role_id = $1 WHERE id = $2', [roleId, mId]);
        return { ...existing.rows[0], roleId };
    }

    const finalId = id || `org-mem-${Date.now()}`;
    const res = await this.query(
        `INSERT INTO organization_memberships (id, person_id, organization_id, role_id, start_date)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id, person_id as "personId", organization_id as "organizationId", role_id as "roleId", start_date as "startDate", end_date as "endDate"`,
         [finalId, personId, organizationId, roleId]
    );
    organizationManager.invalidateCache();
    return res.rows[0];
  }

  async updateOrganizationMember(membershipId: string, roleId: string): Promise<OrganizationMembership | null> {
      const res = await this.query(
          `UPDATE organization_memberships SET role_id = $1 WHERE id = $2 RETURNING id, person_id as "personId", organization_id as "organizationId", role_id as "roleId", start_date as "startDate", end_date as "endDate"`,
          [roleId, membershipId]
    );
    organizationManager.invalidateCache();
    return res.rows[0] || null;
  }

  async removeOrganizationMember(membershipId: string): Promise<OrganizationMembership | null> {
      const res = await this.query(
          `UPDATE organization_memberships SET end_date = NOW() WHERE id = $1 RETURNING id, person_id as "personId", organization_id as "organizationId", role_id as "roleId", start_date as "startDate", end_date as "endDate"`,
          [membershipId]
      );
      organizationManager.invalidateCache();
      return res.rows[0] || null;
  }
}

export const userManager = new UserManager();
