import { describe, expect, it } from 'vitest';
import { normalizeNationalId, saIdNumberProblem } from './nationalId';

describe('national ID numbers', () => {
  it('compare without spaces, dashes or case', () => {
    expect(normalizeNationalId(' 800101 5009 087 ')).toBe('8001015009087');
    expect(normalizeNationalId('a12-345')).toBe('A12345');
  });

  it('pass a valid South African ID number', () => {
    expect(saIdNumberProblem('8001015009087')).toBeNull();
    expect(saIdNumberProblem('800101 5009 087', '1980-01-01')).toBeNull();
  });

  it('warn about a failed check digit', () => {
    expect(saIdNumberProblem('8001015009088')).toMatch(/fails the South African ID number check/);
  });

  it('warn about a date that is not a date', () => {
    expect(saIdNumberProblem('8013015009087')).toMatch(/does not start with a real date/);
    expect(saIdNumberProblem('8002305009087')).toMatch(/does not start with a real date/);
  });

  it('warn when the ID and the birthdate disagree', () => {
    expect(saIdNumberProblem('8001015009087', '1980-02-01')).toMatch(/but the birthdate is 1980-02-01/);
  });

  it('leave passports and other countries alone', () => {
    expect(saIdNumberProblem('A12345678')).toBeNull();
    expect(saIdNumberProblem('123456789')).toBeNull();
  });
});
