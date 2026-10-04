export interface Facility {
  id: string;
  name: string;
  siteId: string;
  supportedSportIds?: string[];
  /** `null` when not set, as the server sends it; send `null` to clear it. */
  surfaceType?: string | null;
  /** The facility's pin; `null` when it has none. */
  latitude?: number | null;
  longitude?: number | null;
  isActive?: boolean;
  category?: string;
  /** The starred sport, whose icon marks the facility on the map; `null` when none is starred. */
  primarySportId?: string | null;
}

