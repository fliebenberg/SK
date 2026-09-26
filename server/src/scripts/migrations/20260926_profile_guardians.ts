import { PoolClient } from 'pg';

/**
 * Migration: guardians of players, and whether a minor's membership carries privileges (`MEMBER-3`).
 *
 * `profile_guardians` links a guardian's org profile to a player's, in the same organisation.
 * Being a guardian is derived from an active link and is never an `org_memberships` row: a
 * membership row is a permission in this codebase, and a guardian must see their own child, not
 * every child in the school. See docs/guardians-implementation-plan.md §0.1.
 *
 * Many-to-many on purpose — siblings share a guardian, a child can have two. `start_date` /
 * `end_date` mirror `org_memberships`, so ending a link keeps its history. At most one active
 * primary guardian per player, and one active link per guardian–player pair.
 *
 * The three `own_account_*` columns on `org_profiles` are the per-minor half of the minors rule
 * (§0.3). `own_account_allowed` is a tri-state and `NULL` must stay distinct from `false`: `NULL`
 * means nobody has said, so the organisation's setting decides; `false` is an explicit refusal.
 * The organisation's half lives in `organizations.settings.minors` and needs no column.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS profile_guardians (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      guardian_profile_id TEXT NOT NULL REFERENCES org_profiles(id) ON DELETE CASCADE,
      player_profile_id TEXT NOT NULL REFERENCES org_profiles(id) ON DELETE CASCADE,
      relationship TEXT NOT NULL DEFAULT 'parent'
        CHECK (relationship IN ('parent', 'guardian', 'grandparent', 'other')),
      is_primary BOOLEAN NOT NULL DEFAULT false,
      start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      end_date TIMESTAMPTZ,
      created_by_profile_id TEXT REFERENCES org_profiles(id) ON DELETE SET NULL,
      CHECK (guardian_profile_id <> player_profile_id)
    )
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_guardians_active_pair
      ON profile_guardians(guardian_profile_id, player_profile_id) WHERE end_date IS NULL
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_guardians_one_primary
      ON profile_guardians(player_profile_id) WHERE is_primary AND end_date IS NULL
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_profile_guardians_player ON profile_guardians(player_profile_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_profile_guardians_guardian ON profile_guardians(guardian_profile_id)`);

  await client.query(`ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS own_account_allowed BOOLEAN`);
  await client.query(`ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS own_account_set_at TIMESTAMPTZ`);
  await client.query(`
    ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS own_account_set_by TEXT
      REFERENCES org_profiles(id) ON DELETE SET NULL
  `);
};
