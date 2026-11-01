import { PoolClient } from 'pg';

/**
 * Migration: images are uploaded on their own and cropped in the app (okf/api_comms.md §Uploaded Images).
 *
 * - `pending_uploads` records every uploaded image no row uses yet. A save claims its upload and
 *   deletes the row; the uploader leaving without saving, or the sweep after 24 hours, deletes the
 *   files with it.
 * - `org_profiles.image_config` and the `logoConfig` key in `organizations.settings` go: they held a
 *   zoom and position applied when the image was shown. The app now crops the picture itself, so an
 *   image is shown as it is stored. Pictures saved with a non-default zoom will show uncropped.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS pending_uploads (
      name TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_pending_uploads_uploaded_by ON pending_uploads(uploaded_by)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_pending_uploads_created_at ON pending_uploads(created_at)`);

  await client.query(`ALTER TABLE org_profiles DROP COLUMN IF EXISTS image_config`);
  await client.query(`UPDATE organizations SET settings = settings - 'logoConfig' WHERE settings ? 'logoConfig'`);
};
