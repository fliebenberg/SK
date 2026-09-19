import { EventSection, MatchTopology, Sport, SportParticipantType, getEventSections } from "@sk/shared";
import { BaseManager } from "./BaseManager";
import { ageGroupManager } from "./AgeGroupManager";

export interface SportWriteData {
  name: string;
  facilityTerm: string;
  periodTerm: string;
  participantType?: SportParticipantType;
  matchTopology?: MatchTopology;
  defaultSettings: any;
  eventSections?: EventSection[];
  eventTemplates?: any[];
}

export class SportManager extends BaseManager {
  async getSports(): Promise<Sport[]> {
    // Fetch info strictly from DB including default_settings and event_templates
    const res = await this.query(
      `SELECT id, name, category_id as "categoryId", participant_type as "participantType", match_topology as "matchTopology", facility_term as "facilityTerm", period_term as "periodTerm", default_settings as "defaultSettings", event_sections as "eventSections", event_templates as "eventTemplates" 
       FROM sports`
    );
    const dbSports = res.rows;
    const ageGroups = await ageGroupManager.getBySport();

    return dbSports.map(dbSport => ({
      ...dbSport,
      facilityTerm: dbSport.facilityTerm || 'Field',
      periodTerm: dbSport.periodTerm || 'Period',
      defaultSettings: {
        ...(dbSport.defaultSettings || {}),
        positions: dbSport.defaultSettings?.positions || []
      },
      // A sport that predates the column still has to render its panels, so sections are
      // derived from the sections its templates name when the column is empty.
      eventSections: getEventSections(dbSport),
      eventTemplates: dbSport.eventTemplates || [],
      ageGroups: ageGroups[dbSport.id] || []
    }));
  }

  async getSport(id: string): Promise<Sport | undefined> {
    const res = await this.query(
      `SELECT id, name, category_id as "categoryId", participant_type as "participantType", match_topology as "matchTopology", facility_term as "facilityTerm", period_term as "periodTerm", default_settings as "defaultSettings", event_sections as "eventSections", event_templates as "eventTemplates" 
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
      eventSections: getEventSections(dbSport),
      // No `ageGroups`: this is on the scoring path, which never needs them. Pickers read them
      // from `getSports`, and the sport editor from `ageGroupManager.getAdminList`.
      eventTemplates: dbSport.eventTemplates || []
    };
  }

  async createSport(data: SportWriteData & { id: string }): Promise<Sport | undefined> {
    await this.query(
      `INSERT INTO sports (id, name, facility_term, period_term, participant_type, match_topology, default_settings, event_sections, event_templates) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        data.id,
        data.name,
        data.facilityTerm,
        data.periodTerm,
        data.participantType || SportParticipantType.TEAM,
        data.matchTopology || MatchTopology.HEAD_TO_HEAD,
        JSON.stringify(data.defaultSettings || {}),
        JSON.stringify(data.eventSections || []),
        JSON.stringify(data.eventTemplates || [])
      ]
    );
    await ageGroupManager.addStarterList(data.id);
    return this.getSport(data.id);
  }

  /**
   * Updates a sport. Columns whose value is omitted keep what the row already holds — in
   * particular `event_sections` and `event_templates`, which a caller that only touches settings
   * does not send and must not clear.
   */
  async updateSport(id: string, data: SportWriteData): Promise<Sport | undefined> {
    await this.query(
      `UPDATE sports 
       SET name = $1, 
           facility_term = $2, 
           period_term = $3, 
           participant_type = COALESCE($4, participant_type), 
           match_topology = COALESCE($5, match_topology), 
           default_settings = $6, 
           event_sections = COALESCE($7::jsonb, event_sections), 
           event_templates = COALESCE($8::jsonb, event_templates) 
       WHERE id = $9`,
      [
        data.name,
        data.facilityTerm,
        data.periodTerm,
        data.participantType || null,
        data.matchTopology || null,
        JSON.stringify(data.defaultSettings || {}),
        data.eventSections ? JSON.stringify(data.eventSections) : null,
        data.eventTemplates ? JSON.stringify(data.eventTemplates) : null,
        id
      ]
    );
    return this.getSport(id);
  }
}

export const sportManager = new SportManager();
