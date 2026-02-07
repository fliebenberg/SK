import { BaseManager } from "./BaseManager";

export class AccessManager extends BaseManager {
  async isAppAdmin(userId: string): Promise<boolean> {
    const res = await this.query('SELECT global_role FROM users WHERE id = $1', [userId]);
    return res.rows[0]?.global_role === 'admin';
  }

  async getOrganizationRole(userId: string, organizationId: string): Promise<string | null> {
    // Current setup uses 'person_id' in organization_memberships. 
    // We need to link users to persons. 
    // For now, I'll assume users and persons share an ID or are linked.
    // Transitioning: Assuming user_id can be used to find memberships.
    const res = await this.query(`
      SELECT role_id 
      FROM organization_memberships 
      WHERE person_id = $1 AND organization_id = $2 AND (end_date IS NULL OR end_date > NOW())
    `, [userId, organizationId]);
    
    return res.rows[0]?.role_id || null;
  }

  async isOrganizationAdmin(userId: string, organizationId: string): Promise<boolean> {
    if (await this.isAppAdmin(userId)) return true;
    const roleId = await this.getOrganizationRole(userId, organizationId);
    return roleId === 'role-org-admin';
  }

  async canManageTeam(userId: string, teamId: string): Promise<boolean> {
    if (await this.isAppAdmin(userId)) return true;
    
    // Check if they are admin of the organization that owns the team
    const res = await this.query(`
      SELECT organization_id FROM teams WHERE id = $1
    `, [teamId]);
    if (res.rows[0]) {
      return this.isOrganizationAdmin(userId, res.rows[0].organization_id);
    }
    return false;
  }
}

export const accessManager = new AccessManager();
