import { PoolClient } from 'pg';

/**
 * Migration: the database can hold a tournament.
 *
 * Tournaments Phase 1. Implements docs/tournaments-data-model.md §3, §4 and §9, and closes
 * `FIX-1` and `FIX-10` from TODO.md. No server or client code reads any of this yet.
 *
 * ---------------------------------------------------------------------------------------------
 * The census this migration was written against (Phase 0, step 2, re-run 2026-09-01 immediately
 * before this file was executed), which is what makes the omissions below safe:
 *
 *     SELECT type, COUNT(*) FROM events GROUP BY type;   ->   SingleMatch = 1
 *     count(*) FILTER (WHERE type IS NULL)               ->   0
 *
 * No `SportsDay` rows, no `Tournament` rows, no untyped rows. So:
 *
 *   - the D1 rewrite in step 4 and the `FIX-1` backfill in step 5 both process zero rows here,
 *     and are kept only because a database that is not this one may hold such rows;
 *   - the divisions/entrants/stage backfill that an earlier draft of §9 proposed stays dropped —
 *     there is nothing to convert (data model §9, "The step that is probably unnecessary").
 *
 * Every statement is re-runnable. `ADD CONSTRAINT` is the exception — Postgres has no
 * `IF NOT EXISTS` for it — so each one is guarded on `pg_constraint`.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md. A fresh database is
 * built from that file and never runs this one; the Phase 1 exit criterion diffs the two schemas.
 * ---------------------------------------------------------------------------------------------
 */

/**
 * Phase 0 measured 8 `game_participants` rows pointing at a `game_id` that is no longer in
 * `games`. Step 10 deletes them — the one destructive statement in an otherwise schema-only
 * migration, included because `FIX-10` was scheduled into this phase at the user's request.
 *
 * If a run finds more than that, something is deleting games without their participants and this
 * migration stops rather than tidying the evidence away.
 */
const EXPECTED_ORPHAN_PARTICIPANTS = 8;

/** `pg_constraint.confdeltype` codes, for reading an existing foreign key's ON DELETE action. */
const ON_DELETE_CODE: Record<string, string> = {
  'NO ACTION': 'a',
  RESTRICT: 'r',
  CASCADE: 'c',
  'SET NULL': 'n',
  'SET DEFAULT': 'd',
};

