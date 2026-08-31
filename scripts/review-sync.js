#!/usr/bin/env node
/**
 * Build (or rebuild) a local review page from one or more markdown documents.
 *
 * The page is a single self-contained HTML file you open with file:// — no server. It renders the
 * documents, lets a reviewer attach comments to any block, tracks which open questions are still
 * unanswered, and exports the comments as markdown for an agent to read back.
 *
 *   node scripts/review-sync.js --out docs/foo-review.html docs/foo.md docs/foo-data-model.md
 *   node scripts/review-sync.js --out docs/foo-review.html --title "Foo Review" docs/foo.md
 *
 * The markdown files stay the source of truth. Re-run this after every edit to them; never hand-edit
 * the generated page, or the two will drift.
 *
 * See .agent/skills/review-artifact/SKILL.md for the workflow and its conventions.
 */

const fs = require("fs");
const path = require("path");

const TEMPLATE = path.join(__dirname, "review-template.html");

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

function fail(msg) {
  console.error("review-sync: " + msg);
  process.exit(1);
}

const args = parseArgs(process.argv);
if (!args.sources.length) fail("no source markdown files given");
if (!args.outPath) fail("--out is required");

const missing = args.sources.filter((p) => !fs.existsSync(p));
if (missing.length) fail("source not found: " + missing.join(", "));

// ---------------------------------------------------------------------------
// Prepare the markdown for embedding.
// ---------------------------------------------------------------------------
let md = args.sources.map((p) => fs.readFileSync(p, "utf8")).join("\n\n");

// In-repo file:/// links are noise in a review — keep the label, drop the href. Real external
// links (https) survive.
md = md.replace(/\[([^\]]+)\]\(file:\/\/\/[^)]*\)/g, "$1");

// Anchor-only links reduce to their label; the page builds its own navigation.
md = md.replace(/\[([^\]]+)\]\(#[^)]*\)/g, "$1");

// Horizontal rules add nothing once the page draws section borders.
md = md.replace(/^---\s*$/gm, "");
md = md.replace(/\n{3,}/g, "\n\n").trim();

// The embed lives inside a <script> block, so any closing tag in the prose would break out of it.
if (/<\/script/i.test(md)) fail("the markdown contains a </script sequence and cannot be embedded");

// ---------------------------------------------------------------------------
// Config the page reads at runtime.
// ---------------------------------------------------------------------------
const outBase = path.basename(args.outPath).replace(/\.html?$/i, "");
const firstH1 = (md.match(/^#\s+(.+)$/m) || [])[1];
const title = args.title || firstH1 || outBase;

const config = {
  title,
  subtitle: "· review draft",
  storageKey: "sk-" + outBase.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-v1",
  exportFileName: outBase + "-comments.md",
  sources: args.sources.map((p) => p.replace(/\\/g, "/")),
};

// ---------------------------------------------------------------------------
// Write the page.
// ---------------------------------------------------------------------------
// Rebuild from the existing output when there is one, so hand-made tweaks to a page survive a
// re-sync. Fall back to the template for a new review.
const CONFIG_TAG = '<script id="review-config" type="application/json">';
let shellPath = args.outPath;
let existing = fs.existsSync(args.outPath) ? fs.readFileSync(args.outPath, "utf8") : null;

// An existing page built before the template gained its config block cannot be used as its own
// shell. Rebuild from the template, but carry the old storage key across — it is what ties a
// reviewer's saved comments to this page, and changing it would orphan every one of them.
let salvagedKey = null;
if (existing && existing.indexOf(CONFIG_TAG) === -1) {
  const m = existing.match(/var KEY = "([^"]+)"/);
  if (m) salvagedKey = m[1];
  console.log("  (upgrading an older page to the current template" +
              (salvagedKey ? "; keeping storage key " + salvagedKey : "") + ")");
  existing = null;
}
if (!existing) shellPath = TEMPLATE;
if (!fs.existsSync(shellPath)) fail("template not found at " + TEMPLATE);
let html = existing || fs.readFileSync(TEMPLATE, "utf8");
if (salvagedKey) config.storageKey = salvagedKey;

function replaceBlock(source, openTag, body) {
  const start = source.indexOf(openTag);
  if (start === -1) fail("could not find " + openTag + " in " + shellPath);
  const from = start + openTag.length;
  const end = source.indexOf("</script>", from);
  if (end === -1) fail("unterminated block for " + openTag);
  return source.slice(0, from) + "\n" + body + "\n" + source.slice(end);
}

// The storage key is what ties a reviewer's saved comments to this page. Never regenerate it for
// an existing page — that would orphan every comment they have written.
const existingConfig = html.match(
  /<script id="review-config" type="application\/json">\s*([\s\S]*?)\s*<\/script>/
);
if (existingConfig && shellPath === args.outPath) {
  try {
    const prev = JSON.parse(existingConfig[1]);
    if (prev.storageKey) config.storageKey = prev.storageKey;
  } catch (e) { /* fall through to the generated key */ }
}

html = replaceBlock(html, CONFIG_TAG, JSON.stringify(config, null, 2));
html = replaceBlock(html, '<script id="spec-src" type="text/plain">', md);

fs.writeFileSync(args.outPath, html, "utf8");

// ---------------------------------------------------------------------------
// Report, so a re-sync is self-verifying at a glance.
// ---------------------------------------------------------------------------
// Count against the prose only. A shell example can easily hold a `# comment` at column 0, which
// would otherwise be reported as another document.
const prose = md.replace(/^```[\s\S]*?^```/gm, "");

const openQs = (prose.match(/^> \*\*Open/gm) || []).length;
const decided = (prose.match(/^> \*\*Decided/gm) || []).length;
const sections = (prose.match(/^## /gm) || []).length;
const docs = (prose.match(/^# /gm) || []).length;

console.log("Wrote " + args.outPath);
console.log("  documents: " + docs + "   sections: " + sections);
console.log("  open questions: " + openQs + "   decided: " + decided);

// Duplicate question tags produce two identically-labelled Q chips, which reads as a bug to the
// reviewer. Cheap to catch here.
const tags = (prose.match(/^> \*\*Open\s*[—-]\s*([^*]+?)\.?\*\*/gm) || [])
  .map((s) => s.replace(/^> \*\*Open\s*[—-]\s*/, "").replace(/\.?\*\*$/, "").trim());
const dupes = tags.filter((t, i) => tags.indexOf(t) !== i);
if (dupes.length) {
  console.log("  WARNING duplicate open-question tags: " + [...new Set(dupes)].join(", "));
}
