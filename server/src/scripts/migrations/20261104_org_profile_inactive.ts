import { PoolClient } from 'pg';

/**
 * Migration: an org profile can be inactive (docs/people.md §9).
 *
 * Someone who has left an organisation keeps their org profile, for match histories and the record,
 * but no longer holds its email or org ID: those are unique among the **active** profiles of one
 * organisation. The same email in two organisations was always fine, and still is.
 *
 * Marks as inactive only those who clearly left: an ended membership or an ended guardian link, and
 * nothing current. Someone on record who never held either (an appointed official from outside, say)
 * is left alone.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  await client.query(`ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS inactive_at TIMESTAMPTZ;`);

  await client.query(`
    DROP INDEX IF EXISTS idx_org_profiles_one_email;
    CREATE UNIQUE INDEX idx_org_profiles_one_email
      ON org_profiles(org_id, LOWER(TRIM(email)))
      WHERE email IS NOT NULL AND TRIM(email) <> '' AND inactive_at IS NULL;

    ALTER TABLE org_profiles DROP CONSTRAINT IF EXISTS org_profiles_org_id_identifier_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_org_profiles_one_org_id
      ON org_profiles(org_id, identifier)
      WHERE identifier IS NOT NULL AND inactive_at IS NULL;
  `);

  await client.query(`
    UPDATE org_profiles op SET inactive_at = NOW()
     WHERE op.inactive_at IS NULL
       AND (
         EXISTS (SELECT 1 FROM org_memberships om WHERE om.org_profile_id = op.id AND om.end_date <= NOW())
         OR EXISTS (SELECT 1 FROM profile_guardians pg WHERE pg.guardian_profile_id = op.id AND pg.end_date <= NOW())
       )
       AND NOT EXISTS (SELECT 1 FROM org_memberships om WHERE om.org_profile_id = op.id AND (om.end_date IS NULL OR om.end_date > NOW()))
       AND NOT EXISTS (SELECT 1 FROM profile_guardians pg WHERE pg.guardian_profile_id = op.id AND (pg.end_date IS NULL OR pg.end_date > NOW()))
       AND NOT EXISTS (SELECT 1 FROM team_memberships tm WHERE tm.org_profile_id = op.id AND (tm.end_date IS NULL OR tm.end_date > NOW()))
       AND NOT EXISTS (SELECT 1 FROM event_organizers eo WHERE eo.org_profile_id = op.id)
       AND NOT EXISTS (SELECT 1 FROM event_sport_organizers eso WHERE eso.org_profile_id = op.id)
       AND NOT EXISTS (SELECT 1 FROM division_organizers dorg WHERE dorg.org_profile_id = op.id);
  `);
};
