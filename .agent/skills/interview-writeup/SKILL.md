---
name: interview-writeup
description: How to turn a recorded user-research interview into the two committed documents — a cleaned speaker-labelled transcript and a structured summary. Use whenever the user asks to write up, transcribe, summarise or "do" an interview, or names an interviewee whose folder sits under docs/interviews/records/.
---

# Interview Write-Up

Discovery interviews for ScoreKeeper are recorded, transcribed, and written up into **two markdown
documents per interview**. This skill is the recipe. Any completed folder under
[docs/interviews/records/](file:///c:/Fred/Coding/SK/docs/interviews/records/) is the reference
implementation — when in doubt, open the two files in the most recent one and match them.

## `records/` is git-ignored, and stays that way

The folder is excluded at [.gitignore](file:///c:/Fred/Coding/SK/.gitignore) line 27 and **nothing
in it has ever been committed**. The reason is not secrecy — every participant agreed to be
interviewed and the repo is private — it is that **raw research material is not part of the
codebase**. It sits inside the tree only so that it is within reach when the learnings are being
worked into plans and code. Three consequences that are easy to get wrong:

1. **Cite findings by organisation, role and date, not by the participant's name** —
   *"User research (Tableview FC, 2026-09-09) found…"*, *"worth confirming with the Tableview FC
   club admin"*. This is a **consistency convention, not a restriction**: the point is that a
   committed file should carry the attribution that still means something to a reader who cannot
   open `records/`, and "the club admin at Tableview" survives that where a first name does not.
   Applies to `TODO.md`, `FUTURE_IDEAS.md`, specs, this skill and the interviews `README.md`.
   Inside `records/` itself, use people's real names throughout — that is the whole point of the
   documents.
2. **Never link from a committed file into `records/`.** The target does not exist in a clone, so
   the link is broken for everyone but the author. Cite by section instead —
   *"the Tableview interview summary §14"*.
3. **`records/` is not backed up by the repo.** It is the only copy. Say so if the user is about to
   do something that would lose it.

## Where everything lives

```
docs/interviews/
  README.md                    ← guides index; §14 is written against its assumptions table
  admin-user.md                ← the five persona guides interviews are conducted from
  coach-team-manager.md
  scorer-official.md
  spectator-fan.md
  league-organiser.md
  records/
    firstname_lastname/        ← one folder per interview, lower_snake_case
      Firstname Lastname.mp3   ← or .mp4 — the raw recording, as recorded
      <whatever the raw transcript was called>
      transcript_interview_firstname_lastname.md
      summary_interview_firstname_lastname.md
```

The filename prefixes are **not** optional — `transcript_interview_` and `summary_interview_`
followed by the folder's own slug. The summary links to the transcript by relative filename, so a
rename breaks it.

## The trigger

"Write up the `<name>` interview", "summarise the interview", "create the summary doc for `<name>`" —
all mean: go to `docs/interviews/records/<name>/`, see what is there, and produce whichever of the
two documents does not exist yet.

**Transcription is not your job.** The user produces the raw transcript externally (Google Gemini,
against the recording) and drops it into the interview folder. If the folder holds only a recording
and no text, say so and stop — do not attempt to transcribe the media yourself, and do not offer to
install a transcription toolchain unless asked. If the folder holds a raw transcript, start at
stage 1.

---

## Stage 1 — the transcript document

**Input:** the raw machine transcript in the folder.
**Output:** `transcript_interview_<name>.md`.

This is a *clean-up*, not a rewrite. The transcript is the evidence the summary is argued from, so
a reader has to be able to trust that the words are the participant's.

### Header block

```markdown
# Transcript: Interview with <Full Name>

**Interviewee:** <Full Name> (<roles> — <Organisation>)
**Subject:** <the ground the interview actually covered, comma separated>
**Correction:** the machine transcription rendered X as "Y"; it is **X**, corrected throughout.

---

### Interview Transcript
```

The **Correction** line appears only when you actually corrected something, one line per correction.
Machine transcription reliably mangles proper nouns — club names, people's names, league acronyms.
In the reference interview the club's own name was mis-heard throughout; the correction is declared
at the top and then applied everywhere, rather than silently fixed, so a reader checking the document
against the audio is not left wondering which of the two they are hearing.

### Body rules

- Every turn is `**Interviewer:**` or `**<Full Name>:**` — the interviewee is labelled with their
  real name, never "Interviewee" or "Speaker B".
- Blank line between turns. No timestamps.
- **Keep the speech.** Filler ("um", "you know"), false starts, self-corrections and profanity all
  stay. A participant correcting themselves twice about a date is itself a fact the summary has to
  report under §16 "To verify", and it only survives if the transcript keeps it.
- Fix punctuation, sentence boundaries and obvious mis-hearings of ordinary words. Do not smooth
  grammar, do not merge turns, do not reorder.
- Where the raw transcript degrades into condensed Q&A rather than verbatim speech — machine
  transcripts often thin out toward the end of a long recording — **leave it condensed and declare
  it in the summary's caveat blockquote.** Never re-inflate it into invented dialogue.
- Never add a question the interviewer did not ask, or an answer the participant did not give.

### When the recording lost something

If the user says an exchange happened that the transcript does not contain, it does **not** go into
the transcript. It goes into the summary, marked as recollection — the reference summary carries a
whole consent exchange that way, with `_(Asked in the room, not captured in the transcript.)_` on the
claim and an entry in §14 saying to confirm it.

---

## Stage 2 — the summary document

**Input:** the transcript document, the persona guide(s) the interview was run from, and the repo.
**Output:** `summary_interview_<name>.md`.

### The one rule that matters

**What the participant said and what you concluded from it are kept apart, visibly.** Sections 2–12
are a faithful account of what they described. Section 13 is interpretation, fenced off behind its
own warning. Do not leak product opinions upward into the factual sections, and never present an
inference as something they said. A reader must be able to take §2–12 as evidence without auditing
it.

### Structure

A header block, then seventeen numbered sections. Keep the numbering and the names — other documents
cite this summary by section number (`the interview summary §14`).

```markdown
# Interview summary — <Full Name>

**Source:** [transcript_interview_<name>.md](transcript_interview_<name>.md) · `<recording file>`
**Interviewee:** <Full Name> — <roles>, <Organisation> (<region>)
**Interviewer:** Fred Liebenberg
**Date of interview:** YYYY-MM-DD
**Primary persona:** <which guide they map to — and which others they can speak to>
**Guides touched:** [admin-user.md](../../admin-user.md) (main), [coach-team-manager.md](../../coach-team-manager.md)

> Summary written from the transcript only. §13 "Signals for ScoreKeeper" is **interpretation**, not
> things <Name> said — everything above it is what they actually described. <plus any caveat about
> where the transcript thins out, condenses, or is supplemented by recollection>
```

| § | Name | What goes in it |
|---|---|---|
| 1 | At a glance | A two-column borderless table of the ~12 facts someone would want without reading further: organisation, size, level, who is paid, governance, comms, and the tool used for each core job. |
| 2 | Participant background | How they got here and what authority they speak with. Keep the human detail — it is what makes the persona real later. Close on a short direct quote where they gave you one. |
| 3 | The organisation | Size, age, level, money, who is paid and who volunteers. |
| 4 | How it is governed | The decision-making body and its cadence, then a **### Named roles** sub-section listing every person named against their job. Names are how you get the next interview. |
| 5 | Communication | Channel by channel. Almost always the richest section. |
| 6 | Fixtures and the season calendar | Who builds them, from what, how they go out, and what changes them. |
| 7 | *Their flagship event* | The one event they described end to end. Name the section after it. |
| 8 | Registration, consent, subs and money | Including photographs and minors' data where that was asked. |
| 9 | Officials / referees | |
| 10 | Capturing results | The whole chain from the field to wherever the result finally lands — including the parts that are paper. |
| 11 | Attendance, training data and analysis | |
| 12 | Tools in use today | A table: **Job · Tool today · Who operates it · Pain named**. One row per job. Leave the pain cell as `—` where none was named — an empty cell is a finding, not an omission. |
| 13 | Signals for ScoreKeeper | Interpretation. See below. |
| 14 | What this interview did *not* cover | Written **against the assumptions table** in [the interviews README](../../README.md) and the guide's own sections. Distinguish *not asked*, *asked but lost*, *deliberately not raised* (pricing) and *not reached*. |
| 15 | Follow-ups *Name* offered | What they volunteered, their availability, who they will introduce you to. Promote the single most valuable follow-up into its own `###` sub-section with the case for it. Close with **Suggested next asks**. |
| 16 | To verify | Every uncertain fact: spellings queried and never settled, phonetic organisation names, self-contradictions, and anything the interviewer's recollection contradicts in the transcript. |
| 17 | My notes | The single line `_Space for your own notes from the interview._` and nothing else. That section is the user's. |

Sections 3–11 are the *topic* sections and should follow the shape of the interview you actually
had — rename, merge or drop one where the conversation did not go there — but keep 1, 2, 12, 13 and
14–17 in place, and keep the numbering contiguous.

### Section 13 in particular

This is the section the whole document exists for. It opens with:

```markdown
> Interpretation — my reading, not <Name>'s words. Treat as hypotheses to test in the next
> interview, not as findings.
```

Then a numbered list. A good signal:

- **Leads with a claim in bold**, then argues it from the interview.
- **Says what it implies for the product**, with sub-bullets where the near-term and long-term
  answers differ.
- **Links into the repo** — to the spec the signal validates or contradicts, to
  [TODO.md](file:///c:/Fred/Coding/SK/TODO.md), to
  [FUTURE_IDEAS.md](file:///c:/Fred/Coding/SK/FUTURE_IDEAS.md). Summaries sit four levels deep, so
  repo-root links are `../../../../`.
- **Separates what they said from what the interviewer read in the room**, where those differ.
- **Says when the evidence is thin.** "Not a v1 argument on one interview, but now evidenced rather
  than hypothetical" is the right register. One interview is one interview.

Flag unprompted material explicitly — *"his own idea, unprompted"*. Something the participant raised
without being asked is worth more than an answer to a question, and the summary should say which it
was.

### Stop at the document — the backlog comes later, and jointly

**Do not write anything into [TODO.md](file:///c:/Fred/Coding/SK/TODO.md) or
[FUTURE_IDEAS.md](file:///c:/Fred/Coding/SK/FUTURE_IDEAS.md) as part of the write-up.** Delivering
the summary is where the task ends.

What follows the summary is a **conversation about the interview**, with the user's own reading
alongside yours. Only after that does anything reach the backlog:

- **In that conversation, suggest** what you think is worth filing and where — and say what you would
  write. Suggesting is the job; filing is not.
- **File only what the user asks you to file**, when they ask. They will also ask for things you did
  not suggest.
- The reason is that the user was **in the room**. They hold context the transcript does not — why a
  line of questioning was dropped, how warm a "great idea" actually sounded, which of two readings is
  right. A signal filed before that conversation is filed on half the evidence, and §13 is
  explicitly hypotheses rather than findings.

The same restraint applies to everything else outside the interview folder — an assumption the
interview appears to **settle** in the README's assumptions table, or a **new persona guide** the
interview argues for (`league-organiser.md` exists because the first interview turned up the league
above the club). Raise both as suggestions; act on them when asked.

Two things you should **never** do, conversation or not:

- **Do not add the interview to `docs/interviews/README.md`** — see the git-ignore rules above. The
  README describes the convention; it does not list who was interviewed.
- **Do not edit §17 "My notes" with your own analysis.** It is the user's section. Writing *their*
  stated conclusions into it, at their request and in their framing, is the one exception.

### When the user corrects your reading

Expect it, and expect it most often in §14. A gap that looks like an omission from the transcript is
frequently a **deliberate choice made in the room** — a line of questioning dropped because the
participant had already shown it was not their concern. That is a finding about the participant, not
a flaw in the interview, and the summary should say so once you are told. Rewrite the entry rather
than appending a correction to it.

### Contradictions are the prize

The README says it and it applies hardest here: **where two people describe the same handover from
opposite ends and disagree, that is the most valuable thing this research produces.** When writing
up an interview that covers ground an earlier one did, read the earlier summary and name the
contradictions — in the topic section where each arises, and again in §13 where it changes what we
should build.
