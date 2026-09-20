import { PoolClient } from 'pg';
import { ORG_SHORT_CODE_MAX_LENGTH, deriveOrgShortCode } from '@sk/shared';

/**
 * Migration: every organisation has a short code.
 *
 * `short_name` was nullable and mostly unset, which was survivable while it was decoration. The
 * tournament entrants screen makes it structural — an org column heading, a tab, a team flag on a
 * phone — and a screen that falls back to the full name for the orgs that never set one is a
 * screen with broken columns. So the column becomes `NOT NULL`, with a `CHECK` beside it because
 * `NOT NULL` alone would happily accept `''` and leave exactly the hole this closes.
 *
 * Existing rows are backfilled by {@link deriveOrgShortCode} — the same function every create
 * path now pre-fills its field with, so a derived code and a typed one are the same kind of thing.
 *
 * **Codes are not unique and this migration does not make them so.** Two schools really are both
 * NHS. The de-duplication below is cosmetic: where a *derived* code lands on one already in use it
 * takes a numeric suffix, so the backfill does not manufacture collisions that nobody chose. Codes
 * that collide because two people picked the same one are left alone, and the UI disambiguates
 * them with the full name.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  const existing = await client.query(
    `SELECT id, name, short_name as "shortName" FROM organizations`
  );

  /** Case-insensitive, because "shs" and "SHS" are the same code to a reader. */
  const taken = new Set<string>(
    existing.rows
      .filter(row => (row.shortName || '').trim())
      .map(row => row.shortName.trim().toUpperCase())
  );

  for (const row of existing.rows) {
    if ((row.shortName || '').trim()) continue;

    // A nameless organisation should not exist, but the column allows one and the backfill has to
    // produce something rather than fail the migration over it.
    const base = deriveOrgShortCode(row.name) || 'ORG';

    let code = base;
    for (let n = 2; taken.has(code.toUpperCase()); n++) {
      const suffix = String(n);
      code = base.slice(0, ORG_SHORT_CODE_MAX_LENGTH - suffix.length) + suffix;
    }
    taken.add(code.toUpperCase());

    await client.query(`UPDATE organizations SET short_name = $1 WHERE id = $2`, [code, row.id]);
  }

  await client.query(`ALTER TABLE organizations ALTER COLUMN short_name SET NOT NULL`);
  await client.query(`
    ALTER TABLE organizations
      DROP CONSTRAINT IF EXISTS organizations_short_name_not_blank,
      ADD CONSTRAINT organizations_short_name_not_blank CHECK (btrim(short_name) <> '')
  `);
};
