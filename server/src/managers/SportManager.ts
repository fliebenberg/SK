import { Sport } from "@sk/types";
import { BaseManager } from "./BaseManager";

export class SportManager extends BaseManager {
  async getSports(): Promise<Sport[]> {
    const res = await this.query('SELECT id, name FROM sports');
    return res.rows;
  }

  async getSport(id: string): Promise<Sport | undefined> {
    const res = await this.query('SELECT id, name FROM sports WHERE id = $1', [id]);
    return res.rows[0];
  }
}

export const sportManager = new SportManager();
