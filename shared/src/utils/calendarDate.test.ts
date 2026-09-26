import { describe, expect, it } from 'vitest';
import { addCalendarDays, assertCalendarDates, calendarDateParts, isCalendarDate, toCalendarDate } from './calendarDate';

describe('a calendar date', () => {
  it('is a complete, real YYYY-MM-DD', () => {
    expect(isCalendarDate('2026-09-19')).toBe(true);
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(calendarDateParts('2010-02-06')).toEqual([2010, 2, 6]);
  });

  it('is not a date-shaped string that means another day', () => {
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2025-02-29')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
  });

  it('is not a timestamp, a half-typed value or another spelling', () => {
    expect(isCalendarDate('2026-09-19T12:00:00.000Z')).toBe(false);
    expect(isCalendarDate('2026-09-1')).toBe(false);
    expect(isCalendarDate('19/09/2026')).toBe(false);
    expect(isCalendarDate('')).toBe(false);
    expect(isCalendarDate(null)).toBe(false);
    expect(isCalendarDate(new Date())).toBe(false);
  });

  it('is written zero-padded, so it sorts as a string', () => {
    expect(toCalendarDate(2026, 9, 1)).toBe('2026-09-01');
    expect(toCalendarDate(2026, 9, 1) < toCalendarDate(2026, 10, 1)).toBe(true);
  });
});

describe('adding days', () => {
  it('crosses months, years and leap days', () => {
    expect(addCalendarDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('refuses a value that is not a date yet', () => {
    expect(addCalendarDays('2026-09-1', 1)).toBeNull();
  });
});

describe('checking a request', () => {
  it('passes real dates, null and absent fields', () => {
    expect(() => assertCalendarDates({ startDate: '2026-09-19', endDate: null }, { startDate: 'Start', endDate: 'End' })).not.toThrow();
    expect(() => assertCalendarDates(undefined, { startDate: 'Start' })).not.toThrow();
  });

  it('refuses a timestamp, naming the field', () => {
    expect(() => assertCalendarDates({ startDate: '2026-09-19T12:00:00.000Z' }, { startDate: 'Start date' }))
      .toThrow('Start date must be a date in the form YYYY-MM-DD.');
  });
});
