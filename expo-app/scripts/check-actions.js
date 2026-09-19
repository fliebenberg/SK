#!/usr/bin/env node
/**
 * Fails if anything sends a socket `action` except through `sendAction` (services/actions.ts).
 *
 * `sendAction` is where the reply contract is interpreted — `{ status: 'ok', data }`,
 * `{ status: 'error', message }`, or `null` for no answer — and where every failure is announced
 * and logged. A call site that emits `'action'` itself goes back to interpreting that on its own,
 * which is how the app came to have failures nobody saw. See services/actions.ts for the history.
 *
 * Run: `npm run check:actions` (from expo-app/). Exit code 1 lists each offending line.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN = ['app', 'components', 'hooks', 'store', 'services', 'utils'];
// The helper itself, and the wrapper it sends through.
const ALLOWED = new Set(['services/actions.ts', 'services/websocket.ts']);
const PATTERNS = [
  { re: /\bemit\(\s*['"`]action['"`]/g, what: "emit('action', …)" },
  { re: /\bemitAction\(/g, what: 'emitAction(…)' },
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
  console.error(`Socket actions must go through sendAction (services/actions.ts). Found ${offences.length}:`);
  for (const offence of offences) console.error(`  ${offence}`);
  process.exit(1);
}
console.log('check:actions — every socket action goes through sendAction.');
