---
name: review-artifact
description: How to build a local review page so the user can comment on a long design document block by block, and how to run the comment round-trip. Use when a spec, data model or catalogue is long enough that inline markdown comments would be unwieldy.
---

# Review Artifacts

When a document is long enough that reviewing it means reacting to dozens of small decisions, a
plain markdown round-trip gets unwieldy — the user has to hunt for a place to put each remark, and
you have to hunt for the remarks. A **review artifact** is a generated HTML page that renders the
document and lets the user attach comments to individual blocks, then hand them back in a form you
can act on one at a time.

Built this way for [docs/tournaments.md](file:///c:/Fred/Coding/SK/docs/tournaments.md) over four
review rounds, and for
[docs/rugby/laws-infringements.md](file:///c:/Fred/Coding/SK/docs/rugby/laws-infringements.md)
before it.

## When to build one

Worth it when the document has **many independent decision points** — a spec with a dozen open
questions, a catalogue with a hundred rows, a data model with competing options. Not worth it for a
short document, a plan the user will simply approve or reject, or anything they will read once.

Ask before building one. It is a side artifact, not a deliverable, and some people would rather
just edit the markdown.

## Two implementations, and which to choose

| | **Static page** | **Local server** |
|---|---|---|
| Files | [scripts/review-sync.js](file:///c:/Fred/Coding/SK/scripts/review-sync.js) + [scripts/review-template.html](file:///c:/Fred/Coding/SK/scripts/review-template.html) | [scripts/rugby-review.js](file:///c:/Fred/Coding/SK/scripts/rugby-review.js) + [scripts/rugby-review.html](file:///c:/Fred/Coding/SK/scripts/rugby-review.html) |
| How the user opens it | Double-click the `.html` — no tooling | `node scripts/…` then a `localhost` URL |
| Where comments live | The browser's `localStorage` | A JSON file in the repo, written on save |
| How you read them back | User clicks **Export**, saves the `.md`, you read it | You read the JSON straight from disk |
| Main weakness | An export step every round; comments are lost if site data is cleared | Needs a server running while reviewing |

**Prefer the server variant when the review will run over several rounds.** The static page's
export step means the user downloads a file and you go looking for it — workable, but it is
friction on every round and the comments never land in the repo. The static page is right when the
user wants to open something without running anything, or will read it somewhere the repo is not.

Both use the same document conventions below, so a document can move between them.

## Building a static review page

```bash
node scripts/review-sync.js --out docs/foo-review.html docs/foo.md docs/foo-data-model.md
```

Multiple markdown files are concatenated into one page, each appearing as its own document with a
break and a sidebar entry. The script reports what it embedded — documents, sections, open
questions, decided items — so a re-sync is self-verifying.

**Re-run it after every edit to the source markdown.** The markdown is the source of truth; the
page is generated. Never hand-edit the generated page — it will be overwritten, and the two will
drift in the meantime. Edits to the *page's own behaviour* go in the template.

## The document conventions the page keys off

These are what make the page more than a renderer, so write the source markdown with them in mind.

**Open questions** are blockquotes opening with `Open`, an em dash, and a short tag:

```markdown
> **Open — table naming.** `tournament_stages` as a feature namespace, or `division_stages`
> naming the parent? Cheap to change now, a migration later.
```

These render as numbered `Q1`, `Q2`… cards, are counted in the header's progress meter, and are
listed in the drawer's Questions tab so the user can jump between them.

**Settled questions** become blockquotes opening with `Decided`:

```markdown
> **Decided — table naming.** …what we chose, and why.
```

These render green with a ✓ and drop out of the open count. **Converting an `Open` into a `Decided`
in place is the core move of the whole workflow** — the answer stays where the question was asked,
so the document reads as a record of decisions rather than a list of loose ends.

Keep a **decisions table** near the top (`D1`, `D2`…) as an index, and reference those ids in later
prose. It gives the user somewhere to see the whole picture without scrolling.

## The round-trip

1. Sync the page and tell the user where it is.
2. They comment and click **Export**, which downloads a markdown file.
3. Read it — for the static variant it lands in the user's `Downloads` folder, newest first.
4. Work through the comments and apply them to the **markdown**, not the page.
5. Re-sync. Comments attached to text you rewrote are cleared automatically, with a banner
   explaining why; comments on untouched text survive.
6. Report back what changed, and say what is still open.

### Reading the export

Comments arrive grouped by section, each quoting the block it was attached to, with `Open question
Q3` where the block was a question. Expect **carry-over**: a comment on a block whose text did not
change is still attached, so earlier rounds reappear in later exports. Check what you have already
processed rather than redoing it.

### When a comment is bigger than the block it sits on

Users frequently attach a large architectural point to whatever paragraph they happened to be
reading. Treat the comment on its merits, not by where it landed — a note on the Purpose section
may deserve its own section elsewhere in the document.

## Gotchas, all learned the hard way

**Comments are keyed by a hash of the block's text.** That is deliberate: comments survive
reordering and unrelated edits, but are dropped when the text they annotate is rewritten — which
is correct, because that comment has been acted on. The page prunes orphans on load and says how
many it cleared. Consequence: **never regenerate the `storageKey`** for an existing page, or every
comment orphans at once. `review-sync.js` carries the key across, including when upgrading a page
built from an older template.

**Do not write control characters into the HTML.** An early version used `\u0000` as an
inline-code placeholder and wrote literal NUL bytes into the file, making it "binary" to grep and
fragile in editors. Use plain ASCII sentinels (`@@CODE0@@`).

**Placeholder tokens must not collide with real prose.** A token of ` 0 ` (digit with spaces)
silently corrupted every plain number in the document — "90 fixtures" and "3/1/0" became
`<code>undefined</code>`. Make sentinels distinctive.

**`sed` eats backslashes in replacement strings.** `\u` and `\d` are consumed as escapes, quietly
producing broken regexes. Use Write/Edit for JavaScript, or avoid backslashes entirely (`[0-9]`
instead of `\d`).

**Verify by running the parser, not by opening a browser.** Extract the page's `<script>` and
`node --check` it, then `eval` the parser functions and run them over the embedded markdown,
asserting the block counts and that every `Open`/`Decided` block classified. See
[.agent/skills/no-browser-verification](file:///c:/Fred/Coding/SK/.agent/skills/no-browser-verification/SKILL.md).

**Duplicate open-question tags produce two identically numbered chips.** Usually caused by one
document cross-referencing another's question. Demote the cross-reference to a plain blockquote.
`review-sync.js` warns on duplicates.

**Navigation must use the document's own numbering.** An early version numbered sidebar rows
sequentially, so a reference to "§2.3" pointed at a row labelled something else — and with two
documents on one page, both had a section 2. Rows carry the number from the heading text.

**`localStorage` can be unavailable on `file://`.** Some browsers refuse it. The page detects this
and shows a banner telling the user to export before closing. This is the strongest argument for
the server variant.

**Say which document you mean.** With several documents on one page, "§2.3" is ambiguous. Write
"data model §2.3".

## Cleaning up

The generated page is a working artifact, not documentation. Delete it when the review is done —
the markdown holds every decision that mattered. `scripts/review-sync.js` and
`scripts/review-template.html` stay; they are the reusable parts.
