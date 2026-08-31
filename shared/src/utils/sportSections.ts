import { EventSection, Sport } from '../models/sport/Sport';
import { EventTemplate } from '../models/sport/EventTemplate';

/**
 * Helpers for reading a sport's event sections.
 *
 * A section is the panel a scorer finds an event button on, and the answer to "does this change
 * the score". Both used to be hardcoded: the four panels were a union type mounted by name in the
 * component registry, and `section === 'Scoring'` appeared verbatim in four call sites. Sections
 * are now editable per sport, so both questions have to be asked of the sport itself.
 */

/** A sport whose sections we can read — loosely typed for clients holding untyped specs. */
type SportLike =
  | (Pick<Sport, 'eventSections'> & { eventTemplates?: EventTemplate[] })
  | null
  | undefined;

/**
 * The sport's sections, in panel order.
 *
 * When a sport declares none — an older row that predates the column, or a spec that never set
 * them — they are derived from the sections its templates actually name, so the scoring screen
 * still renders every event rather than none. `Scoring` keeps its historic meaning in that
 * fallback, since that is what the derived sport was written against.
 */
export function getEventSections(sport: SportLike): EventSection[] {
  const declared = (sport?.eventSections || []).filter((section) => section && section.id);
  if (declared.length > 0) {
    return declared.map((section) => ({ ...section, name: section.name || section.id }));
  }

  const derived: EventSection[] = [];
  const seen = new Set<string>();
  for (const template of sport?.eventTemplates || []) {
    const id = template?.section;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    derived.push({ id, name: id, affectsScore: id === 'Scoring' });
  }
  return derived;
}

/** One section by id, or undefined when the sport does not declare it. */
export function findEventSection(sport: SportLike, sectionId: string | null | undefined): EventSection | undefined {
  if (!sectionId) return undefined;
  return getEventSections(sport).find((section) => section.id === sectionId);
}

/** The heading to draw above a section's panel. Falls back to the raw id. */
export function getEventSectionName(sport: SportLike, sectionId: string | null | undefined): string {
  return findEventSection(sport, sectionId)?.name || sectionId || '';
}

/**
 * Whether recording this template changes the score.
 *
 * Two ways to say yes, and they are deliberately both kept: the template's section is marked as
 * scoring, or the template is worth points. The second is what makes an un-migrated sport behave
 * exactly as it did before sections were editable — every scoring template in the seeds carries
 * points — and it means an admin cannot accidentally make a 5-point try stop counting by filing
 * it under the wrong panel.
 */
export function isScoringTemplate(
  sport: SportLike,
  template: Pick<EventTemplate, 'section' | 'points'> | null | undefined
): boolean {
  if (!template) return false;
  if (findEventSection(sport, template.section)?.affectsScore) return true;
  return (template.points || 0) > 0;
}
