import { Facility } from "@sk/types";
import { BaseManager } from "./BaseManager";
import { addressManager } from "./AddressManager";

export class FacilityManager extends BaseManager {
  private facilityCache: Facility[] | null = null;

  async getFacilities(siteId?: string): Promise<Facility[]> {
    let queryText = `
        SELECT f.id, f.name, f.site_id as "siteId", 
               ARRAY(SELECT sport_id FROM facility_sports WHERE facility_id = f.id) as "supportedSportIds",
               f.surface_type as "surfaceType", f.latitude, f.longitude, f.is_active as "isActive",
               f.category, f.primary_sport_id as "primarySportId"
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

  async getFacilitiesByOrg(orgId: string): Promise<Facility[]> {
    const res = await this.query(`
        SELECT f.id, f.name, f.site_id as "siteId", 
               ARRAY(SELECT sport_id FROM facility_sports WHERE facility_id = f.id) as "supportedSportIds",
               f.surface_type as "surfaceType", f.latitude, f.longitude, f.is_active as "isActive",
               f.category, f.primary_sport_id as "primarySportId"
        FROM facilities f
        JOIN sites s ON f.site_id = s.id
        WHERE s.org_id = $1
    `, [orgId]);
    return res.rows;
  }

  async getFacility(id: string): Promise<Facility | undefined> {
    const res = await this.query(`
        SELECT f.id, f.name, f.site_id as "siteId", 
               ARRAY(SELECT sport_id FROM facility_sports WHERE facility_id = f.id) as "supportedSportIds",
               f.surface_type as "surfaceType", f.latitude, f.longitude, f.is_active as "isActive",
               f.category, f.primary_sport_id as "primarySportId"
        FROM facilities f
        WHERE f.id = $1
    `, [id]);
    
    return res.rows[0];
  }

  async addFacility(facility: Omit<Facility, "id" | "siteId"> & { siteId: string, id?: string }): Promise<Facility> {
    const id = facility.id || `facility-${Date.now()}`;
    const isActive = facility.isActive !== undefined ? facility.isActive : true;
    const category = facility.category || 'other';
    const primarySportId = facility.primarySportId || null;

    await this.query('BEGIN');
    try {
        await this.query(
            `INSERT INTO facilities (id, name, site_id, surface_type, latitude, longitude, is_active, category, primary_sport_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
             [id, facility.name, facility.siteId, facility.surfaceType, facility.latitude, facility.longitude, isActive, category, primarySportId]
        );

        if (facility.supportedSportIds && facility.supportedSportIds.length > 0) {
            for (const sportId of facility.supportedSportIds) {
                await this.query(
                    `INSERT INTO facility_sports (facility_id, sport_id) VALUES ($1, $2)`,
                    [id, sportId]
                );
            }
        }
        await this.query('COMMIT');
    } catch (error) {
        await this.query('ROLLBACK');
        throw error;
    }

    this.invalidateCache();
    return (await this.getFacility(id))!;
  }

  async updateFacility(id: string, data: Partial<Facility>): Promise<Facility | null> {
    const currentFacility = await this.getFacility(id);
    if (!currentFacility) return null;

    await this.query('BEGIN');
    try {
        const supportedSportIds = data.supportedSportIds;
        delete data.supportedSportIds;

        const keys = Object.keys(data).filter(k => k !== 'id' && k !== 'siteId');
        if (keys.length > 0) {
            const map: Record<string, string> = { 
                name: 'name', 
                surfaceType: 'surface_type',
                latitude: 'latitude',
                longitude: 'longitude',
                isActive: 'is_active',
                category: 'category',
                primarySportId: 'primary_sport_id'
            };
            const clauses: string[] = [];
            const values: any[] = [];
            let idx = 1;
            keys.forEach(k => {
                if (map[k] !== undefined) {
                    clauses.push(`${map[k]} = $${idx}`);
                    values.push((data as any)[k]);
                    idx++;
                }
            });
            values.push(id);
            await this.query(`UPDATE facilities SET ${clauses.join(', ')} WHERE id = $${idx}`, values);
        }

        if (supportedSportIds !== undefined) {
            await this.query('DELETE FROM facility_sports WHERE facility_id = $1', [id]);
            if (supportedSportIds.length > 0) {
                for (const sportId of supportedSportIds) {
                    await this.query('INSERT INTO facility_sports (facility_id, sport_id) VALUES ($1, $2)', [id, sportId]);
                }
            }
        }

        await this.query('COMMIT');
    } catch (error) {
        await this.query('ROLLBACK');
        throw error;
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

    await this.query('BEGIN');
    try {
        await this.query('DELETE FROM facility_sports WHERE facility_id = $1', [id]);
        await this.query('DELETE FROM facilities WHERE id = $1', [id]);
        await this.query('COMMIT');
    } catch (error) {
        await this.query('ROLLBACK');
        throw error;
    }

    this.invalidateCache();
    return facility;
  }

  invalidateCache() {
    this.facilityCache = null;
  }
}

export const facilityManager = new FacilityManager();
