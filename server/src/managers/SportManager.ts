import { Sport, getSportConfig, getConfiguredSportIds } from "@sk/types";
import { BaseManager } from "./BaseManager";

export class SportManager extends BaseManager {
  async getSports(): Promise<Sport[]> {
    // 1. Fetch info from DB
    const res = await this.query(
      `SELECT id, name, facility_term as "facilityTerm", period_term as "periodTerm", default_settings as "defaultSettings" 
       FROM sports`
    );
    const dbSports = res.rows;
    
    // 2. Merge with shared registry configurations
    const sports: Sport[] = [];
    const configuredIds = getConfiguredSportIds();
    
    for (const dbSport of dbSports) {
      if (configuredIds.includes(dbSport.id)) {
        const config = await getSportConfig(dbSport.id);
        if (config) {
          // Merge registry data with DB data (DB values take preference)
          sports.push({ 
            ...config, 
            name: dbSport.name,
            facilityTerm: dbSport.facilityTerm || config.facilityTerm,
            periodTerm: dbSport.periodTerm || config.periodTerm,
            defaultSettings: {
              ...config.defaultSettings,
              ...dbSport.defaultSettings,
              positions: dbSport.defaultSettings?.positions || config.defaultSettings?.positions || []
            }
          });
          continue;
        }
      }
      // Fallback for sports not yet migrated to the registry
      sports.push(dbSport);
    }
    
    return sports;
  }

  async getSport(id: string): Promise<Sport | undefined> {
    const res = await this.query(
      `SELECT id, name, facility_term as "facilityTerm", period_term as "periodTerm", default_settings as "defaultSettings" 
       FROM sports WHERE id = $1`, 
      [id]
    );
    const dbSport = res.rows[0];
    if (!dbSport) return undefined;

    const config = await getSportConfig(id);
    if (config) {
      return { 
        ...config, 
        name: dbSport.name,
        facilityTerm: dbSport.facilityTerm || config.facilityTerm,
        periodTerm: dbSport.periodTerm || config.periodTerm,
        defaultSettings: {
          ...config.defaultSettings,
          ...dbSport.defaultSettings,
          positions: dbSport.defaultSettings?.positions || config.defaultSettings?.positions || []
        }
      };
    }
    
    return dbSport;
  }

  async createSport(data: { id: string; name: string; facilityTerm: string; periodTerm: string; defaultSettings: any }): Promise<Sport | undefined> {
    await this.query(
      `INSERT INTO sports (id, name, facility_term, period_term, default_settings) 
       VALUES ($1, $2, $3, $4, $5)`,
      [data.id, data.name, data.facilityTerm, data.periodTerm, JSON.stringify(data.defaultSettings || {})]
    );
    return this.getSport(data.id);
  }

  async updateSport(id: string, data: { name: string; facilityTerm: string; periodTerm: string; defaultSettings: any }): Promise<Sport | undefined> {
    await this.query(
      `UPDATE sports 
       SET name = $1, facility_term = $2, period_term = $3, default_settings = $4 
       WHERE id = $5`,
      [data.name, data.facilityTerm, data.periodTerm, JSON.stringify(data.defaultSettings || {}), id]
    );
    return this.getSport(id);
  }
}

export const sportManager = new SportManager();
