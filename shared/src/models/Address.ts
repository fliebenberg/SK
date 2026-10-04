export interface Address {
  id: string;
  fullAddress: string;
  /**
   * Unit, building or complex — "Unit 16, The Waves" — above the street, for an address that is
   * more than a street number. Optional, and filled from Google only when its result has a unit or
   * premise part; never from a place's name (VENUE-2).
   */
  building?: string;
  /** The street: "15 Foam Rd". */
  addressLine1?: string;
  /** The suburb or area. */
  addressLine2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * An address as the app sends it, inside a site's or an organisation's payload: no `id` (the server
 * keeps the one it has, or makes one), and a pin that `null` clears — a hand-typed address with no
 * pin sends nulls, so an old pin does not survive the edit.
 */
export type AddressPayload = Omit<Address, 'id' | 'latitude' | 'longitude'> & {
  latitude?: number | null;
  longitude?: number | null;
};
