import { PoolClient } from 'pg';

/**
 * Migration: event and season dates become calendar dates (`DATE`), not instants (`TIMESTAMPTZ`).
 *
 * "The tournament is on the 19th" has no time of day, and should read as the 19th for every viewer
 * wherever they are. Stored as a timestamp it needed a convention to survive — the screens wrote
 * noon UTC, far enough from either midnight that no timezone could drag it onto another day — and
 * the season screens never followed it: they wrote midnight UTC, which reads as the day before
 * anywhere west of Greenwich. A `DATE` has no time to convert, so nothing can move it (DATE-1, and
 * the date-formatting skill for the policy).
 *
 * Existing values keep their **UTC** date: noon-UTC event dates and midnight-UTC season dates both
 * fall on the day their author picked in UTC, whereas the server's timezone would move a midnight
 * value to the previous day for anyone east of it.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  for (const table of ['events', 'seasons']) {
    await client.query(`
      ALTER TABLE ${table}
        ALTER COLUMN start_date TYPE DATE USING (start_date AT TIME ZONE 'UTC')::date,
        ALTER COLUMN end_date TYPE DATE USING (end_date AT TIME ZONE 'UTC')::date
    `);
  }
};
