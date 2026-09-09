#!/usr/bin/env node
/**
 * Renders the interview guides in docs/interviews/ to print-ready A4 PDFs.
 *
 *   npm run interviews:pdf                  # every guide -> docs/interviews/print/
 *   npm run interviews:pdf -- scorer        # just the guides whose name contains "scorer"
 *   npm run interviews:pdf -- --compact     # no writing space, fewer pages
 *   npm run interviews:pdf -- --space 12    # 12mm of writing space under each question
 *   npm run interviews:pdf -- --readme      # include README.md as well
 *
 * The point of this over a generic markdown-to-PDF converter is the numbering. The guides write
 * every list item as `1.` and let the renderer number them, and the README cites questions as
 * *section.question* (`4.3`). So this emits "4.3" against the third question of section 4, which
 * means the sheet in your hand is numbered the same way your notes will reference it.
 *
 * It also gives probes their own quieter style (they are prompts for the interviewer, not
 * questions to read aloud), turns the `**Label:**` fields into ruled lines you can write on, and
 * puts the "After the interview" block on its own page.
 *
 * No dependencies. Markdown is parsed here — the guides use a small, consistent subset, and
 * anything they do not use is better fixed in the source than parsed. PDF generation drives an
 * installed Chrome or Edge over the DevTools protocol (Node 22+ has a built-in WebSocket), and
 * falls back to Chrome's --print-to-pdf flag, which works but cannot draw the page footer.
 *
 * Notes files (`YYYY-MM-DD-org-initials.md`) are skipped — they are records of interviews already
 * conducted, not sheets to carry.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'interviews');

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { filters: [], space: 5, readme: false, out: path.join(SRC, 'print'), paper: 'A4' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--compact') opts.space = 0;
    else if (a === '--space') opts.space = Number(argv[++i]);
    else if (a.startsWith('--space=')) opts.space = Number(a.slice(8));
    else if (a === '--readme') opts.readme = true;
    else if (a === '--letter') opts.paper = 'Letter';
    else if (a === '--out') opts.out = path.resolve(argv[++i]);
    else if (a.startsWith('--out=')) opts.out = path.resolve(a.slice(6));
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`);
    else opts.filters.push(a.toLowerCase().replace(/\.md$/, ''));
  }
  if (!Number.isFinite(opts.space) || opts.space < 0) throw new Error('--space needs a number of mm');
  return opts;
}

const HELP = `
Render docs/interviews/*.md to print-ready PDFs.

  npm run interviews:pdf -- [names...] [options]

  names            substring match on the guide filename (default: every guide)

  --compact        no writing space under questions
  --space <mm>     writing space under each question (default 5)
  --readme         also render README.md
  --letter         US Letter instead of A4
  --out <dir>      output directory (default docs/interviews/print)
`;

// ---------------------------------------------------------------------------
// Inline markdown
// ---------------------------------------------------------------------------

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Bold, italics, code, links and the ☐ checkbox. Links lose their href — a printed sheet cannot be
 * clicked, and a visible URL is noise while you are reading a question out loud.
 */
function inline(md) {
  let s = escapeHtml(md);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  // A real bordered box always prints; the glyph depends on the font having it.
  s = s.replace(/☐/g, '<span class="box"></span>');
  return s;
}

// ---------------------------------------------------------------------------
// Block markdown
// ---------------------------------------------------------------------------

