/**
 * Importing an organisation's people from a spreadsheet — and, later, from any other source.
 *
 * **The server takes rows, never files.** The app reads the workbook into {@link PeopleImportRow}s
 * with {@link readPeopleSheet}, and `IMPORT_ORG_PEOPLE` takes those. A future source — an external
 * system's API, a shared Google Sheet — only has to produce the same rows; nothing on the server
 * changes. The rows are plain text as the admin typed it: {@link normalizePeopleImportRow} decides
 * what it means, and both sides run it, so the preview the app shows and the check the server
 * makes cannot disagree.
 *
 * What an import may do, and what it deliberately may not, is recorded in
 * docs/identity_structure.md §8. In short: it adds and updates people and their guardians, never
 * removes anyone, never makes anyone an Admin, and a blank cell leaves what is on record alone.
 */
import { isValidEmail, normalizeEmail } from './memberInvite';
import { calendarDateFromSpreadsheetSerial, isCalendarDate, type CalendarDate } from './calendarDate';
import { GUARDIAN_RELATIONSHIPS, type GuardianRelationship } from '../models/people/ProfileGuardian';
import { CELLPHONE_EXAMPLES, parseCellphone } from './phone';
import { normalizeNationalId, saIdNumberProblem } from './nationalId';

/** The most rows one import may carry. Past this the preview stops being something a person reads. */
export const PEOPLE_IMPORT_MAX_ROWS = 2000;

/** Guardians per person the template has columns for. */
export const PEOPLE_IMPORT_GUARDIANS = 2;

/** The org roles an import may give. Admin is deliberately not one of them. */
export type PeopleImportRoleId = 'role-org-member' | 'role-org-staff';

// -------------------------------------------------------------------------------------------------
// The template's columns
// -------------------------------------------------------------------------------------------------

/** A field of {@link PeopleImportRow}, or one of a guardian's, which a column fills. */
export type PeopleImportField =
  | 'identifier' | 'name' | 'email' | 'cellphone' | 'birthdate' | 'nationalId' | 'role'
  | 'guardianName' | 'guardianEmail' | 'guardianCellphone' | 'guardianRelationship';

export interface PeopleImportColumn {
  /** The header as the template writes it. */
  header: string;
  field: PeopleImportField;
  /** 1 or 2 for a guardian's column. */
  guardian?: number;
  required?: boolean;
  /** Text the cell must be formatted as, so Excel does not eat a leading zero or reformat a date. */
  text?: boolean;
  /** One line for the template's instructions sheet. */
  help: string;
  example: string;
}

function guardianColumns(n: number): PeopleImportColumn[] {
  return [
    { header: `Guardian ${n} name`, field: 'guardianName', guardian: n, help: `Parent or guardian ${n}. Leave the guardian columns empty if there is none.`, example: n === 1 ? 'Sarah Botha' : '' },
    { header: `Guardian ${n} email`, field: 'guardianEmail', guardian: n, help: 'A guardian needs an email or a cellphone number. The same guardian on several rows (brothers and sisters) is recorded once.', example: n === 1 ? 'sarah.botha@example.com' : '' },
    { header: `Guardian ${n} cellphone`, field: 'guardianCellphone', guardian: n, text: true, help: `As for Cellphone: ${CELLPHONE_EXAMPLES}.`, example: n === 1 ? '082 555 0101' : '' },
    { header: `Guardian ${n} relationship`, field: 'guardianRelationship', guardian: n, help: 'Parent, Guardian, Grandparent or Other. Empty means Parent.', example: n === 1 ? 'Parent' : '' },
  ];
}

