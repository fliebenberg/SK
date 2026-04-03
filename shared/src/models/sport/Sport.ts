export interface SportSettings {
  positions?: { id: string, name: string }[];
  maxReserves?: number;
  periodLengthMS?: number;
  periods?: number;
}

export interface Sport {
  id: string;
  name: string;
  categoryId?: string;
  participantType?: 'TEAM' | 'INDIVIDUAL';
  matchTopology?: 'HEAD_TO_HEAD' | 'MULTI_COMPETITOR';
  defaultSettings?: SportSettings;
  facilityTerm?: string;
  periodTerm?: string;
}
