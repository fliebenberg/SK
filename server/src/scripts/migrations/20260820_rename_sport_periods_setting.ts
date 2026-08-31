import { PoolClient } from 'pg';

/**
 * Migration: Rename `default_settings.periods` to `default_settings.scheduledPeriods`.
 *
 * The sport-level key was `periods` while the game- and event-level overrides that shadow it are
 * both called `scheduledPeriods`, as is the resolved value stored on `game.liveState.clock`. The
 * mismatch meant an override written under the obvious name was silently ignored, so the sport
 * default now uses the same name as everything that reads it.
 */
export const up = async (client: PoolClient) => {
  await client.query(`
    UPDATE sports
    SET default_settings =
      jsonb_build_object('scheduledPeriods', default_settings->'periods') || (default_settings - 'periods')
    WHERE default_settings ? 'periods';
  `);
};
