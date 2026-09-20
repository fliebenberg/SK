/**
 * What a form should do when the record it is editing changes underneath it.
 *
 * Every screen in this app edits data that is also live: a room can publish a new version of the
 * record while somebody has the form open. Screens handled that with an effect that re-seeded the
 * drafts whenever the record changed, and that shape has two faults which look unrelated and are
 * the same mistake — treating the live record as the thing the drafts are measured against.
 *
 * - **The Save row flashes on every other viewer's screen.** The update arrives one render before
 *   the effect re-seeds, so for that frame the new record sits beside the old drafts and the form
 *   declares itself dirty. Reported on the division screen: editing a name on one device made a
 *   button blink on another.
 * - **An edit in progress is silently discarded.** Re-seeding unconditionally means a remote change
 *   to *any* field throws away a half-typed value on every other open screen — the loss
 *   `useUnsavedChanges` exists to prevent, arriving through the back door.
 *
 * Both go away by keeping a **baseline**: the values the drafts were last seeded from. Dirtiness is
 * drafts-against-baseline, and the two only ever move together, so no frame can exist in which
 * they disagree. This function then decides what an incoming record means.
 */
export type ReseedDecision =
  /** Take the incoming values: seed the drafts *and* the baseline from them, in one batch. */
  | 'adopt'
  /** Somebody is mid-edit and the incoming values are somebody else's. Leave the drafts alone. */
  | 'keep'
  /** Nothing moved. Write no state — an effect that writes unconditionally feeds itself. */
  | 'unchanged';

export function reseedDecision<T>(args: {
  /**
   * What the drafts were last seeded from, or `null` before the first load — and `null` also when
   * the form has changed subject, since a different record is a different form and whatever was
   * typed in the last one does not carry over.
   */
  baseline: T | null;
  /** The drafts as they stand. */
  drafts: T;
  /** The record as it has just arrived. */
  incoming: T;
  /** Equality over the fields the form edits. */
  same: (a: T, b: T) => boolean;
}): ReseedDecision {
  const { baseline, drafts, incoming, same } = args;

  // Nothing to protect yet.
  if (!baseline) return 'adopt';

  // The record has not moved, whatever the drafts are doing. Said before the conflict check so a
  // form with unsaved edits does not re-decide on every unrelated render.
  if (same(baseline, incoming)) return 'unchanged';

  // Nothing typed here, so there is nothing to lose and a change made elsewhere should show.
  if (same(drafts, baseline)) return 'adopt';

  // This device's own save landing back: the drafts already equal what arrived, so adopting is a
  // no-op for them and moves the baseline — which is what brings the Save row down.
  if (same(drafts, incoming)) return 'adopt';

  return 'keep';
}
