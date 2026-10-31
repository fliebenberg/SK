import { randomUUID } from 'crypto';
import { GameOfficialEntry, GameOfficialRole } from '@sk/shared';
import pool from '../db';

/**
 * Who is appointed to officiate a game (`PERM-7`, docs/permissions.md §2.2): a scorer, a match
 * official (stored as `REFEREE`; a scorer's rights for now) or a timekeeper (the clock alone).
 * Whoever may edit the fixture appoints — the org gate's `appoint-official` decides that; this
 * decides only what is a valid appointment.
 */

const ROLES: GameOfficialRole[] = ['SCORER', 'REFEREE', 'TIMEKEEPER'];

export async function listGameOfficials(gameId: string): Promise<GameOfficialEntry[]> {
  const res = await pool.query(
    `SELECT go.id, go.game_id AS "gameId", go.org_profile_id AS "orgProfileId", go.role, op.name
       FROM game_officials go JOIN org_profiles op ON op.id = go.org_profile_id
      WHERE go.game_id = $1 AND go.role = ANY($2)
      ORDER BY array_position($2::text[], go.role), op.name`,
    [gameId, ROLES]
  );
  return res.rows;
}

export async function addGameOfficial(gameId: string, orgProfileId: string, role: GameOfficialRole): Promise<GameOfficialEntry> {
  if (!ROLES.includes(role)) throw new Error('Bad request: an official is a scorer, a match official or a timekeeper.');
  const game = await pool.query('SELECT e.org_id FROM games g JOIN events e ON e.id = g.event_id WHERE g.id = $1', [gameId]);
  if (!game.rows.length) throw new Error('Bad request: that game does not exist.');
  const person = await pool.query('SELECT name, org_id FROM org_profiles WHERE id = $1', [orgProfileId]);
  if (!person.rows.length) throw new Error('Bad request: that person does not exist.');
  // An official is the host's to appoint from its own people, as a coach must be one of the team's.
  if (person.rows[0].org_id !== game.rows[0].org_id) {
    throw new Error("Choose someone from the organisation hosting this game.");
  }
  const dup = await pool.query(
    'SELECT 1 FROM game_officials WHERE game_id = $1 AND org_profile_id = $2 AND role = $3',
    [gameId, orgProfileId, role]
  );
  if (dup.rows.length) throw new Error(`${person.rows[0].name} is already appointed to that.`);
  const id = `go-${randomUUID()}`;
  await pool.query('INSERT INTO game_officials (id, game_id, org_profile_id, role) VALUES ($1, $2, $3, $4)', [id, gameId, orgProfileId, role]);
  return { id, gameId, orgProfileId, role, name: person.rows[0].name };
}

export async function removeGameOfficial(id: string): Promise<string | null> {
  const res = await pool.query('DELETE FROM game_officials WHERE id = $1 RETURNING game_id', [id]);
  return res.rows[0]?.game_id ?? null;
}
