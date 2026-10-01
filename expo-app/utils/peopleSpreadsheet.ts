import { Platform } from 'react-native';
import * as XLSX from 'xlsx';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  PEOPLE_IMPORT_COLUMNS,
  PEOPLE_IMPORT_GUARDIANS,
  PEOPLE_IMPORT_MAX_ROWS,
  parseCellphone,
  readPeopleSheet,
  type SheetReadResult,
} from '@sk/shared';

/**
 * The workbook half of importing people (docs/identity_structure.md §8): the template an admin
 * downloads, and reading the file they send back into rows. What the rows mean is `@sk/shared`'s
 * `readPeopleSheet` and `normalizePeopleImportRow`; the server takes rows, never a file.
 *
 * SheetJS comes from its own CDN (`cdn.sheetjs.com`), pinned in package.json — its npm releases
 * stopped at 0.18.
 *
 * **Cells are read one by one, never through `sheet_to_json`.** That turns a date cell into a JS
 * `Date` at the *device's* midnight, whatever `cellDates` says — a 5 March birthdate came back as
 * `2012-03-04T22:00:00Z` in Johannesburg, the day-early bug `DATE-1` recorded. Read directly, a date
 * cell is Excel's day count, which `calendarDateFromSpreadsheetSerial` turns into `YYYY-MM-DD` with
 * no timezone anywhere.
 */

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const PEOPLE_TEMPLATE_FILE_NAME = 'ScoreKeeper people import.xlsx';
const PEOPLE_SHEET = 'People';

/** How people type cellphone numbers, each with why it is worth showing. All read as valid. */
const CELLPHONE_TEMPLATE_EXAMPLES: [string, string][] = [
  ['082 555 0100', ''],
  ['082-555-0100', ''],
  ['0825550100', ''],
  ['+27 82 555 0100', 'with the country code'],
  ['0027 82 555 0100', ''],
  ['825550100', 'the leading 0 lost, as Excel does to a number cell'],
  ['+44 7700 900123', 'a number from another country: + and its country code'],
];

const readAs = (typed: string) => {
  const parsed = parseCellphone(typed);
  return parsed?.ok ? parsed.value : '';
};

/** Rows of the People sheet pre-formatted as text where that matters. More than most orgs need. */
const TEMPLATE_ROWS = 1000;

// -------------------------------------------------------------------------------------------------
// The template
// -------------------------------------------------------------------------------------------------

/**
 * The template: a **People** sheet with the column names and nothing else — an example row there
 * would be imported by whoever forgot to delete it — and an **Instructions** sheet with one line per
 * column and an example. Member ID, phone and ID-number columns are formatted as text, so Excel
 * keeps a leading zero and does not round a thirteen-digit number.
 *
 * SheetJS's free edition writes number formats but not data validation, so Role has no dropdown;
 * the Instructions sheet and the preview's error say what it may be.
 */
export function buildPeopleTemplate(): XLSX.WorkBook {
  const people = XLSX.utils.aoa_to_sheet([PEOPLE_IMPORT_COLUMNS.map(c => c.header)]);
  PEOPLE_IMPORT_COLUMNS.forEach((column, c) => {
    if (!column.text) return;
    for (let r = 1; r <= TEMPLATE_ROWS; r++) {
      people[XLSX.utils.encode_cell({ r, c })] = { t: 's', v: '', z: '@' };
    }
  });
  people['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: TEMPLATE_ROWS, c: PEOPLE_IMPORT_COLUMNS.length - 1 } });
  people['!cols'] = PEOPLE_IMPORT_COLUMNS.map(c => ({ wch: Math.max(14, c.header.length + 2) }));

  const instructions = XLSX.utils.aoa_to_sheet([
    ['Importing people into ScoreKeeper'],
    [],
    ['Fill in the People sheet, one row per person, and keep its first row (the column names) as it is.'],
    ['Each row is matched to someone already on record by Member ID, then by email. Anyone else is added as someone new.'],
    ['An empty cell leaves what is on record unchanged. Nobody is removed, and nobody is made an Admin.'],
    [`Up to ${PEOPLE_IMPORT_GUARDIANS} parents or guardians per person. The same guardian on several rows, such as brothers and sisters, is recorded once.`],
    [`At most ${PEOPLE_IMPORT_MAX_ROWS} people per file.`],
    ['You will see a preview of every change before anything is saved.'],
    [],
    ['Column', 'Required', 'What to put in it', 'Example'],
    ...PEOPLE_IMPORT_COLUMNS.map(c => [c.header, c.required ? 'Yes' : '', c.help, c.example]),
    [],
    ['Cellphone numbers', '', 'Typed like this', 'Read as'],
    // Each worked out by `parseCellphone`, so the table cannot promise what the import does not do.
    ...CELLPHONE_TEMPLATE_EXAMPLES.map(([typed, note]) => ['', '', note ? `${typed}   (${note})` : typed, readAs(typed)]),
    ['', '', 'A number with too few or too many digits, or with letters in it, is shown as a problem in the preview.'],
  ]);
  instructions['!cols'] = [{ wch: 26 }, { wch: 10 }, { wch: 100 }, { wch: 26 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, people, PEOPLE_SHEET);
  XLSX.utils.book_append_sheet(workbook, instructions, 'Instructions');
  return workbook;
}

/**
 * Hand a workbook to the person: a download in the browser, the share sheet on a phone (to save it
 * to Files, or send it to a computer). Throws when the device cannot share at all.
 */
export async function saveWorkbook(workbook: XLSX.WorkBook, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    XLSX.writeFile(workbook, fileName, { bookType: 'xlsx', compression: true });
    return;
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('This device cannot save or share files. Download the template on a computer instead.');
  }
  const bytes = new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true }));
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(bytes);
  await Sharing.shareAsync(file.uri, {
    mimeType: XLSX_MIME,
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
    dialogTitle: 'Save the template',
  });
}

