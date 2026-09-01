/**
 * Shared page builder for the two review variants.
 *
 *   review-sync.js   writes a static .html the user double-clicks; comments live in localStorage.
 *   review-serve.js  serves the same page over http; comments POST back into a repo JSON file.
 *
 * Both render through scripts/review-template.html. Keeping the markdown preprocessing, the config
 * injection and the counting here means the two variants cannot drift in what they display — the
 * only thing that differs is where a comment goes when it is typed.
 */

const fs = require("fs");
const path = require("path");

const TEMPLATE = path.join(__dirname, "review-template.html");
const CONFIG_TAG = '<script id="review-config" type="application/json">';
const SRC_TAG = '<script id="spec-src" type="text/plain">';

/** Read and normalise the source markdown for embedding in a <script> block. */
function loadMarkdown(sources) {
  const missing = sources.filter((p) => !fs.existsSync(p));
  if (missing.length) throw new Error("source not found: " + missing.join(", "));

  let md = sources.map((p) => fs.readFileSync(p, "utf8")).join("\n\n");

  // In-repo file:/// links are noise in a review — keep the label, drop the href. Real external
  // links (https) survive.
  md = md.replace(/\[([^\]]+)\]\(file:\/\/\/[^)]*\)/g, "$1");

  // Anchor-only links reduce to their label; the page builds its own navigation.
  md = md.replace(/\[([^\]]+)\]\(#[^)]*\)/g, "$1");

  // Horizontal rules add nothing once the page draws section borders.
  md = md.replace(/^---\s*$/gm, "");
  md = md.replace(/\n{3,}/g, "\n\n").trim();

  // The embed lives inside a <script> block, so any closing tag in the prose would break out of it.
  if (/<\/script/i.test(md)) {
    throw new Error("the markdown contains a </script sequence and cannot be embedded");
  }
  return md;
}

function replaceBlock(source, openTag, body, where) {
  const start = source.indexOf(openTag);
  if (start === -1) throw new Error("could not find " + openTag + " in " + where);
  const from = start + openTag.length;
  const end = source.indexOf("</script>", from);
  if (end === -1) throw new Error("unterminated block for " + openTag);
  return source.slice(0, from) + "\n" + body + "\n" + source.slice(end);
}

/**
 * Count against the prose only. A shell example can easily hold a `# comment` at column 0, which
 * would otherwise be reported as another document.
 */
function stats(md) {
  const prose = md.replace(/^```[\s\S]*?^```/gm, "");
  const tags = (prose.match(/^> \*\*Open\s*[—-]\s*([^*]+?)\.?\*\*/gm) || []).map((s) =>
    s.replace(/^> \*\*Open\s*[—-]\s*/, "").replace(/\.?\*\*$/, "").trim()
  );
  return {
    docs: (prose.match(/^# /gm) || []).length,
    sections: (prose.match(/^## /gm) || []).length,
    openQs: (prose.match(/^> \*\*Open/gm) || []).length,
    decided: (prose.match(/^> \*\*Decided/gm) || []).length,
    duplicateTags: [...new Set(tags.filter((t, i) => tags.indexOf(t) !== i))],
  };
}

/**
 * Build the page HTML.
 *
 * @param {object}   o
 * @param {string[]} o.sources    markdown paths, concatenated in order
 * @param {string}  [o.title]     defaults to the first H1, then to `slug`
 * @param {string}   o.slug       basename used for the storage key and export filename
 * @param {string}  [o.shellPath] rebuild from an existing page so hand tweaks survive a re-sync
 * @param {string}  [o.persist]   'local' (default) or 'server'
 * @param {object}  [o.comments]  server mode only: the comments to hydrate the page with
 * @returns {{html: string, config: object, stats: object, upgraded: boolean}}
 */
function buildPage(o) {
  const md = loadMarkdown(o.sources);
  const firstH1 = (md.match(/^#\s+(.+)$/m) || [])[1];

  const config = {
    title: o.title || firstH1 || o.slug,
    subtitle: "· review draft",
    storageKey: "sk-" + o.slug.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-v1",
    exportFileName: o.slug + "-comments.md",
    sources: o.sources.map((p) => p.replace(/\\/g, "/")),
    persist: o.persist === "server" ? "server" : "local",
  };
  if (config.persist === "server") config.comments = o.comments || {};

  // Rebuild from the existing output when there is one, so hand-made tweaks to a page survive a
  // re-sync. Fall back to the template for a new review.
  let shellPath = o.shellPath && fs.existsSync(o.shellPath) ? o.shellPath : null;
  let existing = shellPath ? fs.readFileSync(shellPath, "utf8") : null;
  let upgraded = false;

  // An existing page built before the template gained its config block cannot be used as its own
  // shell. Rebuild from the template, but carry the old storage key across — it is what ties a
  // reviewer's saved comments to this page, and changing it would orphan every one of them.
  if (existing && existing.indexOf(CONFIG_TAG) === -1) {
    const m = existing.match(/var KEY = "([^"]+)"/);
    if (m) config.storageKey = m[1];
    upgraded = true;
    existing = null;
    shellPath = null;
  }

  // The storage key is what ties a reviewer's saved comments to this page. Never regenerate it for
  // an existing page — that would orphan every comment they have written.
  if (existing) {
    const prev = existing.match(
      /<script id="review-config" type="application\/json">\s*([\s\S]*?)\s*<\/script>/
    );
    if (prev) {
      try {
        const parsed = JSON.parse(prev[1]);
        if (parsed.storageKey) config.storageKey = parsed.storageKey;
      } catch (e) {
        /* fall through to the generated key */
      }
    }
  }

  if (!fs.existsSync(TEMPLATE)) throw new Error("template not found at " + TEMPLATE);
  let html = existing || fs.readFileSync(TEMPLATE, "utf8");
  const where = shellPath || TEMPLATE;

  html = replaceBlock(html, CONFIG_TAG, JSON.stringify(config, null, 2), where);
  html = replaceBlock(html, SRC_TAG, md, where);

  return { html, config, stats: stats(md), upgraded };
}

module.exports = { buildPage, loadMarkdown, stats, TEMPLATE };
