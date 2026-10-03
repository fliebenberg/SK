#!/usr/bin/env node
/**
 * Checks the app's colours (2026-10-03, `UI-24`).
 *
 * A Tailwind class is a string: one naming a shade that does not exist (`text-slate-850`) or a token
 * that does not (`text-ink-mutted`) type-checks, builds, and silently applies no colour at all —
 * near-black text in dark mode, a missing fill, a black border. Fifty-one such classes went unseen
 * for months. This finds them.
 *
 * Fails on:
 *  - a palette shade Tailwind does not have (`-850`, `-455`, `-150`);
 *  - a theme-token class whose name is not a token (`text-ink-mutted`, `bg-success-tint`);
 *  - `constants/theme.d.ts` listing different tokens from `constants/theme.js`;
 *  - a text token below 4.5:1 on the surfaces it is read on (the design spec asks for 7:1 where it
 *    can; the contrast table is printed with `--contrast`).
 *
 * Reports, without failing, how many colours are still named by shade rather than purpose: raw
 * palette classes, `brand-*` / `white` / `black` and the legacy class names, hex values, and the old
 * `COLORS` / `getThemeColor` helpers. Once the sweep has moved them to tokens, `--strict` makes them
 * fail too, and the pre-commit hook runs it that way. `--list` prints where each one is.
 *
 * Run: `npm run check:colors` (from expo-app/). Exit code 1 lists each offending line.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN = ['app', 'components', 'hooks', 'store', 'services', 'utils', 'constants'];
const STRICT = process.argv.includes('--strict');
const SHOW_CONTRAST = process.argv.includes('--contrast');

const { tokens } = require('../constants/theme');
const TOKEN_NAMES = new Set(Object.keys(tokens));
const TOKEN_GROUPS = new Set([...TOKEN_NAMES].map(n => n.split('-')[0]).filter(g => g !== 'on'));

const PALETTE = ['slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green',
  'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const SHADES = new Set([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);
const COLOR_PREFIX = '(?:text|bg|border(?:-[trblxy])?|divide|ring|ring-offset|outline|fill|stroke|placeholder|from|via|to|decoration|accent|caret|shadow)';
const PALETTE_CLASS = new RegExp(`(?<![\\w-])(?:[a-z-]+:)*${COLOR_PREFIX}-(${PALETTE.join('|')})-(\\d+)(?:\\/\\d+)?(?![\\w-])`, 'g');
const TOKEN_CLASS = new RegExp(`(?<![\\w-])(?:[a-z-]+:)*${COLOR_PREFIX}-((?:${[...TOKEN_GROUPS].join('|')})(?:-[a-z]+)*)(?:\\/\\d+)?(?![\\w-])`, 'g');
const HEX = /['"`](?:#(?:[0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})|rgba?\([^)]*\))['"`]/g;
// Colour classes that name a colour rather than a purpose but are not palette shades: the old brand
// table, white and black, and the legacy names from before the tokens.
const OTHER_CLASS = new RegExp(`(?<![\\w-])(?:[a-z-]+:)*${COLOR_PREFIX}-(brand-[a-z]+|white|black|background|surface|textPrimary|textSecondary)(?:\\/\\d+)?(?![\\w-])`, 'g');
// The value helpers from before the tokens; `themeColor(isDark, token)` replaces both.
const LEGACY_VALUE = /\b(COLORS\.(?:brand|light|dark)\b|getThemeColor\()/g;
const COMMENT = /^\s*(\/\/|\/?\*|\{\/\*)/;

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

const failures = [];
let rawPalette = 0;
let rawHex = 0;
let rawOther = 0;
const LIST = process.argv.includes('--list');
const listed = [];

for (const file of SCAN.flatMap(dir => walk(path.join(ROOT, dir), []))) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  // Where colours are defined, not used: the tokens, and `themeColor()`, which hands them out.
  const isDefinition = rel === 'constants/theme.js' || rel === 'constants/Colors.ts';
  const text = fs.readFileSync(file, 'utf8');
  // Colours that are data, not theme: an org's brand colour, a picker's swatches, the black or
  // white worked out to read on a colour. A file says so once with `@colour-data` in a comment,
  // saying why; a single line says so with a `colour-data: <why>` comment at its end or on the line
  // above. Classes are still checked there.
  const isData = /@colour-data\b/.test(text);
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (COMMENT.test(line)) return;
    for (const m of line.matchAll(PALETTE_CLASS)) {
      if (!SHADES.has(Number(m[2]))) failures.push(`${rel}:${i + 1}  ${m[0]} — Tailwind has no ${m[1]}-${m[2]}; it applies no colour`);
      else {
        rawPalette++;
        if (LIST) listed.push(`${rel}:${i + 1}  ${m[0]}`);
      }
    }
    for (const m of line.matchAll(OTHER_CLASS)) {
      rawOther++;
      if (LIST) listed.push(`${rel}:${i + 1}  ${m[0]}`);
    }
    for (const m of line.matchAll(TOKEN_CLASS)) {
      const name = m[1];
      if (!TOKEN_NAMES.has(name)) failures.push(`${rel}:${i + 1}  ${m[0]} — "${name}" is not a colour token (constants/theme.js)`);
    }
    const dataLine = /(\/\/|\/\*) colour-data:/.test(line) || /^\s*(\/\/|\{?\/\*) colour-data:/.test(lines[i - 1] || '');
    if (!isDefinition && !isData && !dataLine) {
      for (const m of [...(line.match(HEX) || []), ...(line.match(LEGACY_VALUE) || [])]) {
        rawHex++;
        if (LIST) listed.push(`${rel}:${i + 1}  ${m}`);
      }
    }
  });
}

// theme.d.ts must list exactly the tokens theme.js defines.
const declared = new Set((fs.readFileSync(path.join(ROOT, 'constants/theme.d.ts'), 'utf8').match(/'([a-z-]+)'/g) || [])
  .map(s => s.slice(1, -1)).filter(s => s !== 'light' && s !== 'dark'));
for (const name of TOKEN_NAMES) if (!declared.has(name)) failures.push(`constants/theme.d.ts — missing token "${name}"`);
for (const name of declared) if (!TOKEN_NAMES.has(name)) failures.push(`constants/theme.d.ts — "${name}" is not in theme.js`);

// Contrast: each text token on the surfaces it is read on, in both themes.
function luminance(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const TONES = ['primary', 'accent', 'success', 'warning', 'danger', 'info', 'special'];
const PAIRS = [
  ...['ink', 'ink-soft', 'ink-muted'].flatMap(t => ['card', 'canvas', 'field', 'sunken'].map(s => [t, s])),
  ...['ink', 'ink-soft', 'ink-muted'].map(t => [t, 'popover']),
  ['ink', 'raised'], ['ink-muted', 'raised'], ['primary-ink', 'raised'], ['on-fill', 'tooltip'],
  ...TONES.flatMap(t => [[`${t}-ink`, 'card'], [`${t}-ink`, 'sunken'], [`${t}-ink`, `${t}-soft`]]),
];
const rows = [];
for (const [text, surface] of PAIRS) {
  for (const mode of ['light', 'dark']) {
    const r = ratio(tokens[text][mode], tokens[surface][mode]);
    rows.push({ text, surface, mode, r });
    if (r < 4.5) failures.push(`contrast — ${text} on ${surface} (${mode}) is ${r.toFixed(2)}:1, under 4.5:1`);
  }
}
if (SHOW_CONTRAST) {
  console.log('Contrast (7:1 is the aim, 4.5:1 the floor):');
  for (const { text, surface, mode, r } of rows) console.log(`  ${r >= 7 ? '  ' : r >= 4.5 ? '~ ' : '! '}${`${text} on ${surface}`.padEnd(34)} ${mode.padEnd(6)} ${r.toFixed(2)}:1`);
}

if (LIST) for (const l of listed) console.log(`  ${l}`);
if (STRICT && rawPalette) failures.push(`${rawPalette} raw palette classes — name the purpose with a token instead`);
if (STRICT && rawOther) failures.push(`${rawOther} brand-*, white, black or legacy colour classes — name the purpose with a token instead`);
if (STRICT && rawHex) failures.push(`${rawHex} hex colours or COLORS / getThemeColor uses outside constants/ — use themeColor() or a token class`);

const remaining = `${rawPalette} raw palette classes, ${rawOther} brand/white/black/legacy classes and ${rawHex} hex or legacy colour values left to move to tokens`;
if (failures.length) {
  console.error(`check:colors — ${failures.length} problem${failures.length === 1 ? '' : 's'}:`);
  for (const f of failures) console.error(`  ${f}`);
  if (!STRICT) console.error(`(and, not yet failing: ${remaining})`);
  process.exit(1);
}
console.log(`check:colors — every colour class names a real shade or token${STRICT ? '' : ` (${remaining})`}.`);
