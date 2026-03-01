import { Address } from "@sk/types";
import { BaseManager } from "./BaseManager";

export class AddressManager extends BaseManager {
  async getAddress(id: string): Promise<Address | undefined> {
    const res = await this.query(`
      SELECT 
        id, 
        full_address as "fullAddress", 
        address_line_1 as "addressLine1", 
        address_line_2 as "addressLine2", 
        city, 
        province, 
        postal_code as "postalCode", 
        country, 
        latitude, 
        longitude 
      FROM addresses 
      WHERE id = $1
    `, [id]);
    return res.rows[0];
  }

  async addAddress(address: Omit<Address, "id"> & { id?: string }): Promise<Address> {
    const id = address.id || `addr-${Date.now()}`;
    const res = await this.query(`
      INSERT INTO addresses (id, full_address, address_line_1, address_line_2, city, province, postal_code, country, latitude, longitude)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, full_address as "fullAddress", address_line_1 as "addressLine1", address_line_2 as "addressLine2", city, province, postal_code as "postalCode", country, latitude, longitude
    `, [
      id, 
      address.fullAddress, 
      address.addressLine1, 
      address.addressLine2, 
      address.city, 
      address.province, 
      address.postalCode, 
      address.country, 
      address.latitude, 
      address.longitude
    ]);
    return res.rows[0];
  }

  async updateAddress(id: string, data: Partial<Address>): Promise<Address | null> {
    const keys = Object.keys(data).filter(k => k !== 'id');
    if (keys.length === 0) return this.getAddress(id).then(r => r || null);

    const map: Record<string, string> = {
      fullAddress: 'full_address',
      addressLine1: 'address_line_1',
      addressLine2: 'address_line_2',
      city: 'city',
      province: 'province',
      postalCode: 'postal_code',
      country: 'country',
      latitude: 'latitude',
      longitude: 'longitude'
    };

    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    keys.forEach(key => {
      if (map[key]) {
        setClauses.push(`${map[key]} = $${idx}`);
        values.push((data as any)[key]);
        idx++;
      }
    });

    if (setClauses.length === 0) return this.getAddress(id).then(r => r || null);
    values.push(id);

    const res = await this.query(
      `UPDATE addresses SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, full_address as "fullAddress", address_line_1 as "addressLine1", address_line_2 as "addressLine2", city, province, postal_code as "postalCode", country, latitude, longitude`,
      values
    );
    return res.rows[0] || null;
  }

  async deleteAddress(id: string): Promise<void> {
    await this.query('DELETE FROM addresses WHERE id = $1', [id]);
  }
}

export const addressManager = new AddressManager();
