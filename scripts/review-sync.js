#!/usr/bin/env node
/**
 * Build a static review page from one or more markdown documents.
 *
 *   node scripts/review-sync.js --out docs/foo-review.html --title "Foo Review" docs/foo.md
 *
 * The page is opened straight off the filesystem and keeps comments in the browser's localStorage,
 * so the reviewer must click Export to hand them back. For a review running over several rounds
 * prefer the server variant, which writes comments into the repo and needs no export step:
 *
 *   node scripts/review-serve.js docs/foo.md
 *
 * The markdown is the source of truth and this page is generated — re-run after every edit, and
 * never hand-edit the output. See .agent/skills/review-artifact/SKILL.md.
 */

const fs = require("fs");
const path = require("path");
const { buildPage } = require("./review-build");

function fail(msg) {
  console.error("review-sync: " + msg);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { sources: [], outPath: null, title: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out.outPath = argv[++i];
    else if (a === "--title") out.title = argv[++i];
    else if (a.startsWith("--")) fail("Unknown flag: " + a);
    else out.sources.push(a);
  }
  return out;
}

const args = parseArgs(process.argv);
if (!args.sources.length) fail("no source markdown files given");
if (!args.outPath) fail("--out is required");

let built;
try {
  built = buildPage({
    sources: args.sources,
    title: args.title,
    slug: path.basename(args.outPath).replace(/\.html?$/i, ""),
    shellPath: args.outPath,
    persist: "local",
  });
} catch (err) {
  fail(err.message);
}

if (built.upgraded) {
  console.log(
    "  (upgrading an older page to the current template; keeping storage key " +
      built.config.storageKey + ")"
  );
}

fs.writeFileSync(args.outPath, built.html, "utf8");

// Report, so a re-sync is self-verifying at a glance.
const s = built.stats;
console.log("Wrote " + args.outPath);
console.log("  documents: " + s.docs + "   sections: " + s.sections);
console.log("  open questions: " + s.openQs + "   decided: " + s.decided);

// Duplicate question tags produce two identically-labelled Q chips, which reads as a bug to the
// reviewer. Cheap to catch here.
if (s.duplicateTags.length) {
  console.log("  WARNING duplicate open-question tags: " + s.duplicateTags.join(", "));
}
