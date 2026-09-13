/**
 * The setup steps, in the order a tournament is actually set up (U46) — and where each one lives
 * now that a step is a screen rather than a section (U48).
 *
 * This module holds only what *every* step screen needs: the order, the labels, and where each one
 * routes. Whether a step is **done** is a different question — it is read off the event, its
 * divisions, its entrants and its fixtures, and the only screen holding all of that is the
 * checklist itself, so the statuses are computed there and never here.
 *
 * **Two steps route to screens that already existed.** Entrants has had its own screen since U21
 * and the divisions under `What's being played` have had theirs since U13. Giving those a second
 * screen apiece would recreate the split this change exists to remove, so the checklist links to
 * what is already there.
 *
 * `Schedule` was dropped in U48. It was hardcoded `status: 'todo'`, so it could never complete and
 * the progress line could never read *Setup complete* unless an organiser dismissed it — a step
 * that exists to be put away is not a step. It comes back when there is a schedule grid behind it.
 * Its key is deliberately not reused: an event dismissed it under `'schedule'`, and that entry
 * simply no longer matches anything.
 */

export type SetupStepKey = 'basics' | 'divisions' | 'entrants' | 'scoring' | 'fixtures';

export interface SetupStepRoute {
  /** Stable across releases — it is what a dismissal is recorded against. */
  key: SetupStepKey;
  label: string;
  /** False for steps that must always be answered. */
  dismissible: boolean;
  href: (orgId: string, eventId: string) => string;
}

export const SETUP_STEPS: SetupStepRoute[] = [
  {
    key: 'basics',
    label: 'Basics',
    dismissible: false,
    href: (orgId, eventId) => `/admin/${orgId}/events/${eventId}/setup/basics`,
  },
  {
    key: 'divisions',
    label: "What's being played",
    dismissible: false,
    href: (orgId, eventId) => `/admin/${orgId}/events/${eventId}/setup/playing`,
  },
  {
    key: 'entrants',
    label: 'Entrants',
    dismissible: true,
    href: (orgId, eventId) => `/admin/${orgId}/events/${eventId}/entrants`,
  },
  {
    key: 'scoring',
    label: 'Rules & scoring',
    dismissible: true,
    href: (orgId, eventId) => `/admin/${orgId}/events/${eventId}/setup/scoring`,
  },
  {
    key: 'fixtures',
    label: 'Fixtures',
    dismissible: true,
    href: (orgId, eventId) => `/admin/${orgId}/events/${eventId}/setup/fixtures`,
  },
];

/** Where the checklist lives. Also the back destination from every step screen. */
export const setupChecklistHref = (orgId: string, eventId: string) =>
  `/admin/${orgId}/events/${eventId}?tab=setup`;

/**
 * The step after this one, skipping any the organiser has put away.
 *
 * `undefined` at the end of the list, which is what makes the last screen offer a way back to the
 * checklist instead of a `Next`. Order is never enforced — this only answers "what would you
 * probably do next", because setup is a checklist and not a wizard (U17).
 */
export function nextStepAfter(
  key: SetupStepKey,
  dismissed: string[] = []
): SetupStepRoute | undefined {
  const index = SETUP_STEPS.findIndex(step => step.key === key);
  if (index === -1) return undefined;
  return SETUP_STEPS.slice(index + 1).find(step => !dismissed.includes(step.key));
}