const RE = {
  hr: /^-{3,}\s*$/,
  heading: /^(#{1,6})\s+(.*)$/,
  quote: /^>\s?(.*)$/,
  table: /^\|/,
  item: /^\d+\.\s+(.*)$/,
  bullet: /^[-*]\s+(.*)$/,
  cont2: /^ {2}(?! )(\S.*)$/,
  probe: /^ {3}-\s+(.*)$/,
  cont3: /^ {3}(?! )(\S.*)$/,
  cont5: /^ {5,}(\S.*)$/,
  fieldEmpty: /^\*\*([^*]+):\*\*\s*$/,
  fieldValue: /^\*\*([^*]+):\*\*\s+(.+)$/,
  sectionNo: /^(\d+)\.\s+(.*)$/,
};

function renderMarkdown(md, opts) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let section = null; // current "## N." number, drives question numbering
  let question = 0;
  let frontMatter = true; // the participant/date block above the first rule
  let afterBlock = false; // inside "After the interview"

  const push = (html) => out.push(html);

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    if (RE.hr.test(line)) {
      if (frontMatter) frontMatter = false;
      else push('<hr />');
      i++;
      continue;
    }

    const heading = line.match(RE.heading);
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      let text = heading[2].trim();
      const numbered = text.match(RE.sectionNo);
      let cls = '';
      if (level === 2) {
        question = 0;
        section = numbered ? numbered[1] : null;
        afterBlock = /after the interview/i.test(text);
        if (afterBlock) cls = ' class="page-break"';
      }
      push(`<h${level}${cls}>${inline(text)}</h${level}>`);
      i++;
      continue;
    }

    // "**Participant:**" with nothing after it — somewhere to write.
    const empty = line.match(RE.fieldEmpty);
    if (empty) {
      const label = inline(empty[1]);
      if (frontMatter) {
        push(`<div class="field"><span class="field-label">${label}:</span><span class="rule"></span></div>`);
      } else {
        push(`<div class="write"><div class="write-label">${label}</div>${'<div class="line"></div>'.repeat(3)}</div>`);
      }
      i++;
      continue;
    }

    const valued = line.match(RE.fieldValue);
    if (valued && frontMatter) {
      push(
        `<div class="field"><span class="field-label">${inline(valued[1])}:</span>` +
          `<span class="field-value">${inline(valued[2])}</span></div>`
      );
      i++;
      continue;
    }

    if (RE.quote.test(line)) {
      const buf = [];
      while (i < lines.length && RE.quote.test(lines[i])) {
        buf.push(lines[i].match(RE.quote)[1]);
        i++;
      }
      push(`<blockquote>${inline(buf.join(' ').trim())}</blockquote>`);
      continue;
    }

    if (RE.table.test(line)) {
      const rows = [];
      while (i < lines.length && RE.table.test(lines[i])) {
        rows.push(lines[i]);
        i++;
      }
      push(renderTable(rows));
      continue;
    }

    if (RE.item.test(line)) {
      const { html, next } = renderList(lines, i, { section, start: question, opts });
      question = next.count;
      i = next.i;
      push(html);
      continue;
    }

    // A plain bullet list at the left margin — prose, not questions to number.
    if (RE.bullet.test(line)) {
      const bullets = [];
      while (i < lines.length && RE.bullet.test(lines[i])) {
        const buf = [lines[i].match(RE.bullet)[1]];
        i++;
        while (i < lines.length && RE.cont2.test(lines[i])) {
          buf.push(lines[i].match(RE.cont2)[1]);
          i++;
        }
        bullets.push(`<li>${inline(buf.join(' '))}</li>`);
      }
      push(`<ul class="bullets">${bullets.join('')}</ul>`);
      continue;
    }

    // Paragraph: run on until a blank line or the start of another block.
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      buf.push(lines[i].trim());
      i++;
    }
    if (buf.length) push(`<p>${inline(buf.join(' '))}</p>`);
    else i++;
  }

  return out.join('\n');
}

function isBlockStart(line) {
  return (
    RE.hr.test(line) ||
    RE.heading.test(line) ||
    RE.quote.test(line) ||
    RE.table.test(line) ||
    RE.item.test(line) ||
    RE.bullet.test(line) ||
    RE.fieldEmpty.test(line)
  );
}

/**
 * An ordered list, its wrapped continuation lines, and its probes.
 *
 * The source numbers every item `1.`, so the number printed here is computed: "4.3" inside a
 * numbered section, a plain running count outside one.
 */
