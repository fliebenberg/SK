# Tournaments — Feature Spec

**Status:** Settled, and **being built**. Phases 0–3 of [the implementation plan](file:///c:/Fred/Coding/SK/docs/tournaments-implementation-plan.md) are complete: the schema, the shared types and standings engine, and the server — divisions, stages, entrants, generation and the recalculation choke point. No client yet; that starts at Phase 5. D1, D6, D7, D9, D10, D11, D13, D17–D21, D23, D26, D29 and D30 have running code behind them.
**Supersedes:** the `SportsDay` event type (see [Consolidation](#1-consolidation-sports-day-becomes-a-format)).
**Review rounds:** round 1 (through Q8) and round 2 (through Q14) processed 2026-08-28;
the UI review round (2026-08-30) added D33 and closed two open questions.
**Related:** [TODO.md](file:///c:/Fred/Coding/SK/TODO.md) — "Consolidate Sportsday and Tournament view";
[docs/design_spec.md](file:///c:/Fred/Coding/SK/docs/design_spec.md) (wizards for complex entry);
[docs/database_structure.md](file:///c:/Fred/Coding/SK/docs/database_structure.md) (`events` and friends).

---

## Purpose

Give the organiser of a multi-organisation event a way to set the whole thing up in the app:
who is coming, what they are playing, where and when each fixture happens, and — where it
matters — how the day is won.

The current app can do the *first* and *last* few percent of this. You can create an event with
sports and participating orgs, and once games exist it will keep live scores and a standings
table. Everything in between — turning "four schools, three sports, five age groups" into
sixty scheduled fixtures across eight fields — is manual, one fixture at a time, through
[games/new.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/[orgId]/events/[eventId]/games/new.tsx).
That is the gap this feature closes.

### The two shapes we are designing for

**A school sports day.** Three or four schools meet for a morning. Multiple sports run in
parallel — rugby on two fields, netball on three courts, hockey on the astro. Each sport runs
several age groups. Most fixtures are just "u14A vs u14A"; there is no bracket and nobody is
knocked out. The schools may or may not agree beforehand that the day is scored — and if it is,
a 1st XV win usually counts for more than a u13C win.

**A single-sport tournament.** One sport, usually one age group, six to sixteen teams. Pool
stage, then a knockout, then a final. Entrants are teams, progression is automatic, and there is
exactly one winner.

These look like different products but they are the same object with different knobs turned. The
whole design below follows from taking that seriously.

### Even an unscored day still has a scoreboard

A sports day with no agreed points system is still full of results, and organisers and parents
still want to see them. So the absence of a competition points system must never mean the absence
of a summary. Where the day is not scored we still show plain counts — games played, won, drawn,
lost per organisation — groupable by sport and by age group. This is a *presentation* default
rather than a competition rule, and it needs no configuration to be useful.

### Design stance: model for the hard cases, ship the easy ones

Settled in review round 2, and it governs every decision below. We work the **complex** formats
through the model now — knockouts with progression, pools, multi-stage draws, ranked meets — so
we know the structure admits them. We may still ship the *user interface* in phases, simplest
first. What we do not do is design against the simple cases and hope the complex ones fit later,
because the places where they would not fit are structural and expensive to move.

### Decisions so far

Recorded in place in the section each belongs to.

| | Decision |
|---|---|
| **D1** | `SportsDay` rows migrate **in place** to `Tournament` + `format: 'Festival'`. No alias kept. |
| **D2** | `Festival` is the stored format name **and**, since the UI review, the label as well. |
| **D3** | Divisions are confirmed, **and are always user-editable** — the app proposes, the organiser disposes. |
| **D4** | "Division" is the name. |
| **D5** | Pools live as flexible data inside a division rather than as their own entity. |
| **D6** | A `Festival` computes **both** a per-division table and an organisation roll-up. |
| **D7** | Placeholder / TBC entrants are supported from v1. |
| **D8** | Fixture generation is a starting point the organiser can always override. |
| **D9** | On entrant change, offer **regenerate from scratch** or **add manually** — never a silent top-up. |
| **D10** | Straight **replacement** of one entrant by another rewrites the fixtures in place and recalculates nothing. |
| **D11** | **Stages** are built into the model *and the UI* from the start, not deferred. |
| **D12** | Model for the complex formats now; phase the UI, not the schema. |
| **D13** | Bulk writes: batch support on the actions that need it, under one shared batch contract. |
| **D14** | Scheduling is a greedy first pass plus easy manual adjustment. **No optimiser for now** — deferred on complexity, not ruled out. |
| **D15** | Multi-day is supported, with per-day time windows and per-stage earliest-start rules. |
| **D16** | Show venue **and** facility wherever more than one venue is in play. |
| **D17** | **3/1/0** becomes the shared default for tournaments *and* leagues. |
| **D18** | Division weighting: a multiplier per division, default 1.0, editable. |
| **D19** | Leagues and tournaments share one scoring-system shape, bonus rules included. |
| **D20** | Tiebreaks are configurable — the organiser orders the progression factors; we ship a default order. |
| **D21** | A game can belong to a tournament **and** to one or more leagues/ladders at the same time. |
| **D22** | Divisions can be delegated to a convenor who edits that division without running the event. |
| **D23** | Automatic knockout progression is **in scope**, not deferred. |
| **D24** | A **ladder is a scoring context**, not a tournament format. |
| **D25** | Stay at two levels (event → division). Revisit only when a real case breaks it. |
| **D26** | **One** placeholder entrant type, carrying an optional fill rule. Not two. |
| **D27** | Ranked contests are designed into the schema now, built later. |
| **D28** | **Double elimination is deferred.** Plate / consolation is the v1 loser-routing format. |
| **D29** | Tiebreak factors as listed, ordered by the organiser — and **any result can be manually overridden**. |
| **D30** | Standings are **persisted**, recalculated when a result is finalised. |
| **D31** | A division convenor **runs their whole division** — entrants, stages, fixtures, results. Widened 2026-09-03. |
| **D32** | The unread sport flags are logged as `SPORT-10` rather than fixed here. |
| **D33** | An organiser is a **named person, not an org role** — assignable at event or division scope. |
| **D34** | Facilities declare which other facilities they **physically conflict with**; conflicting facilities cannot hold fixtures in the same slot. |

---

## 1. Consolidation: Sports Day becomes a format

Today `EventType` is `'SingleMatch' | 'SportsDay' | 'Tournament'`
([Event.ts](file:///c:/Fred/Coding/SK/shared/src/models/event/Event.ts)). `SportsDay` and
`Tournament` are indistinguishable in code — the only difference anywhere in the active codebase
is the header label on the create screen. Both are just "an event with more than one game".

We collapse them:

```
EventType = 'SingleMatch' | 'Tournament'

TournamentFormat =
  | 'Festival'      // sports day: fixtures are arranged, not generated by a bracket
  | 'RoundRobin'    // everyone plays everyone, ranked by table
  | 'Knockout'      // single-elimination bracket
  | 'PoolsKnockout' // pools, then the top N progress to a bracket
  | …               // see the catalogue in §5
```

A sports day is `type: 'Tournament', format: 'Festival'`. The event detail screen keys its tabs
and its setup steps off `format`, which is what the TODO item asks for.

> **Decided — migration.** Existing `type = 'SportsDay'` rows are rewritten **in place** to
> `type = 'Tournament'` with `format: 'Festival'`. No alias is retained; there is little enough
> data that a one-shot migration script is cheaper than carrying a legacy string forever.

> **Decided — the name `Festival`.** Kept as the stored format value. Since format is now one of
> several options an organiser picks when setting up a tournament, having a clearly named format
> is worth more than matching the everyday phrase. What the UI *calls* it is a separate,
> reversible decision we can take when we design the screen.

---

## 2. The missing layer: Divisions

This is the central structural proposal, and everything downstream depends on it.

Right now a `Game` hangs directly off an `Event` and carries its own `sportId` and two team
participants. For a single match that is exactly right. For a sports day it means the event is a
flat bag of sixty unrelated fixtures with no way to say "these eight are the u14 rugby" — which
in turn means no way to generate them in bulk, rank them separately, or hand them to a different
person to run.

So we introduce a grouping layer between the event and its games:

```
Event (Tournament)
└── Division            e.g. "u14 Rugby", "Open Netball", "u16 Rugby — Division B"
    ├── sportId
    ├── ageGroup        (optional — a tournament may have only one)
    ├── entrants        teams, individuals, or unresolved placeholders
    ├── facilities      which fields/courts this division may use (optional)
    ├── weighting       multiplier applied to its points in the org roll-up (default 1.0)
    └── Stage[]         ordered phases — pool, knockout, final. One implicit stage is the
        ├── format          degenerate case, and covers round robin and Festival.
        ├── entrantSource   how this stage's entrants are derived from the previous one
        └── Games           the fixtures
```

A single-sport tournament has exactly one division and the UI can hide the concept entirely — you
would never make the organiser of a 12-team u16 hockey tournament create a division called "u16
Hockey" before adding teams. A sports day has one division per sport × age group, and that is
precisely the unit an organiser thinks in when they build the schedule.

Divisions are also the natural unit for the things a tournament needs that a single match does
not: a points table, a bracket, a start time, a set of facilities, and a person responsible.

> **Decided — divisions are a default, never a constraint.** Sport × age group is how the app
> *proposes* divisions, not how it defines them. An organiser running a single sport at a single
> age group must still be able to split it into "Division A" and "Division B" and assign teams
> to each by hand; equally they must be able to merge or rename what we proposed. Every
> auto-derived division is a suggestion the organiser can override. This is the general principle
> for the whole feature: **generate to save labour, never to remove control.**

> **Decided — naming.** "Division" it is.

> **Decided — pools do not nest as entities.** A division's stage carries its `pools` as flexible
> structured data, and each game records the pool it belongs to. Tournament formats vary enough
> that a rigid schema for every one of them would be a liability; format-specific data stays in a
> format-shaped blob. The catalogue in [§5](#5-format-catalogue--what-we-must-be-able-to-express)
> is the check on whether that blob is expressive enough.

> **Decided — stages are in from the start.** Pools → knockout, multi-stage draws, plate brackets
> and athletics heats → final all describe a division proceeding through phases, where each
> phase's entrants come from the last. Since we will need it, we build it now rather than
> retrofitting it onto live tournament data — **and we build it in the UI too**, so the concept is
> real to the organiser rather than a hidden schema affordance. A division with one stage is the
> degenerate case and the UI can stay quiet about staging when there is only one.

### Is a division enough, or do we need a level above it?

Raised in review: a sports day might be understood as *"one event containing a rugby tournament,
a netball tournament and a hockey tournament"*, each of which then has its own age-group
divisions. That is three levels, where the model above has two.

The two-level model gets most of the way there, because a division carries its own stages and
format. "The rugby tournament" is then *the set of divisions whose sport is rugby* — a grouping
the UI can present, and a convenor can be given (D22), without it being a stored entity.

It stops being enough if a per-sport grouping needs to *own* something: its own overall winner
across age groups, its own points configuration, or its own progression between age groups.

> **Decided — stay at two levels.** "The rugby tournament" is a filtered view over divisions, not
> a stored entity. We push the two-level model as far as it goes and let a real case tell us if it
> breaks, rather than adding a level speculatively. Now that delegation attaches to divisions (D31)
> and weighting is per division (D18), the main candidates for sport-level ownership are already
> handled a level down — which is the evidence that the extra level is not yet earning its place.

---

## 3. Entrants: who is competing?

The two shapes disagree here, and the disagreement is real rather than cosmetic.

- In a **tournament**, the entrant *is* the team. "Who won?" means "which team lifted the trophy".
- In a **sports day**, the entrant is the **organisation**. Individual teams play the fixtures,
  but "who won the day?" means "which school accumulated the most points across every fixture in
  every sport". The current standings code already does exactly this — it remaps every game
  participant's `teamId` to its `orgId` before ranking
  ([[eventId].tsx:272](file:///c:/Fred/Coding/SK/expo-app/app/admin/[orgId]/events/[eventId].tsx#L272)),
  and `calculateStandings` documents the intent in its docstring.

So the tournament carries a **scoring subject**:

```
scoringSubject: 'Team' | 'Organisation'
```

`Festival` defaults to `Organisation`; every other format defaults to `Team`. The subject decides
what the standings table ranks and what the results screen calls a winner.

> **Decided — compute both tables.** A `Festival` always produces the per-division table *and*
> the organisation roll-up. The division table is how you find out who won the u14 rugby; the
> roll-up is how you find out who won the day. Neither is derivable from the other by the reader,
> and both are cheap to compute, so `scoringSubject` decides which is given top billing rather
> than which exists.

### An entrant is not always a team

Raised in review, via the athletics case: an inter-school athletics day is a tournament whose
*winner* is an organisation, and where teams may not feature at all — the competitors are
individuals who score for their school. So `scoringSubject: 'Organisation'` must be available
independently of whether entrants are teams, and an entrant must be able to be a person.

An entrant is therefore one of three things:

| Kind | What it is | Already supported? |
|---|---|---|
| **Team** | The default. A `Team` belonging to a participating org. | Yes — `game_participants.team_id`. |
| **Individual** | A person competing for their org. An athlete, a swimmer, a singles player. | **Yes** — `game_participants.org_profile_id` already exists alongside `team_id`, and both are nullable. |
| **Placeholder** | An unresolved slot: "Winner QF1", "TBC — awaiting confirmation". | No. To build. |

That second row is the useful surprise, and it is covered in
[§4](#4-beyond-head-to-head-athletics-and-meet-style-events).

### Getting teams into a division

An organiser adding "Northcliff High" to a sports day expects the app to work out which of their
teams play. Northcliff has an u14A rugby team already on the system; they do not have an u16
netball team yet because they have never entered one.

Proposed flow, per division:

1. The event already knows its participating orgs (this exists today, including quick-create of
   an unclaimed org with a nomination email invite — see
   [create.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/[orgId]/events/create.tsx)).
2. For a division of *sport S, age group A*, the app offers each participating org's teams
   matching `sportId === S && ageGroup === A` — the same filter `games/new.tsx` already applies.
3. Where an org has no matching team, offer to create one inline. `Team` is a light record
   (`name`, `ageGroup`, `sportId`, `orgId`) so this is cheap, and the create-event screen already
   does inline team creation today.
4. An org may enter more than one team in a division (u14A *and* u14B). This must not be blocked.

> **Decided — placeholder entrants are in from v1.** Three needs converge on one mechanism. A
> knockout bracket cannot name a semi-finalist until the quarters are played, so later stages
> *must* hold unresolved slots. An organiser waiting on confirmations wants to build fixtures and
> a schedule now and fill in teams later. And a stage whose entrants come from the previous one
> (D11) is expressed as placeholders until that stage finishes. Everything downstream —
> scheduling, printing, the fixture list — must tolerate a slot with no entrant yet, and standings
> must skip unresolved fixtures rather than treating them as byes.

> **Decided — one placeholder, with an optional fill rule.** A slot carries a label and, if it has
> one, a rule: `source: null` is filled by a person; `source: { winnerOf: <gameId> }` fills itself
> when that game finishes. One entity, not two.
>
> The reasoning, since this was left as a judgement call. Everything downstream has to treat the
> two identically — the scheduler must place a fixture whose entrant is unknown, the printed
> fixture list must render the label, and standings must skip the fixture rather than score it as a
> bye. Two types would mean writing that handling twice and keeping the two in step forever, and
> the only thing that actually differs is whether a rule exists.
>
> The decisive argument is the override. Real tournaments break their own rules: a team withdraws
> and the losing semi-finalist is promoted; a match is awarded as a walkover; a side is
> disqualified after progressing. Under one entity that is just clearing the rule and naming an
> entrant — the same edit as filling a TBC slot. Under two entities it means converting a
> rule-based slot into a manual one, which is a state transition someone has to design, build and
> test. Given the general override principle in D29, one entity is the shape that makes the
> exception cheap.

---

## 4. Beyond head-to-head: athletics and meet-style events

Everything above assumes a fixture is A versus B with a score each. An athletics day is not that.
It has **events** (100m, high jump, 4×100m relay), each with many competitors at once. An event
may run several **rounds** — heats, then semis, then a final. The result of an event is a
**ranking**, and the ranking converts into points for the athlete's school.

The same shape covers swimming galas, cross-country, cycling, and any "everyone competes, then we
rank them" contest.

### The model is already most of the way there

Review recalled that a team-versus-individual distinction already exists. It does — and there is
more of it than remembered. Verified in the codebase:

| What exists | Where | State |
|---|---|---|
| `SportParticipantType` = `TEAM \| INDIVIDUAL` | [Sport.ts:37](file:///c:/Fred/Coding/SK/shared/src/models/sport/Sport.ts#L37) | Persisted on `sports.participant_type`, validated in `sportValidation.ts`, **editable in the sport admin UI** |
| `MatchTopology` = `HEAD_TO_HEAD \| MULTI_COMPETITOR` | [Sport.ts:44](file:///c:/Fred/Coding/SK/shared/src/models/sport/Sport.ts#L44) | Same — persisted, validated, admin-editable. Its own comment gives "a race" as the example |
| Individual competitors on a fixture | `game_participants.org_profile_id`, nullable alongside `team_id` | Schema supports it today |
| Non-finishing outcomes | `game_participants.status` = `active / withdrawn / disqualified / did_not_start` | Schema supports it today |
| Finishing order | `game_participants.sort_order` | Schema supports it today |

`disqualified`, `did_not_start` and `sort_order` are not team-sport vocabulary. Someone modelled a
multi-competitor race here deliberately. So the athletics story is much less structural work than
it first appeared.

**The catch:** none of it is read yet. `participantType` and `matchTopology` are written by the
sport admin screen and consumed by *nothing* — no scoring path, no fixture creation, no standings.
An admin can mark a sport `INDIVIDUAL` / `MULTI_COMPETITOR` today and the app behaves identically.

That is deliberate groundwork rather than abandoned work: the structures were designed alongside
features that have not been built, on the principle that laying the basic shape early is cheaper
than retrofitting it. This spec is the first consumer that gives them meaning, which is exactly how
it was meant to go. The one genuine problem is narrower than "unread" — the sport editor *offers*
a setting that currently does nothing, so an admin can make a choice the app silently ignores.

> **Decided — logged as `SPORT-10`.** Recorded in `TODO.md` under Sport Configuration, alongside
> `SPORT-1` and `SPORT-2`, which are the same family. Tracked there so the gap survives whether or
> not tournaments land first, rather than being fixed opportunistically inside this feature.

### What actually breaks

Two things, both narrower than the model suggested:

- **The result shape.** A result is currently a score per side, from which win/draw/loss is
  derived. A ranked event produces a finishing order, and points come from *placing* (8 for first,
  6 for second…) rather than from a win. `finalScoreData` needs to admit a ranking.
- **The two-sided assumptions in logic.** `Game.participants` is already an array, so N
  competitors is representable. What assumes exactly two is the code around it —
  `calculateStandings` reads `participantsList[0]` and `[1]` and `finalScoreData.home` / `.away`
  ([standings.ts](file:///c:/Fred/Coding/SK/shared/src/utils/standings.ts)) — and the scoring
  screens, which are built around two sides.

**Rounds** are not new structure after all: heats feeding a final is a division with stages
(D11), which is the same mechanism the knockout needs. One mechanism, three uses.

> **Decided — designed in, built later.** Ranked contests are a first-class case the schema must
> satisfy — `sortOrder`-based results, placing-to-points, `MatchTopology` actually consulted — but
> no athletics UI ships in v1. The detailed mechanics (lanes, seeding, field-event attempts, relay
> legs) remain a spec of their own. Note that the existing final-score override already takes
> `{ [participantId]: number }` rather than a home/away pair
> ([DynamicScoringContext.tsx:759](file:///c:/Fred/Coding/SK/expo-app/components/sports/shared/DynamicScoringContext.tsx#L759)),
> so at least one scoring path is already N-shaped.

---

## 5. Format catalogue — what we must be able to express

A survey of the formats that exist, as a check on the model. "Expressible" means *the Event →
Division → Stage → Games structure can represent it* — not that we build its UI in v1.

| Format | What it is | Expressible? |
|---|---|---|
| **Single round robin** | Everyone plays everyone once; ranked by table. | Yes — one stage. |
| **Double round robin** | As above, home and away. | Yes — a `legs: 2` setting. |
| **Single elimination** | Knockout; lose and you are out. | Yes — stages + placeholder entrants + progression. |
| **Knockout + 3rd-place playoff** | As above with a bronze final. | Yes — one extra fixture fed by the losing semi-finalists. |
| **Pools → knockout** | Group stage, top N of each pool progress. World Cup shape. | Yes — pool stage then bracket stage, with crossover rules (A1 v B2). |
| **Plate / consolation / shield** | Losers of an early round drop into a secondary bracket and play it out for their own trophy. | Yes — a parallel stage fed by losers. |
| **Double elimination** | Two defeats to be eliminated; a losers' bracket runs alongside the winners'. | Expressible, but **deferred** — see below. |
| **Multi-stage (Super 6/8)** | Pool → seeded crossovers → finals, sometimes carrying pool points forward. | Yes — stages, with a rule for what carries over. |
| **Swiss system** | Fixed number of rounds; each round's pairings computed from the current standings. | Yes structurally, but it **breaks up-front generation** — see below. |
| **Festival / arranged** | Fixtures agreed between organisers; no bracket. | Yes — our `Festival`. |
| **Ranked meet** | Athletics, swimming, cross-country. N competitors, placings, points by place. | Yes once results admit a ranking — see [§4](#4-beyond-head-to-head-athletics-and-meet-style-events). |
| **Ladder** | Ongoing; players challenge upward. | Not a format at all — a scoring context. See [§9](#9-competitions-and-containers-leagues-ladders-and-tournaments). |

### Double elimination, and why the simpler version is also worth having

Review asked whether double elimination is just "a first knockout round where winners and losers
go into two separate brackets". That describes a real and genuinely useful format — but it is the
**plate** format, not double elimination, and the difference matters for what we build.

- **Plate / consolation.** The split happens **once**. Lose in round 1 and you move to the plate
  bracket, where you stay. Two independent knockouts running in parallel, one for a cup and one
  for a plate. Simple, predictable, and very common in school sport, because it guarantees every
  team a second game and gives the weaker half something to play for.
- **Double elimination.** The drop happens **every round**. Lose in winners' round 3 and you enter
  the losers' bracket at a *correspondingly later* point, meeting someone who has been surviving
  down there all along. The losers' bracket therefore has roughly twice as many rounds and
  alternates between "survivors play each other" and "survivors play the newly dropped". The grand
  final pits the winners'-bracket champion against the losers'-bracket champion — and since the
  latter has one loss and the former none, a strict reading requires a **bracket reset**: if the
  losers' champion wins, they play a second final to settle it.

Both need the same primitive: **a loser routes somewhere rather than exiting.** They differ only
in how often it fires — once for plate, every round for double elimination.

> **Decided — build plate, defer double elimination.** Plate is what v1 gets, and it is the answer
> to "what happens to the losers" for a school tournament. Double elimination is rare in school
> sport, needs a losers' bracket roughly twice as long as the winners' with its own seeding rules,
> and drags in the bracket reset, which makes the fixture count non-deterministic — you cannot
> fully schedule a day whose final match may or may not happen. None of that fits the basics
> neatly, so it waits until the basics are in place.
>
> What this decision does *not* do is design it out. Both formats run on the same loser-routing
> primitive, which we are building for plate anyway, so double elimination later is a matter of
> firing that primitive every round instead of once — plus the seeding and scheduling rules. The
> bracket reset stays a flag on top of that, whenever it is wanted.

### The Swiss system, explained

Requested in review. Swiss solves a specific problem: **you have too many entrants for a round
robin, but you do not want to eliminate anyone.**

Sixteen teams playing a full round robin is 120 fixtures — impossible in a day. A knockout gets it
done in 15, but half the teams go home after one game. Swiss splits the difference:

1. You fix the number of **rounds** in advance — typically enough to separate the field, around
   4–5 for 16 entrants. Everyone plays in every round.
2. **Round 1** pairings are random, or seeded if you have rankings.
3. After each round, entrants are grouped by their **current score** and paired *within* those
   groups: the 2–0 teams play each other, the 1–1 teams play each other, and so on. A pairing is
   never repeated.
4. After the last round, the standings table is the result. No final, no bracket — the team on top
   has beaten progressively stronger opposition and is a fair winner.

It is standard in chess, esports and debating, and it suits a school one-day competition with a
large field well: everyone plays the same number of games, nobody is eliminated, and the fixtures
get more evenly matched as the day goes on.

**The consequence for us is structural.** Every other format lets us generate the full fixture
list up front. Swiss cannot: round N+1's pairings do not exist until round N's results are in. So
the generator's interface must be **"produce the next stage"**, with "produce everything now"
as the special case where all stages happen to be computable immediately. That is cheap to honour
while designing the generator and expensive to retrofit — which is the whole reason to settle it
before writing one.

---

## 6. Fixture generation

Per division and stage, given N entrants and a format, produce the games.

| Format | Generation |
|---|---|
| `RoundRobin` | Every entrant plays every other, once (or twice — `legs`). Standard circle method, so byes distribute evenly on odd N. |
| `PoolsKnockout` | Split entrants into P pools (seeded or random), round-robin within each pool, then a bracket stage seeded from pool finishers. |
| `Knockout` | Single-elimination bracket sized to the next power of two, with byes for the top seeds. |
| `Swiss` | One round at a time, from the standings after the previous round. |
| `Festival` | **No automatic bracket.** Fixtures are arranged, not derived. |

> **Field evidence, 2026-09-09 — this is the pain, and the bar is lower than expected.** First
> user interview with a club admin who runs a youth tournament (Tableview FC; notes in
> `docs/interviews/records/`, untracked). Building the fixtures by hand in Excel **took him a
> week**, and what made it a week was not the initial draw — it was *"so many variables, teams
> pulling out, refixturing everything, updating spreadsheets"*. He now uses a third-party app and
> rates fixture generation as a bigger win than live scoring or reporting. Two things follow:
> **the entrant-withdrawal path below is the highest-value path in this section**, not the
> first-draw path; and the app he is delighted with generates *random* fixtures with no optimisation
> at all, which is independent support for **D14 (no scheduling optimiser in v1)** in
> [§7](#7-scheduling). One interview, so treat as a signal, not a mandate.

`Festival` is the interesting one, because a sports day's fixtures are not a mathematical
consequence of its entrants. When four schools meet, the u14A teams may play a full round robin,
while the u16s play only two of the three possible fixtures because one school's u16s are away.
The organiser knows what they want; the app's job is to make expressing it fast.

> **Decided — generate, then get out of the way.** A `Festival` division offers round-robin
> generation as a starting point, and the organiser can then delete, add, reorder and reschedule
> freely. Generation is a labour-saver, not a constraint, and a hand-built division is
> indistinguishable from a generated one — which is correct.

> **Decided — regeneration is explicit, never silent.** When entrants are **added or removed**
> after fixtures exist, the organiser is offered exactly two paths: **regenerate the stage from
> scratch** (with a clear warning about what is discarded, and a hard confirmation if any fixture
> already has a result), or **leave the fixtures alone and add the new ones by hand**. The clever
> middle option — silently generating just the fixtures the new entrant creates — is rejected: it
> is the hardest to implement and the hardest to predict, and an organiser who cannot tell what
> the app just did to their schedule will not trust it again.

> **Decided — replacing an entrant is not a regeneration.** Swapping one entrant for another
> leaves the fixture structure identical, so the substitution is made in place across the existing
> fixtures and nothing is recalculated or offered. Regeneration is prompted only when the *number*
> or *arrangement* of entrants changes. If the organiser wants a fresh draw after a substitution,
> they can ask for one.

### Bulk writes

Four schools × three sports × five age groups × round robin is 90 fixtures. Ninety sequential
`ADD_GAME` round-trips would be visibly slow and would broadcast ninety times into the fixtures
rooms, so generation needs to write in bulk.

> **Decided — targeted batches under one contract.** Batch support goes on the actions with a real
> N>1 case (game creation, game updates, roster changes) rather than reshaping every action into an
> array. Converting everything would touch every call site and every response shape across
> `expo-app` and the server for no gain on actions that will always carry one item. The batch
> actions we do add all follow one contract so they behave identically.

The contract has to answer four things, and they are the same four each time:

- **Partial failure.** With ninety items, "it failed" is not a useful ack. Default to one
  transaction — all or nothing — plus a per-item error report so the client can say *which* fixture
  was rejected.
- **Permissions are per item, not per batch.** A batch could name games in two events belonging to
  two orgs. Refuse batches that span more than one permission scope; it is cheaper than checking
  each item and far easier to reason about.
- **Broadcasts batch too**, or the ninety round-trips simply move to the response side. Clients
  need a batch-aware handler — one that applies updates one at a time will re-render ninety times.
- **Retries must not double-write.** A dropped ack on a batch of ninety is much worse than on a
  single insert, so batches carry client-generated ids or an idempotency key.

This contract outlives the feature and belongs in
[okf/api_comms.md](file:///c:/Fred/Coding/SK/okf/api_comms.md) once written.

---

## 7. Scheduling

Generation produces *who plays whom*. Scheduling decides *where and when*, and it is genuinely
constrained: a team cannot be in two places at once, a field hosts one fixture at a time, and a
rugby fixture cannot go on a netball court.

`Facility` already carries `supportedSportIds` and `primarySportId`
([Facility.ts](file:///c:/Fred/Coding/SK/shared/src/models/venue/Facility.ts)), and `Game` already
carries `siteId`, `facilityId` and `scheduledStartTime`. So the constraint data mostly exists.

### Facilities that are the same ground

One constraint the data does *not* yet carry: **two facilities can be the same physical space.** A
club running a mini tournament subdivides one full-size field into four mini pitches and holds all
five as ordinary facilities on the site — `Field A` alongside `Field A1`–`A4` — picking the
full-size one for a senior fixture and a mini one for a youth fixture. The same thing happens
without any subdivision: a cricket outfield overlapping a soccer pitch, or one marked court that is
netball in winter and tennis in summer. It is rare for both to be wanted on the same day, which is
exactly why it will be missed when it happens.

> **Decided (D34) — a facility declares what it conflicts with.** `Facility` carries a list of other
> facility ids it physically overlaps. The scheduler treats a fixture on any of them as occupying
> the slot for all of them, so `Field A1` and `Field A` cannot both be assigned at the same time.
> Two properties matter and are easy to get wrong:
>
> - **Symmetric.** Declaring the conflict on one side is enough; the scheduler enforces it in both
>   directions. Otherwise the constraint fires only when placing a fixture on whichever facility
>   happened to be edited, which is the kind of bug that shows up on the day.
> - **Not transitive.** `A1` conflicts with `A`, and `A2` conflicts with `A`, but **`A1` does not
>   conflict with `A2`** — the four mini pitches run simultaneously, which is the entire point of
>   subdividing the field. Do not close the conflict graph transitively.
>
> Rejected alternatives: a parent/child facility hierarchy (more model than the problem needs, and
> it cannot express a cricket/soccer overlap where neither contains the other), and event-scoped
> temporary facilities (the facilities are real and permanent — only their *use* is per event).
>
> Per **U26**, this warns rather than blocks, like every other scheduling conflict. An organiser who
> knows the mini pitches are lifted for the day should be able to overrule it.

### Venues cascade down

The event holds a **set** of facilities in play, not the single `facilityId` it holds today.

1. The organiser picks the **venue(s)** for the event. That narrows the facilities on offer.
2. They pick which of those **facilities** the event will use.
3. They may then allocate facilities **down to a division or a pool** — "u14 rugby is on Fields 3
   and 4", "Pool A plays on Court 1". The scheduler uses that allocation as a hard constraint.

Allocation at the lower levels is optional. A division with no allocation may use any of the
event's facilities that support its sport.

> **Decided — show venue and facility together.** Wherever more than one venue is in play, the
> fixture list, the schedule grid and the game screen all name the venue as well as the field or
> court. "Field A" is ambiguous the moment two sites are involved, and a tournament makes that the
> normal case rather than the exception. This closes the `TODO.md` item "Add Venue Location (a
> group of Venues)" for tournament purposes.

### Time

Proposed inputs: fixture duration per sport (rugby 25min, netball 15min), a turnaround gap, and
the day windows below.

> **Decided — the greedy pass, then the human.** v1 assigns fixtures to slots in order, respecting
> two hard constraints — an entrant plays once at a time, a facility hosts once at a time — and
> then makes manual adjustment easy and obvious.
>
> **No optimiser for now.** That is a decision about sequencing, not a permanent one: an optimiser
> that minimises gaps and stops a team playing three in a row is a genuinely useful thing to have,
> and worth revisiting once organisers have used the greedy version and told us where it hurts.
> What we are avoiding is building that complexity before we know which constraints actually
> matter in practice — and much of the gap between a legal schedule and a good one is the
> organiser's own context, which no optimiser will have.

> **Decided — multi-day, with windows and stage gates.** A tournament may span days, so the
> scheduler needs a **start and end time per day** (the end time being the latest a fixture may
> *start*, so a day does not overrun). Stages may additionally carry an **earliest start** — the
> knockout rounds begin on day 2 even if day 1 has daylight left after the pools. Without that, a
> greedy scheduler will happily start a semi-final before the pool it depends on has finished.

---

## 8. Points and standings

`calculateStandings` ([standings.ts](file:///c:/Fred/Coding/SK/shared/src/utils/standings.ts)) is
a clean pure function taking games, participants and a `{pointsPerWin, pointsPerDraw,
pointsPerLoss}` config, and the event screen already calls it with org-mapped participants. What
is missing is any way to *configure* it and any notion that some fixtures count more than others.

`Event.settings` already declares `pointSystem: 'standard' | 'weighted'`, `pointsPerWin`,
`pointsPerDraw` and `levelWeighting`. Only the two point values are ever read, and nothing anywhere
writes any of them — there is no UI. `pointSystem` and `levelWeighting` are **declared and never
read by any code in the repo**: groundwork laid for this feature before it was specified. Unlike
the sport flags in [§4](#4-beyond-head-to-head-athletics-and-meet-style-events), they have no
writer either, so nothing invites anyone to set them. The decisions below supersede their shape, so
they should be replaced rather than carried forward.

> **Decided — one default, 3/1/0.** Tournaments and leagues both default to 3 points for a win,
> 1 for a draw, 0 for a loss. The current split — 3/1/0 for events
> ([[eventId].tsx:289](file:///c:/Fred/Coding/SK/expo-app/app/admin/[orgId]/events/[eventId].tsx#L289))
> versus 4/2/0 for leagues
> ([LeagueManager.ts:162](file:///c:/Fred/Coding/SK/server/src/managers/LeagueManager.ts#L162)) —
> is drift, not design, and is exactly the kind of divergence that follows from two systems owning
> the same idea.

> **Decided — one scoring system, shared.** Leagues and tournaments use the same scoring-system
> shape, so a competition means the same thing wherever it is configured, and bonus rules
> (`LeagueSettings.bonusRules` — four tries, a losing margin under seven) land in one place for
> both. Bonus rules are not built in v1, but the shape must not preclude them.

> **Decided — weighting is a per-division multiplier.** Every division carries a multiplier,
> default `1.0`, editable by the organiser. The org roll-up multiplies each division's competition
> points by it before summing, so a 1st XV result can outweigh a u13C result. No separate
> `pointSystem: 'weighted'` mode is needed — "standard" is simply every weight left at 1.

> **Decided — tiebreaks are configurable and ordered.** `calculateStandings` currently ranks by
> points then points difference, which is fine for display and useless for progression: a knockout
> needs a *definite* answer to who goes through. So a tournament carries an ordered list of
> tiebreak factors that the organiser can rearrange, with a sensible default order shipped. The
> engine walks the list until one factor separates the entrants.

> **Decided — the factor list, and a manual override on any result.** We ship: points difference,
> points for, head-to-head result, most wins, and fewest disciplinary points. The organiser orders
> them; more factors can be added later without disturbing the mechanism.
>
> Above all of them sits a **manual override**. Real tournaments resolve things off the field — a
> coin toss, a countback, a withdrawal, a disciplinary ruling — and if the app cannot record that,
> its table will contradict the trophy. So the principle is general rather than specific to
> tiebreaks: **any result the app computes, a person with the right permission can override, and
> the override is recorded as such** rather than by quietly editing the underlying data. A
> narrower version of this already exists for game scores — the final-score override on a finished
> game ([DynamicScoringPanel.tsx](file:///c:/Fred/Coding/SK/expo-app/components/sports/shared/DynamicScoringPanel.tsx)) —
> so the pattern is established; what is new is extending it to standings and progression.

**No points system is still a scoreboard.** Per the Purpose section, a division or event with no
competition points configured still shows played / won / drawn / lost per entrant and per
organisation. The points column is what a points system adds, not the table itself.

> **Decided — points by placing is a scoring system, not a special case.** Awarding points by
> finishing position is as legitimate a scoring system as awarding them for a win, so it becomes a
> **mode** of the shared scoring system rather than a sibling mechanism. A division scores either
> **by result** — the familiar `pointsPerWin` / `Draw` / `Loss` — or **by placing**, a table mapping
> finishing position to points (8 for first, 6 for second, and so on).
>
> Both modes feed the same standings engine, the same division weighting (D18) and the same
> organisation roll-up (D6), so an athletics division and a rugby division can sit in one sports day
> and contribute to one table. That is what makes a mixed day expressible at all, and it is why the
> two belong in one configuration shape rather than two.

---

## 9. Competitions and containers: leagues, ladders and tournaments

Review reframed this section, and the reframing is worth stating as the model rather than as a
comparison:

> A **league** is a scoring system without fixtures of its own. It has a start and end date to
> determine which games count towards it. A **tournament** is a grouped set of games over a
> defined period, usually at one venue or a few close together. Both use the same scoring
> mechanisms.

That separates two things the app had tangled together:

- A **container** owns fixtures — when they happen, where, and who is in them. A tournament is a
  container. So is a single match.
- A **scoring context** owns a table. It owns no fixtures; it *collects* them by rule and ranks
  the results. A league season is a scoring context. So is a ladder.

A game therefore belongs to exactly one container and to **any number of scoring contexts**.

> **Decided — a game can count in several places at once.** A fixture played inside a tournament
> may simultaneously count towards one or more league seasons. "The u16 league's mid-season
> festival" is a real thing, and its results should feed the league table without the game being
> duplicated.

**This is already built.** A `game_seasons` join table exists, with
`addGameToSeason` / `removeGameFromSeason` on `LeagueManager`, an `ADD_GAME_TO_SEASON` socket
action, and a UI on the season screen
([seasons/[seasonId].tsx:307](file:///c:/Fred/Coding/SK/expo-app/app/admin/[orgId]/leagues/[leagueId]/seasons/[seasonId].tsx#L307))
that already attaches games to a season and recalculates its standings. The many-to-many the
decision needs is in place; what is missing is the ability to do it **from the tournament side**,
as part of setting a division up, rather than only by going to the league afterwards.

> **Decided — a ladder is a scoring context, not a tournament format.** A ladder is just a ranking
> rule applied to games between two entrants. Any game marked as counting toward a ladder affects
> it, whether it was played inside a tournament, a league season, or on its own. So we do not build
> a "ladder tournament format" — we let a ladder collect games the same way a season does. This
> also supersedes the framing in
> [FUTURE_IDEAS.md](file:///c:/Fred/Coding/SK/FUTURE_IDEAS.md), where the ladder is described as an
> event type; the challenge-and-scheduling mechanics parked there remain future work.

### Where the table actually lives

The two systems currently answer this differently, and review asked what the difference amounts
to. It is worth spelling out, because it stops being a storage question the moment progression
depends on it.

- **Computed on read** — what events do today. Nothing is stored. Each time someone opens the
  event, their device fetches the games and runs `calculateStandings`. The table can never be
  stale, because it is derived fresh every time. But the work repeats for every viewer, the
  calculation has to be identical everywhere it is implemented, and — the part that matters — the
  *server has no idea what the table says*, so nothing server-side can act on it.
- **Persisted** — what seasons do today, via `Season.cachedStandings`. The table is stored and
  recalculated when a result changes. Reads are cheap, there is one authoritative answer, and the
  server can act on it. The risk is the ordinary risk of any cache: it drifts if some code path
  changes a result without triggering the recalculation.

> **Decided — persist the standings, recalculate when a result is finalised.** Reviewed and
> settled: results and standings both live in the database, and finalising a game result updates
> the standings that depend on it.
>
> The deciding factor is not performance, it is **progression**. Once a placeholder fills itself
> from "the top two of Pool A" (D26), the standings stop being a display and become an *input to
> the fixture list*. A client-side calculation cannot be allowed to decide who plays the
> semi-final; that has to be server-side and durable. D21 points the same way — with one game
> feeding a tournament and a league season at once, both should read one authoritative
> recalculation rather than each deriving their own answer.
>
> **The thing to get right is the trigger.** A cache is only as good as the paths that invalidate
> it, so recalculation must hang off the write that finalises a result rather than off each caller
> remembering to ask. The paths that change a result are more numerous than they look: a game
> finishing normally, the final-score override on an already-finished game, a dispute being
> resolved, a game being deleted, a game being attached to or removed from a season, and an entrant
> substitution (D10). Every one of those must go through the same choke point.

---

## 10. Permissions

A tournament spans organisations, and the participating orgs are frequently not on the app yet —
the existing create flow already handles this by quick-creating unclaimed orgs and emailing a
nomination invite.

Assumed model for v1 (**needs confirming against
[okf/auth_control.md](file:///c:/Fred/Coding/SK/okf/auth_control.md)**): the hosting org's admins
own the tournament — structure, fixtures and schedule. Participating orgs can see everything and
can manage *their own* teams and player selections. Scoring a fixture follows the existing
per-game permission rules and is not changed here.

> **Decided — divisions can be delegated.** At a real sports day the host does not run all six
> sports; the netball convenor runs netball. So a division can be assigned one or more organisers
> who can edit its entrants, fixtures and schedule without being an admin of the whole event. This
> is also why the per-sport grouping question in [§2](#is-a-division-enough-or-do-we-need-a-level-above-it)
> matters less than it first appeared — the unit people are actually given is the division.

> **Decided — an organiser is a named person, not an org role.** Added in the UI review round
> (2026-08-30). The hosting org's admins can all edit the tournament, but they must also be able to
> **nominate a member who is not an admin** to organise it — the person who runs the sports day is
> usually a teacher rather than whoever administers the app account.
>
> This makes a tournament organiser and a division convenor (D22) the same mechanism at two scopes: a
> named person granted edit rights over a container, assigned **per event** rather than through an
> org role. That is the right shape, because the grant concerns one event and should expire with it,
> and it means org roles need no new tier.
>
> **The event-level organiser's rights are full**, settled in the UI review's second round: within
> the tournament they can do everything an org admin can, and outside it nothing. That is safe
> because the admins' own rights come from being admins rather than from an assignment, so an
> appointee cannot lock out the people who appointed them, and any admin can withdraw the grant. The
> narrow role is the *division* convenor (D31), not this one — see
> [docs/tournaments-ui.md](file:///c:/Fred/Coding/SK/docs/tournaments-ui.md) §4.

> **Decided — fixtures and results, and nothing else for now.** A division organiser can edit that
> division's fixtures and enter its results. They cannot add entrants, change the division's
> settings, or move fixtures onto facilities shared with other divisions — those stay with the
> event's admins, because they are the decisions that affect somebody else's division. The list
> can grow once we see what convenors actually get stuck on.

> **Widened 2026-09-03, in Phase 4 — a convenor runs the whole division.** The narrow list above
> was drawn before it was clear what handing a division over actually means. The point of appointing
> a netball convenor is that the event organiser stops thinking about netball: if the convenor then
> has to ask somebody else to enter a late team, the delegation has not happened. So the scope is
> now **everything inside the division** — entrants, stages, fixtures, scheduling, results and
> adjustments.
>
> The line moved but it did not disappear, and where it now sits is the useful part:
>
> - **Not the division's own record.** Its name, sport, age group and especially its `weighting`
>   describe how the division sits in the event and how its points roll up into the organisation
>   table (D18). Changing those is an event-level decision.
> - **Not the event.** Another division, the event's facilities, the tournament itself: all refused.
> - **Not appointing anybody.** Delegation stops here deliberately. The hosting org's admins and the
>   event organisers can withdraw a convenor at any time; a convenor who could appoint others could
>   build a position they cannot be removed from, which is the one asymmetry D33 relies on not
>   existing.
>
> `SET_DIVISION_FACILITIES` moved with the rest: it narrows a division to a subset of the facilities
> the event has already put in play, which is scheduling inside the division rather than a claim on
> somebody else's pitch. `SET_EVENT_FACILITIES` — deciding what the event has in play at all — did
> not.

---

## 11. Explicitly out of scope for v1

Naming these so they do not get built by accident. Note that the design stance (D12) means several
of them are *modelled* now even though no UI ships.

- **Ranked / meet-style contests** — the schema must satisfy them
  ([§4](#4-beyond-head-to-head-athletics-and-meet-style-events)), but no athletics UI in v1.
- **Double elimination and the bracket reset** — deferred (D28). Plate / consolation covers
  "what happens to the losers" for v1, and runs on the same loser-routing primitive, so double
  elimination remains reachable later.
- **A scheduling optimiser** — deferred, not ruled out (D14).
- **Bonus points** — the scoring shape must admit them ([§8](#8-points-and-standings)); no UI.
- **Ladder mechanics** — challenges, who may challenge whom, how often. The ladder *as a scoring
  context* is settled (D24); the challenge and scheduling rules stay parked in
  [FUTURE_IDEAS.md](file:///c:/Fred/Coding/SK/FUTURE_IDEAS.md).
- **Officials assignment** across the schedule.
- **Public spectator view** of a tournament (fixtures/results are already public per
  [docs/api_actions.md](file:///c:/Fred/Coding/SK/docs/api_actions.md); a tournament-shaped public
  page is a later piece).
- **Entry fees, catering, anything non-sporting.**

**Moved into scope in review round 2:** automatic knockout progression — the winner of QF1 flowing
into SF1. It was parked as "a separate mechanism with its own failure modes", and it is, but it is
the *same* mechanism that plate brackets, double elimination and athletics heats all need, and
placeholder entrants (D7) are meaningless without it. Building it once, now, is cheaper than
building the three things that depend on it around its absence.

---

## 12. Related parked work

Per [.agent/skills/todo-checkin/SKILL.md](file:///c:/Fred/Coding/SK/.agent/skills/todo-checkin/SKILL.md),
these live in the code this feature touches:

- **"Add the ability to make a copy of an event"** — strongly relevant. Last year's sports day is
  the best possible template for this year's, and duplication is far cheaper than re-running the
  wizard. Worth folding in.
- **"Prevent saving duplicate events"** — same code path.
- **"Add Venue Location (a group of Venues)"** — addressed for tournaments by D16; confirm whether
  that closes the item or only part of it.
- **`SPORT-10` — unread sport flags.** `participantType` and `matchTopology` are written by the
  sport admin UI and read by nothing
  ([§4](#4-beyond-head-to-head-athletics-and-meet-style-events)). Logged 2026-08-29 under Sport
  Configuration; this spec is the first consumer that would give them meaning.
- **Doc drift:** [database_structure.md](file:///c:/Fred/Coding/SK/docs/database_structure.md) lists
  `participating_org_ids` and `sport_ids` as columns on `events`; they are actually the
  `event_sports` and `event_organizations` join tables
  ([init-db.ts:244](file:///c:/Fred/Coding/SK/server/src/scripts/setup/init-db.ts#L244)). Fix when
  this feature touches the schema.

---

## 13. Open questions

Rebuilt after review round 3, then narrowed again by the UI review (2026-08-30). Thirty-three
decisions are recorded above; one question remains here, and three more sit in
[docs/tournaments-ui.md](file:///c:/Fred/Coding/SK/docs/tournaments-ui.md) §17.

1. ~~**Points by placing**~~ — **answered.** The data model settles it as a *mode* of the shared
   scoring system rather than a sibling: a division scores either by result or by placing, and both
   feed the same standings engine, weighting and roll-up. See
   [docs/tournaments-data-model.md](file:///c:/Fred/Coding/SK/docs/tournaments-data-model.md) §10.
2. ~~**Which formats get a v1 interface**~~ — **answered in the UI review.** All four are in scope
   for v1. The sequencing is `Festival` and `RoundRobin`, then `Knockout` and `PoolsKnockout` on a
   round-by-round list rendering (which is the narrow-screen view in any case), then the bracket
   graphic on wide screens. The expensive part of a knockout is the progression, not the drawing,
   and it arrives with the second step. See
   [docs/tournaments-ui.md](file:///c:/Fred/Coding/SK/docs/tournaments-ui.md) §14.
3. **Venue Location `TODO`** — does D16 (show venue and facility together) close the parked item,
   or only its tournament half? ([§12](#12-related-parked-work))

Everything else has an answer. The concrete tables and types that implement these decisions are in
[docs/tournaments-data-model.md](file:///c:/Fred/Coding/SK/docs/tournaments-data-model.md).

---

## Appendix: what exists today

So that implementation starts from an accurate picture rather than this document's proposals.

| Piece | State |
|---|---|
| `EventType` incl. `SportsDay`, `Tournament` | [Event.ts](file:///c:/Fred/Coding/SK/shared/src/models/event/Event.ts) — the two container types are identical in behaviour |
| Event persistence, sports + orgs | [EventManager.ts:105](file:///c:/Fred/Coding/SK/server/src/managers/EventManager.ts#L105) — join tables, works |
| Create screen | [create.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/[orgId]/events/create.tsx) — one 945-line screen for all three types |
| Event detail | [[eventId].tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/[orgId]/events/[eventId].tsx) — Schedule / Standings / Settings tabs |
| Adding a fixture | [games/new.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/[orgId]/events/[eventId]/games/new.tsx) — one at a time |
| Standings | [standings.ts](file:///c:/Fred/Coding/SK/shared/src/utils/standings.ts) — pure, works, supports the org roll-up; **assumes exactly two participants** |
| Game ↔ season link | `game_seasons` join table + `ADD_GAME_TO_SEASON` + season-screen UI — **the many-to-many D21 needs already exists**, but is only reachable from the league side |
| `Game.participants` | already an array of `GameParticipant`; N competitors is representable |
| `game_participants` columns | `team_id` **and** `org_profile_id` (both nullable), `status` incl. `disqualified` / `did_not_start`, `sort_order` — a race is already modellable |
| `SportParticipantType`, `MatchTopology` | declared, persisted, validated, **admin-editable — and read by nothing**. Logged as `SPORT-10` |
| Final-score override | [DynamicScoringPanel](file:///c:/Fred/Coding/SK/expo-app/components/sports/shared/DynamicScoringPanel.tsx) offers it on a finished game; `updateFinalScore` takes `{ [participantId]: number }` — already N-shaped, not home/away |
| Points config | `Event.settings.pointsPerWin/PerDraw` read with 3/1 defaults; **no UI writes them** |
| `pointSystem`, `levelWeighting` | declared in `Event.settings`, **never read anywhere**; superseded by D18 |
| Divisions, stages, generation, scheduling, progression | **do not exist** |