/** The template's columns, in order. The app builds the workbook from this list. */
export const PEOPLE_IMPORT_COLUMNS: PeopleImportColumn[] = [
  { header: 'Member ID', field: 'identifier', text: true, help: "Your organisation's own number for the person, such as a student or membership number. Rows are matched to people already on record by this, then by email, then by national ID.", example: 'S1042' },
  { header: 'Full name', field: 'name', required: true, help: 'Required.', example: 'Anika Botha' },
  { header: 'Email', field: 'email', help: 'If this address is already on ScoreKeeper, that account gets access to your organisation straight away.', example: 'anika.botha@example.com' },
  { header: 'Cellphone', field: 'cellphone', text: true, help: `A South African number, with or without +27, or an international one starting with + and its country code: ${CELLPHONE_EXAMPLES}. Spaces and dashes are fine. A South African number whose leading 0 was lost is read correctly.`, example: '082 555 0100' },
  { header: 'Birthdate', field: 'birthdate', help: 'A date cell, or text in the form YYYY-MM-DD.', example: '2012-03-05' },
  { header: 'National ID', field: 'nationalId', text: true, help: 'A South African ID number, or a passport number. A South African one is checked, and a probable typing mistake is pointed out. Formatted as text, so a long number is not rounded.', example: '' },
  { header: 'Role', field: 'role', help: 'Member or Staff. Empty means Member for someone new, and no change for someone on record. Admins are made on their profile, not by an import.', example: 'Member' },
  ...guardianColumns(1),
  ...guardianColumns(2),
];

/**
 * Other headers people use for the same columns. Matched after lower-casing and removing
 * everything but letters and digits, so `E-mail`, `EMAIL` and `e mail` are all `email`.
 */
const HEADER_ALIASES: Record<string, PeopleImportField> = {
  name: 'name',
  mobile: 'cellphone',
  cell: 'cellphone',
  cellnumber: 'cellphone',
  dateofbirth: 'birthdate',
  dob: 'birthdate',
};

const headerKey = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '');

// -------------------------------------------------------------------------------------------------
// Rows
// -------------------------------------------------------------------------------------------------

/** A guardian's cells, as typed. */
export interface PeopleImportGuardianCells {
  name?: string;
  email?: string;
  cellphone?: string;
  relationship?: string;
}

/**
 * One person's row, **as typed** — every value text, blanks left out. What it means is decided by
 * {@link normalizePeopleImportRow}, on both sides.
 */
export interface PeopleImportRow {
  /** The row's number in the source, for messages — on a sheet, the row Excel shows (header is 1). */
  rowNumber: number;
  identifier?: string;
  name?: string;
  email?: string;
  cellphone?: string;
  birthdate?: string;
  nationalId?: string;
  role?: string;
  /** Guardian 1 first. An entry is present, possibly empty, for each guardian column group read. */
  guardians?: PeopleImportGuardianCells[];
}

export interface PeopleImportGuardian {
  /** 1 or 2: which guardian columns it came from, for messages. */
  position: number;
  name: string;
  /** Normalized (trimmed, lower-case), as it is stored and compared. */
  email?: string;
  /** International form, as for the person's. */
  cellphone?: string;
  relationship: GuardianRelationship;
}

/** A row once checked: what it asks for. Blanks are absent, meaning "leave what is on record". */
export interface NormalizedPeopleImportRow {
  rowNumber: number;
  identifier?: string;
  name: string;
  email?: string;
  /** International form, `+27825550100` (`parseCellphone`). */
  cellphone?: string;
  birthdate?: CalendarDate;
  /** Without spaces or dashes, upper-case (`normalizeNationalId`). */
  nationalId?: string;
  roleId?: PeopleImportRoleId;
  guardians: PeopleImportGuardian[];
}

export interface SheetReadResult {
  rows: PeopleImportRow[];
  /** Problems with the sheet as a whole. Any of these, and there is nothing to import. */
  errors: string[];
  /** Worth saying but not stopping for, such as a column we do not read. */
  warnings: string[];
}

/** A cell's value as text. A number in the birthdate column is a date cell, so it becomes a date. */
function cellText(value: unknown, field: PeopleImportField | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (field === 'birthdate') return calendarDateFromSpreadsheetSerial(value) || String(value);
    return String(value);
  }
  return String(value).trim();
}

/**
 * Read a sheet, given as rows of cells with the header row first — what a spreadsheet library
 * hands back when asked for an array of arrays (for SheetJS, `sheet_to_json(sheet, { header: 1,
 * blankrows: true, raw: true })`). Blank rows are skipped but still counted, so `rowNumber` is the
 * row Excel shows.
 */
