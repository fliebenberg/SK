import { GameSummary } from '@sk/shared';
import { tournamentManager } from '../managers/TournamentManager';
import { eventManager } from '../managers/EventManager';
import { broadcast } from './broadcast';
import { publishGameSummary } from './fixtures';

/**
 * Publishing a tournament change.
 *
 * The same reasoning as [fixtures.ts](./fixtures.ts): every mutation that alters what a division
 * screen shows goes through here, so all of them reach the same audience with the same payload.
 * Open-coding an audience per action is how `DELETE_GAME`, `UPDATE_GAME_SCORE` and
 * `ADD_GAME_EVENT` each ended up reaching nobody's fixtures list (`FIX-3`, `FIX-6`).
 *
 * Three rooms per division, and the split is by what is in them rather than by who is allowed to
 * organise (U33):
 *
 * | Room | Access | Carries |
 * |---|---|---|
 * | `division:{id}:fixtures` | public | the division, its stages, and its fixtures |
 * | `division:{id}:standings` | public | each stage's table |
 * | `division:{id}` | member | the roster, pool membership, manual adjustments |
 *
 * A division change also reaches `event:{eventId}`, because the event screen lists the divisions
 * and cannot be expected to join every one of their rooms to know they exist.
 */

export const divisionFixturesRoom = (divisionId: string) => `division:${divisionId}:fixtures`;
export const divisionStandingsRoom = (divisionId: string) => `division:${divisionId}:standings`;
export const divisionRoom = (divisionId: string) => `division:${divisionId}`;

/** The division itself changed — name, weighting, scoring, or it appeared or went away. */
export async function publishDivision(divisionId: string, type: string, data: any, eventId?: string): Promise<void> {
  const resolvedEventId = eventId || (await tournamentManager.getDivisionEventId(divisionId));
  broadcast(divisionFixturesRoom(divisionId), type, data);
  if (resolvedEventId) broadcast(`event:${resolvedEventId}`, type, data);
}

/** A stage was added, renamed, resequenced, or its status moved. */
export function publishStages(divisionId: string, stages: any[]): void {
  broadcast(divisionFixturesRoom(divisionId), 'STAGES_SYNC', { divisionId, stages });
}

/** The roster changed. Organiser tier only — it may name people rather than teams. */
export function publishEntrants(divisionId: string, entrants: any[]): void {
  broadcast(divisionRoom(divisionId), 'DIVISION_ENTRANTS_SYNC', { divisionId, entrants });
}

/** Pool membership changed. */
export function publishStageEntrants(divisionId: string, stageId: string, entrants: any[]): void {
  broadcast(divisionRoom(divisionId), 'STAGE_ENTRANTS_SYNC', { stageId, entrants });
}

/** A manual points correction was recorded or withdrawn. */
export function publishAdjustments(divisionId: string, adjustments: any[]): void {
  broadcast(divisionRoom(divisionId), 'DIVISION_ADJUSTMENTS_SYNC', { divisionId, adjustments });
}

/**
 * A whole batch of fixtures, as **one** message.
 *
 * Rule 3 of the batch contract. Ninety fixtures published one at a time would relocate to the
 * client exactly the cost the contract removes on the server — ninety upserts and ninety renders
 * — which is why `useLiveRoom` gains an `upsertMany` reduce kind alongside these (U32).
 */
export function publishStageFixtures(divisionId: string, stageId: string, games: GameSummary[]): void {
  broadcast(divisionFixturesRoom(divisionId), 'STAGE_FIXTURES_SYNC', { stageId, games });
}

/**
 * The tables moved.
 *
 * Published after **every** call to the choke point, because that is the only thing that rewrites
 * them — a standings screen that had to guess when to refetch is the pattern the whole live-data
 * design exists to remove.
 */
export async function publishStandings(divisionId: string | null, eventId: string | null): Promise<void> {
  if (divisionId) {
    const stages = await tournamentManager.getStages(divisionId);
    broadcast(divisionStandingsRoom(divisionId), 'DIVISION_STANDINGS_UPDATED', {
      divisionId,
      stages: stages.map(stage => ({ stageId: stage.id, name: stage.name, status: stage.status, rows: stage.cachedStandings || [] })),
    });
  }
  if (eventId) {
    const res = await eventManager.getEvent(eventId);
    if (res) broadcast(`event:${eventId}`, 'EVENT_STANDINGS_UPDATED', { eventId, rows: (res as any).cachedStandings || [] });
  }
}

/**
 * Everything the choke point changed, published in one place.
 *
 * `changedGameIds` are fixtures whose *participants* progression filled in — "Winner QF1" became a
 * team — so each one publishes a fresh summary through the ordinary fixture path. They are not a
 * batch: progression fills one or two slots at a time, and they belong to different rooms.
 */
export async function publishRecalculation(outcome: {
  divisionId: string | null;
  eventId: string | null;
  changedGameIds: string[];
}): Promise<void> {
  await publishStandings(outcome.divisionId, outcome.eventId);
  for (const gameId of outcome.changedGameIds) {
    await publishGameSummary(gameId);
  }
}
