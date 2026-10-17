import { PoolClient } from 'pg';

/**
 * Migration: each division keeps its whole table (events stage 4, 2026-10-17).
 *
 * `recalculateEventStandings` already computes one table per division — over all of its fixtures,
 * every stage at once — to add the divisions up into the organisation leaderboard, and threw each
 * one away once it had been added. The Standings tab now needs them: an organisation's page lists
 * its teams with their places and the points they earned, which must be the same points the
 * leaderboard added up, and the Divisions card names who leads each division.
 *
 * Left NULL here: `getEventStandings` recalculates an event whose divisions have no table yet, so
 * existing tournaments fill in the first time anybody opens their standings.
 */
export const up = async (client: PoolClient) => {
  await client.query(`ALTER TABLE tournament_divisions ADD COLUMN IF NOT EXISTS cached_standings JSONB`);
};
