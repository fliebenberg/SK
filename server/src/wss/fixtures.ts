import { eventManager } from '../managers/EventManager';
import { accessManager } from '../managers/AccessManager';
import { broadcast } from './broadcast';

/**
 * Publishing a fixture change.
 *
 * Every mutation that alters what a fixture list shows goes through here, so
 * that all of them reach the same audience with the same payload. Before this
 * existed each action open-coded its own `[event.orgId, ...participatingOrgIds]`
 * loop, which is why `DELETE_GAME`, `UPDATE_GAME_SCORE` and `ADD_GAME_EVENT`
 * silently reached nobody's list.
 *
 * The audience is `getGameOrgIds` — host org, registered participant orgs, and
 * the orgs owning the participating teams. That third source matters: an org
 * can be playing in an event that never recorded it, and `getGames` shows such
 * a game in that org's list, so it must hear about changes to it too.
 */

/** Rooms that should hear about this game, as a fixture rather than as a match. */
async function fixtureRooms(gameId: string): Promise<string[]> {
  const orgIds = await accessManager.getGameOrgIds(gameId);
  const rooms = orgIds.map(orgId => `org:${orgId}:events`);
  rooms.push(`game:${gameId}:summary`);
  return rooms;
}

/**
 * Publish the game's current summary to every org that lists it, and to the
 * game's own summary room. Call after any change to score, clock, status,
 * kick-off, venue or participants.
 */
export async function publishGameSummary(gameId: string): Promise<void> {
  const summary = await eventManager.getGameSummary(gameId);
  if (!summary) return;
  const rooms = await fixtureRooms(gameId);
  rooms.forEach(room => broadcast(room, 'GAME_SUMMARY_UPDATED', summary));
}

/**
 * Publish a removal. The rooms must be captured *before* the delete, because
 * afterwards there is no game left to resolve them from — pass the result of
 * `captureFixtureRooms`.
 */
export function publishGameRemoved(gameId: string, rooms: string[]): void {
  rooms.forEach(room => broadcast(room, 'GAME_SUMMARY_REMOVED', { id: gameId }));
}

/** Snapshot the audience for a game that is about to be deleted. */
export async function captureFixtureRooms(gameId: string): Promise<string[]> {
  return fixtureRooms(gameId);
}

/** Publish an event-level change to every org that lists it. */
export function publishEventToOrgs(orgIds: string[], type: string, data: any): void {
  const seen = new Set<string>();
  orgIds.filter(Boolean).forEach(orgId => {
    if (seen.has(orgId)) return;
    seen.add(orgId);
    broadcast(`org:${orgId}:events`, type, data);
  });
}
