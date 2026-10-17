/* eslint-disable */
// Plain JavaScript, not TypeScript: `npm run e2e:release` runs it with node, and the repo root has
// no TypeScript runner. The Playwright config imports it as well.
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * One e2e session at a time on this machine (2026-10-17).
 *
 * Every run resets the same test database and writes to the same `test-results/`, so two at once —
 * two people, or two agent sessions — break each other with failures that have nothing to do with
 * the code. And a session fixing failures runs the suite several times, so the tests stay **held**
 * for it between runs: a second session should not slip in while the first is making its fix.
 *
 * - **A run** takes the lock as the config loads, in the runner's own process. Playwright clears
 *   `test-results/` *before* global setup, so a lock taken there would come too late; taking it
 *   here also covers `npx playwright test` run directly, not only `npm run e2e`.
 * - **When a run ends**, its owner keeps a hold for `E2E_HOLD` minutes (15). Its next run goes
 *   straight in and renews it. The owner is the Claude Code session (`CLAUDE_CODE_SESSION_ID`), or
 *   `E2E_OWNER`, or the user at a terminal.
 * - **Anyone else waits** — saying for whom — until the hold runs out, the owning Claude session has
 *   closed (`CLAUDE_PID` gone), or the owner lets go with `npm run e2e:release`. It gives up after
 *   `E2E_LOCK_WAIT` minutes (60; `0` fails at once).
 * - **A run that died** (killed, crashed) is over; its lock is not waited for.
 *
 * The state is `.run.lock` (JSON); `.run.lock.mutex` guards changing it, for a few milliseconds.
 * `npm run e2e:lock` says who has the tests.
 */
const LOCK = path.join(__dirname, '.run.lock');
const MUTEX = `${LOCK}.mutex`;
const HOLD_MIN = Number(process.env.E2E_HOLD ?? 15);
const WAIT_MIN = Number(process.env.E2E_LOCK_WAIT ?? 60);

const owner = () => {
  if (process.env.E2E_OWNER) return { id: `named:${process.env.E2E_OWNER}`, label: process.env.E2E_OWNER };
  const session = process.env.CLAUDE_CODE_SESSION_ID;
  if (session) {
    return { id: `claude:${session}`, label: `Claude session ${session.slice(0, 8)}`, sessionPid: Number(process.env.CLAUDE_PID) || undefined };
  }
  const user = os.userInfo().username;
  return { id: `user:${user}`, label: `${user} at a terminal` };
};

const alive = pid => {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e && e.code === 'EPERM'; }
};
const read = () => { try { return JSON.parse(fs.readFileSync(LOCK, 'utf8')); } catch { return null; } };
const write = state => fs.writeFileSync(LOCK, JSON.stringify(state, null, 2));
const clock = iso => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
// Waits use timers, not blocking: a blocked process never flushes what it says to a pipe, so an
// agent watching the output would see a silent hang.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** The state's few-millisecond critical section; a mutex older than ten seconds was abandoned. */
function withMutex(fn) {
  for (let i = 0; ; i++) {
    try {
      fs.writeFileSync(MUTEX, String(process.pid), { flag: 'wx' });
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(MUTEX).mtimeMs > 10_000) fs.unlinkSync(MUTEX); } catch { /* gone meanwhile */ }
      if (i > 200) throw new Error(`[e2e] Could not get ${MUTEX}.`);
      sleepSync(25);
    }
  }
  try { return fn(); } finally { try { fs.unlinkSync(MUTEX); } catch { /* already gone */ } }
}

