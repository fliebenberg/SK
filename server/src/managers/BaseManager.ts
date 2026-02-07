import { query } from "../db";

export class BaseManager {
  protected async query(text: string, params?: any[]) {
    return query(text, params);
  }

  // Any other shared utilities like transaction helpers can go here later
}
