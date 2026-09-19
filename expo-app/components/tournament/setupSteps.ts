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
 * and the divisions under `Sports & Divisions` have had theirs since U13. Giving those a second
 * screen apiece would recreate the split this change exists to remove, so the checklist links to
 * what is already there.
 *
 * `Schedule` was dropped in U48. It was hardcoded `status: 'todo'`, so it could never complete and
 * the progress line could never read *Setup complete* unless an organiser dismissed it — a step
 * that exists to be put away is not a step. It comes back when there is a schedule grid behind it.
 * Its key is deliberately not reused: an event dismissed it under `'schedule'`, and that entry
 * simply no longer matches anything.
 */

import { Ionicons } from '@expo/vector-icons';

export type SetupStepKey = 'basics' | 'divisions' | 'entrants' | 'scoring' | 'fixtures';

export interface SetupStepRoute {
  /** Stable across releases — it is what a dismissal is recorded against. */
  key: SetupStepKey;
  label: string;
  /**
   * What the step is *for*, in a few words — "when and where it happens", not "the date field".
   *
   * The checklist showed a label and the state of the data and nothing else, so a row an organiser
   * had not opened yet was a heading with a status next to it and no clue what opening it asked
   * for. This is the line that makes the list readable before any of it is filled in; it shows
   * wherever there is no `detail` to show instead.
   */
  purpose: string;
  /**
   * The step's mark, carried on the row in place of the word "to do".
   *
   * A leading icon does two things a status word cannot: it makes the five rows scannable as a set
   * rather than read one at a time, and it gives the done state somewhere to live — the medallion
   * turns into a check — which is what let the repeated DONE / TO DO column go.
   */
  icon: keyof typeof Ionicons.glyphMap;
  /** False for steps that must always be answered. */
  dismissible: boolean;
  href: (orgId: string, eventId: string) => string;
}

export const SETUP_STEPS: SetupStepRoute[] = [
  {
    key: 'basics',
    label: 'Basic Info',
    purpose: 'When it happens and where it is played',
    icon: 'calendar-outline',
    dismissible: false,
    href: (orgId, eventId) => `/admin/${orgId}/events/${eventId}/setup/basics`,
  },
  {
    key: 'divisions',
    label: 'Sports & Divisions',
    purpose: 'The divisions being contested, and the sport each one plays',
    icon: 'trophy-outline',
    dismissible: false,
    href: (orgId, eventId) => `/admin/${orgId}/events/${eventId}/setup/playing`,
  },
  {
    key: 'entrants',
    label: 'Entrants',
    purpose: 'The schools and teams taking part',
    icon: 'people-outline',
    dismissible: true,
    href: (orgId, eventId) => `/admin/${orgId}/events/${eventId}/entrants`,
  },
  {
    key: 'scoring',
    label: 'Rules & scoring',
    purpose: 'How points are awarded and tables are ranked',
    icon: 'calculator-outline',
    dismissible: true,
    href: (orgId, eventId) => `/admin/${orgId}/events/${eventId}/setup/scoring`,
  },
  {
    key: 'fixtures',
    label: 'Fixtures',
    purpose: 'The matches that will be played',
    icon: 'git-network-outline',
    dismissible: true,
    href: (orgId, eventId) => `/admin/${orgId}/events/${eventId}/setup/fixtures`,
  },
];

/**
 * The step a screen *is*.
 *
 * Every step screen used to hardcode its own label twice — once in its `<ScreenHeader>` and once
 * on its `<SetupStepFooter>` — so a step's name lived in three files and renaming `Basics` to
 * `Basic Info` (U49) meant finding all three. The screens take it from here now, through
 * `useSetupStepScreen`, and this file is the only place a step is named.
 */
export const stepByKey = (key: SetupStepKey): SetupStepRoute =>
  SETUP_STEPS.find(step => step.key === key)!;

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
