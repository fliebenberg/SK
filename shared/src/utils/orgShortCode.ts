/**
 * An organisation's short code — the thing that fits where its name does not.
 *
 * A code was optional until now, which was fine while it was decoration on the org settings
 * screen. It stopped being fine when the tournament entrants screen made it load-bearing: an
 * organisation column heading, a tab, a team flag on a phone — all places where "Hoërskool
 * Menlopark" cannot go and "HMP" can. A screen that has to fall back to the full name for the
 * three orgs that never set one is a screen with three broken columns, so the code is now
 * required on every organisation.
 *
 * **Codes are deliberately not unique.** Two schools genuinely are both "NHS" in real life, and a
 * uniqueness constraint would make organisation creation start refusing the obvious answer and
 * push people into "NHS2". Where a code could be ambiguous the UI shows the full name beside it —
 * which is what the large-screen org flag already does — so ambiguity is a display problem rather
 * than a data one.
 *
 * Requiring a field nobody was filling in means supplying it, hence {@link deriveOrgShortCode}:
 * every create path pre-fills the field from the name as it is typed, and the user overwrites it
 * if the guess is wrong. The same function backfilled the existing rows in
 * `20260920_org_short_code.ts`, so the derivation has to be good enough to live with unedited.
 */

/** Matches the `maxLength` the org settings field has always had. */
export const ORG_SHORT_CODE_MAX_LENGTH = 6;

/**
 * Words that carry no initial. "University of Cape Town" is UCT, not UOCT — dropping these is the
 * whole difference between a derivation people keep and one they retype.
 */
const CONNECTORS = new Set(['the', 'of', 'and', 'for', 'a', 'an', 'at', 'in', 'on', 'de', 'la', 'le', 'van', 'der', 'den']);

/** Word separators. Apostrophes are *not* here: "John's" is one word, not "John" and "s". */
const SEPARATORS = /[\s/_-]+/;

/** Everything that is not a Latin letter or a digit, stripped from inside a word. */
const NOT_LETTER_OR_DIGIT = /[^0-9A-Za-zÀ-ÖØ-öø-ÿ]/g;

/**
 * What a human typed, tidied into a code: no spaces, upper case, capped.
 *
 * Lenient about *which* characters, because a code somebody chose is theirs — an accented letter
 * or a digit is kept as typed. It only takes away what a code cannot contain: whitespace, and
 * length beyond the field.
 */
export function normalizeOrgShortCode(input?: string | null): string {
  return (input || '').replace(/\s+/g, '').toUpperCase().slice(0, ORG_SHORT_CODE_MAX_LENGTH);
}

/**
 * A code guessed from an organisation's name.
 *
 * Two or more significant words give their initials; a single word gives its first three letters,
 * because "N" is not a code and "NOR" is. Returns `''` for a name with nothing in it — callers
 * decide what to do about that rather than being handed a placeholder they cannot distinguish
 * from a real answer.
 */
export function deriveOrgShortCode(name?: string | null): string {
  const words = (name || '')
    .split(SEPARATORS)
    .map(word => word.replace(NOT_LETTER_OR_DIGIT, ''))
    .filter(Boolean);
  if (!words.length) return '';

  const significant = words.filter(word => !CONNECTORS.has(word.toLowerCase()));
  // A name made entirely of connectors ("The Oval") keeps them rather than deriving nothing.
  const source = significant.length ? significant : words;

  const code =
    source.length >= 2
      ? source.map(word => word[0]).join('')
      : source[0].slice(0, 3);

  return normalizeOrgShortCode(code);
}
