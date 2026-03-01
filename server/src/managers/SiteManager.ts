import { Site } from "@sk/types";
import { BaseManager } from "./BaseManager";
import { addressManager } from "./AddressManager";

export class SiteManager extends BaseManager {
  private siteCache: Site[] | null = null;

  async getSites(orgId?: string): Promise<Site[]> {
    let queryText = `
        SELECT s.id, s.name, s.org_id as "orgId", s.address_id as "addressId",
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
        SELECT s.id, s.name, s.org_id as "orgId", s.address_id as "addressId",
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

    await this.query(
        `INSERT INTO sites (id, name, address_id, org_id)
         VALUES ($1, $2, $3, $4)`,
         [id, site.name, addressId, site.orgId]
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
        const map: Record<string, string> = { name: 'name', addressId: 'address_id' };
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
    
    // Will need to check for dependencies, specifically Facilities linked to this site.
    const countsRes = await this.query(`
        SELECT COUNT(*)::int as facilities 
        FROM facilities WHERE site_id = $1
    `, [id]);
    
    if (countsRes.rows[0].facilities > 0) {
        throw new Error(`Cannot delete site: it has ${countsRes.rows[0].facilities} facilities.`);
    }

    await this.query('DELETE FROM sites WHERE id = $1', [id]);
    await this.query(
        `UPDATE organizations SET site_count = site_count - 1 WHERE id = $1`,
        [site.orgId]
    );
    this.invalidateCache();
    return site;
  }

  invalidateCache() {
    this.siteCache = null;
  }
}

export const siteManager = new SiteManager();
