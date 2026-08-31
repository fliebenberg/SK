import { EventTemplate } from '../models/sport/EventTemplate';
import { findOutcome, findReason } from './templateSteps';

/**
 * Turning a template's ids into the words a scorer actually saw.
 *
 * A recorded event stores ids — `outcome: "converted"`, `reason: "early_push"` — and the feed
 * used to resolve them against the template every time it drew a row. That made history a
 * reference rather than a record: renaming an outcome rewrote the past, and deleting a template
 * left old rows printing raw ids.
 *
 * So the words are captured onto the event when it is recorded, the same way `period` already
 * stores "1st Half" rather than an index. These helpers are used by both sides — the writer to
 * stamp the labels, the reader to fall back for events recorded before this existed — so the two
 * can never drift.
 */

/** A template, loosely typed so clients holding untyped sport specs can call these too. */
type TemplateLike = Pick<EventTemplate, 'name' | 'outcomes' | 'reasons' | 'outcomeOverrides'> | null | undefined;

/**
 * What an outcome id reads as: its own `displayOverride`, then the template's override map, then
 * its name.
 *
 * `displayOverride` is checked for presence rather than truthiness on purpose — rugby's permanent
 * red sets it to `""`, meaning "print the event name alone", and treating that as absent would
 * make every red card in the log suddenly read "RED".
 */
export function resolveOutcomeLabel(
  template: TemplateLike,
  outcomeId: string | null | undefined
): string | undefined {
  if (outcomeId === undefined || outcomeId === null || outcomeId === '') return undefined;

  const outcome = findOutcome(template as EventTemplate, outcomeId);
  if (outcome?.displayOverride !== undefined) return outcome.displayOverride;

  const override = template?.outcomeOverrides?.[outcomeId];
  if (override !== undefined) return override;

  return outcome?.name;
}

/** What a reason id reads as. */
export function resolveReasonLabel(
  template: TemplateLike,
  reasonId: string | null | undefined
): string | undefined {
  if (reasonId === undefined || reasonId === null || reasonId === '') return undefined;
  return findReason(template as EventTemplate, reasonId)?.name;
}

/** The words to stamp onto an event so its log row survives later edits to the template. */
export interface CapturedEventLabels {
  /** The template's name as it read when the event was recorded. */
  templateName?: string;
  /** The chosen outcome as it read. May be `""` — an outcome that deliberately prints nothing. */
  outcomeName?: string;
  /** The chosen reason as it read. */
  reasonName?: string;
}

/**
 * The labels to merge into an event's `eventData` at write time.
 *
 * Only keys with something to say are returned, so an event with no outcome does not carry an
 * empty one — and a later edit that clears the outcome must clear `outcomeName` with it, which is
 * why the writer merges this over the event data rather than under it.
 */
export function captureEventLabels(
  template: TemplateLike,
  eventData: { outcome?: string | null; reason?: string | null } | undefined
): CapturedEventLabels {
  const labels: CapturedEventLabels = {};

  if (template?.name) labels.templateName = template.name;

  const outcomeName = resolveOutcomeLabel(template, eventData?.outcome);
  if (outcomeName !== undefined) labels.outcomeName = outcomeName;

  const reasonName = resolveReasonLabel(template, eventData?.reason);
  if (reasonName !== undefined) labels.reasonName = reasonName;

  return labels;
}
