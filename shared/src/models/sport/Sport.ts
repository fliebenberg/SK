export interface Sport {
  id: string;
  name: string;
  categoryId?: string;
  participantType?: 'TEAM' | 'INDIVIDUAL';
  matchTopology?: 'HEAD_TO_HEAD' | 'MULTI_COMPETITOR';
  defaultSettings?: any;
  facilityTerm?: string;
}
