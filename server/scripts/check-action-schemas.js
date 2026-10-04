#!/usr/bin/env node
/**
 * Fails if the server's action payload check is older than the payload types (`SYNC-6`).
 *
 * src/wss/actionPayloads.schema.json is generated from shared/src/types/Protocol.ts. If the types
 * change and it is not regenerated, the server checks payloads against the old types: a new field
 * the app now sends is refused, or a removed one is still let through.
 *
 * No dependencies — it compares hashes rather than regenerating — so it runs in the pre-commit
 * hook in a fresh clone.
 *
 * Run: `npm run check:action-schemas` (from server/).
 */
const fs = require('fs');
const { sharedSourceHash, SCHEMA_FILE } = require('./action-schemas-hash');

let recorded = null;
try {
  recorded = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8')).sourceHash;
} catch {
  // Missing or unreadable: reported below as out of date.
}

if (recorded !== sharedSourceHash()) {
  console.error('The action payload check is out of date: shared/src has changed since it was generated.');
  console.error('Run `npm run gen:action-schemas` in server/ and commit the result.');
  process.exit(1);
}
console.log('check:action-schemas — the payload check matches the shared types.');
