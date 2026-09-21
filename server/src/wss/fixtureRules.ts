import { Game } from '@sk/shared';

/**
 * What a fixture's two write paths are each allowed to do — **planning** and **the result** — and
 * nothing that belongs to the other (2026-09-21).
 *
 * `UPDATE_GAME` used to carry both. It edited a fixture's teams, time and venue, and it also
 * accepted a status of *Live* or *Finished*, a `finalScoreData` and a `liveState` — a second, weaker
 * way into match state beside the scoring actions built for it. The two were not equivalent, which
 * is what made it a problem rather than a duplication:
 *
 *  - Finishing a match through it wrote **no game-log entry**, where `UPDATE_GAME_STATUS` records
 *    every status change. The same event left a trail or not depending on the screen.
 *  - *Live* needed an editor and *Finished* a scorer, so one field sat under two rules.
 *  - It would finish a match with **no result**, and a match that had been started carries an empty
 *    live score — which the standings engine read as a 0–0 draw.
 *  - `finalScoreData` and `liveState` were accepted though no client sends them, so only a
 *    hand-built payload could reach a path that wrote a result past the scoring rules.
 *
 * So `UPDATE_GAME` is planning now, and a result is recorded through `RECORD_GAME_RESULT` — under
 * the scorer's permission (which already admits editors), logged, and with a result or an explicit
 * *not provided* rather than nothing.
 *
 * These are **validation**, not permission — whether the request makes sense, not who may make it —
 * so they run in the handler, after the gates. Kept out of `index.ts` so a script can test them.
 */

/** The statuses that are decisions about a fixture, rather than about the match being played. */
const PLANNING_STATUSES = ['Scheduled', 'Cancelled'];

/**
 * Refuse an `UPDATE_GAME` that reaches into the result or the match's progress.
 *
 * A status that is *unchanged* is allowed whatever it is, so moving a finished match's venue still
 * saves: the edit form sends the status it was given back.
 */
export function refuseResultInFixtureEdit(data: any, current: Pick<Game, 'status'>): void {
  if (!data) return;
  if (data.finalScoreData !== undefined || data.liveState !== undefined) {
    throw new Error('A result is recorded from the match itself — use Record result.');
  }
  if (data.status === undefined || data.status === current.status) return;

  if (!PLANNING_STATUSES.includes(data.status)) {
    throw new Error(
      data.status === 'Finished'
        ? 'A match is finished by recording its result — use Record result.'
        : 'A match is started from its scoring screen.'
    );
  }
  // Scheduled and Cancelled are only between each other: taking a match that has started or
  // finished back to Scheduled would leave its result behind on a fixture that has not been played.
  if (!PLANNING_STATUSES.includes(current.status as string)) {
    throw new Error('This match has already started, so its status is changed from the match itself.');
  }
}

/**
 * Check a `RECORD_GAME_RESULT` payload against the match it is for.
 *
 * Exactly one of a score and *not provided*. Both sides must be known, since a result for "Winner
 * QF1 v Winner QF2" is a result for nobody. And a score covers every side and only those sides —
 * a half-entered score recorded as final is the kind of thing that decides a pool by accident.
 */
export function validateRecordedResult(
  game: Pick<Game, 'participants'>,
  payload: { scores?: Record<string, number>; notProvided?: boolean }
): void {
  const { scores, notProvided } = payload;
  if (!!notProvided === !!scores) {
    throw new Error('Record either the score or that it was not provided.');
  }

  const sides = game.participants || [];
  if (sides.length < 2) throw new Error('A match needs two sides before it has a result.');
  if (sides.some(p => !p.teamId && !p.orgProfileId && !(p as any).entrantId)) {
    throw new Error('Both sides must be known before a result can be recorded.');
  }

  if (!scores) return;
  const sideIds = sides.map(p => p.id);
  const given = Object.keys(scores);
  if (sideIds.some(id => !given.includes(id)) || given.some(id => !sideIds.includes(id))) {
    throw new Error('Give a score for every side of the match.');
  }
  if (Object.values(scores).some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
    throw new Error('A score must be a number, zero or more.');
  }
}
