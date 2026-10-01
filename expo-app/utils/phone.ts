import { DEFAULT_COUNTRY_CODE, parseCellphone } from '@sk/shared';

/**
 * Showing a cellphone number. Numbers are stored in international form, `+27825550100`
 * (`parseCellphone` in `@sk/shared`, decided 2026-09-30); a South African one is shown the way
 * people write it here, `082 555 0100`. Anything else is shown as stored.
 *
 * Also what an edit field is filled with, so a person edits the number in the form they know. The
 * server stores whatever they type in international form, and treats the same number typed another
 * way as unchanged — so a form's "has this changed" check compares {@link sameCellphone}, never
 * the text.
 *
 * A number saved before numbers were checked may not be readable; it is shown exactly as it was
 * typed.
 */
export function formatCellphone(stored: string | null | undefined): string {
  if (!stored) return '';
  const parsed = parseCellphone(stored);
  if (!parsed?.ok) return stored;
  const prefix = `+${DEFAULT_COUNTRY_CODE}`;
  if (parsed.value.indexOf(prefix) !== 0) return parsed.value;
  const n = parsed.value.slice(prefix.length);
  return `0${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
}

/** Are two numbers the same number, however each was typed? Blank equals blank. */
export function sameCellphone(a: string | null | undefined, b: string | null | undefined): boolean {
  const read = (v: string | null | undefined) => {
    const parsed = parseCellphone(v);
    return parsed ? (parsed.ok ? parsed.value : (v || '').trim()) : '';
  };
  return read(a) === read(b);
}

/** Why a typed number cannot be saved, or `null` when it can (blank can). For a form's own check. */
export function cellphoneProblem(typed: string | null | undefined): string | null {
  const parsed = parseCellphone(typed);
  return parsed && !parsed.ok ? parsed.problem : null;
}
