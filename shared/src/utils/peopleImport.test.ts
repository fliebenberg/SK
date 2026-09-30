import { describe, expect, it } from 'vitest';
import { calendarDateFromSpreadsheetSerial } from './calendarDate';
import {
  PEOPLE_IMPORT_COLUMNS,
  PEOPLE_IMPORT_MAX_ROWS,
  cellphoneDigits,
  normalizePeopleImportRow,
  readPeopleSheet,
} from './peopleImport';

const HEADER = PEOPLE_IMPORT_COLUMNS.map(c => c.header);

describe('a spreadsheet date cell', () => {
  it('reads as the calendar date Excel shows', () => {
    expect(calendarDateFromSpreadsheetSerial(40973)).toBe('2012-03-05');
    expect(calendarDateFromSpreadsheetSerial(61)).toBe('1900-03-01');
    expect(calendarDateFromSpreadsheetSerial(45658)).toBe('2025-01-01');
  });

  it('drops a time of day rather than rounding into the next day', () => {
    expect(calendarDateFromSpreadsheetSerial(40973.99)).toBe('2012-03-05');
  });

  it('refuses what cannot be a birthdate', () => {
    expect(calendarDateFromSpreadsheetSerial(60)).toBeNull();
    expect(calendarDateFromSpreadsheetSerial(NaN)).toBeNull();
  });
});

describe('reading a sheet', () => {
  it('reads the template, counting rows the way Excel does', () => {
    const { rows, errors, warnings } = readPeopleSheet([
      HEADER,
      ['S1042', 'Anika Botha', 'Anika@Example.com', '0825550100', 40973, '', 'Member', 'Sarah Botha', 'sarah@example.com', '', 'Parent'],
      [],
      ['S1043', 'Ruan Botha'],
    ]);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(rows).toEqual([
      {
        rowNumber: 2, identifier: 'S1042', name: 'Anika Botha', email: 'Anika@Example.com', cellphone: '0825550100',
        birthdate: '2012-03-05', role: 'Member',
        guardians: [{ name: 'Sarah Botha', email: 'sarah@example.com', relationship: 'Parent' }],
      },
      { rowNumber: 4, identifier: 'S1043', name: 'Ruan Botha' },
    ]);
  });

  it('matches headers loosely, and takes common other names', () => {
    const { rows, errors } = readPeopleSheet([
      ['NAME', 'E-mail', 'Mobile', 'Date of birth', ' guardian 2 NAME '],
      ['Mia Strydom', 'mia@example.com', '0825550199', '2011-07-01', 'Pieter Strydom'],
    ]);
    expect(errors).toEqual([]);
    expect(rows[0]).toEqual({
      rowNumber: 2, name: 'Mia Strydom', email: 'mia@example.com', cellphone: '0825550199', birthdate: '2011-07-01',
      guardians: [{}, { name: 'Pieter Strydom' }],
    });
  });

  it('says which columns it ignored', () => {
    const { warnings } = readPeopleSheet([['Full name', 'House'], ['Mia', 'Blue']]);
    expect(warnings).toEqual(['The column "House" is not one we read, so it was ignored.']);
  });

  it('refuses a sheet with no name column, a repeated column, no people, or too many', () => {
    expect(readPeopleSheet([['Email'], ['a@example.com']]).errors[0]).toMatch(/no "Full name" column/);
    expect(readPeopleSheet([['Full name', 'Name'], ['A', 'B']]).errors[0]).toMatch(/two "Full name" columns/);
    expect(readPeopleSheet([HEADER, [], []]).errors).toEqual(['The sheet has no people in it, under the header row.']);
    const many = [['Full name'], ...Array.from({ length: PEOPLE_IMPORT_MAX_ROWS + 1 }, (_, i) => [`P${i}`])];
    expect(readPeopleSheet(many).errors[0]).toMatch(/at most 2000/);
  });
});

