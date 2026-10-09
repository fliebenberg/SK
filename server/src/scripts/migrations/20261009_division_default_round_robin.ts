import { PoolClient } from 'pg';

/**
 * Migration: divisions that were never given a format become round robin (`FIX-27`).
 *
 * **Data only — no schema change**, so there is nothing to mirror into `setup/init-db.ts`.
 *
 * Every division was created with one `Festival` stage, because every tournament is created a
 * Festival and a division took its first stage from that. Since `FIX-27` a `Festival` stage means
 * **set fixtures by hand** — no draw — and is something an organiser chooses; a division nobody
 * chose a format for starts as round robin (`defaultDivisionFormat`). So the divisions still in that
 * untouched state move over: **exactly one stage, a `Festival`, and no fixtures**. A division with
 * fixtures keeps its `Festival` stage — those fixtures were drawn or added under it — and a
 * division with any other shape was set up on purpose.
 *
 * Agreed 2026-10-09; at the time only test and development data existed.
 */
export const up = async (client: PoolClient) => {
  const res = await client.query(`
    UPDATE division_stages s
       SET format = 'RoundRobin', name = 'Round Robin', updated_at = NOW()
     WHERE s.format = 'Festival'
       AND (SELECT count(*) FROM division_stages o WHERE o.division_id = s.division_id) = 1
       AND NOT EXISTS (SELECT 1 FROM games g WHERE g.stage_id = s.id)
  `);
  console.log(`  ${res.rowCount ?? 0} division(s) with no format set became round robin.`);
};
