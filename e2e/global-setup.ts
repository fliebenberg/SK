import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const API = process.env.E2E_API_URL || 'http://localhost:3001';
const SERVER = path.resolve(__dirname, '../server');

/**
 * Every run starts from the fixture data: the test organisations are put back exactly as defined
 * (`npm run db:test-orgs`, which reloads *Test Spring Festival* too), and the API restarted so its
 * caches reload — nodemon restarts when a watched file changes, so the entry file is touched. Set
 * `E2E_SKIP_RESET=1` to run against the data as it is.
 */
export default async function globalSetup() {
  if (process.env.E2E_SKIP_RESET) return;
  execSync('npm run db:test-orgs', { cwd: SERVER, stdio: 'inherit' });
  const entry = path.join(SERVER, 'src/index.ts');
  const now = new Date();
  fs.utimesSync(entry, now, now);
  await new Promise(resolve => setTimeout(resolve, 3000));
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(API);
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  throw new Error(`The API at ${API} did not come back after the reset.`);
}
