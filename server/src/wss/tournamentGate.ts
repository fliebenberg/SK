import { SocketAction } from '@sk/shared';
import pool from '../db';
import { dataManager } from '../DataManager';
import { accessManager } from '../managers/AccessManager';
import { singleScope } from './batch';

/**
 * One gate for every tournament write.
 *
 * Twenty-odd actions, two scopes, one decision — made here rather than in twenty-odd handlers each
 * remembering to check. The maps say what a payload *touches*; `AccessManager` says who may touch
 * it; this module is only the join between them.
 *
 * Lifted out of `index.ts` in Phase 4 for a second reason as well: a gate nobody can call is a gate
 * nobody can test. `phase4-permissions.ts` exercises this function directly, so the refusals the
 * exit criterion asks about are checked against the very code the socket runs, not a re-statement
 * of it.
 */

/**
 * Tournament writes, mapped to the event they act on.
 *
 * A resolver returns the event id, or null when the payload names nothing that exists — which is a
 * refusal, not a free pass, because "no event" is the shape a payload takes when it points at a row
 * that is not there.
 */
export const TOURNAMENT_ACTION_EVENT: Partial<Record<SocketAction, (payload: any) => Promise<string | null>>> = {
  [SocketAction.ADD_DIVISION]: async (p) => p?.eventId ?? null,
  [SocketAction.UPDATE_DIVISION]: async (p) => (p?.id ? dataManager.getDivisionEventId(p.id) : null),
  [SocketAction.DELETE_DIVISION]: async (p) => (p?.id ? dataManager.getDivisionEventId(p.id) : null),
  [SocketAction.ADD_STAGE]: async (p) => (p?.divisionId ? dataManager.getDivisionEventId(p.divisionId) : null),
  [SocketAction.UPDATE_STAGE]: async (p) => (p?.id ? dataManager.getStageEventId(p.id) : null),
  [SocketAction.DELETE_STAGE]: async (p) => (p?.id ? dataManager.getStageEventId(p.id) : null),
  [SocketAction.SET_DIVISION_ENTRANTS]: async (p) =>
    p?.divisionId ? dataManager.getDivisionEventId(p.divisionId) : null,
  [SocketAction.SET_STAGE_ENTRANTS]: async (p) => (p?.stageId ? dataManager.getStageEventId(p.stageId) : null),
  [SocketAction.GENERATE_STAGE_FIXTURES]: async (p) => (p?.stageId ? dataManager.getStageEventId(p.stageId) : null),
  [SocketAction.SCHEDULE_STAGE]: async (p) => (p?.stageId ? dataManager.getStageEventId(p.stageId) : null),
  [SocketAction.ADD_ADJUSTMENT]: async (p) => (p?.divisionId ? dataManager.getDivisionEventId(p.divisionId) : null),
  [SocketAction.DELETE_ADJUSTMENT]: async (p) => {
    if (!p?.id) return null;
    const res = await pool.query('SELECT division_id FROM division_adjustments WHERE id = $1', [p.id]);
    const divisionId = res.rows[0]?.division_id;
    return divisionId ? dataManager.getDivisionEventId(divisionId) : null;
  },
  [SocketAction.SET_EVENT_FACILITIES]: async (p) => p?.eventId ?? null,
  [SocketAction.SET_DIVISION_FACILITIES]: async (p) =>
    p?.divisionId ? dataManager.getDivisionEventId(p.divisionId) : null,
  // Appointing is authorized as the event at both scopes, and has no entry in the division map
  // below — deliberately. A convenor runs their division; who else may run it is not theirs to
  // decide, which is what keeps an appointee from ever locking out the people who appointed them.
  [SocketAction.APPOINT_ORGANIZER]: async (p) =>
    p?.eventId ?? (p?.divisionId ? dataManager.getDivisionEventId(p.divisionId) : null),
  [SocketAction.WITHDRAW_ORGANIZER]: async (p) =>
    p?.eventId ?? (p?.divisionId ? dataManager.getDivisionEventId(p.divisionId) : null),
  [SocketAction.RESOLVE_PARTICIPANT]: async (p) => {
    if (!p?.gameParticipantId) return null;
    const gameId = await dataManager.getGameIdForParticipant(p.gameParticipantId);
    return gameId ? (await dataManager.getGameStageContext(gameId)).eventId : null;
  },
  // Rule 2 of the batch contract: one permission scope per batch. `singleScope` refuses a batch
  // spanning two events *before* any work, rather than authorizing it against whichever item
  // happened to sort first.
  [SocketAction.ADD_GAMES]: async (p) =>
    singleScope(p?.games || [], (game: any) => game?.eventId || null),
  [SocketAction.UPDATE_GAMES]: async (p) => {
    const games = p?.games || [];
    const eventIds = await Promise.all(
      games.map(async (game: any) =>
        game?.id ? (await dataManager.getGameStageContext(game.id)).eventId : null
      )
    );
    return singleScope(eventIds, (eventId: string | null) => eventId);
  },
};

/**
 * The same writes, mapped to the *division* they act on — the second half of the gate.
 *
 * A convenor holds a grant over one division, so the question the gate has to be able to ask is
 * "which division does this payload touch?". An action with no entry here is event-scope only:
 * creating, renaming or deleting a division, and setting the event's facilities, are decisions
 * about the shape of the tournament rather than about running one part of it, and appointing
 * further organisers is deliberately not delegated (see the two entries above).
 *
 * Everything else *is* delegated, and widely: on 2026-09-03 the convenor's scope was widened from
 * D31's "fixtures and results" to the whole of their division — entrants, stages, fixtures, results
 * and adjustments — so that an event organiser can hand a division over and stop thinking about it,
 * including bringing in entrants of their own.
 *
 * A resolver returns null when the payload names nothing resolvable, or when a batch spans more
 * than one division. Null is a refusal of the *division* path, not of the request: the caller still
 * has whatever event-scope rights they hold.
 */
