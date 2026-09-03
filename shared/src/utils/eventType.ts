import { Event, EventFormat, eventFormatLabel } from '../models/event/Event';

/**
 * What kind of event this is — answered explicitly, including when the answer is "we do not know".
 *
 * This exists because of `FIX-1`. Every consumer used to test `type === 'SingleMatch'` and fall
 * through to Tournament, so an event with no type got the Tournament badge, the Tournament
 * navigation and the generic actions — silently, and wrongly. The schema half was closed in Phase 1
 * (`events.type` is `NOT NULL` with a `CHECK`), and U39 settled what the client should do with the
 * case that can no longer arise: **fail loudly rather than fall back**. An event whose type we
 * cannot name is a bug to surface, not a shape to absorb.
 *
 * So callers branch on `kind` and handle all three cases. There is no `isSingleMatch` boolean here
 * on purpose: a boolean has only two branches, and the whole point is that there are three.
 */
export type EventKind = 'SingleMatch' | 'Tournament' | 'Unknown';

export interface ResolvedEventType {
  kind: EventKind;
  /** What a badge should say. Never empty, so a card always has something to render. */
  label: string;
  /** The value we actually met, so an error state can name it rather than shrugging. */
  raw?: string;
}

export function resolveEventType(event?: Pick<Event, 'type'> | null): ResolvedEventType {
  switch (event?.type) {
    case 'SingleMatch':
      return { kind: 'SingleMatch', label: 'Single Match', raw: event.type };
    case 'Tournament':
      return { kind: 'Tournament', label: 'Tournament', raw: event.type };
    default:
      return { kind: 'Unknown', label: 'Unknown Type', raw: (event as any)?.type };
  }
}

/**
 * How a tournament's structure is described in prose, for the line under its name.
 *
 * The format is the label (U34) — a `Festival` is called a Festival, not a Sports Day — so this is
 * the stored value passed through {@link eventFormatLabel} rather than a second vocabulary.
 */
export function tournamentFormatLabel(event?: Pick<Event, 'format'> | null): string {
  return eventFormatLabel(event?.format as EventFormat | undefined);
}

/**
 * The message an error state shows when it meets a type it cannot name.
 *
 * Phrased for an organiser rather than for a developer: they cannot fix the row, but they can tell
 * us which event is broken, and the name is the thing they can see.
 */
export function unknownEventTypeMessage(resolved: ResolvedEventType): string {
  return resolved.raw
    ? `This event is stored with an unrecognised type ("${resolved.raw}"), so we cannot show it safely.`
    : 'This event is stored with no type at all, so we cannot show it safely.';
}
