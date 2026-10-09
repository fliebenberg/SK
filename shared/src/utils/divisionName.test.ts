import { describe, expect, it } from 'vitest';
import {
  divisionAutoName,
  divisionFullName,
  divisionSiblingLabel,
  divisionSiblingLabels,
  findTakenDivisionName,
  isAutomaticDivisionName,
} from './divisionName';

describe('a division’s automatic name (U50, FIX-27)', () => {
  it('is the age group, as the sport’s list spells it, without the sport', () => {
    expect(divisionAutoName('U14')).toBe('U14');
    // SPORT-11: no longer upper-cased.
    expect(divisionAutoName('U13 Girls')).toBe('U13 Girls');
    expect(divisionAutoName('Open')).toBe('Open');
  });

  it('is "Open" with no age group', () => {
    expect(divisionAutoName(undefined)).toBe('Open');
    expect(divisionAutoName('  ')).toBe('Open');
  });

  it('letters a division that shares its age group with another of its sport', () => {
    expect(divisionAutoName('U14', ['U14'])).toBe('U14 B');
    expect(divisionAutoName('U14', ['U14', 'U14 B'])).toBe('U14 C');
    // The first free letter, so a gap left by a deleted division is filled.
    expect(divisionAutoName('U14', ['U14', 'U14 C'])).toBe('U14 B');
    // A hand-named sibling takes nothing.
    expect(divisionAutoName('U14', ["Girls' Open"])).toBe('U14');
  });

  it('keeps a lettered name for as long as it is free', () => {
    expect(divisionAutoName('U14', [], 'U14 B')).toBe('U14 B');
    expect(divisionAutoName('U14', ['U14', 'U14 B'], 'U14 B')).toBe('U14 C');
    // Not a variant of a different base, once the age group changes.
    expect(divisionAutoName('U16', [], 'U14 B')).toBe('U16');
  });

  it('recognises every name the app hands out as its own', () => {
    const context = { sportName: 'Rugby', ageGroup: 'U14', eventName: "Fred's Test Tournament" };
    expect(isAutomaticDivisionName('', context)).toBe(true);
    expect(isAutomaticDivisionName('U14', context)).toBe(true);
    expect(isAutomaticDivisionName('U14 B', context)).toBe(true);
    expect(isAutomaticDivisionName("Fred's Test Tournament", context)).toBe(true);
    expect(isAutomaticDivisionName('Division 2', context)).toBe(true);
    expect(isAutomaticDivisionName('Open', { sportName: 'Rugby' })).toBe(true);
  });

  it('still recognises the names given before FIX-27, whatever their case', () => {
    const context = { sportName: 'Rugby', ageGroup: 'U13 Girls' };
    expect(isAutomaticDivisionName('Rugby U13 Girls', context)).toBe(true);
    // SPORT-11: the old rule upper-cased the age group.
    expect(isAutomaticDivisionName('Rugby U13 GIRLS', context)).toBe(true);
    expect(isAutomaticDivisionName('Rugby U13 GIRLS - 2', context)).toBe(true);
    expect(isAutomaticDivisionName('Rugby', { sportName: 'Rugby' })).toBe(true);
  });

  it('leaves a name somebody typed alone', () => {
    const context = { sportName: 'Rugby', ageGroup: 'U14' };
    expect(isAutomaticDivisionName("Girls' Open", context)).toBe(false);
    expect(isAutomaticDivisionName('U14 Cup', context)).toBe(false);
    expect(isAutomaticDivisionName('U14 Rugby', context)).toBe(false);
  });
});

describe('a division’s name with its sport', () => {
  it('puts the sport in front where it is not on screen', () => {
    expect(divisionFullName('U12', 'Netball')).toBe('Netball U12');
    expect(divisionFullName('Open', 'Hockey')).toBe('Hockey Open');
  });

  it('does not repeat a sport the name already starts with', () => {
    expect(divisionFullName('Rugby U14', 'Rugby')).toBe('Rugby U14');
    expect(divisionFullName('rugby sevens', 'Rugby')).toBe('rugby sevens');
  });

  it('copes with either half missing', () => {
    expect(divisionFullName('U12', null)).toBe('U12');
    expect(divisionFullName('', 'Netball')).toBe('Netball');
  });
});

describe('division names are unique within a sport', () => {
  const taken = ['U14', "Girls' Open"];

  it('finds a name that is already taken, whatever its capitalisation or spacing', () => {
    expect(findTakenDivisionName('U14', taken)).toBe('U14');
    expect(findTakenDivisionName('  u14  ', taken)).toBe('U14');
    expect(findTakenDivisionName("girls' open", taken)).toBe("Girls' Open");
  });

  it('lets a free name through', () => {
    expect(findTakenDivisionName('U16', taken)).toBeUndefined();
    expect(findTakenDivisionName('U14 B', taken)).toBeUndefined();
    // An empty name is a different problem, not a duplicate.
    expect(findTakenDivisionName('   ', taken)).toBeUndefined();
  });

  it('never produces an automatic name that clashes only by case', () => {
    expect(divisionAutoName('U14', ['u14'])).toBe('U14 B');
    expect(divisionAutoName('U14', ['U14', 'u14 b'])).toBe('U14 C');
    expect(divisionAutoName('U14', ['u14'], 'U14')).toBe('U14 B');
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
