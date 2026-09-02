import pool, { query } from "../db";
import type { PoolClient } from "pg";

/** The subset of a `PoolClient` a transactional block needs: run a statement on *this* connection. */
export type Tx = (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number | null }>;

export class BaseManager {
  protected async query(text: string, params?: any[]) {
    return query(text, params);
  }

  /**
   * Run a block of statements as one transaction.
   *
   * **Use this rather than `this.query('BEGIN')`.** `query` goes through the pool, which hands out
   * a possibly different connection per call — so `BEGIN`, the writes and `COMMIT` can each land
   * on a different backend, and the "transaction" is neither atomic nor rolled back by the
   * `ROLLBACK` that follows a throw. This checks out **one** client and runs everything on it.
   *
   * The block is handed a `Tx` rather than the client itself, so nothing inside can release the
   * connection or start a nested transaction by accident.
   *
   * (`EventManager` and `LeagueManager` still contain the pooled `BEGIN`/`COMMIT` pattern in
   * several places; that is `TX-1` in TODO.md, deliberately not swept up here.)
   */
  protected async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn((text, params) => client.query(text, params));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      // A failed ROLLBACK must not mask the error that caused it.
      await client.query('ROLLBACK').catch(rollbackErr =>
        console.error('[BaseManager] ROLLBACK failed:', rollbackErr)
      );
      throw err;
    } finally {
      client.release();
    }
  }

  // Any other shared utilities can go here later
}