function renderList(lines, start, { section, start: from, opts }) {
  let i = start;
  let count = from;
  const items = [];

  while (i < lines.length) {
    const m = lines[i].match(RE.item);
    if (!m) break;
    i++;
    count++;

    const item = { text: [m[1]], probes: [] };
    while (i < lines.length) {
      const probe = lines[i].match(RE.probe);
      if (probe) {
        item.probes.push([probe[1]]);
        i++;
        continue;
      }
      const deep = lines[i].match(RE.cont5);
      if (deep && item.probes.length) {
        item.probes[item.probes.length - 1].push(deep[1]);
        i++;
        continue;
      }
      const cont = lines[i].match(RE.cont3) || deep;
      if (cont) {
        if (item.probes.length) item.probes[item.probes.length - 1].push(cont[1]);
        else item.text.push(cont[1]);
        i++;
        continue;
      }
      break;
    }
    items.push({ ...item, number: section ? `${section}.${count}` : `${count}` });
  }

  const space = opts.space ? ` style="padding-bottom:${opts.space}mm"` : '';
  const html = items
    .map((it) => {
      const probes = it.probes.length
        ? `<ul class="probes">${it.probes.map((p) => `<li>${inline(p.join(' '))}</li>`).join('')}</ul>`
        : '';
      return (
        `<li${space}><span class="n">${it.number}</span>` +
        `<div class="q"><p>${inline(it.text.join(' '))}</p>${probes}</div></li>`
      );
    })
    .join('\n');

  return { html: `<ol class="questions">\n${html}\n</ol>`, next: { i, count } };
}

