import { describe, expect, it } from 'vitest';
import { clashingFields, sameEditValue, sameTeamSheet, seasonEditFields, teamSheetChanges, listInWords } from './editConflicts';

describe('edit conflicts (SYNC-11)', () => {
  it('treats every kind of blank as the same, and compares objects whatever their key order', () => {
    expect(sameEditValue(null, '')).toBe(true);
    expect(sameEditValue(undefined, null)).toBe(true);
    expect(sameEditValue('logo.png', null)).toBe(false);
    expect(sameEditValue({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it('names only the fields of was that have changed since', () => {
    const now = { name: 'Winter', pointsPerWin: 4, endDate: '2026-08-31' };
    expect(clashingFields(undefined, now)).toEqual([]);
    expect(clashingFields({ name: 'Winter', pointsPerWin: 3 }, now)).toEqual(['pointsPerWin']);
  });

  it('reads a season the way its form does, missing points as the default', () => {
    const fields = seasonEditFields({ name: 'W', startDate: '2026-05-01', endDate: '2026-08-31', settings: {} as any, logo: undefined });
    expect(fields.logo).toBeNull();
    expect(typeof fields.pointsPerWin).toBe('number');
  });

  it('compares team sheets whatever order they were picked in, and lists what differs', () => {
    const a = { orgProfileId: 'a', position: '1', isReserve: false };
    const b = { orgProfileId: 'b', position: '2', isReserve: false };
    expect(sameTeamSheet([a, b], [b, a])).toBe(true);
    expect(sameTeamSheet([a], [a, b])).toBe(false);
    const changes = teamSheetChanges([a, b], [{ ...a, isReserve: true }]);
    expect(changes.map(c => c.orgProfileId).sort()).toEqual(['a', 'b']);
    expect(changes.find(c => c.orgProfileId === 'b')?.yours).toBeNull();
  });

  it('lists in words', () => {
    expect(listInWords(['name'])).toBe('name');
    expect(listInWords(['name', 'logo', 'end date'])).toBe('name, logo and end date');
  });
});
