#!/usr/bin/env node
/**
 * Fails if anything builds an uploaded-image URL except services/assets.ts (MEDIA-1).
 *
 * The server announces where images are served from, so they can move to another server without
 * an app rebuild — but only if no screen assembles `…/uploads/profiles/x_medium.webp` itself. Two
 * screens used to, which is how a stored name ended up used as a URL and a picture never showed.
 * Use `getOrgLogoUrl` / `getAvatarUrl` from services/assets.ts.
 *
 * Run: `npm run check:images` (from expo-app/). Exit code 1 lists each offending line.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN = ['app', 'components', 'hooks', 'store', 'services', 'utils'];
const ALLOWED = new Set(['services/assets.ts']);
const PATTERNS = [
  { re: /\/uploads\b/g, what: "'/uploads' path" },
  { re: /_(?:large|medium|thumb)\.webp/g, what: 'image tier file name' },
];

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
    const text = fs.readFileSync(file, 'utf8');
    for (const { re, what } of PATTERNS) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(text))) {
        const line = text.slice(0, match.index).split('\n').length;
        offences.push(`${rel}:${line}  ${what}`);
      }
    }
  }
}

if (offences.length) {
  console.error(`Image URLs must be built by services/assets.ts. Found ${offences.length}:`);
  for (const offence of offences) console.error(`  ${offence}`);
  process.exit(1);
}
console.log('check:images — every image URL is built by services/assets.ts.');
