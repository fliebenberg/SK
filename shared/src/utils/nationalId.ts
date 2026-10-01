/**
 * National ID numbers: how two are compared, and the check a South African one can be given.
 *
 * The field also holds passport numbers and other countries' IDs, so nothing is refused for its
 * shape. A **thirteen-digit** value is taken to be a South African ID number and checked — its
 * check digit, and that it starts with a real date — and a failure is a **warning**, never a
 * refusal (decided 2026-09-30): a school may hold a number it cannot correct today.
 */

import { calendarDateParts } from './calendarDate';

/** As compared and stored by an import: spaces and dashes removed, letters upper-case. */
export function normalizeNationalId(value: string | null | undefined): string {
  return (value || '').replace(/[\s\-]/g, '').toUpperCase();
}

/** The Luhn check the thirteenth digit of a South African ID number is. */
function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits.charAt(digits.length - 1 - i));
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Why a South African ID number looks wrong, or `null` when it looks right or is not one (anything
 * but thirteen digits). Given the person's birthdate, also says when the two disagree — the ID
 * starts with the date of birth as YYMMDD.
 */
export function saIdNumberProblem(value: string | null | undefined, birthdate?: string | null): string | null {
  const id = normalizeNationalId(value);
  if (!/^\d{13}$/.test(id)) return null;

  const yy = Number(id.slice(0, 2));
  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));
  // Either century will do for "is this a real date": 29 February is checked against a leap year.
  const realDate = [1900, 2000].some(century => {
    const y = century + yy;
    return calendarDateParts(`${y}-${id.slice(2, 4)}-${id.slice(4, 6)}`) !== null;
  });
  if (!realDate || mm < 1 || dd < 1) {
    return `National ID ${id} does not start with a real date of birth (YYMMDD), so it is probably mistyped.`;
  }
  if (!luhnValid(id)) {
    return `National ID ${id} fails the South African ID number check, so it is probably mistyped.`;
  }
  const born = calendarDateParts(birthdate);
  if (born && (born[0] % 100 !== yy || born[1] !== mm || born[2] !== dd)) {
    return `National ID ${id} starts with the date of birth ${id.slice(0, 2)}-${id.slice(2, 4)}-${id.slice(4, 6)} (YY-MM-DD), but the birthdate is ${birthdate}. One of them is probably wrong.`;
  }
  return null;
}
