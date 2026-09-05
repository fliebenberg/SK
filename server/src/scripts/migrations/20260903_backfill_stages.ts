import { PoolClient } from 'pg';
import { stagePlanForFormat } from '@sk/shared';
import { v4 as uuidv4 } from 'uuid';

/**
 * Migration: every tournament division has a stage, and every tournament fixture is in one.
 *
 * Tournaments Phase 6. **Data only — no schema change**, so there is nothing to mirror into
 * `setup/init-db.ts`: a database built from scratch has no rows to fix.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS CLOSES
 *
 * `PEOPLE-3`: `AccessManager.getGameDivisionId` resolves a fixture's division through
 * `games.stage_id`, so a tournament fixture in no stage belongs to no division — and a convenor
 * can neither read nor score it while the event's organisers can. Phase 5 answered the design
 * question (*a fixture should always have a stage*) and made it true going forward: a tournament
 * is now created with its first division **and** that division's stages. Phase 6 closes the
 * client half (`FIX-12`, so a hand-added fixture names its stage).
 *
 * That leaves the rows that already exist, which is what this is for. Two backfills:
 *
 *   1. **Stageless divisions** get the stages their event's format implies, from the same
 *      `stagePlanForFormat` the `ADD_EVENT` handler uses. One function, so a division created
 *      before Phase 5 ends up indistinguishable from one created after it.
 *
 *   2. **Stageless fixtures** are attached to their division's first stage — but only where the
 *      answer is unambiguous, which means an event with **exactly one** division. With several,
 *      nothing in the row says which one the fixture belonged to, and guessing would put a
 *      fixture in a table it never counted toward. Those are **reported and left alone** for a
 *      human to place; the division panel and the event screen both show them, which is Phase 5
 *      deliberately preferring a visible orphan to an invisible one.
 *
 * Only tournaments are touched. A `SingleMatch` event has no divisions and its fixture correctly
 * belongs to no stage — that is not the state this is fixing.
 * ---------------------------------------------------------------------------------------------
 */
export const up = async (client: PoolClient) => {
  // 1. Divisions with no stages at all.
  const { rows: stageless } = await client.query(`
    SELECT d.id, d.name, e.format
      FROM tournament_divisions d
      JOIN events e ON e.id = d.event_id
     WHERE NOT EXISTS (SELECT 1 FROM division_stages s WHERE s.division_id = d.id)
     ORDER BY d.event_id, d.sort_order
  `);

  let stagesCreated = 0;
  for (const division of stageless) {
    for (const stage of stagePlanForFormat(division.format)) {
      await client.query(
        `INSERT INTO division_stages (id, division_id, name, format, sequence, status)
         VALUES ($1, $2, $3, $4, $5, 'Pending')
         ON CONFLICT (division_id, sequence) DO NOTHING`,
        [`stg-${uuidv4()}`, division.id, stage.name, stage.format, stage.sequence]
      );
      stagesCreated++;
    }
  }
  console.log(
    `  ${stageless.length} division(s) had no stages; ${stagesCreated} stage(s) created.`
  );

  // 2. Fixtures in no stage, on an event with exactly one division.
  const placed = await client.query(`
    UPDATE games g
       SET stage_id = chosen.stage_id
      FROM (
        SELECT d.event_id,
               (SELECT s.id FROM division_stages s
                 WHERE s.division_id = d.id ORDER BY s.sequence LIMIT 1) AS stage_id
          FROM tournament_divisions d
         WHERE (SELECT count(*) FROM tournament_divisions d2 WHERE d2.event_id = d.event_id) = 1
      ) AS chosen
     WHERE g.event_id = chosen.event_id
       AND g.stage_id IS NULL
       AND chosen.stage_id IS NOT NULL
     RETURNING g.id
  `);

  const { rows: ambiguous } = await client.query(`
    SELECT count(*)::int AS n
      FROM games g
     WHERE g.stage_id IS NULL
       AND EXISTS (SELECT 1 FROM tournament_divisions d WHERE d.event_id = g.event_id)
  `);

  console.log(`  ${placed.rowCount} orphaned fixture(s) attached to their division's first stage.`);
  if (ambiguous[0].n > 0) {
    console.log(
      `  ${ambiguous[0].n} fixture(s) remain in no stage, on events with more than one division. ` +
        `Nothing in the row says which division they belonged to, so they are left visible for ` +
        `an organiser to place rather than guessed at.`
    );
  }
};
