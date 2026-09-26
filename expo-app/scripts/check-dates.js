#!/usr/bin/env node
/**
 * Fails if a date or time is parsed, built or formatted anywhere but utils/dates.ts.
 *
 * Every date bug this app has had came from a screen doing its own date handling, and treating one
 * kind of "when" as another: a kick-off's time cut out of the UTC string and saved back as local
 * time, a birthdate read as the server's midnight, a season written at midnight UTC (DATE-1). The
 * policy is the date-formatting skill; this is what keeps it from being forgotten.
 *
 * A line that genuinely needs one of these — a clock reading for a log, say — carries
 * `// dates-ok: <reason>`. If the date is one a person reads, add a function to utils/dates.ts.
 *
 * Run: `npm run check:dates` (from expo-app/). Exit code 1 lists each offending line.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN = ['app', 'components', 'hooks', 'store', 'services', 'utils'];
const ALLOWED = new Set(['utils/dates.ts']);
const PATTERNS = [
  { re: /\.split\(\s*['"`]T['"`]\s*\)/, what: "split('T') — the UTC half of an ISO string, not the viewer's" },
  { re: /toISOString\(\)\s*\.\s*(slice|substring|substr|split)\(/, what: 'slicing toISOString() — the UTC date, not the viewer\'s' },
  { re: /\.toLocale(Date|Time)String\(/, what: 'toLocaleDateString / toLocaleTimeString — format through utils/dates.ts' },
  { re: /\.get(FullYear|Month|Date|Hours|Minutes)\(\)/, what: 'reading date parts by hand — build dates in utils/dates.ts' },
  { re: /new Date\(\s*`/, what: 'new Date(`…`) — building an instant by hand; use localInputsToInstant' },
];
/** Comment lines: prose about the old bugs is not the bug. */
const COMMENT = /^\s*(\/\/|\/?\*|\{\/\*)/;
const WAIVER = /\/\/\s*dates-ok:\s*\S/;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const offences = [];
for (const top of SCAN) {
  const dir = path.join(ROOT, top);
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir, [])) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (ALLOWED.has(rel)) continue;
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
      if (COMMENT.test(line) || WAIVER.test(line)) return;
      for (const { re, what } of PATTERNS) {
        if (re.test(line)) offences.push(`${rel}:${index + 1}  ${what}`);
      }
    });
  }
}

if (offences.length) {
  console.error(
    `Dates are handled in utils/dates.ts only (date-formatting skill). Found ${offences.length}:`
  );
  for (const offence of offences) console.error(`  ${offence}`);
  process.exit(1);
}
console.log('check:dates — every date is handled through utils/dates.ts.');
