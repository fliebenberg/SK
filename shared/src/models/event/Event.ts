export type EventType = 'SingleMatch' | 'SportsDay' | 'Tournament';

export interface Event {
  id: string;
  name: string;
  type?: EventType; // Optional for migration, will default to SingleMatch
  date?: string; // Legacy field
  startDate: string;
  endDate?: string;
  siteId?: string;
  facilityId?: string;
  orgId: string;
  participatingOrgIds?: string[];
  sportIds?: string[];
  settings?: {
    pointSystem?: 'standard' | 'weighted';
    pointsPerWin?: number;
    pointsPerDraw?: number;
    levelWeighting?: Record<string, number>;
    positions?: { id: string; name: string }[];
  };
  status?: 'Scheduled' | 'Cancelled' | 'Finished';
}
