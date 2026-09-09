# User research — interview guides

Guides for the discovery interviews behind ScoreKeeper. One file per persona, plus one file per
interview conducted.

## Guides

| Persona | Guide | Length | Core sections |
|---|---|---|---|
| **Admin** — runs the organisation and its events | [admin-user.md](admin-user.md) | ~60 min | §4 last event run, §6 running the day |
| **Coach / team manager** — runs one team | [coach-team-manager.md](coach-team-manager.md) | ~45–60 min | §4 selection, §5 getting information |
| **Scorer / official** — captures results on the day | [scorer-official.md](scorer-official.md) | ~45 min | §5 scoring the match, §6 clock and authority |
| **Spectator / fan** — consumes results | [spectator-fan.md](spectator-fan.md) | ~30–40 min | §6 afterwards, §7 where the conversation already happens |
| Player | — | | Not planned yet. Partly covered by the spectator guide where the participant is a parent. |

The four cover one event from four angles. Where they overlap it is deliberate — the admin builds
the draw and the coach receives it (admin §5 / coach §5); the coach hands over a team sheet and the
scorer needs it (coach §6.4 / scorer §3.3). **Contradictions between two accounts of the same
handover are the most valuable thing this research can produce**, so each guide's closing block
asks you to note them.

## Before you start

[recruiting.md](recruiting.md) — how to ask someone for an interview without describing the
product, outreach templates, the opening two minutes, and what to say when it goes sideways.

## Conventions

- Questions are cited as **section.question** — `4.3` is the third question in §4 of that guide.
- Every list item is written as `1.` in the source; the renderer numbers them, so numbering never
  needs maintaining. **Add new questions at the end of a section** so existing references stay
  valid.
- Indented bullets are probes — prompts for the interviewer, not questions to read aloud.
- Nothing about ScoreKeeper is described until the reactions section near the end of each guide.
- Each guide ends with an "After the interview" block. Fill it in within the hour.

## Printing a guide

`npm run interviews:pdf` renders every guide to A4 PDFs in `print/`, ready to take to an
interview — [scripts/interview-pdf.js](file:///c:/Fred/Coding/SK/scripts/interview-pdf.js).

```
npm run interviews:pdf                 # all guides
npm run interviews:pdf -- scorer       # just the ones whose filename matches
npm run interviews:pdf -- --compact    # drop the writing space, fewer pages
npm run interviews:pdf -- --space 12   # 12mm of writing space under each question
npm run interviews:pdf -- --help
```

The printed sheet numbers questions the way this README cites them — `4.3` against the third
question of §4 — so what you write on the page matches what you type into your notes. Probes are
set smaller and greyer because they are not read aloud, `**Label:**` lines become ruled lines you
can write on, and "After the interview" starts on its own page.

It drives an installed Chrome or Edge (set `CHROME_PATH` if it is somewhere unusual) and needs no
dependencies. The PDFs are generated output and are not committed — rerun the command after
editing a guide.

## Notes files

Name interview notes `YYYY-MM-DD-<org>-<initials>.md` and reference questions by number
(`5.4: found out about the change from a parent's WhatsApp, not the school`). Keeping notes
separate from the guides means the guides stay stable while notes accumulate against them.

## Asking about children's data

Four guides touch names, photographs and consent for minors — admin §8.6–8.7, coach §8.9 and
§11.6, spectator §8. **They are asking different questions and should not be merged**: the admin
is asked about policy and compliance, the coach about what they hold and share day to day, the
spectator about their own child. But do not ask all of them in every interview — pick the framing
that matches who is in front of you.

## What this research is meant to settle

Product decisions currently recorded as assumptions that no real user has tested:

| Assumption | Where recorded | Asked in |
|---|---|---|
| Permissions model for tournaments | [tournaments.md](../tournaments.md) §10 — *"needs confirming"* | Admin §11, coach §11 |
| Division delegation to a convenor | `D22`, `D31` | Admin §11.3 |
| Division weighting — a 1st team result counts for more | `D18` | Admin §7.3 |
| An unscored day still gets a scoreboard | `D6` | Admin §7.8 |
| Placeholder / TBC entrants | `D7` | Admin §5.8, §14.7 |
| Consensus undo — a second scorer approves within a time limit | [multi_sport_architecture.md](../multi_sport_architecture.md) §2 | Scorer §7.4, §11.5 |
| Scoring detail beyond the score is worth capturing live | Event templates, same doc §5 | Scorer §11.4 |
| Offline scoring is trusted | Offline indicator, [TODO.md](../../TODO.md) | Scorer §11.6 |
| How admin functionality should work as a whole | The whole Reports & Moderation group, `REP-1`…`REP-8`, parked pending this | Admin §11, spectator §7.6 |
| A supporters' chat is wanted, and moderatable | Not yet specified — future feature | Spectator §7, §10.6 |

**On the last one:** a fan chat would need the moderation workflow that `REP-1` says does not exist
(nothing ever writes a report's resolution). Spectator §7.6 asks what happens today when a group
chat goes wrong, which is the cheapest way to find out what moderation would actually have to do.
