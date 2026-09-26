import { Address } from "../Address";
import type { TimeZone } from "../../utils/zonedTime";

export interface Site {
  id: string;
  name: string;
  addressId?: string;
  address?: Address;
  orgId: string;
  isActive?: boolean;
  /**
   * The venue's timezone, looked up by the server from the address pin whenever it is saved and
   * never set any other way (`DATE-2`). `null` when there is no pin or the lookup found nothing:
   * the venue then keeps its organisation's timezone. Resolve the two with `venueTimeZone` in the
   * app's `utils/dates.ts`, not by hand.
   */
  timezone?: TimeZone | null;
}
