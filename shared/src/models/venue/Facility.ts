import { Address } from "../Address";

export interface Facility {
  id: string;
  name: string;
  siteId: string;
  primarySportId?: string;
  addressId?: string;
  address?: Address;
  surfaceType?: string;
}
