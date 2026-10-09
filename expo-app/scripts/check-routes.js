#!/usr/bin/env node
/**
 * Fails if a doc names an app route that does not exist.
 *
 * The routing doc used to list every screen by hand, and by 2026-10-09 nine of its routes had gone
 * (`/live`, `/games/[id]`, `/admin/organizations`…). It now notes only what the folder cannot say —
 * this keeps those notes honest. Every backticked path starting with `/` in the docs below must be a
 * route Expo Router builds from `app/`: route groups like `(tabs)` and `index` dropped, dynamic
 * segments spelled exactly as their file (`[orgId]`, not `[id]`). A query (`?tab=`) is ignored.
 *
 * Run: `npm run check:routes` (from expo-app/). Exit code 1 lists each unknown route.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..');
const APP = path.join(ROOT, 'app');
const DOCS = ['okf/client_routing.md', 'docs/design_spec.md'];

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|jsx|ts|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const routes = new Set();
for (const file of walk(APP, [])) {
  const parts = path.relative(APP, file).split(path.sep);
  const name = parts.pop().replace(/\.(tsx|jsx|ts|js)$/, '');
  if (name.startsWith('_') || name.startsWith('+')) continue;
  const segments = parts.filter((p) => !/^\(.*\)$/.test(p));
  if (name !== 'index') segments.push(name);
  routes.add('/' + segments.join('/'));
}

const offences = [];
for (const doc of DOCS) {
  const lines = fs.readFileSync(path.join(REPO, doc), 'utf8').split('\n');
  lines.forEach((text, i) => {
    for (const match of text.matchAll(/`(\/[^`\s]*)`/g)) {
      const route = match[1].split('?')[0].replace(/\/$/, '') || '/';
      if (route.includes('*')) continue; // a pattern such as `/admin/[orgId]/*`, not one route
      if (!routes.has(route)) offences.push(`${doc}:${i + 1}  ${match[1]}`);
    }
  });
}

if (offences.length) {
  console.error(`Docs name routes that are not in expo-app/app/. Found ${offences.length}:`);
  for (const offence of offences) console.error(`  ${offence}`);
  process.exit(1);
}
console.log('check:routes — every route named in the docs exists.');