// -------------------------------------------------------------------------------------------------
// Reading a file
// -------------------------------------------------------------------------------------------------

export interface PickedPeopleSheet {
  fileName: string;
  sheet: SheetReadResult;
}

/** Ask for a file and read it. `null` when the person cancels. */
export async function pickPeopleSheet(): Promise<PickedPeopleSheet | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: [XLSX_MIME, 'application/vnd.ms-excel', 'text/csv', 'text/comma-separated-values', '.xlsx', '.xls', '.csv'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets?.length) return null;
  const asset = picked.assets[0];
  const data = Platform.OS === 'web' && asset.file
    ? new Uint8Array(await asset.file.arrayBuffer())
    : await new File(asset.uri).bytes();
  return { fileName: asset.name, sheet: readPeopleWorkbook(data) };
}

/** A cell as `readPeopleSheet` wants it: a number (a date cell stays Excel's day count), text, or nothing. */
function cellValue(cell: XLSX.CellObject | undefined): string | number | null {
  if (!cell) return null;
  switch (cell.t) {
    case 'n':
      return typeof cell.v === 'number' ? cell.v : null;
    case 's':
      return cell.v == null ? null : String(cell.v);
    case 'b':
      return cell.v ? 'TRUE' : 'FALSE';
    // A cell SheetJS already made a date (not the case with `cellDates: false`): its text as shown,
    // which the row check accepts only in the form YYYY-MM-DD.
    case 'd':
      return cell.w ?? null;
    default:
      return null;
  }
}

/**
 * Read a workbook's people: the sheet called "People", or the first one. Rows are laid out by their
 * position on the sheet, so a row number in a message is the row Excel shows.
 */
export function readPeopleWorkbook(data: Uint8Array): SheetReadResult {
  let workbook: XLSX.WorkBook;
  try {
    // `raw` keeps a CSV's text as text — `00123` stays `00123` — and `cellDates: false` keeps date
    // cells as day counts.
    workbook = XLSX.read(data, { type: 'array', raw: true, cellDates: false });
  } catch {
    return { rows: [], errors: ['This file could not be read as a spreadsheet. Save it as .xlsx or .csv and choose it again.'], warnings: [] };
  }

  const warnings: string[] = [];
  let name = workbook.SheetNames.find(n => n.trim().toLowerCase() === PEOPLE_SHEET.toLowerCase());
  if (!name) {
    name = workbook.SheetNames[0];
    if (workbook.SheetNames.length > 1) warnings.push(`There is no sheet called "${PEOPLE_SHEET}", so the first sheet, "${name}", was read.`);
  }
  const sheet = name ? workbook.Sheets[name] : undefined;
  if (!sheet) return { rows: [], errors: ['The file has no sheets in it.'], warnings };

  // Only the cells that exist: a sheet formatted down to row 1,048,576 has few of them.
  const table: (string | number | null)[][] = [];
  for (const address of Object.keys(sheet)) {
    if (address.charAt(0) === '!') continue;
    const { r, c } = XLSX.utils.decode_cell(address);
    const value = cellValue(sheet[address] as XLSX.CellObject);
    if (value === null || value === '') continue;
    while (table.length <= r) table.push([]);
    table[r][c] = value;
  }

  const result = readPeopleSheet(table);
  return { ...result, warnings: [...warnings, ...result.warnings] };
}