export const TOURNAMENT_ACTION_DIVISION: Partial<Record<SocketAction, (payload: any) => Promise<string | null>>> = {
  [SocketAction.ADD_STAGE]: async (p) => p?.divisionId ?? null,
  [SocketAction.UPDATE_STAGE]: async (p) => (p?.id ? divisionOfStage(p.id) : null),
  [SocketAction.DELETE_STAGE]: async (p) => (p?.id ? divisionOfStage(p.id) : null),
  [SocketAction.SET_DIVISION_ENTRANTS]: async (p) => p?.divisionId ?? null,
  [SocketAction.SET_STAGE_ENTRANTS]: async (p) => (p?.stageId ? divisionOfStage(p.stageId) : null),
  [SocketAction.GENERATE_STAGE_FIXTURES]: async (p) => (p?.stageId ? divisionOfStage(p.stageId) : null),
  [SocketAction.SCHEDULE_STAGE]: async (p) => (p?.stageId ? divisionOfStage(p.stageId) : null),
  [SocketAction.ADD_ADJUSTMENT]: async (p) => p?.divisionId ?? null,
  [SocketAction.DELETE_ADJUSTMENT]: async (p) => {
    if (!p?.id) return null;
    const res = await pool.query('SELECT division_id FROM division_adjustments WHERE id = $1', [p.id]);
    return res.rows[0]?.division_id ?? null;
  },
  [SocketAction.SET_DIVISION_FACILITIES]: async (p) => p?.divisionId ?? null,
  [SocketAction.RESOLVE_PARTICIPANT]: async (p) => {
    if (!p?.gameParticipantId) return null;
    const gameId = await dataManager.getGameIdForParticipant(p.gameParticipantId);
    return gameId ? accessManager.getGameDivisionId(gameId) : null;
  },
  // The batch rule again, one level down: every fixture in the batch must belong to the same
  // division, or the division path does not authorize it. `singleScope` is not reused here because
  // a mixed batch is not an error at this point — it simply falls back to event scope.
  [SocketAction.ADD_GAMES]: async (p) =>
    sameDivision(
      await Promise.all(
        (p?.games || []).map((game: any) =>
          game?.stageId ? divisionOfStage(game.stageId) : Promise.resolve(null)
        )
      )
    ),
  [SocketAction.UPDATE_GAMES]: async (p) =>
    sameDivision(
      await Promise.all(
        (p?.games || []).map((game: any) =>
          game?.id ? accessManager.getGameDivisionId(game.id) : Promise.resolve(null)
        )
      )
    ),
};

/** The division a stage belongs to, or null when the stage does not exist. */
async function divisionOfStage(stageId: string): Promise<string | null> {
  const stage = await dataManager.getStage(stageId);
  return stage?.divisionId ?? null;
}

/** The one division every item shares, or null if they do not share one. */
function sameDivision(divisionIds: (string | null)[]): string | null {
  if (!divisionIds.length) return null;
  const unique = new Set(divisionIds);
  if (unique.size !== 1) return null;
  const [only] = unique;
  return only ?? null;
}

/** True when this action is a tournament write and therefore goes through the gate. */
export function isTournamentAction(type: SocketAction): boolean {
  return !!TOURNAMENT_ACTION_EVENT[type];
}

/**
 * Authorize one tournament write, or throw the refusal the client sees.
 *
 * Two scopes, checked in that order, both through `AccessManager` so there is one rulebook.
 *
 * **Event scope** is the ordinary case: `canEditEventOrGame`, the same function every other event
 * and game edit already uses, so a division, a stage, a roster and an adjustment inherit exactly
 * the rights the event grants. Since Phase 4 that function also admits an appointed event
 * organiser, which is why fourteen call sites did not have to change.
 *
 * **Division scope** is the fallback, and only for actions that name a division at all. A
 * convenor's grant covers the whole of their division and nothing above or beside it, so an attempt
 * to touch another division — or to appoint somebody, or to delete the division itself — resolves
 * to a division they do not hold, or to no division, and is refused here rather than by a hidden
 * button.
 *
 * `orgId` in the payload is the workspace the caller is acting from, and it falls back to the
 * event's own org so the check cannot be skipped by simply omitting it — the same fallback
 * `UPDATE_GAME` and `DELETE_GAME` already use.
 */
export async function enforceTournamentAction(
  userId: string | null,
  type: SocketAction,
  payload: any
): Promise<void> {
  const tournamentEventFor = TOURNAMENT_ACTION_EVENT[type];
  if (!tournamentEventFor) return;

  if (!userId) {
    throw new Error('Unauthorized: You must be signed in to organise a tournament.');
  }

  const targetEventId = await tournamentEventFor(payload);
  if (!targetEventId) {
    throw new Error(`Bad request: ${type} does not name a tournament that exists.`);
  }

  const eventOrg = await pool.query('SELECT org_id FROM events WHERE id = $1', [targetEventId]);
  const requestingOrgId = payload?.orgId || eventOrg.rows[0]?.org_id;
  const allowedAsEvent =
    !!requestingOrgId && (await dataManager.canEditEventOrGame(userId, requestingOrgId, targetEventId));
  if (allowedAsEvent) return;

  const tournamentDivisionFor = TOURNAMENT_ACTION_DIVISION[type];
  const targetDivisionId = tournamentDivisionFor ? await tournamentDivisionFor(payload) : null;
  if (targetDivisionId && (await accessManager.hasDivisionGrant(userId, targetDivisionId))) return;

  throw new Error('Unauthorized: You do not have permission to organise this tournament.');
}
