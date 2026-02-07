import { Organization, Venue, OrganizationRole } from "@sk/types";
import { BaseManager } from "./BaseManager";

export class OrganizationManager extends BaseManager {
  private organizationCache: Organization[] | null = null;

  organizationRoles: OrganizationRole[] = [
    { id: "role-org-admin", name: "Admin" },
    { id: "role-org-member", name: "Member" },
  ];

  async getOrganizations(): Promise<Organization[]> {
    if (this.organizationCache) {
      return this.organizationCache;
    }

    const res = await this.query(`
      SELECT 
        o.id, 
        o.name, 
        o.logo, 
        o.primary_color as "primaryColor", 
        o.secondary_color as "secondaryColor", 
        o.supported_sport_ids as "supportedSportIds", 
        o.short_name as "shortName", 
        o.supported_role_ids as "supportedRoleIds",
        (SELECT COUNT(*)::int FROM teams t WHERE t.organization_id = o.id) as "teamCount",
        (SELECT COUNT(*)::int FROM venues v WHERE v.organization_id = o.id) as "venueCount",
        (SELECT COUNT(*)::int FROM events e WHERE (e.organization_id = o.id OR o.id = ANY(e.participating_org_ids)) AND (e.start_date IS NULL OR e.start_date > (NOW() - INTERVAL '24 hours'))) as "eventCount",
        (SELECT COUNT(*)::int FROM organization_memberships om WHERE om.organization_id = o.id) as "memberCount"
      FROM organizations o
    `);
    
    this.organizationCache = res.rows;
    return res.rows;
  }

  async getOrganization(id?: string): Promise<Organization | undefined> {
    if (!id) return undefined;
    const res = await this.query(`
      SELECT 
        o.id, 
        o.name, 
        o.logo, 
        o.primary_color as "primaryColor", 
        o.secondary_color as "secondaryColor", 
        o.supported_sport_ids as "supportedSportIds", 
        o.short_name as "shortName", 
        o.supported_role_ids as "supportedRoleIds",
        (SELECT COUNT(*)::int FROM teams t WHERE t.organization_id = o.id) as "teamCount",
        (SELECT COUNT(*)::int FROM venues v WHERE v.organization_id = o.id) as "venueCount",
        (SELECT COUNT(*)::int FROM events e WHERE (e.organization_id = o.id OR o.id = ANY(e.participating_org_ids)) AND (e.start_date IS NULL OR e.start_date > (NOW() - INTERVAL '24 hours'))) as "eventCount"
      FROM organizations o
      WHERE o.id = $1
    `, [id]);
    return res.rows[0];
  }

  invalidateCache() {
    this.organizationCache = null;
  }

  async addOrganization(org: Omit<Organization, "id"> & { id?: string }): Promise<Organization> {
    const id = org.id || `org-${Date.now()}`;
    const supportedSportIds = org.supportedSportIds || [];
    const supportedRoleIds = org.supportedRoleIds || [];
    
    const res = await this.query(
      `INSERT INTO organizations (id, name, logo, primary_color, secondary_color, supported_sport_ids, short_name, supported_role_ids) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, name, logo, primary_color as "primaryColor", secondary_color as "secondaryColor", supported_sport_ids as "supportedSportIds", short_name as "shortName", supported_role_ids as "supportedRoleIds"`,
      [id, org.name, org.logo, org.primaryColor, org.secondaryColor, supportedSportIds, org.shortName, supportedRoleIds]
    );
    this.invalidateCache();
    return res.rows[0];
  }

  async updateOrganization(id: string, data: Partial<Organization>): Promise<Organization | null> {
    const keys = Object.keys(data).filter(k => k !== 'id');
    if (keys.length === 0) return this.getOrganization(id).then(r => r || null);

    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const map: Record<string, string> = {
        name: 'name', logo: 'logo', primaryColor: 'primary_color', secondaryColor: 'secondary_color',
        supportedSportIds: 'supported_sport_ids', shortName: 'short_name', supportedRoleIds: 'supported_role_ids'
    };

    keys.forEach(key => {
        if (map[key]) {
            setClauses.push(`${map[key]} = $${idx}`);
            values.push((data as any)[key]);
            idx++;
        }
    });

    if (setClauses.length === 0) return this.getOrganization(id).then(r => r || null);
    values.push(id);
    
    const res = await this.query(
        `UPDATE organizations SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, name, logo, primary_color as "primaryColor", secondary_color as "secondaryColor", supported_sport_ids as "supportedSportIds", short_name as "shortName", supported_role_ids as "supportedRoleIds"`,
        values
    );
    this.invalidateCache();
    return res.rows[0] || null;
  }

  async getVenues(organizationId?: string): Promise<Venue[]> {
    let queryText = 'SELECT id, name, address, organization_id as "organizationId" FROM venues';
    const params: any[] = [];
    if (organizationId) {
        queryText += ' WHERE organization_id = $1';
        params.push(organizationId);
    }
    const res = await this.query(queryText, params);
    return res.rows;
  }

  async addVenue(venue: Omit<Venue, "id" | "organizationId"> & { organizationId: string, id?: string }): Promise<Venue> {
    const id = venue.id || `venue-${Date.now()}`;
    const res = await this.query(
        `INSERT INTO venues (id, name, address, organization_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, address, organization_id as "organizationId"`,
          [id, venue.name, venue.address, venue.organizationId]
    );
    this.invalidateCache();
    return res.rows[0];
  }
  
  async updateVenue(id: string, data: Partial<Venue>): Promise<Venue | null> {
    if (data.name || data.address) {
         const res = await this.query(
             `UPDATE venues SET name = COALESCE($1, name), address = COALESCE($2, address) WHERE id = $3 RETURNING id, name, address, organization_id as "organizationId"`,
             [data.name, data.address, id]
         );
         return res.rows[0];
    }
    return (await this.getVenues()).find(v => v.id === id) || null;
  }

  async deleteVenue(id: string): Promise<Venue | null> {
    const venueRaw = await this.query('SELECT * FROM venues WHERE id = $1', [id]);
    if (venueRaw.rowCount === 0) return null;
    const venue = { ...venueRaw.rows[0], organizationId: venueRaw.rows[0].organization_id };
    
    await this.query('DELETE FROM venues WHERE id = $1', [id]);
    this.invalidateCache();
    return venue;
  }

  async getOrganizationRoles(): Promise<OrganizationRole[]> {
    return this.organizationRoles;
  }

  getOrganizationRole(id: string) {
    return this.organizationRoles.find(r => r.id === id);
  }
}

export const organizationManager = new OrganizationManager();
