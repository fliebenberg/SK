#!/usr/bin/env node
/**
 * Fails if anything starts a transaction through the connection pool (TX-1).
 *
 * `this.query(...)` in a manager and `pool.query(...)` both hand each statement to whichever pooled
 * connection is free, so `BEGIN`, the writes and `COMMIT` can land on different backends: the block
 * is not atomic, its `ROLLBACK` undoes nothing, and the stray `BEGIN` is inherited by the next
 * unrelated query on that connection. It works in development, where the pool is idle and hands back
 * the same connection, and fails silently under load.
 *
 * Use `this.transaction(async (tx) => { ... })` in a manager (BaseManager.ts), or check out one
 * client with `pool.connect()` in a script and run every statement on it.
 *
 * Run: `npm run check:transactions` (from server/). Exit code 1 lists each offending line.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const PATTERN = /\b(?:this|pool)\.query\(\s*['"`]\s*(?:BEGIN|START\s+TRANSACTION)\b/gi;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const offences = [];
for (const file of walk(SRC, [])) {
  const text = fs.readFileSync(file, 'utf8');
  PATTERN.lastIndex = 0;
  let match;
  while ((match = PATTERN.exec(text))) {
    const before = text.slice(0, match.index);
    // Comments that describe the pattern (BaseManager explains why it is banned) are not uses of it.
    if (/^\s*(\*|\/\/|\/\*)/.test(before.slice(before.lastIndexOf('\n') + 1))) continue;
    const line = before.split('\n').length;
    offences.push(`${path.relative(ROOT, file).split(path.sep).join('/')}:${line}  ${match[0]}`);
  }
}

if (offences.length) {
  console.error(`Transactions must run on one connection — use this.transaction() or pool.connect(). Found ${offences.length}:`);
  for (const offence of offences) console.error(`  ${offence}`);
  process.exit(1);
}
console.log('check:transactions — no transaction is started through the pool.');
