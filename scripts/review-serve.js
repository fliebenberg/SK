#!/usr/bin/env node
/**
 * Serve a review page whose comments are saved into the repo instead of the browser.
 *
 *   node scripts/review-serve.js docs/foo.md
 *   node scripts/review-serve.js docs/foo.md docs/foo-data-model.md --port 5000
 *
 * Comments land in <first source>.comments.json beside the document, keyed by the same block hash
 * the static page uses — so a document can move between the two variants and keep its comments.
 *
 * Why this rather than review-sync.js: no export step, the comments are in the repo where the
 * agent reads them straight off disk and where git tracks them, and it works in browsers that
 * refuse localStorage on file:// URLs. The cost is that the server must be running to review.
 *
 * The markdown is re-read on every page load, so editing the source and refreshing is enough —
 * there is no rebuild step. Comments on text that changed are pruned by the page, exactly as in
 * the static variant. See .agent/skills/review-artifact/SKILL.md.
 */

const fs = require("fs");
const http = require("http");
const path = require("path");
const { buildPage } = require("./review-build");

const ROOT = path.join(__dirname, "..");

function fail(msg) {
  console.error("review-serve: " + msg);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { sources: [], title: null, port: 4173, comments: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") out.port = Number(argv[++i]);
    else if (a === "--title") out.title = argv[++i];
    else if (a === "--comments") out.comments = argv[++i];
    else if (a.startsWith("--")) fail("Unknown flag: " + a);
    else out.sources.push(a);
  }
  return out;
}

const args = parseArgs(process.argv);
if (!args.sources.length) fail("no source markdown files given");
if (!Number.isFinite(args.port)) fail("--port must be a number");

// Comments sit beside the first document, named after it. With several sources on one page the
// first is the primary document, which is also how the page titles itself.
const slug = path.basename(args.sources[0]).replace(/\.md$/i, "");
const COMMENTS =
  args.comments || path.join(path.dirname(args.sources[0]), slug + ".comments.json");

const readComments = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(COMMENTS, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

function countComments(data) {
  return Object.keys(data).reduce(
    (n, k) => n + (Array.isArray(data[k]) ? data[k].length : 0),
    0
  );
}

// Fail fast on a bad document rather than at the first request.
let initial;
try {
  initial = buildPage({
    sources: args.sources,
    title: args.title,
    slug,
    persist: "server",
    comments: readComments(),
  });
} catch (err) {
  fail(err.message);
}

const server = http.createServer((req, res) => {
  const send = (code, type, body) => {
    res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(body);
  };

  if (req.method === "GET" && (req.url === "/" || req.url.startsWith("/?"))) {
    let built;
    try {
      // Re-read the markdown every load, so editing the source and refreshing is enough.
      built = buildPage({
        sources: args.sources,
        title: args.title,
        slug,
        persist: "server",
        comments: readComments(),
      });
    } catch (err) {
      return send(500, "text/plain; charset=utf-8", "review-serve: " + err.message);
    }
    return send(200, "text/html; charset=utf-8", built.html);
  }

  if (req.method === "POST" && req.url === "/save") {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 5e6) req.destroy();
    });
    req.on("end", () => {
      try {
        const incoming = JSON.parse(body);
        // Keep only well-formed comment lists, so a malformed post cannot corrupt the file.
        const clean = {};
        for (const [k, v] of Object.entries(incoming)) {
          if (!Array.isArray(v) || !v.length) continue;
          const rows = v.filter((c) => c && typeof c.text === "string" && c.text.trim());
          if (rows.length) clean[k] = rows;
        }
        fs.writeFileSync(COMMENTS, JSON.stringify(clean, null, 2) + "\n", "utf8");
        send(200, "application/json", JSON.stringify({ ok: true, count: countComments(clean) }));
      } catch (err) {
        send(400, "application/json", JSON.stringify({ ok: false, error: String(err) }));
      }
    });
    return;
  }

  send(404, "text/plain", "Not found");
});

server.listen(args.port, () => {
  const s = initial.stats;
  console.log("Review server — " + initial.config.title);
  console.log("  documents  " + args.sources.map((p) => path.relative(ROOT, p)).join(", "));
  console.log("  sections   " + s.sections + "   open questions: " + s.openQs + "   decided: " + s.decided);
  console.log("  comments   " + path.relative(ROOT, COMMENTS) + "  (" + countComments(readComments()) + " so far)");
  if (s.duplicateTags.length) {
    console.log("  WARNING duplicate open-question tags: " + s.duplicateTags.join(", "));
  }
  console.log("");
  console.log("  open       http://localhost:" + args.port);
  console.log("");
  console.log("Typing autosaves into the repo. Ctrl+C here when you are done.");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    fail("port " + args.port + " is busy. Try: node scripts/review-serve.js " +
         args.sources.join(" ") + " --port " + (args.port + 1));
  }
  throw err;
});
