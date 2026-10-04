/**
 * The hash of shared/src that the generated action payload check records (`SYNC-6`): shared by
 * `gen-action-schemas.js`, which writes it, and `check-action-schemas.js`, which compares it.
 *
 * Every `.ts` file in shared/src counts, not only Protocol.ts, because the payload types reach into
 * the models. A change that turns out not to touch any payload costs one re-run of the generator.
 * Line endings are normalised, so a checkout with CRLF hashes the same as one with LF.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SHARED_SRC = path.resolve(__dirname, '../../shared/src');
const SCHEMA_FILE = path.resolve(__dirname, '../src/wss/actionPayloads.schema.json');

function tsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsFiles(full, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

function sharedSourceHash() {
  const hash = crypto.createHash('sha256');
  for (const file of tsFiles(SHARED_SRC).sort()) {
    hash.update(path.relative(SHARED_SRC, file).split(path.sep).join('/'));
    hash.update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  }
  return hash.digest('hex');
}

module.exports = { sharedSourceHash, SCHEMA_FILE };
