/**
 * Builds the people-import sample for the test organisation Test Hoërskool Doringkloof:
 * server/src/scripts/setup/fixtures/people-import/doringkloof-people-import.xlsx
 *
 * Run from expo-app/ (where SheetJS is installed): `node scripts/make-people-import-sample.js`.
 * What each row is for, and what the preview should say about it, is in the README beside the file.
 * Keep the two in step: change a row here, change its line there.
 *
 * Written as a spreadsheet would be by hand, not from the app's template code, so it also tests the
 * reader against a real header row — including a column the import does not read.
 */
const path = require('path');
const XLSX = require('xlsx');

const OUT = path.join(__dirname, '..', '..', 'server', 'src', 'scripts', 'setup', 'fixtures', 'people-import', 'doringkloof-people-import.xlsx');

const HEADER = [
  'Member ID', 'Full name', 'Email', 'Cellphone', 'Birthdate', 'National ID', 'Role',
  'Guardian 1 name', 'Guardian 1 email', 'Guardian 1 cellphone', 'Guardian 1 relationship',
  'Guardian 2 name', 'Guardian 2 email', 'Guardian 2 cellphone', 'Guardian 2 relationship',
  'House', // not an import column: the preview should say it was ignored
];

/** A date cell, as Excel stores one: a day count, shown as yyyy-mm-dd. */
const date = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { t: 'n', v: (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000, z: 'yyyy-mm-dd' };
};

// One entry per sheet row from row 2. `null` is a blank row, kept so row numbers show it is skipped.
// Columns: id, name, email, cell, birthdate, nationalId, role, g1 name/email/cell/rel, g2 name/email/cell/rel, house
const ROWS = [
  // --- Valid: new people --------------------------------------------------------------------
  ['DKL0901', 'Thandi Nkosi', '', '+27 82 555 0101', date('2012-04-12'), '', 'Member', 'Nomsa Nkosi', 'nomsa.nkosi@example.test', '082 555 0110', 'Parent', '', '', '', '', 'Blue'],
  ['DKL0902', 'Sipho Nkosi', '', '', date('2014-09-30'), '1409305009089', '', 'Nomsa Nkosi', 'Nomsa.Nkosi@Example.test', '', 'Parent', 'Grace Nkosi', '', '083 555 0120', 'Grandparent', 'Blue'],
  ['DKL0903', 'Karin de Wet', 'karin.dewet@doringkloof.test', '0027 72 555 0102', '', '8001015009087', 'Staff', '', '', '', '', '', '', '', '', ''],
  ['DKL0904', 'Lindiwe Dube', 'lindiwe.dube@example.test', { t: 'n', v: 825550104 }, date('2013-02-14'), '', 'Member', 'Sizwe Dube', 'sizwe.dube@example.test', '', 'Guardian', '', '', '', '', 'Red'],
  // --- Valid: people on record ----------------------------------------------------------------
  ['DKL0005', 'Ruan Potgieter', '', '071 555 0130', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['', 'Hennie Steyn', 'hennie.steyn@doringkloof.test', '', '', '', 'Staff', '', '', '', '', '', '', '', '', ''],
  ['DKL0043', 'Anika Kotzé', '', '', '', '', '', 'Karin Kotzé', 'karin.kotze@example.test', '082 555 0140', 'Parent', '', '', '', '', ''],
  ['', 'Francois Marais', 'francois.marais@doringkloof.test', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['', 'Johan van der Merwe', 'johan.vandermerwe@doringkloof.test', '', '', '', 'Staff', '', '', '', '', '', '', '', '', ''],
  ['', 'Mia Strydom', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  null,
  ['DKL0905', 'James Thornton', 'james.thornton@staldrics.test', '', '', '', 'Member', '', '', '', '', '', '', '', '', ''],
  ['DKL0917', 'Oliver Grant', 'oliver.grant@example.test', '+44 7700 900123', '', 'GB1234567', 'Staff', '', '', '', '', '', '', '', '', ''],
  // --- Invalid ------------------------------------------------------------------------------
  ['DKL0906', '', 'nobody@example.test', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['DKL0907', 'Pieter Kruger', 'pieter.kruger@', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['DKL0908', 'Sarah Botes', '', '', '12/05/2011', '', '', '', '', '', '', '', '', '', '', ''],
  ['DKL0909', 'Willem Joubert', '', '', '', '', 'Admin', '', '', '', '', '', '', '', '', ''],
  ['DKL0910', 'Riaan Venter', '', '', '', '', 'Coach', '', '', '', '', '', '', '', '', ''],
  ['DKL0911', 'Lerato Sithole', '', '', date('2011-06-01'), '', '', 'Mpho Sithole', '', '', 'Parent', '', '', '', '', ''],
  ['DKL0912', 'Zoe Pillay', 'zoe.pillay@example.test', '', '', '', '', 'Priya Pillay', 'zoe.pillay@example.test', '', 'Parent', '', '', '', '', ''],
  ['DKL0913', 'Ethan Naidoo', '', '', '', '', '', 'Kevin Naidoo', 'kevin.naidoo@example.test', '', 'Uncle', '', '', '', '', ''],
  ['DKL0914', 'Jan Botha', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['DKL0914', 'Johan Botha', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['DKL0915', 'Annelie Botha', 'annelie.botha@doringkloof.test', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['DKL0916', 'Aiden Smith', '', '', '', '', '', 'Mary Smith', 'mary.smith@example.test', '', 'Parent', 'Mary Smith', 'mary.smith@example.test', '', 'Parent', ''],
  ['DKL0918', 'Nico Venter', '', '082 555', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['DKL0919', 'Emma Jacobs', '', '', '', '0101015009083', '', '', '', '', '', '', '', '', '', ''],
  ['DKL0920', 'Mila Jacobs', '', '', '', '0101 015 009 083', '', '', '', '', '', '', '', '', '', ''],
];

const sheet = XLSX.utils.aoa_to_sheet([HEADER]);
ROWS.forEach((row, i) => {
  if (!row) return;
  row.forEach((value, c) => {
    if (value === '') return;
    const cell = typeof value === 'object' ? value : { t: 's', v: value };
    // Text columns stay text, as the template formats them.
    if ([0, 3, 5, 9, 13].indexOf(c) >= 0 && cell.t === 's') cell.z = '@';
    sheet[XLSX.utils.encode_cell({ r: i + 1, c })] = cell;
  });
});
sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ROWS.length, c: HEADER.length - 1 } });
sheet['!cols'] = HEADER.map(h => ({ wch: Math.max(14, h.length + 2) }));

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, sheet, 'People');
XLSX.writeFile(workbook, OUT, { bookType: 'xlsx', compression: true });
console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${ROWS.filter(Boolean).length} people, ${ROWS.length + 1} rows including the header).`);
