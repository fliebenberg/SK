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
| **League / competition organiser** — runs a competition across clubs it does not own | [league-organiser.md](league-organiser.md) | ~60 min | §4 building the draw, §5 in-season change, §8 results and the table |
| Player | — | | Not planned yet. Partly covered by the spectator guide where the participant is a parent. |

The first four cover one event from four angles. Where they overlap it is deliberate — the admin
builds the draw and the coach receives it (admin §5 / coach §5); the coach hands over a team sheet
and the scorer needs it (coach §6.4 / scorer §3.3); the admin and the coach both push results
outward and the spectator goes looking for them (admin §9.7 / coach §8.10 / spectator §4, §6).

**The league guide sits at a different altitude**, not a different angle. It is the layer *above*
the club: someone who runs a competition across organisations they cannot instruct, whose authority
is rules and sanctions rather than management. Do not reuse the admin guide for them — it assumes
one organisation running its own events. The league and the club describe the same handovers from
opposite ends (results submission, officials, postponements), so its closing block asks for
contradictions against club accounts specifically.

**Contradictions between two accounts of the same handover are the most valuable thing this
research can produce**, so each guide's closing block asks you to note them.

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

## Completed interviews

`records/` is **git-ignored**. Raw research material is not part of the codebase — it lives in the
tree only so it is within reach while its learnings are worked into plans and code. Being local-only
also means it is **not backed up by the repo**.

