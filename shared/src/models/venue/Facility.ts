export interface Facility {
  id: string;
  name: string;
  siteId: string;
  supportedSportIds?: string[];
  surfaceType?: string;
  latitude?: number;
  longitude?: number;
  isActive?: boolean;
  category?: string;
  primarySportId?: string;
}

