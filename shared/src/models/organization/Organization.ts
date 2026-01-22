export interface Organization {
  id: string;
  name: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  supportedSportIds: string[];
  shortName?: string;
  supportedRoleIds?: string[];
}