export function readPeopleSheet(table: unknown[][]): SheetReadResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const header = (table[0] || []).map(cell => cellText(cell, undefined));

  const byKey: Record<string, PeopleImportColumn> = {};
  for (const column of PEOPLE_IMPORT_COLUMNS) byKey[headerKey(column.header)] = column;

  // Which column each header fills; `null` for one we do not read.
  const seen: Record<string, boolean> = {};
  const columns: (PeopleImportColumn | null)[] = header.map(text => {
    if (!text) return null;
    const key = headerKey(text);
    const column = byKey[key] || (HEADER_ALIASES[key] && PEOPLE_IMPORT_COLUMNS.filter(c => c.field === HEADER_ALIASES[key] && !c.guardian)[0]) || null;
    if (!column) {
      warnings.push(`The column "${text}" is not one we read, so it was ignored.`);
      return null;
    }
    const id = `${column.field}:${column.guardian || 0}`;
    if (seen[id]) {
      errors.push(`There are two "${column.header}" columns. Remove one, so it is clear which to use.`);
      return null;
    }
    seen[id] = true;
    return column;
  });

  if (!seen['name:0']) {
    errors.push('The sheet has no "Full name" column. Start from the template, or add one to the first row.');
  }

  const rows: PeopleImportRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const cells = table[i] || [];
    const row: PeopleImportRow = { rowNumber: i + 1 };
    let empty = true;
    columns.forEach((column, c) => {
      if (!column) return;
      const text = cellText(cells[c], column.field);
      if (!text) return;
      empty = false;
      if (column.guardian) {
        const guardians = row.guardians || (row.guardians = []);
        while (guardians.length < column.guardian) guardians.push({});
        const key = column.field === 'guardianName' ? 'name'
          : column.field === 'guardianEmail' ? 'email'
          : column.field === 'guardianCellphone' ? 'cellphone'
          : 'relationship';
        guardians[column.guardian - 1][key] = text;
      } else {
        (row as any)[column.field] = text;
      }
    });
    if (!empty) rows.push(row);
  }

  if (!errors.length && !rows.length) errors.push('The sheet has no people in it, under the header row.');
  if (rows.length > PEOPLE_IMPORT_MAX_ROWS) {
    errors.push(`The sheet has ${rows.length} people; one import can take at most ${PEOPLE_IMPORT_MAX_ROWS}. Split it into smaller files.`);
  }
  return { rows, errors, warnings };
}

/** `"Member"` or `"staff"` → the role id; anything else → the message saying why not. */
function roleOf(text: string): { roleId?: PeopleImportRoleId; error?: string } {
  const key = headerKey(text);
  if (key === 'member') return { roleId: 'role-org-member' };
  if (key === 'staff') return { roleId: 'role-org-staff' };
  if (key === 'admin' || key === 'administrator') {
    return { error: 'An import cannot make someone an Admin. Import them as Staff, then make them an Admin on their profile.' };
  }
  return { error: `Role "${text}" is not one we know. Use Member or Staff.` };
}

function relationshipOf(text: string | undefined): GuardianRelationship | null {
  if (!text) return 'parent';
  const key = headerKey(text) as GuardianRelationship;
  return GUARDIAN_RELATIONSHIPS.indexOf(key) >= 0 ? key : null;
}

const trimmed = (value: unknown): string => (typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim());

/**
 * What a row asks for, or why it cannot be imported. Checks only what the row itself shows — a bad
 * date, an unknown role, a guardian with no way to tell them apart. Whether it clashes with who is
 * already on record is the server's to say, because only the server knows.
 */
