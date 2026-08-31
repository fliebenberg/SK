import { PoolClient } from 'pg';

/**
 * Migration: give sports an `event_sections` column and backfill it from their templates.
 *
 * Sections used to be a fixed union in the client — four panels mounted by name, with `Scoring`
 * carrying the extra meaning "this event changes the score". They are per-sport data now, so each
 * sport needs the list it was implicitly using: the distinct `section` values its templates name,
 * in the order they first appear, with the headings the client used to hardcode.
 *
 * Sports with no templates get an empty list and derive nothing, which is correct — they have no
 * events to file.
 */

/** The headings `DynamicScoringPanel` used to hold in its own `SECTION_TITLES` map. */
const KNOWN_SECTION_NAMES: Record<string, string> = {
  Scoring: 'Scoring Events',
  'Game Events': 'Game Events',
  Infringements: 'Infringement Events',
  Stats: 'Stats Events',
};

export const up = async (client: PoolClient) => {
  await client.query(`
    ALTER TABLE sports ADD COLUMN IF NOT EXISTS event_sections JSONB DEFAULT '[]'::jsonb;
  `);

  const res = await client.query(`
    SELECT id, event_templates as "eventTemplates", event_sections as "eventSections"
    FROM sports
  `);

  for (const row of res.rows) {
    // Never overwrite a list that is already there — this migration may run after a deploy in
    // which the editor has already written sections.
    if (Array.isArray(row.eventSections) && row.eventSections.length > 0) continue;

    const sections: Array<{ id: string; name: string; affectsScore?: boolean }> = [];
    const seen = new Set<string>();
    for (const template of row.eventTemplates || []) {
      const id = template?.section;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      sections.push({
        id,
        name: KNOWN_SECTION_NAMES[id] || id,
        // `Scoring` is the only section that carried this meaning before it was data.
        ...(id === 'Scoring' ? { affectsScore: true } : {}),
      });
    }

    if (sections.length === 0) continue;

    await client.query(`UPDATE sports SET event_sections = $1::jsonb WHERE id = $2`, [
      JSON.stringify(sections),
      row.id,
    ]);
  }
};
