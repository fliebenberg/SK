import { PoolClient } from 'pg';
import { RUGBY_SEED_SPEC } from '../setup/seeds/sports/rugby.seed';

/**
 * Migration: Let an outcome seed the follow-up event it spawns.
 *
 * The scrum outcomes on `penalty_awarded` and `free_kick` carried `eventData: { reason: "Penalty" }`
 * / `{ reason: "Free Kick" }`, which reads as "the scrum was awarded for a penalty" but is not what
 * `Outcome.eventData` means: the mutation engine merges it onto the event being edited, so setting
 * a free kick's outcome to Scrum overwrote the free kick's own infringement reason ("Early Push")
 * with "Free Kick". `tap_go` carried the same field with no follow-up at all to justify it.
 *
 * Those values move to `triggerEventData`, which is prefilled into the spawned child instead, and
 * the ids are corrected to reasons the child actually defines — the old strings matched nothing in
 * the scrum template's reason list, so even as child data they would have shown as unresolved. The
 * scrum template gains a `free_kick` reason to match; `penalty_scrum` ("Penalty") already existed.
 *
 * Rewrites rugby's `event_templates` from the canonical seed, as
 * `20260815_rugby_trigger_team` did — the seed is the source of truth for the spec and a full
 * rewrite keeps the DB copy from drifting field by field. Both rewrite the same constant, so the
 * order the two run in does not matter.
 */
export const up = async (client: PoolClient) => {
  const templatesJson = JSON.stringify(RUGBY_SEED_SPEC.eventTemplates);

  const res = await client.query(
    `UPDATE sports
     SET event_templates = $1
     WHERE id = 'rugby' OR id = 'sport-rugby';`,
    [templatesJson]
  );

  console.log(`[trigger_event_data] Rewrote event_templates for ${res.rowCount} rugby sport row(s).`);
};