export function normalizePeopleImportRow(row: PeopleImportRow): { row: NormalizedPeopleImportRow; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  /** A cell's number in its stored form, or the reason it cannot be read. */
  const cellphoneOf = (label: string, text: string): string | undefined => {
    const parsed = parseCellphone(text);
    if (!parsed) return undefined;
    if (parsed.ok) return parsed.value;
    errors.push(`${label}: ${parsed.problem}`);
    return undefined;
  };

  const name = trimmed(row.name);
  if (!name) errors.push('Full name is empty.');

  const email = normalizeEmail(trimmed(row.email)) || undefined;
  if (email && !isValidEmail(email)) errors.push(`"${trimmed(row.email)}" is not a valid email address.`);

  const birthdate = trimmed(row.birthdate) || undefined;
  if (birthdate && !isCalendarDate(birthdate)) {
    errors.push(`Birthdate "${birthdate}" is not a date we can read. Use a date cell, or text in the form YYYY-MM-DD, such as 2012-03-05.`);
  }

  let roleId: PeopleImportRoleId | undefined;
  const roleText = trimmed(row.role);
  if (roleText) {
    const role = roleOf(roleText);
    if (role.error) errors.push(role.error);
    roleId = role.roleId;
  }

  const cellphone = cellphoneOf('Cellphone', trimmed(row.cellphone));
  const nationalId = normalizeNationalId(trimmed(row.nationalId)) || undefined;
  const idProblem = saIdNumberProblem(nationalId, birthdate && isCalendarDate(birthdate) ? birthdate : null);
  if (idProblem) warnings.push(idProblem);

  const guardians: PeopleImportGuardian[] = [];
  (row.guardians || []).slice(0, PEOPLE_IMPORT_GUARDIANS).forEach((cells, i) => {
    const position = i + 1;
    const g = {
      name: trimmed(cells?.name),
      email: normalizeEmail(trimmed(cells?.email)) || undefined,
      cellphoneText: trimmed(cells?.cellphone),
      relationshipText: trimmed(cells?.relationship) || undefined,
    };
    if (!g.name && !g.email && !g.cellphoneText && !g.relationshipText) return;

    const label = `Guardian ${position}`;
    const guardianCellphone = cellphoneOf(`${label}'s cellphone`, g.cellphoneText);
    if (!g.name) errors.push(`${label} has no name.`);
    if (!g.email && !g.cellphoneText) {
      errors.push(`${label} needs an email or a cellphone number, so they can be told apart from anyone else with the same name.`);
    }
    if (g.email && !isValidEmail(g.email)) errors.push(`${label}'s email "${trimmed(cells?.email)}" is not a valid email address.`);
    const relationship = relationshipOf(g.relationshipText);
    if (!relationship) {
      errors.push(`${label}'s relationship "${g.relationshipText}" is not one we know. Use Parent, Guardian, Grandparent or Other.`);
    }
    // Access is matched by email, so a shared address would make the guardian *be* the child.
    if (g.email && email && g.email === email) {
      errors.push(`${label} has the same email as the person. Give each their own.`);
    }
    guardians.push({ position, name: g.name, email: g.email, cellphone: guardianCellphone, relationship: relationship || 'parent' });
  });
  if (guardians.length === 2 && guardians[0].email && guardians[0].email === guardians[1].email) {
    errors.push('Guardian 1 and Guardian 2 have the same email, so they are the same person.');
  }

  return {
    row: {
      rowNumber: row.rowNumber,
      identifier: trimmed(row.identifier) || undefined,
      name,
      email,
      cellphone,
      birthdate: birthdate && isCalendarDate(birthdate) ? birthdate : undefined,
      nationalId,
      roleId,
      guardians,
    },
    errors,
    warnings,
  };
}


// -------------------------------------------------------------------------------------------------
// The report
// -------------------------------------------------------------------------------------------------

/** What happens to a row: someone added, someone on record changed, nothing to do, or refused. */
export type PeopleImportOutcome = 'new' | 'update' | 'unchanged' | 'error';

export interface PeopleImportChange {
  /** The column's header, as the admin knows it: `Email`, `Role`. */
  field: string;
  from: string | null;
  to: string | null;
}

export interface PeopleImportGuardianResult {
  position: number;
  name: string;
  /** A new profile, or one already on record (matched by email, or by name and cellphone). */
  profile: 'new' | 'existing';
  /** Linked by this import, or already this person's guardian. */
  link: 'new' | 'existing';
}

export interface PeopleImportRowResult {
  /** Position in the submitted rows. */
  index: number;
  rowNumber: number;
  name: string;
  outcome: PeopleImportOutcome;
  /** The person's profile: the one matched, or the one this import creates. */
  profileId?: string;
  changes: PeopleImportChange[];
  guardians: PeopleImportGuardianResult[];
  errors: string[];
  warnings: string[];
}

export interface PeopleImportReport {
  mode: 'preview' | 'apply';
  rows: PeopleImportRowResult[];
  counts: {
    new: number;
    update: number;
    unchanged: number;
    error: number;
    /** Guardian profiles created — a guardian on several rows is counted once. */
    newGuardians: number;
    /** Guardian links made. */
    newGuardianLinks: number;
  };
  /** True when this `idempotencyKey` had already been applied and this is the stored report. */
  replayed?: boolean;
}