describe('checking a row', () => {
  it('normalizes what it can and leaves blanks out', () => {
    const { row, errors } = normalizePeopleImportRow({
      rowNumber: 2, identifier: ' S1042 ', name: ' Anika Botha ', email: ' Anika@Example.COM ', role: 'staff',
      guardians: [{ name: 'Sarah Botha', cellphone: '082 555 0101' }],
    });
    expect(errors).toEqual([]);
    expect(row).toEqual({
      rowNumber: 2, identifier: 'S1042', name: 'Anika Botha', email: 'anika@example.com',
      cellphone: undefined, birthdate: undefined, nationalId: undefined, roleId: 'role-org-staff',
      guardians: [{ position: 1, name: 'Sarah Botha', email: undefined, cellphone: '082 555 0101', relationship: 'parent' }],
    });
  });

  it('refuses a missing name, a bad email, and a date it cannot read', () => {
    const { errors } = normalizePeopleImportRow({ rowNumber: 3, email: 'not-an-email', birthdate: '05/03/2012' });
    expect(errors).toEqual([
      'Full name is empty.',
      '"not-an-email" is not a valid email address.',
      'Birthdate "05/03/2012" is not a date we can read. Use a date cell, or text in the form YYYY-MM-DD, such as 2012-03-05.',
    ]);
  });

  it('never makes an Admin, and names the roles it does know', () => {
    expect(normalizePeopleImportRow({ rowNumber: 2, name: 'A', role: 'Admin' }).errors[0]).toMatch(/cannot make someone an Admin/);
    expect(normalizePeopleImportRow({ rowNumber: 2, name: 'A', role: 'Coach' }).errors[0]).toMatch(/Use Member or Staff/);
    expect(normalizePeopleImportRow({ rowNumber: 2, name: 'A', role: 'MEMBER' }).row.roleId).toBe('role-org-member');
  });

  it('needs a guardian to have a name and a way to tell them apart', () => {
    expect(normalizePeopleImportRow({ rowNumber: 2, name: 'A', guardians: [{ email: 'g@example.com' }] }).errors)
      .toEqual(['Guardian 1 has no name.']);
    expect(normalizePeopleImportRow({ rowNumber: 2, name: 'A', guardians: [{}, { name: 'Pieter' }] }).errors)
      .toEqual(['Guardian 2 needs an email or a cellphone number, so they can be told apart from anyone else with the same name.']);
  });

  it('skips an empty guardian group, but keeps the position of the next', () => {
    const { row } = normalizePeopleImportRow({ rowNumber: 2, name: 'A', guardians: [{}, { name: 'Pieter', email: 'p@example.com' }] });
    expect(row.guardians.map(g => g.position)).toEqual([2]);
  });

  it('refuses a guardian who shares the person’s email, or the other guardian’s', () => {
    expect(normalizePeopleImportRow({ rowNumber: 2, name: 'A', email: 'a@example.com', guardians: [{ name: 'G', email: 'A@example.com' }] }).errors)
      .toEqual(['Guardian 1 has the same email as the person. Give each their own.']);
    expect(normalizePeopleImportRow({
      rowNumber: 2, name: 'A', guardians: [{ name: 'G', email: 'g@example.com' }, { name: 'H', email: 'g@example.com' }],
    }).errors).toEqual(['Guardian 1 and Guardian 2 have the same email, so they are the same person.']);
  });

  it('reads relationships loosely, and refuses one it does not know', () => {
    expect(normalizePeopleImportRow({ rowNumber: 2, name: 'A', guardians: [{ name: 'G', email: 'g@example.com', relationship: 'GrandParent' }] }).row.guardians[0].relationship)
      .toBe('grandparent');
    expect(normalizePeopleImportRow({ rowNumber: 2, name: 'A', guardians: [{ name: 'G', email: 'g@example.com', relationship: 'Aunt' }] }).errors[0])
      .toMatch(/Use Parent, Guardian, Grandparent or Other/);
  });
});

describe('cellphone digits', () => {
  it('ignores spacing and punctuation', () => {
    expect(cellphoneDigits('082 555-0100')).toBe('0825550100');
    expect(cellphoneDigits(null)).toBe('');
  });
});