function renderTable(rows) {
  const cells = (row) =>
    row
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  const isDivider = (row) => /^[\s|:-]+$/.test(row);

  const head = cells(rows[0]);
  const body = rows.slice(1).filter((r) => !isDivider(r)).map(cells);
  const th = head.map((c) => `<th>${inline(c)}</th>`).join('');
  const tr = body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

const CSS = `
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0;
    font-family: "Segoe UI", -apple-system, "Helvetica Neue", Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.42;
    color: #16181d;
  }

  h1 { font-size: 17pt; line-height: 1.2; margin: 0 0 3mm; letter-spacing: -0.01em; }
  h2 {
    font-size: 12pt;
    margin: 7mm 0 2.5mm;
    padding-bottom: 1.2mm;
    border-bottom: 1.4pt solid #16181d;
    break-after: avoid;
  }
  h3 { font-size: 10.5pt; margin: 5mm 0 2mm; break-after: avoid; }
  h2.page-break { break-before: page; }
  p { margin: 0 0 2.5mm; }
  hr { border: 0; border-top: 0.5pt solid #c9ccd2; margin: 5mm 0; }
  code { font-family: Consolas, "SF Mono", monospace; font-size: 0.9em; }
  strong { font-weight: 650; }

  /* Front-matter fields: label, then a line to write on. */
  .field { display: flex; align-items: baseline; gap: 2.5mm; margin-bottom: 2mm; font-size: 10pt; }
  .field-label { white-space: nowrap; }
  .field-value { flex: 1; }
  .rule { flex: 1; border-bottom: 0.5pt solid #9aa0a8; height: 3.6mm; }

  /* A checkbox that does not depend on the font carrying the glyph. */
  .box {
    display: inline-block;
    width: 3.1mm;
    height: 3.1mm;
    border: 0.7pt solid #55595f;
    border-radius: 0.4mm;
    margin-right: 0.8mm;
    vertical-align: -0.3mm;
  }

  /* Questions. The number lives in a gutter so long questions stay aligned. */
  ol.questions { list-style: none; margin: 0 0 3mm; padding: 0; }
  ol.questions > li {
    display: flex;
    gap: 3mm;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  ol.questions > li > .n {
    flex: 0 0 11mm;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    color: #5b6675;
    font-size: 9.5pt;
    padding-top: 0.4mm;
  }
  ol.questions > li > .q { flex: 1; min-width: 0; }
  ol.questions > li > .q > p { margin: 0; }

  /* Probes are for the interviewer, not to be read aloud — quieter on purpose. */
  ul.probes { list-style: none; margin: 1mm 0 0; padding: 0; }
  ul.probes > li {
    position: relative;
    padding-left: 4mm;
    font-size: 9pt;
    line-height: 1.35;
    color: #5f656e;
    margin-bottom: 0.6mm;
  }
  ul.probes > li::before {
    content: "";
    position: absolute;
    left: 0.6mm;
    top: 1.7mm;
    width: 2.2mm;
    border-top: 0.7pt solid #a8adb5;
  }

  /* Plain prose bullets (guidance, conventions) — not questions. */
  ul.bullets { list-style: none; margin: 0 0 3mm; padding: 0; }
  ul.bullets > li {
    position: relative;
    padding-left: 4.5mm;
    margin-bottom: 1.6mm;
    break-inside: avoid;
  }
  ul.bullets > li::before {
    content: "";
    position: absolute;
    left: 0.4mm;
    top: 1.9mm;
    width: 2.6mm;
    border-top: 1pt solid #8a9199;
  }

  blockquote {
    margin: 2.5mm 0 3.5mm;
    padding: 2.2mm 3mm;
    border-left: 1.6pt solid #8a9199;
    background: #f4f5f7;
    font-size: 9.5pt;
    line-height: 1.38;
    color: #3d434b;
    break-inside: avoid;
  }
  blockquote p { margin: 0; }

  /* "After the interview" prompts — ruled space to write into. */
  .write { margin: 0 0 4mm; break-inside: avoid; }
  .write-label { font-weight: 650; font-size: 10pt; margin-bottom: 2.6mm; }
  .write .line { border-bottom: 0.5pt solid #c2c6cc; height: 6.5mm; }

  table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9pt; }
  th, td { border: 0.5pt solid #c9ccd2; padding: 1.4mm 2mm; text-align: left; vertical-align: top; }
  th { background: #f0f1f4; font-weight: 650; }
`;

/**
 * `@page` is here for the --print-to-pdf fallback, which otherwise defaults to US Letter. The
 * protocol path sets paper and margins explicitly and passes preferCSSPageSize:false, so it
 * ignores this — the two cannot disagree.
 */
function shell(title, body, paper = 'A4') {
  const page = `@page { size: ${paper}; margin: ${MARGINS.top}in ${MARGINS.right}in ${MARGINS.bottom}in ${MARGINS.left}in; }`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${page}${CSS}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;

  const { PROGRAMFILES, LOCALAPPDATA } = process.env;
  const pf86 = process.env['PROGRAMFILES(X86)'];
  const candidates = {
    win32: [
      `${PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
      `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      `${PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
    ],
  };

  for (const p of candidates[process.platform] || candidates.linux) {
    if (p && !p.includes('undefined') && fs.existsSync(p)) return p;
  }
  return null;
}

const PAPER = {
  A4: { width: 8.27, height: 11.69 },
  Letter: { width: 8.5, height: 11 },
};

const MARGINS = { top: 0.72, bottom: 0.76, left: 0.79, right: 0.7 };

/**
 * Chrome renders this in its own tiny document, so keep it to inline styles and floats — flexbox
 * is not reliable in that context. `pageNumber` and `totalPages` are Chrome's own class hooks.
 */
function footerTemplate(title) {
  return (
    '<div style="font-size:7.5pt;font-family:Segoe UI,Arial,sans-serif;color:#7c828a;' +
    'width:100%;padding:0 18mm;">' +
    `<span>${escapeHtml(title)}</span>` +
    '<span style="float:right">Page <span class="pageNumber"></span>' +
    ' of <span class="totalPages"></span></span>' +
    '</div>'
  );
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Launch one browser and keep it for every document.
 *
 * The endpoint is read from the DevToolsActivePort file Chrome drops in the profile, not only from
 * its stderr banner. On Windows Chrome sometimes re-execs itself, so the process we spawned exits 0
 * while the browser that matters starts up beside it — watching the file finds it either way.
 */
async function launchChrome(exe) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-interview-pdf-'));
  const proc = spawn(
    exe,
    [
      '--headless',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let output = '';
  let exitCode = null;
  proc.stdout.on('data', (d) => (output += d.toString()));
  proc.stderr.on('data', (d) => (output += d.toString()));
  proc.on('error', (e) => {
    output += `\n${e.message}`;
    exitCode = -1;
  });
  proc.on('exit', (code) => (exitCode = code));

  const portFile = path.join(profile, 'DevToolsActivePort');
  let deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    const banner = output.match(/ws:\/\/\S+/);
    if (banner) return { proc, profile, wsUrl: banner[0] };

    if (fs.existsSync(portFile)) {
      const [port, endpoint] = fs.readFileSync(portFile, 'utf8').split('\n');
      if (port && endpoint) {
        return { proc, profile, wsUrl: `ws://127.0.0.1:${port.trim()}${endpoint.trim()}` };
      }
    }

    // If the process is gone, give a relaunch a moment to appear, then stop waiting.
    if (exitCode !== null) deadline = Math.min(deadline, Date.now() + 5000);
    await delay(100);
  }

  discard(profile);
  const said = output.trim();
  throw new Error(
    `The browser did not start.\n  ${exe}` +
      (exitCode !== null ? `\n  It exited with code ${exitCode}.` : '') +
      (said ? `\n  It said: ${said.split('\n').slice(-4).join('\n  ')}` : '')
  );
}

