import { eventManager } from '../managers/EventManager';
import { accessManager } from '../managers/AccessManager';
import { gameListRowOf } from '@sk/shared';
import { broadcast, roomHasListeners } from './broadcast';
import {
  divisionFixturesRoom,
  eventFixturesRoom,
  eventRowRoom,
  gameRowRoom,
  gameSummaryRoom,
  orgEventsRoom,
  orgFixturesRoom,
} from './rooms';

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

/**
 * Rooms that should hear about this game, as a fixture rather than as a match.
 *
 * The event and division rooms are here for the reason `FIX-4` gave: a room that hands data over
 * on join and never republishes it is a room whose contents go stale the moment anything happens.
 * `join_room` pushes `GAME_SUMMARIES_SYNC` to `event:{id}:fixtures` and `DIVISION_GAMES_SYNC` to
 * `division:{id}:fixtures`, so both must also receive the updates — otherwise an event screen shows
 * the score as it was when it opened. Added in Phase 5, when the event screen moved onto the room.
 */
async function fixtureRooms(gameId: string): Promise<string[]> {
  const [orgIds, eventId, divisionId] = await Promise.all([
    accessManager.getGameOrgIds(gameId),
    accessManager.getGameEventId(gameId),
    accessManager.getGameDivisionId(gameId),
  ]);
  // Every one of these is the *fixtures* room of its scope, never the events or record room —
  // rule 4. `org:{id}:events` used to receive game summaries because it carried both datasets.
  const rooms = orgIds.map(orgId => orgFixturesRoom(orgId));
  rooms.push(gameSummaryRoom(gameId));
  if (eventId) rooms.push(eventFixturesRoom(eventId));
  if (divisionId) rooms.push(divisionFixturesRoom(divisionId));
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
  broadcast(gameRowRoom(gameId), 'GAME_ROW_UPDATED', gameListRowOf(summary));
  await publishEventRow(summary.eventId);
}

/** What each `event:{id}:row` last said, so that a score, which changes neither count, sends nothing. */
const lastEventRow = new Map<string, string>();

/**
 * Publish a tournament's game counts, if anyone is listening and they have changed. Call after a
 * game under it is added, removed or changes status; `publishGameSummary` does.
 */
export async function publishEventRow(eventId: string): Promise<void> {
  const room = eventRowRoom(eventId);
  if (!roomHasListeners(room)) {
    // Someone joining later is handed the counts as they are then, so this one is out of date.
    lastEventRow.delete(eventId);
    return;
  }
  const row = await eventManager.getEventListRow(eventId);
  const said = `${row.gameCount}:${row.liveCount}`;
  if (lastEventRow.get(eventId) === said) return;
  lastEventRow.set(eventId, said);
  broadcast(room, 'EVENT_ROW_UPDATED', row);
}

/**
 * Publish a removal. The rooms must be captured *before* the delete, because
 * afterwards there is no game left to resolve them from — pass the result of
 * `captureFixtureRooms`.
 */
export function publishGameRemoved(gameId: string, rooms: string[]): void {
  rooms.forEach(room => broadcast(room, 'GAME_SUMMARY_REMOVED', { id: gameId }));
  broadcast(gameRowRoom(gameId), 'GAME_ROW_REMOVED', { id: gameId });
  // Its event is named by the rooms captured before the delete; the row is gone by now.
  for (const room of rooms) {
    const [kind, eventId, sub] = room.split(':');
    if (kind === 'event' && sub === 'fixtures') void publishEventRow(eventId).catch(err => console.error(`[Fixtures] Event row for ${eventId}:`, err));
  }
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
    broadcast(orgEventsRoom(orgId), type, data);
  });
}