/** Add a named constraint only if one of that name is not already on the table. */
const addConstraintIfAbsent = async (
  client: PoolClient,
  table: string,
  name: string,
  definition: string
) => {
  const { rows } = await client.query(
    `SELECT 1 FROM pg_constraint WHERE conname = $1 AND conrelid = $2::regclass`,
    [name, table]
  );
  if (rows.length > 0) return;
  await client.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} ${definition}`);
};

/**
 * Converge a column on exactly one foreign key, with exactly one ON DELETE action.
 *
 * Guarding on the constraint *name* alone is not enough here. `game_participants` carries no
 * foreign keys at all in the working database, but a database built from an older `init-db.ts`
 * has them under Postgres' auto-generated names (`game_participants_team_id_fkey`) and with the
 * wrong action — so a name check would happily add a second, duplicate key beside the first.
 * Look the column up instead, and replace whatever is there if it does not already say what this
 * migration wants it to say.
 */
const ensureForeignKey = async (
  client: PoolClient,
  opts: {
    table: string;
    column: string;
    references: string;
    name: string;
    onDelete: keyof typeof ON_DELETE_CODE;
  }
) => {
  const { table, column, references, name, onDelete } = opts;
  const wanted = ON_DELETE_CODE[onDelete];

  const { rows } = await client.query(
    `SELECT c.conname, c.confdeltype
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f'
        AND c.conrelid = $1::regclass
        AND a.attname = $2
        AND array_length(c.conkey, 1) = 1`,
    [table, column]
  );

  const alreadyCorrect = rows.some(
    (r: { conname: string; confdeltype: string }) => r.conname === name && r.confdeltype === wanted
  );
  if (alreadyCorrect && rows.length === 1) return;

  for (const row of rows) {
    await client.query(`ALTER TABLE ${table} DROP CONSTRAINT ${row.conname}`);
  }
  await client.query(
    `ALTER TABLE ${table}
       ADD CONSTRAINT ${name} FOREIGN KEY (${column}) REFERENCES ${references} ON DELETE ${onDelete}`
  );
};

export const up = async (client: PoolClient) => {
  // -------------------------------------------------------------------------------------------
  // 1. The nine new tables (data model §3). Divisions and stages come first: `game_participants`
  //    gains foreign keys onto both in step 2.
  // -------------------------------------------------------------------------------------------
  await client.query(`
    CREATE TABLE IF NOT EXISTS tournament_divisions (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sport_id TEXT REFERENCES sports(id),
        age_group TEXT,
        scoring_subject TEXT,           -- 'Team' | 'Organisation'; NULL inherits the event
        weighting NUMERIC(6,3) NOT NULL DEFAULT 1.0,
        settings JSONB DEFAULT '{}'::jsonb,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_divisions_event ON tournament_divisions(event_id);`
  );

  await client.query(`
    CREATE TABLE IF NOT EXISTS division_stages (
        id TEXT PRIMARY KEY,
        division_id TEXT NOT NULL REFERENCES tournament_divisions(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        format TEXT NOT NULL,           -- 'Festival' | 'RoundRobin' | 'Knockout' | 'Plate' | 'Swiss'
        sequence INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
                                        -- 'Pending' | 'Ready' | 'InProgress' | 'Complete'
        earliest_start TIMESTAMPTZ,     -- D15: the knockout may not start before day 2
        settings JSONB DEFAULT '{}'::jsonb,
        cached_standings JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (division_id, sequence)
    );
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_division_stages_division ON division_stages(division_id);`
  );

  await client.query(`
    CREATE TABLE IF NOT EXISTS division_entrants (
        id TEXT PRIMARY KEY,
        division_id TEXT NOT NULL REFERENCES tournament_divisions(id) ON DELETE CASCADE,
        team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
        org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE SET NULL,
        org_id TEXT REFERENCES organizations(id),
        label TEXT,                     -- shown while unresolved: 'TBC — awaiting confirmation'
        seed INTEGER,
        status TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'withdrawn'
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT entrant_is_team_or_person CHECK (team_id IS NULL OR org_profile_id IS NULL)
    );
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_division_entrants_division ON division_entrants(division_id);`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_division_entrants_org ON division_entrants(org_id);`
  );

  await client.query(`
    CREATE TABLE IF NOT EXISTS stage_entrants (
        stage_id TEXT REFERENCES division_stages(id) ON DELETE CASCADE,
        entrant_id TEXT REFERENCES division_entrants(id) ON DELETE CASCADE,
        pool_key TEXT,                  -- 'A', 'B'; NULL when the stage has no pools
        seed INTEGER,
        sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (stage_id, entrant_id)
    );
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_stage_entrants_stage ON stage_entrants(stage_id);`
  );

  await client.query(`
    CREATE TABLE IF NOT EXISTS event_facilities (
        event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
        facility_id TEXT REFERENCES facilities(id) ON DELETE CASCADE,
        PRIMARY KEY (event_id, facility_id)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS division_facilities (
        division_id TEXT REFERENCES tournament_divisions(id) ON DELETE CASCADE,
        facility_id TEXT REFERENCES facilities(id) ON DELETE CASCADE,
        PRIMARY KEY (division_id, facility_id)
    );
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_division_facilities_division ON division_facilities(division_id);`
  );

  await client.query(`
    CREATE TABLE IF NOT EXISTS division_adjustments (
        id TEXT PRIMARY KEY,
        division_id TEXT NOT NULL REFERENCES tournament_divisions(id) ON DELETE CASCADE,
        entrant_id TEXT NOT NULL REFERENCES division_entrants(id) ON DELETE CASCADE,
        points_delta NUMERIC(6,2) NOT NULL DEFAULT 0,
        reason TEXT NOT NULL,
        created_by_user_id TEXT REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_division_adjustments_division ON division_adjustments(division_id);`
  );

  // The two organiser tables (data model §3.7, implementation plan §0.1). They are in this
  // migration rather than Phase 4's because adding a table later is cheap, but discovering in
  // Phase 4 that this migration has already run in a deployed environment is not.
  //
  // Grants reference `org_profiles`, never `users`: `AccessManager` resolves a user into a set of
  // profile ids, so a person with no account yet can still be appointed, and the grant needs no
  // rewrite when they later claim it.
  await client.query(`
    CREATE TABLE IF NOT EXISTS event_organizers (
        event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
        org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE CASCADE,
        granted_by_org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (event_id, org_profile_id)
    );
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_event_organizers_profile ON event_organizers(org_profile_id);`
  );

  await client.query(`
    CREATE TABLE IF NOT EXISTS division_organizers (
        division_id TEXT REFERENCES tournament_divisions(id) ON DELETE CASCADE,
        org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE CASCADE,
        granted_by_org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (division_id, org_profile_id)
    );
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_division_organizers_profile ON division_organizers(org_profile_id);`
  );

  // -------------------------------------------------------------------------------------------
  // 2. `game_participants` learns where a side came from (data model §4.1).
  //
  //    All four are null for every existing row and for every single match, so nothing that reads
  //    this table today changes behaviour. `SET NULL` throughout and deliberately: `CASCADE` on
  //    `source_stage_id` would delete one side of a fixture when a stage was removed.
  // -------------------------------------------------------------------------------------------
  await client.query(`
    ALTER TABLE game_participants ADD COLUMN IF NOT EXISTS entrant_id TEXT
        REFERENCES division_entrants(id) ON DELETE SET NULL;
    ALTER TABLE game_participants ADD COLUMN IF NOT EXISTS source_game_id TEXT
        REFERENCES games(id) ON DELETE SET NULL;
    ALTER TABLE game_participants ADD COLUMN IF NOT EXISTS source_stage_id TEXT
        REFERENCES division_stages(id) ON DELETE SET NULL;
    ALTER TABLE game_participants ADD COLUMN IF NOT EXISTS source_rule JSONB;
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_game_participants_entrant ON game_participants(entrant_id);`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_game_participants_source_game ON game_participants(source_game_id);`
  );

  // -------------------------------------------------------------------------------------------
  // 3. `events` gains a format and a standings cache (data model §4.2).
  //
  //    `format` is a column rather than a settings key (implementation plan §0.2): after D1 it
  //    carries more meaning than `type` does, and an unconstrained string in a blob would have sat
  //    badly beside step 8 making `type` NOT NULL in the same migration. `cached_standings`
  //    follows the `seasons.cached_standings` precedent exactly — it is data, not configuration.
  // -------------------------------------------------------------------------------------------
  await client.query(`
    ALTER TABLE events ADD COLUMN IF NOT EXISTS cached_standings JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS format TEXT;
  `);

  // -------------------------------------------------------------------------------------------
  // 4. The `SportsDay` rewrite (D1) — in place, no alias. A sports day *is* a festival-format
  //    tournament, and keeping two words for one thing is what produced the duplicated event
  //    screens this feature exists to consolidate.
  // -------------------------------------------------------------------------------------------
  const rewritten = await client.query(`
    UPDATE events SET type = 'Tournament', format = COALESCE(format, 'Festival')
     WHERE type = 'SportsDay'
  `);
  console.log(`  D1: ${rewritten.rowCount} SportsDay row(s) rewritten to Tournament/Festival.`);

  // -------------------------------------------------------------------------------------------
  // 5. Backfill `format` for containers that already said `Tournament`, and `type` for any untyped
  //    row (`FIX-1`). Both are no-ops against the census above; they exist for a database that is
  //    not this one. `Festival` is the right default for a legacy container — it is the format
  //    that assumes least about structure.
  // -------------------------------------------------------------------------------------------
  const promoted = await client.query(`
    UPDATE events SET format = settings->>'format'
     WHERE format IS NULL AND settings ? 'format' AND settings->>'format' IS NOT NULL
  `);
  const defaulted = await client.query(`
    UPDATE events SET format = 'Festival' WHERE type = 'Tournament' AND format IS NULL
  `);
  const typed = await client.query(`
    UPDATE events SET type = 'SingleMatch' WHERE type IS NULL
  `);
  console.log(
    `  format: ${promoted.rowCount} promoted from settings, ${defaulted.rowCount} defaulted; ` +
      `type: ${typed.rowCount} untyped row(s) backfilled (FIX-1).`
  );

  // -------------------------------------------------------------------------------------------
  // 6. Backfill `event_facilities` from each event's existing single `facility_id`, which stays
  //    where it is — for a `SingleMatch` one facility is the whole story (data model §3.5).
  // -------------------------------------------------------------------------------------------
  const facilities = await client.query(`
    INSERT INTO event_facilities (event_id, facility_id)
    SELECT id, facility_id FROM events WHERE facility_id IS NOT NULL
    ON CONFLICT DO NOTHING
  `);
  console.log(`  event_facilities backfilled: ${facilities.rowCount} row(s).`);

  // -------------------------------------------------------------------------------------------
  // 7. Drop the superseded settings keys. `pointSystem` and `levelWeighting` are replaced by
  //    `settings.scoring` and `tournament_divisions.weighting` (D18), and nothing reads them.
  //    `format` goes too, now that step 3 has given it a column and step 5 has promoted any value
  //    a row acquired there before that decision.
  // -------------------------------------------------------------------------------------------
  const dropped = await client.query(`
    UPDATE events SET settings = settings - 'pointSystem' - 'levelWeighting' - 'format'
     WHERE settings ?| array['pointSystem', 'levelWeighting', 'format']
  `);
  console.log(`  events.settings: ${dropped.rowCount} row(s) had superseded keys removed.`);

  // -------------------------------------------------------------------------------------------
  // 8. Constrain `events.type` (U39 / `FIX-1`). Last of the `events` work, because it is only safe
  //    once steps 4 and 5 have left every row with a value this CHECK admits. An event without a
  //    type should not exist, so stop defaulting it and start refusing it.
  // -------------------------------------------------------------------------------------------
  await client.query(`ALTER TABLE events ALTER COLUMN type SET NOT NULL;`);
  await addConstraintIfAbsent(
    client,
    'events',
    'events_type_check',
    `CHECK (type IN ('SingleMatch', 'Tournament'))`
  );

  // -------------------------------------------------------------------------------------------
  // 9. `seasons.settings` default -> 3/1/0 (D17). New rows only: existing seasons store their
  //    values explicitly, so no league's table moves. The shape is now the same `ScoringSystem` a
  //    tournament uses (D19), which is the point — the same configuration means the same thing in
  //    both places.
  // -------------------------------------------------------------------------------------------
  await client.query(`
    ALTER TABLE seasons ALTER COLUMN settings
        SET DEFAULT '{"pointsPerWin": 3, "pointsPerDraw": 1, "pointsPerLoss": 0}'::jsonb;
  `);

  // -------------------------------------------------------------------------------------------
  // 10. `FIX-10` — give `game_participants` its foreign keys. Clean, then constrain: the table has
  //     never had them, and the working database holds rows pointing at games that no longer
  //     exist, so adding the constraints over the data as it stands would simply fail.
  //
  //     Note the asymmetry, because it is the point. (b) is ordinary schema work; (a) DELETES
  //     ROWS, which nothing else in this migration does, and it reports the count first — a
  //     migration that silently deletes rows is worse than one that stops.
  // -------------------------------------------------------------------------------------------
  const { rows: orphanRows } = await client.query(`
    SELECT count(*)::int AS n
      FROM game_participants gp
     WHERE NOT EXISTS (SELECT 1 FROM games g WHERE g.id = gp.game_id)
  `);
  const orphans: number = orphanRows[0].n;
  console.log(`  FIX-10: ${orphans} orphaned game_participants row(s) found.`);

  if (orphans > EXPECTED_ORPHAN_PARTICIPANTS) {
    throw new Error(
      `FIX-10: found ${orphans} orphaned game_participants rows, but Phase 0 measured ` +
        `${EXPECTED_ORPHAN_PARTICIPANTS}. A jump means something is deleting games without their ` +
        `participants — that is a bug to find, not data to tidy. Stop and look before re-running.`
    );
  }

  if (orphans > 0) {
    await client.query(`
      DELETE FROM game_participants gp
       WHERE NOT EXISTS (SELECT 1 FROM games g WHERE g.id = gp.game_id)
    `);
    console.log(`  FIX-10: deleted ${orphans} orphaned row(s).`);
  }

  // Cascade only where the row is meaningless without its parent — which a participant is,
  // relative to its game. The other two are references, not ownership: deleting a team must not
  // delete the fixtures it played, and `team_id` is already nullable because a tournament side can
  // be an unresolved rule (data model §2.0). `RESTRICT` is rejected for the same reason — it would
  // make a team undeletable for the lifetime of its results.
  await ensureForeignKey(client, {
    table: 'game_participants',
    column: 'game_id',
    references: 'games(id)',
    name: 'game_participants_game_fk',
    onDelete: 'CASCADE',
  });
  await ensureForeignKey(client, {
    table: 'game_participants',
    column: 'team_id',
    references: 'teams(id)',
    name: 'game_participants_team_fk',
    onDelete: 'SET NULL',
  });
  await ensureForeignKey(client, {
    table: 'game_participants',
    column: 'org_profile_id',
    references: 'org_profiles(id)',
    name: 'game_participants_profile_fk',
    onDelete: 'SET NULL',
  });
};
