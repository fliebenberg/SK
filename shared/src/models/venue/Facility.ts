export interface Facility {
  id: string;
  name: string;
  siteId: string;
  primarySportId?: string;
  surfaceType?: string;
  latitude?: number;
  longitude?: number;
}
