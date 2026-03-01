import { Address } from "../Address";

export interface Organization {
  id: string;
  name: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  supportedSportIds: string[];
  shortName?: string;
  supportedRoleIds?: string[];
  addressId?: string;
  address?: Address;
  teamCount?: number;
  siteCount?: number;
  eventCount?: number;
  memberCount?: number;
  isClaimed?: boolean;
  creatorId?: string;
  isActive?: boolean;
  settings?: Record<string, any>;
}
