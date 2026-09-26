import { describe, expect, it } from 'vitest';
import { canConvertTimeZones, instantToZonedInputs, isTimeZone, zonedInputsToInstant } from './zonedTime';

describe('a timezone name', () => {
  it('is an IANA zone the engine knows', () => {
    expect(isTimeZone('Africa/Johannesburg')).toBe(true);
    expect(isTimeZone('Africa/Windhoek')).toBe(true);
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isTimeZone('')).toBe(false);
    expect(isTimeZone(null)).toBe(false);
  });

  it('converts, on this engine', () => {
    expect(canConvertTimeZones()).toBe(true);
  });
});

describe('a kick-off typed at the venue', () => {
  it('is that time on the venue clock, whatever timezone the machine is in', () => {
    expect(zonedInputsToInstant('2026-09-19', '14:30', 'Africa/Johannesburg')).toBe('2026-09-19T12:30:00.000Z');
    expect(zonedInputsToInstant('2026-09-19', '14:30', 'Europe/London')).toBe('2026-09-19T13:30:00.000Z');
    expect(zonedInputsToInstant('2026-09-19', '14:30', 'Asia/Kolkata')).toBe('2026-09-19T09:00:00.000Z');
  });

  it('reads back as the same date and time it was typed as', () => {
    for (const zone of ['Africa/Johannesburg', 'America/New_York', 'Pacific/Auckland', 'Asia/Kolkata']) {
      const instant = zonedInputsToInstant('2026-01-05', '09:15', zone);
      expect(instantToZonedInputs(instant, zone)).toEqual({ date: '2026-01-05', time: '09:15' });
    }
  });

  it('keeps its day either side of midnight UTC', () => {
    // 01:00 in Auckland is the previous day in UTC; 23:00 in New York is the next.
    const early = zonedInputsToInstant('2026-06-10', '01:00', 'Pacific/Auckland');
    expect(early).toBe('2026-06-09T13:00:00.000Z');
    expect(instantToZonedInputs(early, 'Pacific/Auckland')).toEqual({ date: '2026-06-10', time: '01:00' });
    const late = zonedInputsToInstant('2026-06-10', '23:00', 'America/New_York');
    expect(late).toBe('2026-06-11T03:00:00.000Z');
    expect(instantToZonedInputs(late, 'America/New_York')).toEqual({ date: '2026-06-10', time: '23:00' });
  });

  it('is midnight as 00:00, not 24:00', () => {
    expect(instantToZonedInputs('2026-09-18T22:00:00.000Z', 'Africa/Johannesburg')).toEqual({ date: '2026-09-19', time: '00:00' });
  });

  it('follows daylight saving: the same clock time is a different offset in winter and summer', () => {
    expect(zonedInputsToInstant('2026-01-15', '15:00', 'Europe/London')).toBe('2026-01-15T15:00:00.000Z');
    expect(zonedInputsToInstant('2026-07-15', '15:00', 'Europe/London')).toBe('2026-07-15T14:00:00.000Z');
    // The day the clocks change, either side of the change.
    expect(zonedInputsToInstant('2026-03-29', '00:30', 'Europe/London')).toBe('2026-03-29T00:30:00.000Z');
    expect(zonedInputsToInstant('2026-03-29', '03:30', 'Europe/London')).toBe('2026-03-29T02:30:00.000Z');
  });

  it('is still a real moment when the time is skipped or repeated by a clock change', () => {
    // 01:30 does not happen in London on 29 March 2026; 01:30 happens twice on 25 October.
    const skipped = zonedInputsToInstant('2026-03-29', '01:30', 'Europe/London');
    expect(['2026-03-29T00:30:00.000Z', '2026-03-29T01:30:00.000Z']).toContain(skipped);
    const repeated = zonedInputsToInstant('2026-10-25', '01:30', 'Europe/London');
    expect(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']).toContain(repeated);
  });
});

describe('a kick-off whose time is not set', () => {
  it('is noon at the venue', () => {
    expect(zonedInputsToInstant('2026-09-19', null, 'Africa/Johannesburg')).toBe('2026-09-19T10:00:00.000Z');
    expect(zonedInputsToInstant('2026-09-19', null, 'Africa/Windhoek')).toBe('2026-09-19T10:00:00.000Z');
    expect(zonedInputsToInstant('2026-09-19', null, 'America/New_York')).toBe('2026-09-19T16:00:00.000Z');
  });
});

describe('what is refused', () => {
  it('is a half-typed date or time, or an unknown timezone', () => {
    expect(zonedInputsToInstant('2026-09-1', '14:30', 'Africa/Johannesburg')).toBeNull();
    expect(zonedInputsToInstant('2026-09-19', '14:3', 'Africa/Johannesburg')).toBeNull();
    expect(zonedInputsToInstant('2026-09-19', '25:00', 'Africa/Johannesburg')).toBeNull();
    expect(zonedInputsToInstant('2026-09-19', '14:30', 'Nowhere/Special')).toBeNull();
    expect(instantToZonedInputs('not a date', 'Africa/Johannesburg')).toBeNull();
    expect(instantToZonedInputs(null, 'Africa/Johannesburg')).toBeNull();
    expect(instantToZonedInputs('2026-09-19T12:30:00.000Z', 'Nowhere/Special')).toBeNull();
  });
});