/** Who has the tests now, other than `me`; null when they are free for `me`. */
function blocker(state, me) {
  if (!state) return null;
  if (state.run && alive(state.run.pid)) {
    // This process, or the runner whose test loader is loading the config again.
    if (state.run.pid === process.pid || state.run.pid === process.ppid) return null;
    return { text: `a run by ${state.owner.label} is in progress (pid ${state.run.pid}, started ${clock(state.run.startedAt)})` };
  }
  if (state.owner.id === me.id) return null;
  const held = state.heldUntil && Date.parse(state.heldUntil) > Date.now();
  const sessionGone = state.owner.sessionPid && !alive(state.owner.sessionPid);
  if (held && !sessionGone) return { text: `the tests are held by ${state.owner.label} until ${clock(state.heldUntil)}, between its runs` };
  return null;
}

let held = false;

/** Takes the tests for this run, waiting while someone else has them. */
async function holdRunLock() {
  // The test workers load the config too; only the runner takes the lock.
  if (held || process.env.TEST_WORKER_INDEX !== undefined) return;
  const me = owner();
  const giveUpAt = Date.now() + WAIT_MIN * 60_000;
  let said = '';
  let before = null;
  for (;;) {
    const result = withMutex(() => {
      const state = read();
      const blocked = blocker(state, me);
      if (blocked) return blocked;
      if (state && state.run && (state.run.pid === process.pid || state.run.pid === process.ppid)) return 'ours';
      write({ owner: me, run: { pid: process.pid, startedAt: new Date().toISOString() }, heldUntil: null });
      // A hold of our own from an earlier run, for a listing to leave as it found it.
      before = state && state.owner.id === me.id && state.heldUntil ? state : null;
      return 'taken';
    });
    if (result === 'ours') { held = true; return; }
    if (result === 'taken') {
      held = true;
      // Listing tests changes nothing, so it leaves no hold behind.
      const listing = process.argv.includes('--list');
      process.on('exit', () => finishRun(me, listing, before));
      return;
    }
    if (Date.now() >= giveUpAt) {
      throw new Error(`[e2e] Gave up waiting: ${result.text}. Two runs at once reset the same database and break each other. ` +
        `Set E2E_LOCK_WAIT to wait longer; the holder lets go with \`npm run e2e:release\`; \`npm run e2e:lock\` shows who has the tests.`);
    }
    if (result.text !== said) { console.log(`[e2e] Waiting: ${result.text}.`); said = result.text; }
    await sleep(2000);
  }
}

/** At the end of a run: keep the tests for its owner for a while, so a fix can be tried again. */
function finishRun(me, listing, before) {
  try {
    withMutex(() => {
      const state = read();
      if (!state || !state.run || state.run.pid !== process.pid) return;
      if (listing && before) { write(before); return; }
      if (listing || HOLD_MIN <= 0) { fs.unlinkSync(LOCK); return; }
      write({ owner: me, run: null, heldUntil: new Date(Date.now() + HOLD_MIN * 60_000).toISOString() });
    });
  } catch { /* the next run sees a dead run and goes ahead */ }
}

/** `npm run e2e:release`: let go of a hold, so nobody waits out the rest of it. */
function release() {
  const me = owner();
  withMutex(() => {
    const state = read();
    if (!state) { console.log('[e2e] Nobody has the tests.'); return; }
    if (state.run && alive(state.run.pid)) { console.log(`[e2e] Not released: a run by ${state.owner.label} is in progress (pid ${state.run.pid}).`); return; }
    if (state.owner.id !== me.id && !process.argv.includes('--force')) {
      console.log(`[e2e] Not released: the tests are held by ${state.owner.label}, not by you (${me.label}). --force releases it anyway.`);
      return;
    }
    fs.unlinkSync(LOCK);
    console.log(`[e2e] Released the hold of ${state.owner.label}.`);
  });
}

/** `npm run e2e:lock`: who has the tests. */
function status() {
  const state = read();
  const blocked = blocker(state, { id: '' });
  console.log(blocked ? `[e2e] ${blocked.text[0].toUpperCase()}${blocked.text.slice(1)}.` : '[e2e] Nobody has the tests.');
}

module.exports = { holdRunLock, release, status };

if (require.main === module) {
  if (process.argv[2] === 'release') release();
  else status();
}
