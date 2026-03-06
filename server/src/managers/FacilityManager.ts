import { Facility } from "@sk/types";
import { BaseManager } from "./BaseManager";
import { addressManager } from "./AddressManager";

export class FacilityManager extends BaseManager {
  private facilityCache: Facility[] | null = null;

  async getFacilities(siteId?: string): Promise<Facility[]> {
    let queryText = `
        SELECT f.id, f.name, f.site_id as "siteId", f.primary_sport_id as "primarySportId", 
               f.surface_type as "surfaceType", f.latitude, f.longitude, f.is_active as "isActive"
        FROM facilities f
    `;
    const params: any[] = [];
    if (siteId) {
        queryText += ' WHERE f.site_id = $1';
        params.push(siteId);
    }
    const res = await this.query(queryText, params);
    return res.rows;
  }

  async getFacility(id: string): Promise<Facility | undefined> {
    const res = await this.query(`
        SELECT f.id, f.name, f.site_id as "siteId", f.primary_sport_id as "primarySportId", 
               f.surface_type as "surfaceType", f.latitude, f.longitude, f.is_active as "isActive"
        FROM facilities f
        WHERE f.id = $1
    `, [id]);
    
    return res.rows[0];
  }

  async addFacility(facility: Omit<Facility, "id" | "siteId"> & { siteId: string, id?: string }): Promise<Facility> {
    const id = facility.id || `facility-${Date.now()}`;
    const isActive = facility.isActive !== undefined ? facility.isActive : true;

    await this.query(
        `INSERT INTO facilities (id, name, site_id, primary_sport_id, surface_type, latitude, longitude, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
         [id, facility.name, facility.siteId, facility.primarySportId, facility.surfaceType, facility.latitude, facility.longitude, isActive]
    );
    this.invalidateCache();
    return (await this.getFacility(id))!;
  }

  async updateFacility(id: string, data: Partial<Facility>): Promise<Facility | null> {
    const currentFacility = await this.getFacility(id);
    if (!currentFacility) return null;

    // No special address handling needed anymore    

    const keys = Object.keys(data).filter(k => k !== 'id' && k !== 'siteId');
    if (keys.length > 0) {
        const map: Record<string, string> = { 
            name: 'name', 
            primarySportId: 'primary_sport_id',
            surfaceType: 'surface_type',
            latitude: 'latitude',
            longitude: 'longitude',
            isActive: 'is_active'
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
