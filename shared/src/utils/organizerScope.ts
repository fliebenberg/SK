/**
 * Which scope an organiser appointment names (D33, widened 2026-09-20).
 *
 * Three scopes now, and the payload that carries them is one shape, so "which one is this?" is a
 * question asked in the gate, in the manager, in two handlers and in the picker. Asked five times
 * it is five chances to disagree — particularly over the one case that is not obvious: a **sport**
 * grant names an event *and* a sport, so `eventId` alone no longer means "event scope".
 *
 * The order is what makes it total: the most specific field present wins. A payload naming a
 * division is a division grant whatever else it carries; one naming a sport is a sport grant; only
 * an event on its own is an event grant. Anything else names nothing, which is a refusal rather
 * than a default — "no scope" is the shape a payload takes when a caller omitted the field, and
 * guessing on their behalf is how a division grant becomes an event grant.
 */
export type OrganizerScope =
  | { kind: 'event'; eventId: string }
  | { kind: 'sport'; eventId: string; sportId: string }
  | { kind: 'division'; divisionId: string };

/**
 * What an appointment or a withdrawal carries. Every field optional — that is the point.
 *
 * Nullable because this is the shape of an *incoming* payload, where a field can arrive explicitly
 * null. What {@link organizerScopeFields} produces is the narrower {@link OrganizerScopePayload},
 * so assembling a payload never hands a null to an action whose type does not allow one.
 */
export interface OrganizerScopeFields {
  eventId?: string | null;
  sportId?: string | null;
  divisionId?: string | null;
}

/** The same fields as a caller sends them: present or absent, never null. */
export interface OrganizerScopePayload {
  eventId?: string;
  sportId?: string;
  divisionId?: string;
}

/** The scope this payload names, or null when it names none. */
export function organizerScopeOf(fields: OrganizerScopeFields | null | undefined): OrganizerScope | null {
  if (!fields) return null;
  const { eventId, sportId, divisionId } = fields;
  if (divisionId) return { kind: 'division', divisionId };
  // A sport grant is a grant *within one tournament* — the same sport in another tournament is
  // somebody else's job — so it is not expressible without both halves.
  if (sportId && eventId) return { kind: 'sport', eventId, sportId };
  if (eventId) return { kind: 'event', eventId };
  return null;
}

/** The fields to send for a scope — the inverse, so a caller never assembles one by hand. */
export function organizerScopeFields(scope: OrganizerScope): OrganizerScopePayload {
  switch (scope.kind) {
    case 'event':
      return { eventId: scope.eventId };
    case 'sport':
      return { eventId: scope.eventId, sportId: scope.sportId };
    case 'division':
      return { divisionId: scope.divisionId };
  }
}

/**
 * The refusal a scopeless payload earns, worded once.
 *
 * Phrased for a developer rather than an organiser: no screen can produce it, so a user reading it
 * has reached the socket some other way.
 */
export const NO_ORGANIZER_SCOPE =
  'An appointment names a tournament, one of its sports, or one of its divisions.';
