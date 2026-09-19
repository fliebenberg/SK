import { describe, expect, it } from 'vitest';
import { divisionAutoName, findTakenDivisionName, isAutomaticDivisionName } from './divisionName';

describe('a division’s automatic name (U50)', () => {
  it('puts the sport first, then the age group', () => {
    expect(divisionAutoName('Rugby', 'u14')).toBe('Rugby U14');
    expect(divisionAutoName('Rugby', '')).toBe('Rugby');
    expect(divisionAutoName(undefined, 'U14')).toBe('U14');
    expect(divisionAutoName(undefined, undefined)).toBe('');
  });

  it('numbers a division that shares its sport and age group with another', () => {
    expect(divisionAutoName('Rugby', 'U14', ['Rugby U14'])).toBe('Rugby U14 - 2');
    expect(divisionAutoName('Rugby', 'U14', ['Rugby U14', 'Rugby U14 - 2'])).toBe('Rugby U14 - 3');
    // The lowest free number, so a gap left by a deleted division is filled.
    expect(divisionAutoName('Rugby', 'U14', ['Rugby U14', 'Rugby U14 - 3'])).toBe('Rugby U14 - 2');
    // A hand-named sibling takes nothing.
    expect(divisionAutoName('Rugby', 'U14', ["Girls' Open"])).toBe('Rugby U14');
  });

  it('keeps a numbered name for as long as it is free', () => {
    // The first "Rugby U14" was deleted; this one does not silently become "Rugby U14".
    expect(divisionAutoName('Rugby', 'U14', [], 'Rugby U14 - 2')).toBe('Rugby U14 - 2');
    // …but a name somebody else now holds is not kept.
    expect(divisionAutoName('Rugby', 'U14', ['Rugby U14', 'Rugby U14 - 2'], 'Rugby U14 - 2')).toBe(
      'Rugby U14 - 3'
    );
    // Nor is a variant of a different base, once the age group changes.
    expect(divisionAutoName('Rugby', 'U16', [], 'Rugby U14 - 2')).toBe('Rugby U16');
  });

  it('recognises every name the app hands out as its own', () => {
    const context = { sportName: 'Rugby', ageGroup: 'U14', eventName: "Fred's Test Tournament" };
    expect(isAutomaticDivisionName('', context)).toBe(true);
    expect(isAutomaticDivisionName('Rugby U14', context)).toBe(true);
    expect(isAutomaticDivisionName('Rugby U14 - 2', context)).toBe(true);
    expect(isAutomaticDivisionName("Fred's Test Tournament", context)).toBe(true);
    expect(isAutomaticDivisionName('Division 2', context)).toBe(true);
  });

  it('leaves a name somebody typed alone', () => {
    const context = { sportName: 'Rugby', ageGroup: 'U14' };
    expect(isAutomaticDivisionName("Girls' Open", context)).toBe(false);
    expect(isAutomaticDivisionName('Rugby U14 - A', context)).toBe(false);
    // The old order is a hand-typed name now, not the automatic one.
    expect(isAutomaticDivisionName('U14 Rugby', context)).toBe(false);
  });
});

describe('division names are unique within a tournament', () => {
  const taken = ['Rugby U14', "Girls' Open"];

  it('finds a name that is already taken, whatever its capitalisation or spacing', () => {
    expect(findTakenDivisionName('Rugby U14', taken)).toBe('Rugby U14');
    expect(findTakenDivisionName('rugby u14', taken)).toBe('Rugby U14');
    expect(findTakenDivisionName('  RUGBY U14  ', taken)).toBe('Rugby U14');
    expect(findTakenDivisionName("girls' open", taken)).toBe("Girls' Open");
  });

  it('lets a free name through', () => {
    expect(findTakenDivisionName('Rugby U16', taken)).toBeUndefined();
    expect(findTakenDivisionName('Rugby U14 - 2', taken)).toBeUndefined();
    // An empty name is a different problem, not a duplicate.
    expect(findTakenDivisionName('   ', taken)).toBeUndefined();
  });

  it('never produces an automatic name that clashes only by case', () => {
    expect(divisionAutoName('Rugby', 'U14', ['rugby u14'])).toBe('Rugby U14 - 2');
    expect(divisionAutoName('Rugby', 'U14', ['RUGBY U14', 'rugby u14 - 2'])).toBe('Rugby U14 - 3');
    expect(divisionAutoName('Rugby', 'U14', ['rugby u14'], 'Rugby U14')).toBe('Rugby U14 - 2');
  });
});
