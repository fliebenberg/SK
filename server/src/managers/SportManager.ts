import { Sport } from "@sk/types";
import { BaseManager } from "./BaseManager";

export class SportManager extends BaseManager {
  async getSports(): Promise<Sport[]> {
    // Fetch info strictly from DB including default_settings and event_templates
    const res = await this.query(
      `SELECT id, name, category_id as "categoryId", participant_type as "participantType", match_topology as "matchTopology", facility_term as "facilityTerm", period_term as "periodTerm", default_settings as "defaultSettings", event_templates as "eventTemplates" 
       FROM sports`
    );
    const dbSports = res.rows;
    
    return dbSports.map(dbSport => ({
      ...dbSport,
      facilityTerm: dbSport.facilityTerm || 'Field',
      periodTerm: dbSport.periodTerm || 'Period',
      defaultSettings: {
        ...(dbSport.defaultSettings || {}),
        positions: dbSport.defaultSettings?.positions || []
      },
      eventTemplates: dbSport.eventTemplates || []
    }));
  }

  async getSport(id: string): Promise<Sport | undefined> {
    const res = await this.query(
      `SELECT id, name, category_id as "categoryId", participant_type as "participantType", match_topology as "matchTopology", facility_term as "facilityTerm", period_term as "periodTerm", default_settings as "defaultSettings", event_templates as "eventTemplates" 
       FROM sports WHERE id = $1`, 
      [id]
    );
    const dbSport = res.rows[0];
    if (!dbSport) return undefined;

    return {
      ...dbSport,
      facilityTerm: dbSport.facilityTerm || 'Field',
      periodTerm: dbSport.periodTerm || 'Period',
      defaultSettings: {
        ...(dbSport.defaultSettings || {}),
        positions: dbSport.defaultSettings?.positions || []
      },
      eventTemplates: dbSport.eventTemplates || []
    };
  }

  async createSport(data: { id: string; name: string; facilityTerm: string; periodTerm: string; defaultSettings: any; eventTemplates?: any[] }): Promise<Sport | undefined> {
    await this.query(
      `INSERT INTO sports (id, name, facility_term, period_term, default_settings, event_templates) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [data.id, data.name, data.facilityTerm, data.periodTerm, JSON.stringify(data.defaultSettings || {}), JSON.stringify(data.eventTemplates || [])]
    );
    return this.getSport(data.id);
  }

  async updateSport(id: string, data: { name: string; facilityTerm: string; periodTerm: string; defaultSettings: any; eventTemplates?: any[] }): Promise<Sport | undefined> {
    await this.query(
      `UPDATE sports 
       SET name = $1, facility_term = $2, period_term = $3, default_settings = $4, event_templates = $5 
       WHERE id = $6`,
      [data.name, data.facilityTerm, data.periodTerm, JSON.stringify(data.defaultSettings || {}), JSON.stringify(data.eventTemplates || []), id]
    );
    return this.getSport(id);
  }
}

export const sportManager = new SportManager();
