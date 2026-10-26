#!/usr/bin/env node
/**
 * Checks the app's fonts (2026-10-26, `UI-36`).
 *
 * A font class is a string: one naming a family the Tailwind config does not define
 * (`font-inter-semibold`, before it was added) type-checks, builds, and silently falls back to the
 * platform's default font at normal weight. About 156 texts in 57 files did that unseen, because the
 * approved designs use Inter SemiBold and the app never loaded it. This finds them.
 *
 * Fails on:
 *  - a `font-…` class that is neither a family in tailwind.config.js nor one of Tailwind's own
 *    weight, style or stack classes;
 *  - a family in tailwind.config.js whose font app/_layout.tsx does not load with `useFonts`;
 *  - a `fontFamily: '…'` in a style naming a font that is not loaded.
 *
 * Run: `npm run check:fonts` (from expo-app/). Exit code 1 lists each offending line.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN = ['app', 'components', 'hooks', 'store', 'services', 'utils', 'constants'];

// Tailwind's own `font-*` classes, which are not families.
const BUILT_IN = new Set([
  'thin', 'extralight', 'light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black',
  'sans', 'serif', 'mono',
]);

const config = fs.readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8');
const familyBlock = config.match(/fontFamily:\s*\{([\s\S]*?)\}/);
if (!familyBlock) {
  console.error('check:fonts — could not find fontFamily in tailwind.config.js.');
  process.exit(1);
}
const families = new Map();
for (const m of familyBlock[1].matchAll(/["']?([a-z-]+)["']?\s*:\s*\[\s*["']([A-Za-z0-9_]+)["']/g)) {
  families.set(m[1], m[2]);
}

const layout = fs.readFileSync(path.join(ROOT, 'app', '_layout.tsx'), 'utf8');
const useFontsBlock = layout.match(/useFonts\(\{([\s\S]*?)\}\)/);
const loaded = new Set(useFontsBlock ? [...useFontsBlock[1].matchAll(/([A-Za-z]+_[0-9A-Za-z]+)/g)].map(m => m[1]) : []);

const problems = [];
for (const [cls, font] of families) {
  if (!loaded.has(font)) problems.push(`tailwind.config.js: font-${cls} uses ${font}, which app/_layout.tsx does not load`);
}

// Not followed by `=` or `:`, which makes it an SVG attribute or a CSS property (`font-family="…"`).
const FONT_CLASS = /(?<![\w-])(?:[a-z-]+:)*font-([a-z][a-z0-9-]*)(?![\w-]|\s*[=:])/g;
const INLINE_FAMILY = /fontFamily\s*:\s*['"]([^'"]+)['"]/g;
const STRING = /(["'`])((?:(?!\1)[^\n])*?)\1/g;
const COMMENT = /^\s*(\/\/|\/?\*|\{\/\*)/;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

for (const dir of SCAN) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of walk(abs, [])) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
      if (COMMENT.test(line)) return;
      for (const s of line.matchAll(STRING)) {
        for (const m of s[2].matchAll(FONT_CLASS)) {
          const name = m[1];
          if (!families.has(name) && !BUILT_IN.has(name)) {
            problems.push(`${rel}:${i + 1}: font-${name} is not a font class (tailwind.config.js fontFamily)`);
          }
        }
      }
      for (const m of line.matchAll(INLINE_FAMILY)) {
        const font = m[1].split(',')[0].trim();
        if (!loaded.has(font) && !['sans-serif', 'serif', 'monospace', 'System'].includes(font)) {
          problems.push(`${rel}:${i + 1}: fontFamily '${font}' is not loaded in app/_layout.tsx`);
        }
      }
    });
  }
}

if (problems.length) {
  console.error(`check:fonts — ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('check:fonts — every font class names a family the app loads.');
