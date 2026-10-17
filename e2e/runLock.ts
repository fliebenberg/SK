import fs from 'fs';
import path from 'path';

/**
 * One e2e run at a time on this machine (2026-10-17).
 *
 * Every run resets the same test database and writes to the same `test-results/`, so two at once —
 * two people, or two agent sessions — break each other with failures that have nothing to do with
 * the code. The lock is taken when the config loads, in the runner's own process: Playwright clears
 * `test-results/` *before* global setup, so a lock taken there would come too late. Taking it here
 * also covers `npx playwright test` run directly, not only `npm run e2e`.
 *
 * A second run waits, saying whose run it is waiting for, and gives up after `E2E_LOCK_WAIT`
 * minutes (30 by default; `0` fails at once). A lock whose run is no longer alive — killed, or
 * crashed — is stale and taken over.
 */
const LOCK = path.join(__dirname, '.run.lock');

interface Holder { pid: number; ppid: number; startedAt: string; command: string }

const alive = (pid: number) => {
  try { process.kill(pid, 0); return true; } catch (e: any) { return e?.code === 'EPERM'; }
};
const read = (): Holder | null => {
  try { return JSON.parse(fs.readFileSync(LOCK, 'utf8')); } catch { return null; }
};
/** Ours: this process, or the runner that started it (its test loader loads the config again). */
const ours = (h: Holder) => h.pid === process.pid || h.pid === process.ppid;
// Waited for with timers, not by blocking: a blocked process never flushes what it says to a pipe,
// so an agent watching the output would see a silent hang.
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let held = false;

export async function holdRunLock() {
  // The test workers load the config too; only the runner takes the lock.
  if (held || process.env.TEST_WORKER_INDEX !== undefined) return;
  const waitMinutes = Number(process.env.E2E_LOCK_WAIT ?? 30);
  const giveUpAt = Date.now() + waitMinutes * 60_000;
  let said = 0;
  for (;;) {
    try {
      const me: Holder = { pid: process.pid, ppid: process.ppid, startedAt: new Date().toISOString(), command: process.argv.slice(1).join(' ') };
      fs.writeFileSync(LOCK, JSON.stringify(me, null, 2), { flag: 'wx' });
      held = true;
      // On any exit, Ctrl+C included (Playwright stops the run and exits itself). A run killed
      // outright leaves the lock behind, and the next run finds it stale.
      process.on('exit', () => { if (read()?.pid === process.pid) { try { fs.unlinkSync(LOCK); } catch { /* already gone */ } } });
      return;
    } catch (e: any) {
      if (e?.code !== 'EEXIST') throw e;
    }
    const holder = read();
    if (holder && ours(holder)) { held = true; return; }
    // Unreadable (being written this instant) is retried; a dead holder's lock is stale.
    if (holder && !alive(holder.pid)) {
      console.log(`[e2e] Taking over a stale lock from pid ${holder.pid} (started ${holder.startedAt}), which is no longer running.`);
      try { fs.unlinkSync(LOCK); } catch { /* someone else took it over first */ }
      continue;
    }
    const who = holder ? ` (pid ${holder.pid}, started ${holder.startedAt})` : '';
    if (Date.now() >= giveUpAt) {
      throw new Error(
        `[e2e] Another e2e run is in progress${who}. Two runs at once reset the same database and break ` +
        `each other. Wait for it to finish, or set E2E_LOCK_WAIT to the minutes to wait. A lock whose ` +
        `run has died is taken over by itself: ${LOCK}`
      );
    }
    if (Date.now() - said > 60_000) {
      console.log(`[e2e] Waiting for another e2e run to finish${who}…`);
      said = Date.now();
    }
    await sleep(2000);
  }
}
