import { GameSummary } from '@sk/shared';
import { tournamentManager } from '../managers/TournamentManager';
import { accessManager } from '../managers/AccessManager';
import { eventManager } from '../managers/EventManager';
import { dataManager } from '../DataManager';
import { broadcast } from './broadcast';
import { publishGameSummary } from './fixtures';
import {
  divisionAdjustmentsRoom,
  divisionEntrantsRoom,
  divisionFixturesRoom,
  divisionRoom,
  divisionStageEntrantsRoom,
  divisionStagesRoom,
  divisionStandingsRoom,
  eventDivisionsRoom,
  eventEntrantsRoom,
  eventStandingsRoom,
  userCapabilitiesRoom,
} from './rooms';

/**
 * Publishing a tournament change.
 *
 * The same reasoning as [fixtures.ts](./fixtures.ts): every mutation that alters what a division
 * screen shows goes through here, so all of them reach the same audience with the same payload.
 * Open-coding an audience per action is how `DELETE_GAME`, `UPDATE_GAME_SCORE` and
 * `ADD_GAME_EVENT` each ended up reaching nobody's fixtures list (`FIX-3`, `FIX-6`).
 *
 * One room per dataset (rule 4), and the tier follows what is in the room rather than who is
 * allowed to organise (U33):
 *
 * | Room | Access | Carries |
 * |---|---|---|
 * | `division:{id}` | public | the division record |
 * | `division:{id}:fixtures` | public | its fixtures |
 * | `division:{id}:stages` | public | its stages |
 * | `division:{id}:standings` | public | each stage's table |
 * | `division:{id}:facilities` | public | the venues in play |
 * | `division:{id}:entrants` | member | the roster |
 * | `division:{id}:stage_entrants` | member | pool membership |
 * | `division:{id}:adjustments` | member | manual points corrections |
 *
 * A division change also reaches `event:{eventId}:divisions`, because the event screen lists the
 * divisions and cannot be expected to join every one of their rooms to know they exist.
 */

export {
  divisionFixturesRoom,
  divisionStandingsRoom,
  divisionRoom,
  eventEntrantsRoom,
} from './rooms';

/**
 * The whole tournament's roster, in one room (U21).
 *
 * The entry screens work on two axes — by division and by organisation — over **one** dataset, and
 * the org axis is a division x org grid, so it needs every division's roster at once. Fifteen
 * `division:{id}` joins on one screen open is the cost live data exists to remove, so the roster
 * gets an event-level room beside the per-division one. Same tier as the per-division room, for
 * the same reason: an entrant may be a person rather than a team.
 */


/** The division itself changed — name, weighting, scoring, or it appeared or went away. */
export async function publishDivision(divisionId: string, type: string, data: any, eventId?: string): Promise<void> {
  const resolvedEventId = eventId || (await tournamentManager.getDivisionEventId(divisionId));
  broadcast(divisionRoom(divisionId), type, data);
  if (resolvedEventId) broadcast(eventDivisionsRoom(resolvedEventId), type, data);
}

/** A stage was added, renamed, resequenced, or its status moved. */
export function publishStages(divisionId: string, stages: any[]): void {
  broadcast(divisionStagesRoom(divisionId), 'STAGES_SYNC', { divisionId, stages });
}

/**
 * The roster changed. Organiser tier only — it may name people rather than teams.
 *
 * Two rooms, because two screens hold this data at two altitudes: the division panel holds one
 * division's roster, and the entry screens hold the whole event's. Both get the same message shape
 * so the reducer is the same in both places — `DIVISION_ENTRANTS_SYNC` names its division either
 * way, and the event-level listener merges by it.
 */
export async function publishEntrants(divisionId: string, entrants: any[], eventId?: string): Promise<void> {
  broadcast(divisionEntrantsRoom(divisionId), 'DIVISION_ENTRANTS_SYNC', { divisionId, entrants });
  const resolvedEventId = eventId || (await tournamentManager.getDivisionEventId(divisionId));
  if (resolvedEventId) {
    broadcast(eventEntrantsRoom(resolvedEventId), 'DIVISION_ENTRANTS_SYNC', { divisionId, entrants });
  }
}

/** Pool membership changed. */
export function publishStageEntrants(divisionId: string, stageId: string, entrants: any[]): void {
  broadcast(divisionStageEntrantsRoom(divisionId), 'STAGE_ENTRANTS_SYNC', { stageId, entrants });
}

/** A manual points correction was recorded or withdrawn. */
export function publishAdjustments(divisionId: string, adjustments: any[]): void {
  broadcast(divisionAdjustmentsRoom(divisionId), 'DIVISION_ADJUSTMENTS_SYNC', { divisionId, adjustments });
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
    if (res) broadcast(eventStandingsRoom(eventId), 'EVENT_STANDINGS_UPDATED', { eventId, rows: (res as any).cachedStandings || [] });
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
  // The choke point calls `refreshStageStatus`, so a stage may have moved from `Ready` to
  // `InProgress` or to `Complete` — and the stage tabs put that status in their sublabel (U14).
  // Without this the table updates and the tab beside it still says "4 of 7 played" until the
  // next join, which is the same class of defect as `FIX-4`: the room hands data over on join
  // and then never updates it.
  if (outcome.divisionId) {
    publishStages(outcome.divisionId, await tournamentManager.getStages(outcome.divisionId));
  }
  for (const gameId of outcome.changedGameIds) {
    await publishGameSummary(gameId);
  }
}

/**
 * An organiser was appointed or withdrawn.
 *
 * This is the one tournament change that cannot be broadcast to a division room, and the reason is
 * the same one that keeps `canEdit` off the division object: a room broadcast reaches everybody in
 * it, and what changed here is one person's rights. So it goes to `user:{id}` — the `self` tier —
 * carrying that person's freshly computed capabilities for the event.
 *
 * Nobody to notify is a normal outcome, not a failure: a grant may name a profile that has no
 * account yet, which is exactly the "appoint the convenor, who will get an invite" case. When they
 * later claim it, `AccessManager`'s email match picks the grant up with no row being touched.
 *
 * `EVENT_CAPABILITIES_UPDATED` is hooked in `broadcast()` the way `USER_MEMBERSHIPS_UPDATED` is:
 * it drops the cached identity and revalidates the rooms that socket already holds, so a withdrawn
 * convenor stops receiving a division's roster at once rather than at their next reconnect.
 */
export async function publishOrganizerChange(orgProfileId: string, eventId: string): Promise<void> {
  const userIds = await accessManager.getUserIdsForOrgProfile(orgProfileId);
  for (const userId of userIds) {
    const capabilities = await accessManager.getEventCapabilities(userId, eventId);
    broadcast(userCapabilitiesRoom(userId), 'EVENT_CAPABILITIES_UPDATED', capabilities);
    // The room hands the whole grant set over on join, so it has to republish it here too —
    // otherwise a fixtures list's role chips keep the set they were given at join and go stale the
    // first time somebody is appointed (`FIX-4`, `LIVE-8`). `EVENT_CAPABILITIES_UPDATED` above is
    // the answer for *one* event; this is the set across all of them, and they are different
    // datasets sharing a room only because they are the same question at two altitudes.
    broadcast(userCapabilitiesRoom(userId), 'EVENT_GRANTS_SYNC', await dataManager.getMyGrants(userId));
  }
}