/** A minimal DevTools protocol client over Node's built-in WebSocket. */
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('Could not connect to the browser')), { once: true });
  });

  let seq = 0;
  const pending = new Map();
  const listeners = new Set();

  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.method || 'CDP'}: ${msg.error.message}`));
      else resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });

  const once = (method, sessionId) =>
    new Promise((resolve) => {
      const fn = (msg) => {
        if (msg.method === method && (!sessionId || msg.sessionId === sessionId)) {
          listeners.delete(fn);
          resolve(msg.params);
        }
      };
      listeners.add(fn);
    });

  return { send, once, close: () => ws.close() };
}

async function printWithCdp(client, htmlPath, title, paper) {
  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
  try {
    await client.send('Page.enable', {}, sessionId);
    const loaded = client.once('Page.loadEventFired', sessionId);
    await client.send('Page.navigate', { url: fileUrl(htmlPath) }, sessionId);
    await Promise.race([
      loaded,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Timed out rendering the page')), 30000)),
    ]);

    const { data } = await client.send(
      'Page.printToPDF',
      {
        printBackground: true,
        preferCSSPageSize: false,
        paperWidth: PAPER[paper].width,
        paperHeight: PAPER[paper].height,
        marginTop: MARGINS.top,
        marginBottom: MARGINS.bottom,
        marginLeft: MARGINS.left,
        marginRight: MARGINS.right,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: footerTemplate(title),
      },
      sessionId
    );
    return Buffer.from(data, 'base64');
  } finally {
    await client.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

/**
 * Fallback for Node without a global WebSocket. Produces a correct document but no page footer —
 * --print-to-pdf takes no footer template.
 */
function printWithCli(exe, htmlPath, pdfPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      exe,
      [
        '--headless',
        '--disable-gpu',
        '--no-first-run',
        '--no-pdf-header-footer',
        `--print-to-pdf=${pdfPath}`,
        htmlPath,
      ],
      { stdio: 'ignore' }
    );
    proc.on('error', reject);
    proc.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Browser exited with code ${code}`))
    );
  });
}

const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/').replace(/^\//, '');

