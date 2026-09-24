import { PoolClient } from 'pg';

/**
 * Migration: a profile remembers which address its last invite went to.
 *
 * The resend cooldown used to belong to the person: one invite per profile per cooldown, whatever
 * the address. An admin who mistyped an email then had to wait a week to send to the right one.
 * The cooldown now belongs to the address (`inviteCooldownRemainingHours` in `@sk/shared`), which
 * needs the address the invite actually went to — not the profile's current `email`, or clearing
 * the field and typing the same address back would reset it.
 *
 * Existing invites are backfilled with the profile's current email, the best record there is of
 * where they went, so a cooldown already running keeps running.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  await client.query(`ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS last_invite_email TEXT`);
  await client.query(`
    UPDATE org_profiles
       SET last_invite_email = LOWER(TRIM(email))
     WHERE last_invite_sent_at IS NOT NULL AND last_invite_email IS NULL AND email IS NOT NULL
  `);
};
