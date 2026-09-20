#!/usr/bin/env node
/**
 * Fails if a migration file is not accounted for in the two places that go stale silently.
 *
 * Both failures are invisible for months, which is what makes them worth a script rather than a
 * rule nobody remembers:
 *
 *   1. **The catalogue in `okf/database.md`.** It is how anyone finds out what a migration did
 *      without reading fourteen files, and it is the first thing to be forgotten because nothing
 *      breaks when it is. `20260920_event_sport_organizers.ts` sat unlisted until the next change
 *      touched the same document.
 *
 *   2. **The `init-db.ts` mirror.** A migration that alters structure must also be reflected in the
 *      clean-install path, or a new environment is built without it. This script can only check
 *      that *something* in `init-db.ts` mentions the tables the migration names — a weak test, and
 *      deliberately so: the real one is the `pg_dump` diff described in `okf/database.md`, which no
 *      static check replaces. Data-only migrations have nothing to mirror and say so in a comment.
 *
 * Run: `npm run check:migrations` (from server/). Exit code 1 lists what is missing.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'src/scripts/migrations');
const CATALOGUE = path.resolve(ROOT, '../okf/database.md');
const INIT_DB = path.join(ROOT, 'src/scripts/setup/init-db.ts');

/** A migration that creates or alters nothing says so, and is exempt from the mirror check. */
const DATA_ONLY = /\bdata only, no schema change\b/i;

const catalogue = fs.readFileSync(CATALOGUE, 'utf8');
const initDb = fs.readFileSync(INIT_DB, 'utf8');

const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))
  .sort();

const problems = [];

for (const file of files) {
  if (!catalogue.includes(file)) {
    problems.push(`${file}  is not listed in okf/database.md`);
  }

  const source = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  if (DATA_ONLY.test(source)) continue;

  // Every table this migration creates or alters, as it names them.
  const tables = new Set();
  const re = /(?:CREATE TABLE(?: IF NOT EXISTS)?|ALTER TABLE(?: IF EXISTS)?)\s+([a-z_][a-z0-9_]*)/gi;
  let match;
  while ((match = re.exec(source))) tables.add(match[1].toLowerCase());

  const unmirrored = [...tables].filter(table => !initDb.toLowerCase().includes(table));
  if (unmirrored.length) {
    problems.push(
      `${file}  touches ${unmirrored.join(', ')}, which init-db.ts never mentions ` +
        `(mirror it, or mark the migration "Data only, no schema change")`
    );
  }
}

if (problems.length) {
  console.error(`check:migrations — ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`check:migrations — ${files.length} migrations, all catalogued and mirrored.`);