/**
 * Windows keeps a lock on the profile until the browser is really gone. Ask it to close over the
 * protocol first — if Chrome re-execed itself, the process we spawned is not the one to kill.
 */
async function shutdown(chrome, client) {
  if (client) await client.send('Browser.close').catch(() => {});

  if (chrome.proc.exitCode === null) {
    const exited = new Promise((resolve) => chrome.proc.once('exit', resolve));
    chrome.proc.kill();
    await Promise.race([exited, delay(5000)]);
  }
  await delay(200);
  discard(chrome.profile);
}

/** Temp directories are the OS's problem if this fails — never fail the run over one. */
function discard(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const NOTES_FILE = /^\d{4}-\d{2}-\d{2}-/;

function collectGuides(opts) {
  if (!fs.existsSync(SRC)) throw new Error(`No interview guides found at ${SRC}`);
  let files = fs
    .readdirSync(SRC)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => !NOTES_FILE.test(f))
    .filter((f) => opts.readme || f.toLowerCase() !== 'readme.md')
    .sort();

  if (opts.filters.length) {
    files = files.filter((f) => opts.filters.some((q) => f.toLowerCase().includes(q)));
  }
  return files;
}

/** The `# Heading` of the document, used for the PDF title and the page footer. */
function titleOf(md, fallback) {
  const m = md.match(/^#\s+(.*)$/m);
  if (!m) return fallback;
  return m[1].replace(/[*`]/g, '').trim();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP.trim());
    return;
  }

  const files = collectGuides(opts);
  if (!files.length) {
    console.error(
      opts.filters.length
        ? `No guide matched: ${opts.filters.join(', ')}`
        : `No guides found in ${path.relative(ROOT, SRC)}`
    );
    process.exitCode = 1;
    return;
  }

  const exe = findChrome();
  if (!exe) {
    console.error(
      'Could not find Chrome or Edge.\n' +
        'Install one, or point CHROME_PATH at the executable and run again.'
    );
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(opts.out, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-interview-html-'));
  const useCdp = typeof globalThis.WebSocket === 'function';

  let chrome = null;
  let client = null;
  if (useCdp) {
    // Losing the protocol costs the page footer, not the PDFs — say so and carry on.
    try {
      chrome = await launchChrome(exe);
      client = await connect(chrome.wsUrl);
    } catch (err) {
      if (chrome) await shutdown(chrome, null).catch(() => {});
      chrome = null;
      client = null;
      console.warn(`${err.message}\n\nFalling back to --print-to-pdf; the PDFs will have no page footer.\n`);
    }
  } else {
    console.warn('Node has no built-in WebSocket (needs 22+) — falling back, PDFs will have no page footer.\n');
  }

  const written = [];
  try {
    for (const file of files) {
      const md = fs.readFileSync(path.join(SRC, file), 'utf8');
      const title = titleOf(md, file.replace(/\.md$/, ''));
      const html = shell(title, renderMarkdown(md, opts), opts.paper);

      const htmlPath = path.join(work, file.replace(/\.md$/, '.html'));
      const pdfPath = path.join(opts.out, file.replace(/\.md$/, '.pdf'));
      fs.writeFileSync(htmlPath, html, 'utf8');

      if (client) fs.writeFileSync(pdfPath, await printWithCdp(client, htmlPath, title, opts.paper));
      else await printWithCli(exe, htmlPath, pdfPath);

      const kb = Math.round(fs.statSync(pdfPath).size / 1024);
      console.log(`  ${title}  ->  ${path.relative(ROOT, pdfPath).replace(/\\/g, '/')}  (${kb} KB)`);
      written.push(pdfPath);
    }
  } finally {
    if (chrome) await shutdown(chrome, client);
    if (client) client.close();
    discard(work);
  }

  console.log(`\n${written.length} guide${written.length === 1 ? '' : 's'} ready to print.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`\n${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { renderMarkdown, shell, titleOf, parseArgs };
