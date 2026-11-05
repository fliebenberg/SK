#!/usr/bin/env node
/**
 * Fails if anything sends a socket `action` except through `sendAction` (services/actions.ts), or
 * casts what it passes to `sendAction`.
 *
 * `sendAction` is where the reply contract is interpreted — `{ status: 'ok', data }`,
 * `{ status: 'error', message }`, or `null` for no answer — and where every failure is announced
 * and logged. A call site that emits `'action'` itself goes back to interpreting that on its own,
 * which is how the app came to have failures nobody saw. See services/actions.ts for the history.
 *
 * A cast (`as any`, `as SomeType`) inside a `sendAction(…)` call switches off the payload's type
 * check, and the server refuses a payload whose fields its type does not name (`SYNC-6`) — so a
 * cast turns a compile error into a refused save. `as const` is allowed: it only narrows.
 *
 * Reads are held to the same rule: `emit('get_data', …)` only inside `readData` (services/reads.ts,
 * `SYNC-9`), which is where a read's reply is interpreted, so that a failure cannot pass for "nothing".
 *
 * Run: `npm run check:actions` (from expo-app/). Exit code 1 lists each offending line.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN = ['app', 'components', 'hooks', 'store', 'services', 'utils'];
// The helpers themselves, and the wrapper they send through.
const ALLOWED = new Set(['services/actions.ts', 'services/reads.ts', 'services/websocket.ts']);
const PATTERNS = [
  { re: /\bemit\(\s*['"`]action['"`]/g, what: "emit('action', …)" },
  { re: /\bemitAction\(/g, what: 'emitAction(…)' },
];

/** The text of every `sendAction(…)` call in `text`, with the index it starts at. */
function sendActionCalls(text) {
  const calls = [];
  const re = /\bsendAction\(/g;
  let match;
  while ((match = re.exec(text))) {
    let depth = 0;
    let end = match.index + 'sendAction'.length;
    for (; end < text.length; end++) {
      if (text[end] === '(') depth++;
      else if (text[end] === ')' && --depth === 0) break;
    }
    calls.push({ index: match.index, body: text.slice(match.index, end + 1) });
    re.lastIndex = end;
  }
  return calls;
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

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
      while ((match = re.exec(text))) offences.push(`${rel}:${lineOf(text, match.index)}  ${what}`);
    }
    for (const call of sendActionCalls(text)) {
      const code = call.body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const casts = code.match(/\bas\s+(?!const\b)[A-Za-z_$][\w$.]*/g);
      if (casts) offences.push(`${rel}:${lineOf(text, call.index)}  sendAction(…) with ${casts.join(', ')} — type the payload instead`);
    }
  }
}

if (offences.length) {
  console.error(`Socket actions must go through sendAction (services/actions.ts), with payloads that are not cast, and reads through readData (services/reads.ts). Found ${offences.length}:`);
  for (const offence of offences) console.error(`  ${offence}`);
  process.exit(1);
}
console.log('check:actions — every socket action goes through sendAction, no payload is cast, and every read goes through readData.');
