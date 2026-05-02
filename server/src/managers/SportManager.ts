import { Sport, getSportConfig, getConfiguredSportIds } from "@sk/types";
import { BaseManager } from "./BaseManager";

export class SportManager extends BaseManager {
  async getSports(): Promise<Sport[]> {
    // 1. Fetch basic info from DB
    const res = await this.query('SELECT id, name FROM sports');
    const dbSports = res.rows;
    
    // 2. Merge with shared registry configurations
    const sports: Sport[] = [];
    const configuredIds = getConfiguredSportIds();
    
    for (const dbSport of dbSports) {
      if (configuredIds.includes(dbSport.id)) {
        const config = await getSportConfig(dbSport.id);
        if (config) {
          // Merge registry data with DB name
          sports.push({ ...config, name: dbSport.name });
          continue;
        }
      }
      // Fallback for sports not yet migrated to the registry
      sports.push(dbSport);
    }
    
    return sports;
  }

  async getSport(id: string): Promise<Sport | undefined> {
    const res = await this.query('SELECT id, name FROM sports WHERE id = $1', [id]);
    const dbSport = res.rows[0];
    if (!dbSport) return undefined;

    const config = await getSportConfig(id);
    if (config) {
      return { ...config, name: dbSport.name };
    }
    
    return dbSport;
  }
}

export const sportManager = new SportManager();
