import { describe, expect, it } from 'vitest';
import {
  divisionAutoName,
  divisionSiblingLabel,
  divisionSiblingLabels,
  findTakenDivisionName,
  isAutomaticDivisionName,
} from './divisionName';

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

describe('how a division is labelled beside its siblings', () => {
  const rugby = { sportName: 'Rugby' };

  it('uses the age group when there is one, not the whole automatic name', () => {
    expect(divisionSiblingLabel({ name: 'Rugby U14', ageGroup: 'U14' }, rugby)).toBe('U14');
  });

  it('prefers a name somebody typed over the age group', () => {
    expect(divisionSiblingLabel({ name: 'Cup', ageGroup: 'U14' }, rugby)).toBe('Cup');
  });

  it('names two ageless divisions apart instead of calling both "All ages"', () => {
    expect(divisionSiblingLabel({ name: 'Rugby', ageGroup: null }, rugby)).toBe('Rugby');
    expect(divisionSiblingLabel({ name: 'Rugby - 2', ageGroup: null }, rugby)).toBe('Rugby - 2');
  });

  it('still says "All ages" for a lone division with no name and no age group', () => {
    expect(divisionSiblingLabel({ name: '', ageGroup: null }, rugby)).toBe('All ages');
  });

  it('treats the tournament\'s own name as automatic, so it does not label a pill', () => {
    expect(
      divisionSiblingLabel({ name: "Fred's Test Tournament", ageGroup: 'U14' }, {
        sportName: 'Rugby',
        eventName: "Fred's Test Tournament",
      })
    ).toBe('U14');
  });
});

describe('labelling a sport\'s divisions together', () => {
  const rugby = { sportName: 'Rugby' };
  const labels = (divisions: any[]) => [...divisionSiblingLabels(divisions, rugby).values()];

  it('keeps the short labels when they already differ', () => {
    expect(
      labels([
        { id: 'a', name: 'Rugby U13', ageGroup: 'U13' },
        { id: 'b', name: 'Rugby U14', ageGroup: 'U14' },
      ])
    ).toEqual(['U13', 'U14']);
  });

  it('falls back to names for an A/B split at the same age, which would read "U14" twice', () => {
    expect(
      labels([
        { id: 'a', name: 'Rugby U14', ageGroup: 'U14' },
        { id: 'b', name: 'Rugby U14 - 2', ageGroup: 'U14' },
      ])
    ).toEqual(['Rugby U14', 'Rugby U14 - 2']);
  });

  it('only rewrites the labels that clash, leaving the rest short', () => {
    expect(
      labels([
        { id: 'a', name: 'Rugby U13', ageGroup: 'U13' },
        { id: 'b', name: 'Rugby U14', ageGroup: 'U14' },
        { id: 'c', name: 'Rugby U14 - 2', ageGroup: 'U14' },
      ])
    ).toEqual(['U13', 'Rugby U14', 'Rugby U14 - 2']);
  });

  it('separates two ageless divisions, which used to be "All ages" twice', () => {
    expect(
      labels([
        { id: 'a', name: 'Rugby', ageGroup: null },
        { id: 'b', name: 'Rugby - 2', ageGroup: null },
      ])
    ).toEqual(['Rugby', 'Rugby - 2']);
  });
});
