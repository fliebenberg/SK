import { Address } from "../Address";

export interface Site {
  id: string;
  name: string;
  addressId?: string;
  address?: Address;
  orgId: string;
  isActive?: boolean;
}
