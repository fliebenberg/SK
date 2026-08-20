#!/usr/bin/env node
/**
 * Local review tool for docs/rugby/laws-infringements.md (`SCORE-11`).
 *
 * Renders the document as a readable page with a comment box against every table row, gap and
 * decision, and saves what you type straight back into the repo as JSON — so the agent reads your
 * comments from disk rather than you pasting them into chat.
 *
 *   node scripts/rugby-review.js          # serve on http://localhost:4173
 *   node scripts/rugby-review.js --port 5000
 *
 * Comments land in docs/rugby/laws-infringements.comments.json, keyed by section + row title so
 * they survive the document being re-ordered. Nothing is written to the markdown itself; merging
 * the comments into its Comments column is a deliberate, separate step.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'rugby', 'laws-infringements.md');
const COMMENTS = path.join(ROOT, 'docs', 'rugby', 'laws-infringements.comments.json');
const SHELL = path.join(__dirname, 'rugby-review.html');

const portArg = process.argv.indexOf('--port');
const PORT = portArg > -1 ? Number(process.argv[portArg + 1]) : 4173;

// ---------------------------------------------------------------------------
// Inline markdown. Deliberately minimal — the document only uses links, code,
// bold and italics, and anything else is better fixed in the source than parsed.
// ---------------------------------------------------------------------------

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(md) {
  let s = escapeHtml(md);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, href) => {
    const safe = /^(https?:|file:|#|\.)/i.test(href) ? href : '#';
    return '<a href="' + safe + '" target="_blank" rel="noreferrer">' + text + '</a>';
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return s;
}

/** Block-level markdown for the prose items (paragraphs, bullet lists). */
function block(mdLines) {
  const html = [];
  let list = null;
  const flush = () => {
    if (list) {
      html.push('<ul>' + list.map((li) => '<li>' + inline(li) + '</li>').join('') + '</ul>');
      list = null;
    }
  };
  let para = [];
  const flushPara = () => {
    if (para.length) {
      html.push('<p>' + inline(para.join(' ')) + '</p>');
      para = [];
    }
  };
  for (const raw of mdLines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flush();
    } else if (/^#{1,6}\s/.test(line)) {
      flushPara();
      flush();
      html.push('<h4>' + inline(line.replace(/^#+\s*/, '')) + '</h4>');
    } else if (isRow(line)) {
      // The intro's only table is the column glossary, which reads better as a definition list.
      flushPara();
      flush();
      if (!isSep(line)) {
        const c = cells(line);
        html.push('<div class="kv"><span>' + inline(c[0]) + '</span><span>' + inline(c.slice(1).join(' ')) + '</span></div>');
      }
    } else if (/^[-*]\s+/.test(line)) {
      flushPara();
      (list = list || []).push(line.replace(/^[-*]\s+/, ''));
    } else {
      flush();
      para.push(line);
    }
  }
  flushPara();
  flush();
  return html.join('');
}

// ---------------------------------------------------------------------------
// Document parsing
// ---------------------------------------------------------------------------

const isRow = (l) => /^\|.*\|\s*$/.test(l);
const isSep = (l) => isRow(l) && /^\|[\s:|-]+\|\s*$/.test(l);
const cells = (l) =>
  l
    .replace(/^\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

function parse() {
  const lines = fs.readFileSync(DOC, 'utf8').split(/\r?\n/);
  const groups = [];
  const intro = [];

  let part = null;
  let h2 = null;
  let h3 = null;
  let started = false;
  const seen = new Map();

  const sectionName = () => [h2, h3].filter(Boolean).join(' / ') || part || 'Document';

  const group = () => {
    const name = sectionName();
    let g = groups[groups.length - 1];
    if (!g || g.name !== name) {
      g = { id: slug(name), name: inline(name), text: name, part, items: [], notes: [] };
      groups.push(g);
    }
    return g;
  };

  const addItem = (title, meta, html) => {
    const g = group();
    let id = g.id + '::' + slug(title);
    const n = (seen.get(id) || 0) + 1;
    seen.set(id, n);
    if (n > 1) id += '--' + n;
    g.items.push({ id, title: inline(title), text: title, meta, html });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const text = h[2].trim();
      if (h[1] === '#') {
        part = text;
        h2 = null;
        h3 = null;
        if (/^Part\s+1/i.test(text)) started = true;
      } else if (h[1] === '##') {
        h2 = text;
        h3 = null;
      } else {
        h3 = text;
      }
      if (started) group();
      else if (h[1] !== '#') intro.push(line);
      continue;
    }

    if (!started) {
      if (line.trim() !== '---') intro.push(line);
      continue;
    }

    // Tables: one commentable item per body row.
    if (isRow(line) && isSep(lines[i + 1] || '')) {
      const cols = cells(line);
      i += 2;
      for (; i < lines.length && isRow(lines[i]); i++) {
        const vals = cells(lines[i]);
        const meta = [];
        for (let c = 1; c < cols.length; c++) {
          const key = cols[c].replace(/\*\*/g, '');
          if (/^comments?$/i.test(key)) continue;
          if (vals[c] && vals[c] !== '') meta.push({ key, value: inline(vals[c]), text: vals[c] });
        }
        addItem(vals[0].replace(/\*\*/g, ''), meta, '');
      }
      i--;
      continue;
    }

    // Part 4's decisions are bold-led paragraphs rather than headings.
    if (/^\*\*D\d+\s/.test(line.trim())) {
      const buf = [];
      for (; i < lines.length && lines[i].trim() !== '' && !/^#/.test(lines[i]); i++) buf.push(lines[i]);
      i--;
      const titleMatch = /^\*\*(D\d+\s*[—-]\s*[^*]+?)\*\*/.exec(buf.join(' '));
      const title = titleMatch ? titleMatch[1].trim().replace(/[.:]$/, '') : buf[0].slice(0, 60);
      addItem(title, [], block(buf));
      continue;
    }

    // Everything else in a section: prose. A section with no table (Part 3's gaps) becomes one
    // commentable item; prose sitting beside a table stays as read-only context.
    if (line.trim() !== '' && line.trim() !== '---') {
      const buf = [];
      for (; i < lines.length && !/^#/.test(lines[i]) && !isRow(lines[i]); i++) buf.push(lines[i]);
      i--;
      const g = group();
      const html = block(buf);
      if (!html) continue;
      if (/^Part 3/i.test(part || '') && h2 && g.items.length === 0) addItem(h2, [], html);
      else g.notes.push(html);
    }
  }

  return {
    intro: block(intro),
    groups: groups.filter((g) => g.items.length || g.notes.length),
    total: groups.reduce((n, g) => n + g.items.length, 0),
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const readComments = () => {
  try {
    return JSON.parse(fs.readFileSync(COMMENTS, 'utf8'));
  } catch {
    return {};
  }
};

const server = http.createServer((req, res) => {
  const send = (code, type, body) => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };

  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
    const doc = parse();
    const payload = JSON.stringify({ doc, comments: readComments() }).replace(/</g, '\\u003c');
    const shell = fs.readFileSync(SHELL, 'utf8').replace('"__REVIEW_DATA__"', payload);
    return send(200, 'text/html; charset=utf-8', shell);
  }

  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 5e6) req.destroy();
    });
    req.on('end', () => {
      try {
        const incoming = JSON.parse(body);
        const clean = {};
        for (const [k, v] of Object.entries(incoming)) {
          if (typeof v === 'string' && v.trim()) clean[k] = v.trim();
        }
        fs.writeFileSync(COMMENTS, JSON.stringify(clean, null, 2) + '\n', 'utf8');
        send(200, 'application/json', JSON.stringify({ ok: true, count: Object.keys(clean).length }));
      } catch (err) {
        send(400, 'application/json', JSON.stringify({ ok: false, error: String(err) }));
      }
    });
    return;
  }

  send(404, 'text/plain', 'Not found');
});

server.listen(PORT, () => {
  const doc = parse();
  console.log('Rugby review tool');
  console.log('  document  ' + path.relative(ROOT, DOC));
  console.log('  items     ' + doc.total + ' commentable rows across ' + doc.groups.length + ' sections');
  console.log('  comments  ' + path.relative(ROOT, COMMENTS));
  console.log('');
  console.log('  open      http://localhost:' + PORT);
  console.log('');
  console.log('Typing autosaves. Ctrl+C here when you are done.');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' is busy. Try: node scripts/rugby-review.js --port ' + (PORT + 1));
    process.exit(1);
  }
  throw err;
});
