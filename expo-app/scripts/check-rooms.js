#!/usr/bin/env node
/**
 * Fails if a screen joins a live room and does nothing about the room not arriving (`LIVE-25`).
 *
 * A room's join push is a screen's initial load, and until 2026-11-07 a push that never came left the
 * screen loading for ever with nothing said. The socket service now answers or times out every join,
 * and the app-wide `RoomFailureNotice` is the safety net — but a page knows *what* did not load, and
 * says it better beside the content it would have filled. This keeps every new page from forgetting.
 *
 * Two rules, for every file under app/ and components/:
 *
 *   1. Each call of `useLiveRoom`, or of a hook built on it (found here, not listed by hand), must
 *      pass the room it returns to a `<RoomFailure rooms={[…]} />` in the same file:
 *        const { items, room } = useLiveRoom(…)        → rooms={[room]}
 *        const { teams, room: teamsRoom } = useOrgTeams(…) → rooms={[teamsRoom]}
 *        const org = useOrgSummary(…)                  → rooms={[org.room]}
 *   2. Nothing calls `wsService.subscribeToRoom` but the socket layer and the hooks allowed below:
 *      a room joined by hand has no status, so nobody would hear that it failed.
 *
 * A call that deliberately leaves the saying to someone else — the org's name in a header, when the
 * workspace layout already covers that room — carries `// rooms-ok: <reason>` on its line or the
 * line above. The notice still speaks for it if nothing on screen does.
 *
 * Run: `npm run check:rooms` (from expo-app/). Exit code 1 lists each offending call.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN = ['app', 'components'];
const HOOKS = 'hooks';
/** Where joining a room by hand is the point. */
const MAY_SUBSCRIBE = new Set(['services/websocket.ts', 'hooks/useLiveRoom.ts', 'hooks/useListRows.ts']);
const WAIVER = /rooms-ok:\s*\S/;

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const rel = file => path.relative(ROOT, file).split(path.sep).join('/');

/** Comments blanked out (keeping line breaks), so prose about a hook is not a call of it. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
}

// --- Which hooks join a room: `useLiveRoom` itself, and any hook whose body calls one, wherever it
// is defined — a component file that keeps its own hook (`useOrgApplications`) counts too. ---
/** The top-level `function useX(` declarations in a file, each to its closing brace in column 0. */
function hookRanges(text) {
  return [...text.matchAll(/^(?:export\s+)?function (use\w+)\s*[<(]/gm)].map(match => {
    const close = text.indexOf('\n}', match.index);
    const end = close === -1 ? text.length : close + 2;
    return { name: match[1], start: match.index, end, body: text.slice(match.index + match[0].length, end) };
  });
}
const hookBodies = new Map(); // name -> body text
const rangesByFile = new Map();
const allFiles = [HOOKS, ...SCAN].flatMap(top => walk(path.join(ROOT, top), []));
for (const file of allFiles) {
  const ranges = hookRanges(stripComments(fs.readFileSync(file, 'utf8')));
  rangesByFile.set(file, ranges);
  for (const range of ranges) hookBodies.set(range.name, range.body);
}
const roomHooks = new Set(['useLiveRoom']);
for (let grew = true; grew; ) {
  grew = false;
  for (const [name, body] of hookBodies) {
    if (roomHooks.has(name)) continue;
    if ([...roomHooks].some(hook => new RegExp(`\\b${hook}\\s*[<(]`).test(body))) {
      roomHooks.add(name);
      grew = true;
    }
  }
}

// --- The files that must say so. ---
const callRe = new RegExp(`\\b(${[...roomHooks].join('|')})\\s*(<[^()]*?>)?\\s*\\(`, 'g');
const offences = [];

const files = [...SCAN.flatMap(top => walk(path.join(ROOT, top), [])), ...walk(path.join(ROOT, HOOKS), []), ...walk(path.join(ROOT, 'services'), [])];
for (const file of files) {
  const name = rel(file);
  const raw = fs.readFileSync(file, 'utf8');
  const rawLines = raw.split(/\r?\n/);
  const text = stripComments(raw);
  const lineOf = index => text.slice(0, index).split('\n').length;
  const waived = line => WAIVER.test(rawLines[line - 1] || '') || WAIVER.test(rawLines[line - 2] || '');

  // Rule 2.
  if (!MAY_SUBSCRIBE.has(name)) {
    for (const match of text.matchAll(/\bsubscribeToRoom\s*\(/g)) {
      const line = lineOf(match.index);
      if (!waived(line)) offences.push(`${name}:${line}  joins a room by hand — use useLiveRoom, so its failure is heard`);
    }
  }

  // Rule 1 applies to screens; a hook in hooks/ hands `room` on to whoever calls it.
  if (!SCAN.some(top => name.startsWith(`${top}/`))) continue;

  const roomsProps = [...text.matchAll(/rooms=\{([\s\S]*?)\}\s*(?=\w+=|\/?>)/g)].map(m => m[1]).join(' ');
  const ranges = rangesByFile.get(file) || [];
  for (const match of text.matchAll(callRe)) {
    // Inside a room hook's own body: the hook hands `room` on, and its callers are checked.
    if (ranges.some(r => roomHooks.has(r.name) && match.index > r.start && match.index < r.end)) continue;
    const before = text.slice(Math.max(0, match.index - 600), match.index);
    if (/function\s+$/.test(before) || /import[^;]*$/.test(before)) continue;
    const line = lineOf(match.index);
    if (waived(line)) continue;

    // What the call's result is assigned to: `const x =` or `const { …, room: x } =`.
    // The nearest declaration before the call, and only if the call is what it is assigned.
    const decls = [...before.matchAll(/\b(?:const|let|var)\s+/g)];
    const last = decls[decls.length - 1];
    const decl = last && before.slice(last.index + last[0].length).match(/^([\s\S]*?)=\s*$/);
    let token = null;
    if (decl) {
      const lhs = decl[1].trim();
      if (lhs.startsWith('{')) {
        const renamed = lhs.match(/\brooms?\s*:\s*(\w+)/);
        const bare = lhs.match(/(?:^|[{,\s])(rooms?)\s*(?=[,}])/);
        token = renamed ? renamed[1] : bare ? bare[1] : null;
      } else if (/^\w+$/.test(lhs)) {
        token = `${lhs}\\.rooms?`;
      }
    }
    // Not after a word or a property access, so `...siteRooms` counts and `other.room` does not.
    if (token && new RegExp(`(?<!\\w)(?<![\\w)\\]]\\.)${token}\\b`).test(roomsProps)) continue;
    offences.push(
      `${name}:${line}  ${match[1]}() — pass its room to a <RoomFailure rooms={[…]} />, or mark the line \`// rooms-ok: <reason>\``
    );
  }
}

if (offences.length) {
  console.error(`A screen must say when a live room it joins does not arrive (LIVE-25). Found ${offences.length}:`);
  for (const offence of offences) console.error(`  ${offence}`);
  console.error('\nSee the live-data skill, "When a room does not arrive".');
  process.exit(1);
}
console.log(`check:rooms — every live room on screen says when it does not arrive (${roomHooks.size} room hooks).`);
