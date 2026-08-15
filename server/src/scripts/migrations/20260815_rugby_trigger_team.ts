import { PoolClient } from 'pg';
import { RUGBY_SEED_SPEC } from '../setup/seeds/sports/rugby.seed';

/**
 * Migration: Declare which side a triggered follow-up event belongs to.
 *
 * `Outcome.triggerEventId` said what a completed event spawns but never whose it is. The rule
 * lived in expo-app as a hardcoded pair of template ids ("penalty_awarded" and "free_kick" flip
 * to the other team, everything else does not), so the server — which also cascades edits to
 * linked children — had no way to know, and the event feed's "add the follow-up" pill did not
 * know either.
 *
 * Templates now carry `triggerTeam: 'same' | 'opponent'` alongside `triggerEventId`, defaulting
 * to `same`. In rugby the penalty and free kick outcomes that award something to the opposition
 * (`penalty_kick`, `line_kick`, `scrum`) are marked `opponent`; a try's conversion stays with
 * the scoring team by default.
 *
 * Rewrites rugby's `event_templates` from the canonical seed, as
 * `20260810_update_rugby_event_templates` did — the seed is the source of truth for the spec and
 * a full rewrite keeps the DB copy from drifting field by field.
 */
export const up = async (client: PoolClient) => {
  const templatesJson = JSON.stringify(RUGBY_SEED_SPEC.eventTemplates);

  const res = await client.query(
    `UPDATE sports
     SET event_templates = $1
     WHERE id = 'rugby' OR id = 'sport-rugby';`,
    [templatesJson]
  );

  console.log(`[trigger_team] Rewrote event_templates for ${res.rowCount} rugby sport row(s).`);
};
