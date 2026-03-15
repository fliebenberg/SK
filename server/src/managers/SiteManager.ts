import { Site } from "@sk/types";
import { BaseManager } from "./BaseManager";
import { addressManager } from "./AddressManager";

export class SiteManager extends BaseManager {
  private siteCache: Site[] | null = null;

  async getSites(orgId?: string): Promise<Site[]> {
    let queryText = `
        SELECT s.id, s.name, s.org_id as "orgId", s.address_id as "addressId", s.is_active as "isActive",
               a.full_address as "fullAddress", a.address_line_1 as "addressLine1", a.address_line_2 as "addressLine2",
               a.city, a.province, a.postal_code as "postalCode", a.country,
               a.latitude, a.longitude
        FROM sites s
        LEFT JOIN addresses a ON s.address_id = a.id
    `;
    const params: any[] = [];
    if (orgId) {
        queryText += ' WHERE s.org_id = $1';
        params.push(orgId);
    }
    const res = await this.query(queryText, params);
    return res.rows.map(row => ({
        ...row,
        address: row.addressId ? {
            id: row.addressId,
            fullAddress: row.fullAddress,
            addressLine1: row.addressLine1,
            addressLine2: row.addressLine2,
            city: row.city,
            province: row.province,
            postalCode: row.postalCode,
            country: row.country,
            latitude: row.latitude,
            longitude: row.longitude
        } : undefined
    }));
  }

  async getSite(id: string): Promise<Site | undefined> {
    const res = await this.query(`
        SELECT s.id, s.name, s.org_id as "orgId", s.address_id as "addressId", s.is_active as "isActive",
               a.full_address as "fullAddress", a.address_line_1 as "addressLine1", a.address_line_2 as "addressLine2",
               a.city, a.province, a.postal_code as "postalCode", a.country,
               a.latitude, a.longitude
        FROM sites s
        LEFT JOIN addresses a ON s.address_id = a.id
        WHERE s.id = $1
    `, [id]);
    
    const row = res.rows[0];
    if (!row) return undefined;

    return {
        ...row,
        address: row.addressId ? {
            id: row.addressId,
            fullAddress: row.fullAddress,
            addressLine1: row.addressLine1,
            addressLine2: row.addressLine2,
            city: row.city,
            province: row.province,
            postalCode: row.postalCode,
            country: row.country,
            latitude: row.latitude,
            longitude: row.longitude
        } : undefined
    };
  }

  async addSite(site: Omit<Site, "id" | "orgId"> & { orgId: string, id?: string }): Promise<Site> {
    const id = site.id || `site-${Date.now()}`;
    let addressId = site.addressId;

    if (site.address && !addressId) {
        const newAddr = await addressManager.addAddress(site.address);
        addressId = newAddr.id;
    }

    const isActive = site.isActive !== undefined ? site.isActive : true;

    await this.query(
        `INSERT INTO sites (id, name, address_id, org_id, is_active)
         VALUES ($1, $2, $3, $4, $5)`,
         [id, site.name, addressId, site.orgId, isActive]
    );
    await this.query(
        `UPDATE organizations SET site_count = site_count + 1 WHERE id = $1`,
        [site.orgId]
    );
    this.invalidateCache();
    return (await this.getSite(id))!;
  }

  async updateSite(id: string, data: Partial<Site>): Promise<Site | null> {
    const currentSite = await this.getSite(id);
    if (!currentSite) return null;

    if (data.address) {
        if (currentSite.addressId) {
            await addressManager.updateAddress(currentSite.addressId, data.address);
        } else {
            const newAddr = await addressManager.addAddress(data.address);
            data.addressId = newAddr.id;
        }
        delete data.address;
    }

    const keys = Object.keys(data).filter(k => k !== 'id' && k !== 'orgId');
    if (keys.length > 0) {
        const map: Record<string, string> = { name: 'name', addressId: 'address_id', isActive: 'is_active' };
        const clauses: string[] = [];
        const values: any[] = [];
        let idx = 1;
        keys.forEach(k => {
            if (map[k]) {
                clauses.push(`${map[k]} = $${idx}`);
                values.push((data as any)[k]);
                idx++;
            }
        });
        values.push(id);
        await this.query(`UPDATE sites SET ${clauses.join(', ')} WHERE id = $${idx}`, values);
    }

    this.invalidateCache();
    return (await this.getSite(id)) || null;
  }

  async deleteSite(id: string): Promise<Site | null> {
    const site = await this.getSite(id);
    if (!site) return null;
    
    // Dependency checks: Events or Games linked directly to this site.
    // Also need to check if any Facility of this site is used in Games.
    const countsRes = await this.query(`
        SELECT 
            (SELECT COUNT(*)::int FROM events WHERE site_id = $1) as events,
            (SELECT COUNT(*)::int FROM games WHERE site_id = $1) as games,
            (SELECT COUNT(*)::int FROM games g JOIN facilities f ON g.facility_id = f.id WHERE f.site_id = $1) as facility_games,
            (SELECT COUNT(*)::int FROM facilities WHERE site_id = $1) as facilities
    `, [id]);
    
    const { events, games, facility_games, facilities } = countsRes.rows[0];

    if (events > 0 || games > 0 || facility_games > 0) {
        let reasons = [];
        if (events > 0) reasons.push(`${events} events`);
        if (games > 0) reasons.push(`${games} games`);
        if (facility_games > 0) reasons.push(`${facility_games} games (linked via facilities)`);
        
        throw new Error(`Cannot delete site: it is linked to ${reasons.join(', ')}.`);
    }

    // Wrap in transaction
    await this.query('BEGIN');
    try {
        // 1. Delete all facilities associated with the site
        if (facilities > 0) {
            await this.query('DELETE FROM facilities WHERE site_id = $1', [id]);
        }

        // 2. Delete the site itself
        await this.query('DELETE FROM sites WHERE id = $1', [id]);

        // 3. Update organization site count
        await this.query(
            `UPDATE organizations SET site_count = site_count - 1 WHERE id = $1`,
            [site.orgId]
        );

        await this.query('COMMIT');
    } catch (error) {
        await this.query('ROLLBACK');
        throw error;
    }

    this.invalidateCache();
    return site;
  }

  invalidateCache() {
    this.siteCache = null;
  }
}

export const siteManager = new SiteManager();
