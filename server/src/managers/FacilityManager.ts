import { Facility } from "@sk/types";
import { BaseManager } from "./BaseManager";
import { addressManager } from "./AddressManager";

export class FacilityManager extends BaseManager {
  private facilityCache: Facility[] | null = null;

  async getFacilities(siteId?: string): Promise<Facility[]> {
    let queryText = `
        SELECT f.id, f.name, f.site_id as "siteId", f.primary_sport_id as "primarySportId", f.address_id as "addressId", f.surface_type as "surfaceType",
               a.full_address as "fullAddress", a.address_line_1 as "addressLine1", a.address_line_2 as "addressLine2",
               a.city, a.province, a.postal_code as "postalCode", a.country,
               a.latitude, a.longitude
        FROM facilities f
        LEFT JOIN addresses a ON f.address_id = a.id
    `;
    const params: any[] = [];
    if (siteId) {
        queryText += ' WHERE f.site_id = $1';
        params.push(siteId);
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

  async getFacility(id: string): Promise<Facility | undefined> {
    const res = await this.query(`
        SELECT f.id, f.name, f.site_id as "siteId", f.primary_sport_id as "primarySportId", f.address_id as "addressId", f.surface_type as "surfaceType",
               a.full_address as "fullAddress", a.address_line_1 as "addressLine1", a.address_line_2 as "addressLine2",
               a.city, a.province, a.postal_code as "postalCode", a.country,
               a.latitude, a.longitude
        FROM facilities f
        LEFT JOIN addresses a ON f.address_id = a.id
        WHERE f.id = $1
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

  async addFacility(facility: Omit<Facility, "id" | "siteId"> & { siteId: string, id?: string }): Promise<Facility> {
    const id = facility.id || `facility-${Date.now()}`;
    let addressId = facility.addressId;

    if (facility.address && !addressId) {
        const newAddr = await addressManager.addAddress(facility.address);
        addressId = newAddr.id;
    }

    await this.query(
        `INSERT INTO facilities (id, name, site_id, primary_sport_id, address_id, surface_type)
         VALUES ($1, $2, $3, $4, $5, $6)`,
         [id, facility.name, facility.siteId, facility.primarySportId, addressId, facility.surfaceType]
    );
    this.invalidateCache();
    return (await this.getFacility(id))!;
  }

  async updateFacility(id: string, data: Partial<Facility>): Promise<Facility | null> {
    const currentFacility = await this.getFacility(id);
    if (!currentFacility) return null;

    if (data.address) {
        if (currentFacility.addressId) {
            await addressManager.updateAddress(currentFacility.addressId, data.address);
        } else {
            const newAddr = await addressManager.addAddress(data.address);
            data.addressId = newAddr.id;
        }
        delete data.address;
    }

    const keys = Object.keys(data).filter(k => k !== 'id' && k !== 'siteId');
    if (keys.length > 0) {
        const map: Record<string, string> = { 
            name: 'name', 
            addressId: 'address_id', 
            primarySportId: 'primary_sport_id',
            surfaceType: 'surface_type' 
        };
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
        await this.query(`UPDATE facilities SET ${clauses.join(', ')} WHERE id = $${idx}`, values);
    }

    this.invalidateCache();
    return (await this.getFacility(id)) || null;
  }

  async deleteFacility(id: string): Promise<Facility | null> {
    const facility = await this.getFacility(id);
    if (!facility) return null;
    
    // Check for games linked to this facility
    const countsRes = await this.query(`
        SELECT COUNT(*)::int as games 
        FROM games WHERE facility_id = $1
    `, [id]);
    
    if (countsRes.rows[0].games > 0) {
        throw new Error(`Cannot delete facility: it is used by ${countsRes.rows[0].games} games.`);
    }

    await this.query('DELETE FROM facilities WHERE id = $1', [id]);
    this.invalidateCache();
    return facility;
  }

  invalidateCache() {
    this.facilityCache = null;
  }
}

export const facilityManager = new FacilityManager();
