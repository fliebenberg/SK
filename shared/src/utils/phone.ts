/**
 * Cellphone numbers: one stored form, whatever was typed (decided 2026-09-30).
 *
 * **Stored in international form** — `+27825550100` — so the same number typed as `082 555 0100`,
 * `+27 82 555 0100` or `0027825550100` is one value, which is what comparing two people needs and
 * what a WhatsApp or SMS link needs later. The app shows a South African number as `082 555 0100`
 * (`formatCellphone` in `expo-app/utils/phone.ts`).
 *
 * **South Africa is assumed** for a number with no country code: every organisation on the app is
 * South African today, and nothing records an organisation's country (an address's `country` is
 * free text). A number from anywhere else is typed with `+` and its country code.
 *
 * The server stores what {@link parseCellphone} returns and refuses what it cannot read; the app
 * runs the same function, so a form and the server cannot disagree.
 */

/** The country code assumed when a number has none. */
export const DEFAULT_COUNTRY_CODE = '27';

/** The examples every message and help text shows, so they cannot drift apart. */
export const CELLPHONE_EXAMPLES = '082 555 0100, +27 82 555 0100 or +44 7700 900123';

export type CellphoneParse =
  | { ok: true; value: string }
  | { ok: false; problem: string };

/**
 * Read a cellphone number in any of the ways people type one:
 *
 * | Typed | Read as |
 * |---|---|
 * | `082 555 0100`, `082-555-0100`, `(082) 555 0100` | `+27825550100` |
 * | `+27 82 555 0100`, `0027 82 555 0100`, `27825550100` | `+27825550100` |
 * | `825550100` — Excel dropped the leading 0 | `+27825550100` |
 * | `+27 082 555 0100` — the 0 kept after the code | `+27825550100` |
 * | `+44 7700 900123` | `+447700900123` |
 *
 * Refused: letters, too few or too many digits, and a `+` anywhere but the front. A South African
 * number has nine digits after the 0 (or after +27); an international one has 8 to 15 digits in
 * all, the E.164 limit. Blank is `null` — nothing to store.
 */
export function parseCellphone(text: string | null | undefined): CellphoneParse | null {
  const typed = (text || '').trim();
  if (!typed) return null;
  const problem = { ok: false as const, problem: `"${typed}" is not a cellphone number we can read. Use a South African number or an international one starting with +, such as ${CELLPHONE_EXAMPLES}.` };

  // Spaces, dashes, dots, slashes and brackets are how numbers are grouped, not part of them.
  const compact = typed.replace(/[\s\-.()/]/g, '');
  if (!/^\+?\d+$/.test(compact)) return problem;

  let international: string | null = null;
  if (compact.charAt(0) === '+') international = compact.slice(1);
  else if (compact.slice(0, 2) === '00') international = compact.slice(2);

  if (international !== null) {
    if (international.slice(0, DEFAULT_COUNTRY_CODE.length) === DEFAULT_COUNTRY_CODE) {
      let national = international.slice(DEFAULT_COUNTRY_CODE.length);
      if (national.charAt(0) === '0') national = national.slice(1);
      return national.length === 9 ? { ok: true, value: `+${DEFAULT_COUNTRY_CODE}${national}` } : problem;
    }
    if (international.charAt(0) === '0' || international.length < 8 || international.length > 15) return problem;
    return { ok: true, value: `+${international}` };
  }

  // No country code: a South African number, with or without its leading 0.
  if (compact.length === 10 && compact.charAt(0) === '0') return { ok: true, value: `+${DEFAULT_COUNTRY_CODE}${compact.slice(1)}` };
  if (compact.length === 9 && compact.charAt(0) !== '0') return { ok: true, value: `+${DEFAULT_COUNTRY_CODE}${compact}` };
  if (compact.length === 11 && compact.slice(0, 2) === DEFAULT_COUNTRY_CODE) return { ok: true, value: `+${compact}` };
  return problem;
}

/**
 * A stored number as something to compare: its international form when it can be read, else its
 * digits. Numbers saved before 2026-09-30 are as they were typed, and must still compare equal to
 * the same number typed another way.
 */
export function cellphoneKey(stored: string | null | undefined): string {
  const parsed = parseCellphone(stored);
  if (parsed?.ok) return parsed.value;
  return (stored || '').replace(/\D/g, '');
}

/**
 * The digits to look for when someone searches for a number, or `null` if the search is not one.
 * A leading 0 is dropped, because it is not stored: `082 555` finds `+27825550100`.
 */
export function cellphoneSearchDigits(query: string | null | undefined): string | null {
  const q = (query || '').trim();
  if (!/^[+\d][\d\s\-.()/]*$/.test(q)) return null;
  let digits = q.replace(/\D/g, '');
  if (digits.charAt(0) === '0') digits = digits.replace(/^0+/, '');
  return digits.length >= 3 ? digits : null;
}
