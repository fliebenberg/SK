import { PoolClient } from 'pg';
import { STARTER_AGE_GROUPS, starterAgeGroupId } from '../setup/ageGroupSeed';

/**
 * Migration: age groups become a per-sport list, and teams, divisions and leagues point at it.
 *
 * Until now `age_group` was free text on all three tables, so "U13", "u13 " and "Under 13" were
 * three age groups and a school's team could fail to qualify for a division over spelling. Now:
 *
 *   - `sport_age_groups` holds each sport's list. `is_official` splits it into the list an admin
 *     curates in the sport editor and the custom entries users add under "Other…". Promoting a
 *     custom entry flips the flag; merging one repoints its users at another entry and deletes it.
 *
 *   - `teams`, `tournament_divisions` and `leagues` swap `age_group TEXT` for `age_group_id`, with
 *     a composite foreign key on `(sport_id, age_group_id)`. That is what stops a rugby team
 *     holding a hockey age group, and it is why `sport_age_groups` carries `UNIQUE (sport_id, id)`.
 *     A row with no sport (a division before one is chosen) is not checked, per MATCH SIMPLE.
 *
 * Every sport is seeded with the starter official list, and existing values are carried over:
 * one that matches a starter entry ignoring case and spacing takes it, anything else becomes a
 * custom entry. A value on a row with no sport has nowhere to live and is dropped.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS sport_age_groups (
        id TEXT PRIMARY KEY,
        sport_id TEXT NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_official BOOLEAN NOT NULL DEFAULT false,
        created_by TEXT,
        created_org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (sport_id, id)
    );
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS sport_age_groups_name_key
        ON sport_age_groups (sport_id, lower(name));
  `);

  const sports = await client.query(`SELECT id FROM sports`);
  for (const { id: sportId } of sports.rows) {
    for (let i = 0; i < STARTER_AGE_GROUPS.length; i++) {
      await client.query(
        `INSERT INTO sport_age_groups (id, sport_id, name, sort_order, is_official)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT DO NOTHING`,
        [starterAgeGroupId(sportId, STARTER_AGE_GROUPS[i]), sportId, STARTER_AGE_GROUPS[i], i]
      );
    }
  }

  for (const table of ['teams', 'tournament_divisions', 'leagues']) {
    await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS age_group_id TEXT`);

    // Values no list entry matches become custom entries, spelled as first seen.
    await client.query(`
      INSERT INTO sport_age_groups (id, sport_id, name, is_official)
      SELECT DISTINCT ON (t.sport_id, lower(btrim(t.age_group)))
             gen_random_uuid()::text, t.sport_id, btrim(t.age_group), false
        FROM ${table} t
       WHERE t.sport_id IS NOT NULL AND btrim(coalesce(t.age_group, '')) <> ''
       ORDER BY t.sport_id, lower(btrim(t.age_group))
      ON CONFLICT DO NOTHING
    `);

    await client.query(`
      UPDATE ${table} t
         SET age_group_id = ag.id
        FROM sport_age_groups ag
       WHERE ag.sport_id = t.sport_id
         AND lower(ag.name) = lower(btrim(t.age_group))
    `);

    await client.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS age_group`);
    await client.query(`
      ALTER TABLE ${table}
        ADD CONSTRAINT ${table}_age_group_fk
        FOREIGN KEY (sport_id, age_group_id) REFERENCES sport_age_groups (sport_id, id)
    `);
  }
};