Each interview gets a folder `records/<firstname_lastname>/` holding the recording, a cleaned
speaker-labelled transcript and a structured summary. Transcription happens outside the repo — the
raw machine transcript is dropped into that folder, and the write-up starts from there. Ask an agent
to "write up the `<name>` interview" and
[.agent/skills/interview-writeup](file:///c:/Fred/Coding/SK/.agent/skills/interview-writeup/SKILL.md)
tells it where to look, what the two documents contain and how to keep them apart.

Findings travel out of `records/` by being written up somewhere committed — a guide, `TODO.md`,
`FUTURE_IDEAS.md`, or a spec. Two conventions make those citations survive for a reader who has no
`records/` folder:

- **Cite by organisation, role and date rather than by the participant's name** —
  `User research (Tableview FC, 2026-09-09)`, `the Tableview FC club admin`. Inside `records/` the
  documents use real names throughout; it is only the committed citation that generalises, because
  "the club admin at Tableview" still means something to a reader who a first name would not.
- **Cite by section, not by link** — `the Tableview interview summary §14`. A link into `records/`
  is broken for anyone but the author.

## Notes files

Name interview notes `YYYY-MM-DD-<org>-<initials>.md` and reference questions by number
(`5.4: found out about the change from a parent's WhatsApp, not the school`). Keeping notes
separate from the guides means the guides stay stable while notes accumulate against them.

## Asked in every guide

**How big is the organisation** — admin §8.8–8.9, coach §1.8, scorer §1.8, spectator §1.9,
league §2.6–2.8.
Everyone interviewed belongs to an organisation and you will often not be speaking to the person
who runs it, so ask it every time and accept an estimate. **Two numbers matter, not one**, and
since 2026-09-12 they do different jobs:

- **Participants and staff — the priced number.** This is what an organisation pays for, and both
  organisations interviewed so far gave it without hesitation.
- **Adults who would need an account (parents, guardians, followers) — the audience number.** It is
  **not priced** — spectators are free — but it sizes the consumer side, which is where the app's
  volume will be. Expect it to be an order of magnitude larger, and **expect nobody to know it**:
  neither organisation interviewed could produce it.

Ask for both rather than "how many people". **A league is asked for four numbers, not two** —
clubs, teams, registered participants and club officials — since its unit of adoption is a club,
not a person. Where two people from the same organisation give different numbers, that gap is
itself a finding — it says nobody holds the real figure.

**Do not raise pricing while asking it.** Naming a per-person price contaminates every answer
after it, in the same way describing the product does. The one place appetite to pay is asked
directly is spectator §9.6, which sits after that guide's own concept description.

## Asking about children's data

Five guides touch names, photographs and consent for minors — admin §8.6–8.7 and **§8.10–8.13**,
coach §8.9 and §11.6, spectator §8 (**§8.6–8.8** added 2026-09-13), league §6.3–6.4. **They are
asking different questions and should not be
merged**: the admin is asked about policy and compliance, the coach about what they hold and share
day to day, the spectator about their own child, and the league about the rules it is bound by and
enforces, which is where the policy actually originates. But do not ask all of them in every
interview — pick the framing that matches who is in front of you.

**The newer questions test a specific design**, so do not drop them as detail: whether a **name and a
photograph are two different answers** (the product treats them as separate permissions), and **who
wins when the family and the organisation disagree** — the org default plus an optional per-person
override, designed in [identity_structure.md](../identity_structure.md) §7 and tracked as `PEOPLE-4`.
Both are currently **untested**: the first parent interview asked the headline question and reached
neither. The admin guide also asks what an organisation could *show* if challenged about a
photograph, which is the audit trail that design assumes.

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
| Offline scoring is trusted | Offline indicator, [TODO-archive.md](../../TODO-archive.md) | Scorer §11.6 |
| How admin functionality should work as a whole | The whole Reports & Moderation group, `REP-1`…`REP-8`, parked pending this | Admin §11, spectator §7.6 |
| A supporters' chat is wanted, and moderatable | Not yet specified — future feature | Spectator §7, §10.6 |
| The app runs the match clock, and periods end by it | [okf/api_comms.md](../../okf/api_comms.md) §"Local Scoring & Clock Engines"; [multi_sport_architecture.md](../multi_sport_architecture.md) §4 | Coach §6.5, scorer §6.1–6.3 |
| ~~Pricing tiers by organisation size — what a tier would actually count~~ **Settled 2026-09-12** — price on **players and staff**; spectators, parents and fans are free and uncounted. See the note below. | Decided — pricing | Admin §8.8–8.9, coach §1.8, scorer §1.8, spectator §1.9 |
| How results reach spectators today, and who cannot be reached at all | Not yet specified — the spectator half of the product | Admin §9.7–9.8, coach §8.10–8.11, spectator §4, §6 |
| Everyone around one team is a potential user, not just the coach | Not yet specified — roles beyond coach / admin / scorer. **Strongly supported** — three unmodelled adults across two interviews: a volunteer scorekeeper, a class rep, and the adult who does the school run | Coach §2.7–2.9 |
| For a **minor**, an adult decides availability and receives the communication; an adult player does both themselves | **Evidenced in both interviews.** Designed 2026-09-12 and **built 2026-09-26** ([identity_structure.md](../identity_structure.md) §5, `MEMBER-3`); guardians acting for a child — availability, selection — is `MEMBER-6` | Admin §8.6–8.7, coach §8.9, spectator §8 |
| A league is a user in its own right, and the route to its clubs | [FUTURE_IDEAS.md](../../FUTURE_IDEAS.md) — leagues feature, parked | League §13, §14.6–14.7 |
| Fixture generation is worth more to an organiser than live scoring | [tournaments.md](../tournaments.md) §6, field note 2026-09-09 | League §4.6, §14.4 |
| Results can arrive structured rather than as a photographed team sheet | [tournaments.md](../tournaments.md) §6 | League §8.3–8.4, §14.5 |

**On pricing.** The rule is that an organisation pays for what it *controls* — its players and its
staff — and never for the audience it cannot control or count. Spectators, parents and fans use the
app free: they are **the reason an organisation pays**, not a cost it carries. The research supports
this from an unexpected direction: **both organisations stated their player and staff numbers
without hesitation, and neither could give an adult/parent count** — Tableview explicitly excluded
parents from its ~450. So pricing on players and staff counts what an organisation already knows
about itself, and never asks the question nobody can answer. Indirect monetisation of the consumer
side (advertising and similar) is deliberately deferred until there are thousands of consumers.
**Watch the counting boundary** — `member_count` is a bare count of active memberships. Guardians
hold no membership (built 2026-09-26), so they are not counted; any future role that is a
membership but must not be priced has to be excluded explicitly — see
[identity_structure.md](../identity_structure.md) §5.6.

**On the last one:** a fan chat would need the moderation workflow that `REP-1` says does not exist
(nothing ever writes a report's resolution). Spectator §7.6 asks what happens today when a group
chat goes wrong, which is the cheapest way to find out what moderation would actually have to do.
