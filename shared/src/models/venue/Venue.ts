import { Address } from "../Address";

export interface Venue {
  id: string;
  name: string;
  addressId?: string;
  address?: Address;
  orgId: string;
}
