# Tournaments — UI Design

**Status:** Settled — nothing open. Four review rounds: round 1 on 2026-08-30 (34 comments, 29
questions), then rounds 2, 3 and 4 on 2026-08-31 closing the remainder and the parked work in §16.
Forty-eight decisions recorded — `U45`-`U47` were added on 2026-09-10 and `U48` on 2026-09-13,
from the first sustained use of the Setup tab (§7). Ready to build.
**Implements the surfaces for:** [docs/tournaments.md](file:///c:/Fred/Coding/SK/docs/tournaments.md)
and [docs/tournaments-data-model.md](file:///c:/Fred/Coding/SK/docs/tournaments-data-model.md).
Ids `D1…D33` refer to the feature spec's decision table; `U1…` are decisions about the interface.
**Related:** [docs/design_spec.md](file:///c:/Fred/Coding/SK/docs/design_spec.md) — navigation model,
creation wizards, save UX, list-card conventions.

---

## Purpose

The feature spec settles what a tournament *is*; the data model settles how it is stored. Neither
says what the organiser, the convenor or the visiting school actually sees, and that is the gap
this document closes — from where a tournament is found in the first place (§2) down to what a
single fixture side renders when nobody yet knows who is playing (§10.1).

It is worth its own review round rather than being folded into the spec, because the interface is
where the phasing decision (D12) actually bites. The model must admit every format; the screens do
not have to arrive at once, and choosing which arrive first is a judgement about UI cost rather
than about the schema.

### What we are designing for

Four people, and they want different things from the same tournament:

- **The host organiser** builds it — divisions, entrants, fixtures, schedule — over several weeks,
  then runs it on the day. They may be an org admin, or a member the admins named for the job.
- **The convenor** was handed the netball (D22). They care about six fixtures and their results,
  and everything else on the screen is noise.
- **The visiting school** has eight fixtures out of sixty. They want to know when they play, where,
  and to pick their teams.
- **The coach, the parent, the spectator** wants one team's next fixture and its score, and does not
  belong to the hosting org at all.

The current event screen serves the first, and only while you are standing in the hosting org's
workspace.

---

## What the code already settles

Three facts, checked rather than assumed, because two of them close questions that looked open.

**The events list already gathers tournaments an org merely attends.**
[EventManager.ts:59](file:///c:/Fred/Coding/SK/server/src/managers/EventManager.ts#L59) returns
events where the org hosts it, **or** appears in `event_organizations`, **or** has a team playing a
game in it. So "where do we see the tournaments we are involved in" already has an answer — the
existing org events list at
[events/index.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/[orgId]/events/index.tsx). What is
missing is that the card never says *which of the three* you are: `isEventOwner` is computed at
[index.tsx:377](file:///c:/Fred/Coding/SK/expo-app/app/admin/[orgId]/events/index.tsx#L377) and used
only to choose a route.

**That screen already holds the game-level data too.** The `org:{orgId}:events` room pushes
`EVENTS_SYNC` **and** `GAME_SUMMARIES_SYNC` on join, and the list already renders a `SingleMatch` as
its one game. So the events-versus-games split in §2 is a presentation decision over data the screen
is already receiving, not a new fetch.

**Editability is a single boolean, and it is about to stop being one.**
`canEdit = event.orgId === orgId`
([[eventId].tsx:69](file:///c:/Fred/Coding/SK/expo-app/app/admin/[orgId]/events/[eventId].tsx#L69)),
and [matchPermissions.ts](file:///c:/Fred/Coding/SK/expo-app/utils/matchPermissions.ts) applies the
same workspace rule per game. D22, D31 and now D33 break that shape completely. This is the largest
single consequence of the feature spec on the interface, and §3 and §4 are about it.

---

## UI decisions

Recorded in place in the section each belongs to. This table is the index.

| | Decision | § |
|---|---|---|
| **U1** | Tournaments live in the existing org events list. No new navigation destination. | 2 |
| **U2** | Events and Games are two tabs over one room, not two menu items. | 2 |
| **U3** | Every list has two framings — inside an org, and across everything. This work builds the first without foreclosing the second. | 1 |
| **U4** | A viewer's relationship to a tournament is a **set** of roles, not one value. | 3 |
| **U5** | The scope filter is multi-select chips, since an event can carry several roles at once. | 2 |
| **U6** | Fixtures filter at three levels — everything, my organisation, me — switchable in one tap. | 3 |
| **U7** | "My view" versus "All" is a general control on the tournament, not a per-role default. | 3 |
| **U8** | A convenor of exactly one division lands on it; of several, on the event. | 3 |
| **U9** | Capability flags are computed server-side. `participatesAsOrgIds` is dropped as client-derivable. | 4 |
| **U10** | The division permission check lives in `AccessManager`, beside the event and game checks. | 4 |
| **U11** | A tournament organiser may be a named non-admin member. One assignment mechanism, two scopes. | 4 |
| **U12** | That organiser has **full** rights over the tournament and none outside it. No exception list. | 4 |
| **U13** | A division is its own screen. | 5 |
| **U14** | Stages are navigation tabs within the division screen, each carrying a state sublabel. | 5 |
| **U15** | One collapse rule: a level with exactly one child renders inline and shows no picker. | 6 |
| **U16** | The implicit division is created silently with the tournament. | 6 |
| **U17** | The wizard creates the shell; the event screen carries a setup checklist. | 7 |
| **U18** | Copying an existing tournament is the first wizard question, with a choose-what-to-copy step. | 7 |
| **U19** | One layout for v1, with tab order and default tab keyed off phase. | 8 |
| **U20** | Reading the schedule survives a dropped connection; entering a result queues; generating does not. | 8 |
| **U21** | Entrants are entered on two axes — by division and by organisation. | 9 |
| **U22** | One shared fixture-side component renders all three entrant states, and is built first. | 10 |
| **U23** | Moving a fixture reuses the team-selection pattern: drag on web, tap-a-slot on mobile. | 10 |
| **U24** | The schedule is a filtered list on narrow screens and a grid on wide ones. | 10 |
| **U25** | Unscheduled fixtures get both a tray on the schedule and a filter on the fixtures list. | 10 |
| **U26** | Conflicts warn and never block, shown on the fixture *and* in a day-level panel. | 10 |
| **U27** | The bracket is a round list on narrow screens and a bracket on wide, from the same positions. | 10 |
| **U28** | Standings rows follow `scoringSubject`; a division selector scopes them, defaulting to all. | 11 |
| **U29** | Scoping to one division ranks its **entrants**, so two teams from one school are two rows. | 11 |
| **U30** | An override is marked quietly but discoverably — a subtle badge, the reason on tap. | 11 |
| **U31** | The regeneration dialog states the concrete cost in fixtures and results. | 11 |
| **U32** | `useLiveRoom` gains a batch reduce kind. | 12 |
| **U33** | Rooms are chosen by the screen's data needs, never by the viewer's role. | 12 |
| **U34** | `Festival` is the UI label as well as the stored value. | 13 |
| **U35** | The word **"Division"** is used in every slot that shows one — it is the general term, and divisions need not be sport × age group. | 13 |
| **U36** | The two tabs are named `Events` and `Games`, after the entities. | 13 |
| **U37** | All four v1 formats are in scope. The bracket *graphic* is sequenced last. | 14 |
| **U38** | A printable fixture list is parked, and is a feature in its own right. | 15 |
| **U39** | An event's `type` becomes required, and an unknown one raises an error rather than defaulting. | 16 |
| **U40** | A screen batch-subscribes to what it displays; the join push stays the load where the room *is* the screen. | 16 |
| **U41** | The invite picker is a debounced typeahead over a bounded search, not a list of every organisation. | 16 |
| **U42** | `GET_DATA_ENFORCE=true` is set **before** tournaments add their request types. | 16 |
| **U43** | The Setup tab saves as one form, through the app's floating save bar, not per section. | 7 |
| **U44** | Each setup step *is* a collapsible section, its heading pinned while it is open. No separate checklist. | 7 |
| **U45** | A tournament is created by naming it. No wizard — the Setup screen is the form. | 7 |
| **U46** | The setup sections follow the setup process. `Structure` is dissolved into Basics and What's being played (renamed `Sports & Divisions` by U50). | 7 |
| **U47** | A tournament has a **base site** and a **set of facilities**. The base site is where it is, not what it may use. | 7 |
| **U48** | The Setup tab is the checklist; every step is its own screen, saving itself. No accordion. | 7 |
| **U49** | The checklist says what it is, what each step is for, and which to do next. The tab carries a dot, not a count. | 7 |
| **U50** | A tournament always shows its division(s) — one included. The step is `Sports & Divisions`. Narrows U15, renames U46's section. | 6, 7 |
| **U51** | The tournament's sports are chosen first; each division plays one of them. Reverses U46's derivation. | 7 |
| **U52** | Every sport has at least one division and every division plays one of the tournament's sports. Choosing a sport creates its division; a sport with divisions cannot be removed; deleting its last division removes it. | 7 |

### Constraints carried in from the feature spec

Not re-opened here. Listed because each one dictates something about a screen.

| Spec decision | What it forces on the interface |
|---|---|
| **D3 / D8** | Everything generated is editable afterwards. Generation is an *action*, never a locked structure. |
| **D6** | A `Festival` computes both a per-division table and an organisation roll-up. |
| **D7 / D26** | Every rendering of a fixture side handles three states. |
| **D9** | Regeneration is an explicit, warned choice — never silent. |
| **D11** | Stages are visible to the organiser, not just present in the schema. |
| **D12** | The interface ships in phases. Which phases is §14. |
| **D16** | Venue and facility are named together wherever more than one venue is in play. |
| **D22 / D31 / D33** | A tournament, a sport and a division are each surfaces that can be handed to one person. |
| **D29** | An override must be visible *as* an override, not as quietly different data. |
| **D30** | Standings arrive from the server. The client stops calling `calculateStandings`. |

---

## 1. Two framings, and which one this work builds

Raised in review, and it reframes everything below it, so it goes first.

Every list in the app can be asked in two ways. **Inside an org** — "what is *this organisation*
involved in, and what is my role in it?" — which is what `/admin/[orgId]/…` answers. And
**across everything** — "what am *I* involved in?" — which spans orgs and has nothing to do with
which workspace you happen to be standing in.

A coach at Northcliff follows Parktown as a spectator, competes in an event hosted by St John's, and
administers their own club. The public tab bar is where that person lives; the org workspace is
where the same person goes to do a job for one organisation.

Today only the first framing exists for events. There is no cross-org "my events" anywhere in the
app, and [`app/(tabs)/index.tsx`](file:///c:/Fred/Coding/SK/expo-app/app/(tabs)/index.tsx) is still a
placeholder. Following an org is not built either.

> **Decided — two framings, and this work builds one of them.** The tournament work builds the
> **org framing** only: `/admin/[orgId]/events` and everything below it, scoped to what that
> organisation is involved in. The personal framing — my orgs, my events, the ones I follow, across
> every organisation — is a separate piece of work on the public tabs.
>
> **The constraint it puts on this work** is concrete rather than aspirational. The capability flags
> in §4 answer "what is *this user's* relationship to this event", which is a per-user-per-event
> question that has nothing to do with the `orgId` in the route. So they must be computed from the
> user's identity and the event, **not** from the workspace they are browsing — otherwise the
> personal list has to compute the same answer a second, different way. Getting that right now costs
> nothing; getting it wrong means rewriting it later.
>
> The relationship vocabulary in §3 is designed with `following` as a future member of the set, so
> adding it later is an extra flag rather than a new concept.

---

## 2. Finding a tournament

The list query is already right (see above), so this section is about what the list says, how it is
split, and how it is narrowed.

> **Decided — no new navigation destination.** Tournaments appear in the org's existing events
> list. [design_spec §2.1](file:///c:/Fred/Coding/SK/docs/design_spec.md) caps the bottom tab bar at
> five, and a tournament *is* an event; giving it its own destination would both press on that cap
> and split the fixture list into two places a user has to check.

### Events and games are two altitudes of one list

Raised in review: an events list and a games list answer different questions. The events list is the
higher altitude — *what are we involved in, and in what capacity* — while the games list drills to
the actual fixtures, who is playing and what the score is, and wants its own filtering down to the
games relevant to this user.

Both are true, and the current screen conflates them: it holds `events` **and** `gameSummaries`, and
renders a `SingleMatch` as its game while a tournament collapses to a single card standing for
sixty fixtures.

> **Decided — two tabs, one menu item.** `Events` and `Games` become tabs on the existing events
> screen rather than two entries in the org admin menu. Three reasons: both are already delivered by
> one room, so the split costs no new data; they are the same subject at two altitudes rather than
> two subjects, which is what tabs are for
> ([design_spec §2.4](file:///c:/Fred/Coding/SK/docs/design_spec.md)); and a second menu item spends
> navigation budget that the org workspace does not have spare.
>
> The same split recurs one level down — a tournament screen has a division list and a fixture list —
> so this is a pattern worth getting right once. The tab labels are part of the naming question in
> §13.

### Narrowing the list

> **Decided — multi-select chips, because roles overlap.** A user can be hosting a tournament,
> convening its netball, *and* coaching a team in it, all at once. So the scope control is a row of
> **multi-select filter chips** — Hosting, Convening, Attending — rather than a segmented control
> that forces one answer. This also settles where it lives: a chip row sits beside the existing
> `Upcoming / Past` toggle without becoming a second segmented control competing with the first.
> How it behaves in practice is worth revisiting once the real screen exists.

---

## 3. Relationship is a set, not a value

The interface has to distinguish things that today's single `canEdit` cannot, and a viewer can be
several of them at once:

| Role | Scope of edit | What they came to do |
|---|---|---|
| **Hosting** | The whole tournament | Build it: divisions, entrants, fixtures, schedule, scoring |
| **Convening** | The whole of one division (D31, widened 2026-09-03) | Run their sport |
| **Attending** | Their own teams and selections | Find out when we play, and pick the side |
| *(Following)* | Nothing | Watch. Not built — reserved in the vocabulary (§1) |

> **Decided — the card carries a set of flags.** An event card shows every role the viewer holds in
> that tournament, not the "most senior" one. Collapsing three roles into one label loses exactly
> the information the label exists to convey — a host who also coaches a team needs to see both,
> because they will use the screen for both.

### Filtering within a tournament

> **Decided — three levels, one tap apart.** Inside a tournament, fixtures filter at three levels:
> **everything**, **my organisation's fixtures**, and **fixtures I am directly involved in**. A
> visiting school opening a sixty-fixture sports day defaults to their own, but the control is
> visible and named, and moving between the three is one tap. A guest must never be unable to see the
> whole day, and must never fail to notice they are looking at part of it.

> **Decided — "My view" is a control, not a role.** The same idea generalises past fixtures: a
> convenor's "my view" is the divisions they run, a coach's is the fixtures their teams play, a
> host's is everything. Rather than three role-specific screens, there is one **My view / All**
> control on the tournament whose *contents* are derived from the viewer's role set. One mechanism,
> and it degrades correctly for someone holding two roles at once.

> **Decided — where a convenor lands.** On their division when they convene exactly one, on the
> event when they convene several. Combined with the control above, the landing screen is a
> convenience rather than a constraint — they can always get to the whole day.

---

## 4. Where the capability answer is computed

The client can derive hosting and attending. It **cannot** derive convening: division-organiser
assignments are new data that appears on no payload the client holds.

> **Decided — the server computes it.** Permission is checked server-side on every write in any
> case, so deriving the *display* answer anywhere else means maintaining a second implementation of
> the same rules — which we already do once, and pay for, in
> [matchPermissions.ts](file:///c:/Fred/Coding/SK/expo-app/utils/matchPermissions.ts).
>
> The payload-weight concern raised in the draft was overstated: the flags are a small fixed
> addition per event — a boolean and a list of division ids — not something that scales with the
> number of fixtures.
>
> **And it shrinks by one field.** `participatesAsOrgIds` is dropped: the event already carries its
> participating orgs and the client already knows the user's own, so the client can intersect the two
> itself. What is left is `{ canEditEvent, convenesDivisionIds }` on the event and a `canEdit` on
> each division. Per §1, both are computed from the user and the event, never from the workspace in
> the route.

> **Decided — the check belongs in `AccessManager`.** Beside the existing event and game checks
> rather than inside the new tournament managers, so there is one rulebook. The feature spec's §10
> still needs confirming against
> [okf/auth_control.md](file:///c:/Fred/Coding/SK/okf/auth_control.md) before either is built.

> **Built 2026-09-03 (Phase 4), with one change to the shape above: the flags are their own read,
> not a field on the event.** `{ canEditEvent, convenesDivisionIds }` is what the client gets and
> what this section asks for; where it arrives is different. A `canEdit` sitting on a division
> object would be published to `division:{id}` and `event:{id}` like everything else — and those are
> rooms, so one viewer's answer would be delivered to every other viewer of the same room, and any
> broadcast of that division would silently overwrite the flags in the client store.
>
> So: `get_data { type: 'event_capabilities', eventId }`, answered per socket from the identity the
> handshake proved, and a push to `user:{id}` when a grant changes. The client derives a division's
> `canEdit` as `canEditEvent || convenesDivisionIds.includes(divisionId)` — one field fewer on the
> wire than the draft, and no per-user data on a shared object.
>
> The confirmation this section asked for was done first, and it came back clean:
> `okf/auth_control.md` described three sources of authority (membership role, app admin, public
> tiers) and no event-scoped grant. Nothing in it had to change; it gained a fourth tier.

### The organiser need not be an admin

Raised in review, and it changes the permission model rather than just the interface: the hosting
org's admins can all edit the tournament, but they must also be able to **nominate a member of the
org who is not an admin** to organise it. The person who runs the sports day is often a teacher, not
whoever administers the app account.

> **Decided — one assignment mechanism, two scopes.** A tournament organiser and a division convenor
> are the same thing at different scopes: a named person granted edit rights over a container. So
> rather than an org-role change, both are per-event assignments — organiser *of this tournament*, or
> organiser *of this division*. That keeps org roles out of it entirely, which is right, because the
> grant is about one event and should end with it.
>
> Recorded in the feature spec as **D33**, since it extends D22 and D31 rather than sitting only in
> the interface.

> **Decided — the organiser has full rights over the tournament, and none outside it.** No exception
> list. Within the tournament they can do everything an org admin can — including deleting it,
> changing which orgs are invited, and appointing further organisers — and outside it they have
> whatever their ordinary membership gives them, which is usually nothing.
>
> This is safe precisely because the two grants have different sources. The hosting org's admins get
> their rights from *being admins*, not from an assignment, so an organiser cannot revoke them; any
> admin can withdraw an organiser at any time, and the grant ends with the event. The asymmetry that
> would make "full rights" dangerous — an appointee able to lock out the people who appointed them —
> cannot arise.
>
> Note this leaves the *division* convenor as the genuinely narrow role (D31, fixtures and results
> only). Event-level and division-level are the same assignment mechanism (D33) with very different
> scopes, which is the intended shape rather than an inconsistency.

> **Decided 2026-09-20 — a third scope: one sport of the tournament.** "Who runs the netball" is a
> real job at a schools tournament and had no home: the two existing scopes made it either the whole
> tournament or one age group of it, and appointing somebody to each netball division in turn was
> correct only for as long as the draw stood still.
>
> So the sport scope is stored as a **rule** — a row on `(event, sport)` — and not as a list of
> divisions. It covers a netball division added tomorrow, and stops covering one moved to hockey,
> with no row touched either time. That property is the reason it exists; a fan-out into
> `division_organizers` would have been the same feature with a staleness bug built in.
>
> **What it carries**: everything a convenor of every division of that sport holds, plus the two
> things a convenor deliberately does not — the division's own record, and **adding and deleting
> divisions** of their sport. They appoint within their sport (co-organisers of it, convenors of its
> divisions) and withdraw only the people they appointed, exactly as a convenor does.
>
> **Where it stops is the useful part, and all three are decisions about the *tournament* rather
> than about the sport**: they cannot move a division to another sport (it would walk a division out
> of their reach or somebody else's into it), cannot delete their sport's **last** division (that
> would take the sport out of the tournament — U52), and cannot make an event-scope appointment. The
> first is refused in the gate, the second in the handler, because "is this the last one" is a fact
> about the rest of the tournament rather than about the payload.
>
> **Called "organiser", not "convenor"**, so the two narrow scopes stay distinguishable in speech:
> "the netball organiser" runs the sport, "the netball U14 convenor" runs one division of it.
>
> Appointed on **Sports & Divisions**, in the group that already lists each sport's divisions —
> folded behind a summary line, because that screen is a list of sports and a picker under each one
> would bury what the screen is for. It is also the one screen a sport's organiser opens for their
> own job, so it admits them: they see their sports and the divisions under them, and not the chips
> that decide which sports the tournament plays, nor the setup-flow footer.

---

## 5. Structural depth

We go from `Event → Game` to `Event → Division → Stage → Game`.

> **Decided — a division is its own screen**, at
> `/admin/[orgId]/events/[eventId]/divisions/[divisionId]`. A division is in effect a tournament
> within a tournament, with its own format, venues, entrants and table, which on its own justifies a
> screen. It is also the unit of delegation (D22/D31), so a convenor needs a link that can be sent to
> them. The event screen shows a scannable division list as the entry point.
>
> Where a tournament has only one division, the division screen falls away and the tournament's own
> venues, format and settings apply directly to it — which is §6.

> **Decided — stages are navigation tabs within the division screen.** Per
> [design_spec §2.4](file:///c:/Fred/Coding/SK/docs/design_spec.md), navigation tabs are for
> switching between section views of one screen, which is exactly what "Pools" and "Knockout" are —
> phases of one division rather than separate destinations. The app already has the piece that makes
> this good: `TabItem` gained an optional `sublabel` under `SCORE-10` for the scoring stepper, so each
> stage tab can carry its own state — "Pools · complete", "Knockout · 4 of 7 played" — and the
> organiser sees where the division has got to without opening anything.

---

## 6. Collapsing the degenerate cases

A single-sport tournament has one division and the organiser must never meet the concept. The same
applies to a `Festival` division with a single stage.

> **Narrowed 2026-09-19 (U50): for divisions, only the layout collapses now — the concept does
> not.** Setup always lists the division, one included, and the organiser sets it up. The reasoning
> and what survives are in §7 under U50. Everything below stands as written for **stages**, and for
> divisions wherever it describes rendering rather than vocabulary.

> **Decided — one collapse rule, applied everywhere.** **A level with exactly one child renders that
> child inline and shows no picker for it.** One division → the event screen *is* the division
> screen, and the tournament's venues, format and settings are the division's. One stage → no stage
> tabs. The concept appears at the moment a second child does.
>
> **And the appearance is announced.** When adding a second division or stage restructures the
> screen, tell the user that is what will happen rather than letting the layout change under them.
> The exact treatment is worth settling against the real screen; the principle is that a structural
> change is never a surprise.

> **Decided — the implicit division is created silently.** With the tournament, not lazily on the
> first fixture. It is the simpler rule everywhere downstream, and an empty division row beside an
> empty tournament row costs nothing.


> **Built 2026-09-03 (Phase 5), with one deliberate widening.** The rule is
> [`isCollapsed`](file:///c:/Fred/Coding/SK/shared/src/utils/collapseRule.ts), with tests, and it
> collapses **nothing as well as one** — a tournament with no divisions yet must not render a picker
> over an empty list either. The inline case and the routed case mount the *same* component
> ([DivisionPanel](file:///c:/Fred/Coding/SK/expo-app/components/tournament/DivisionPanel.tsx)), which
> is what stops "the event screen *is* the division screen" from becoming two renderings that drift.
>
> The announcement is a confirmation before the write, and it **names the existing child** —
> "the existing division is called *u14 Rugby*; you can rename it once both are visible" — because
> that name is about to appear on screen having never been seen. Adding a division routes straight to
> the new one, so the restructure is followed rather than merely announced.
>
> The implicit division is created **with its stages too** (D11), derived from the format:
> `PoolsKnockout` is the one format that is genuinely two stages, and so the one that shows tabs on
> the day it is created. That also narrows `PEOPLE-3` — a division that is never stageless is a
> division whose fixtures always have a stage to belong to.

---

## 7. Setup is a checklist, not a wizard

[design_spec §5.2](file:///c:/Fred/Coding/SK/docs/design_spec.md) prescribes multi-step wizards for
complex creation, and the current
[create.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/[orgId]/events/create.tsx) was a 945-line
screen doing that for all three event types — two of which are now one (D1).

A tournament does not fit that shape, because it is not built in one sitting. The name and dates are
known in March; entrants confirm through April; fixtures follow; the schedule is done the week
before. A wizard that must be completed before it produces anything is the wrong container for work
that spans weeks.

> **Decided — the wizard creates the shell, the event screen carries a checklist.** The wizard takes
> name, dates, format, venue(s) and participating orgs. The event screen then shows a visible
> **setup checklist** — divisions defined, entrants complete (3 of 5 divisions), fixtures generated,
> schedule assigned, scoring configured — giving the organiser a resumable state, telling them what
> is outstanding, and putting "generate fixtures" and "auto-schedule" in context as checklist actions
> rather than buried in a settings tab. It also makes the phased UI legible: a format with no
> generator simply shows "add fixtures by hand" on that step.
>
> Steps that do not apply must be dismissible, or an organiser who genuinely wants no points system
> is nagged forever.

> **Built 2026-09-03 (Phase 5) as a scaffold with real steps, two of which act.** The container, its
> progress count and its dismissal are done; structure and organisers are live; entrants, generation
> and scheduling say what they are waiting for rather than offering a button that does nothing, and
> fill in over Phases 6-8. Dismissal is stored on the **event**, in
> `settings.dismissedSetupSteps`, not per viewer — a step that does not apply does not apply for
> anybody organising it, and the alternative nags every co-organiser separately. Dismissed steps are
> counted and restorable, so putting one away is not the same as losing it.

> **Revised 2026-09-07 — the checklist gets its own tab, and every step is a link.** The first
> real use found the checklist saying what was outstanding without saying *where*: three of six
> steps had no action at all (Structure, Schedule, Scoring), the details form sat under a tab
> called Settings that nobody looking for "where do I fill this in" would open, and the whole thing
> sat above the schedule where a convenor or a visiting school had to scroll past it. Three changes:
>
> - **A `Setup` tab** holds one section per step in the same order — Structure, Entrants,
>   Fixtures, Schedule, Scoring — each showing what is already there and offering the input. The
>   `Settings` tab is gone: its contents were setup, and the danger zone sits at the bottom of
>   Setup, which is the last place you go for a tournament.
> - **The checklist is a sticky stepper, not a card.** The first cut put the steps in a card at the
>   top of the tab, each with its status and a line of detail — and reaching the next step meant
>   scrolling back up every time. So the steps are one compact row pinned under the tabs
>   ([SetupStepper.tsx](file:///c:/Fred/Coding/SK/expo-app/components/SetupStepper.tsx)): a
>   done / to-do mark and a label per step, a `2/5` count, the current section highlighted from
>   the scroll position, and a tap that scrolls to the section. The detail that used to sit in the
>   card ("3 divisions · 2 organisers", "Using the default 3 / 1 / 0") now heads the section it
>   describes, beside the "Doesn't apply" control that dismisses the step. Dismissing hides the
>   section too, and a restore list at the bottom of the tab brings it back. This is still U17 —
>   the order is natural, nothing enforces it, and a step is done by the state of the data, never
>   by having been visited.
> - **"People running it" is no longer its own step.** Organisers are part of the structure, so the
>   Structure section holds the details form, the division list with "Add a division", and the
>   organiser picker, and the step's detail reads `3 divisions · 2 organisers`. Per-division
>   convenors stay on the division screen.
> - **Scoring is a real input.** The step used to test a `pointsPerWin` key that nothing wrote and
>   the server never read. It now edits `settings.scoring` — the key
>   [TournamentManager.resolveScoringConfig](file:///c:/Fred/Coding/SK/server/src/managers/TournamentManager.ts)
>   actually reads, with the 3 / 1 / 0 default (D17) shown until the organiser saves their own.
>   A change now rebuilds every table under the event immediately (`FIX-14`, closed 2026-09-08);
>   it used to take effect only on the next recorded result, so a morning of results kept showing
>   the old points.
>
> The Schedule tab keeps the division list and fixtures and nothing else, which is what the people
> who are not organising want from it.

> **Revised 2026-09-08 — one save for the tab, not one per section (U43).** Setup shipped with a
> `Save Changes` button under Details and a `Save Scoring` button under Scoring, which made it the
> only admin screen in the app that does not use the floating save bar every other edit screen has
> — and it warned about unsaved changes on the way out while offering no way to discard them. Both
> buttons are gone. The sections are cards in one form, dirtiness is the whole form's, and
> [`<FloatingSaveBar>`](file:///c:/Fred/Coding/SK/expo-app/components/FloatingSaveBar.tsx) carries
> the Save and the Cancel — the same reset that `useUnsavedChanges` now runs when the leave dialog
> is answered with "discard". Three consequences worth naming:
>
> - **One write, not two.** Details and scoring go in a single `UPDATE_EVENT`. Two buttons meant
>   two writes to the same row whenever both had changed, ordered by the connection pool.
> - **The bar is not scoped to the tab.** The form lives on Setup but the edits belong to the
>   tournament, so switching to Schedule with changes pending leaves the bar up rather than hiding
>   the only control that can save or discard them.
> - **Confirming the defaults needed its own affordance.** The Scoring step is done once
>   `settings.scoring` exists, but an untouched 3 / 1 / 0 form is not *dirty* — it already matches
>   what the server would use — so a purely dirtiness-driven bar could never complete the step. A
>   **Use These Defaults** button in the scoring card marks the form dirty and the bar writes it,
>   which keeps one save path rather than reintroducing a second one.
>
>   **Revised 2026-09-24 — `Next` confirms the defaults.** The button made accepting the defaults
>   cost two presses (confirm, then Save), and the bar never went away afterwards: the flag cleared
>   only when the saved points changed, and saving 3 / 1 / 0 over a 3 / 1 / 0 default changes
>   nothing. It is gone. Pressing `Next` on the Rules & scoring step now writes the scoring
>   system when the event has none yet, because moving on is the organiser accepting what they see;
>   `Back to the checklist` does not, so a look without a decision stays possible. The card offers
>   **Reset to Defaults** only when the boxes differ from 3 / 1 / 0, and resetting is an ordinary
>   edit — the save bar appears if what is saved is not the defaults.

> **Revised 2026-09-08 — the steps are the sections (U44).** With one save bar, what was left was
> a tab that read as an undifferentiated column of inputs: the seam between one step's work and
> the next was a line of small caps, and Structure's seven fields sat directly against Entrants'
> single sentence. Each step is now a collapsible section
> ([`<AccordionHeader>`](file:///c:/Fred/Coding/SK/expo-app/components/Accordion.tsx)) — collapsed,
> the rows *are* the checklist; expanded, the row is the heading of the work.
>
> **This is not the checklist card returning.** The card (the first cut, revised a day later) put
> the summary and the content in two places and made you travel between them; the sticky stepper
> fixed the travelling by pinning the summary. An accordion removes the second place altogether,
> so there is nothing to travel to. Which is why the stepper goes: five chips with done/todo ticks
> above five rows with done/todo ticks is the same checklist twice. All that survives it is
> `<SetupProgress>` — the `2 of 5 done` count, the one thing the rows do not say.
>
> - **The open section's heading is sticky.** Structure expanded is taller than a phone screen, and
>   closing it should never mean scrolling back up to find its row. This is why the component is a
>   *header* rather than a wrapper around its content: `stickyHeaderIndices` pins a `ScrollView`'s
>   direct children, so the heading and its panel must be siblings, and the Setup tab gets its own
>   scroll so the indices address the sections and nothing else.
> - **Several sections may be open at once.** One-at-a-time would close Structure — unsaved edits
>   and all — the moment you opened Scoring to confirm the defaults. The first unfinished section
>   is opened on arrival, once; a step completing under an organiser must not reshuffle what is
>   open beneath their hands, the same rule the default tab follows.
> - **A collapsed section with unsaved edits carries a dot.** With one bar for the whole form,
>   "You have modified this tournament's setup" would otherwise point at something you cannot see.
> - **The prose moved inside.** Every section used to spend three lines — label, state, and a
>   static sentence describing it — before the first input, five times over. The row keeps the
>   label and the state; the description and the "Doesn't apply" control are read inside the open
>   section, where they are of use.
>
> Two columns on a wide screen is the obvious next move and is deliberately not in this change —
> `UI-4`.

> **Corrected 2026-09-09 — the row says its state in a word, and the pinned row stays on top.**
> Three things the accordion got wrong on first use, all of them in the header row:
>
> - **The completion mark read as a radio button.** A leading `checkmark-circle` / `ellipse-outline`
>   pair meant four of five rows opened with an empty circle in the leading slot — which is the
>   universal shape of *pick one of these*, an invitation to choose between the five sections
>   rather than a report on them. The circle is gone. State is now a word next to the chevron —
>   `✓ Done` or `To do` — which cannot be mistaken for a control, and does not carry its meaning
>   in colour alone.
> - **The detail line was green when done**, at 1.67:1 on a light surface — failing
>   [§6.3](file:///c:/Fred/Coding/SK/docs/design_spec.md) twice over, once as contrast and once as
>   colour doing a word's job. It is information ("3 divisions · 2 organisers"), so it is now
>   neutral in both states, and §1.1 gains the light-mode green swap the cyan rule always had.
> - **Rows appeared above the pinned header.** `py-6` sat on the `ScrollView` rather than on its
>   content, and a sticky row pins to the top of the *padding* box — leaving a 24px band that is
>   still inside the clip region, where passing content showed above the header it was supposed to
>   disappear under. The padding moved to `contentContainerStyle`, so the gap scrolls away with the
>   content and the header docks flush beneath the tabs.
> - **And then the headers piled up on one another.** With the band closed, the next fault was
>   visible: Entrants' row slid *over* Structure's and sat on top of it, so the pinned line was
>   whichever header had arrived last. A pinned row has to be **pushed off** by the row below it.
>   Native already did that — `stickyHeaderIndices` translates a header out of the way as the next
>   one approaches — but `react-native-web` implements the same prop as `position: sticky; top: 0`
>   on siblings of a single container, where every header pins to the same line and the later one
>   simply paints over the earlier. There is no prop that fixes this; the two platforms need
>   different trees, and the Setup tab now builds one. **Web** wraps each header *with* its panel
>   and makes the header `position: sticky` inside that wrapper, so the containing block — the
>   section's own bottom edge — shoves the header out exactly as the next arrives, with descending
>   z-indices on the wrappers because every `react-native-web` `View` is a stacking context of its
>   own. **Native** keeps the flat siblings and the indices. The rule is recorded on
>   [`<AccordionHeader>`](file:///c:/Fred/Coding/SK/expo-app/components/Accordion.tsx) and in
>   [okf/design_system.md](file:///c:/Fred/Coding/SK/okf/design_system.md), since it binds every
>   future accordion and not just this screen.

> **Corrected 2026-09-09 — an open section is one card, and the descriptions are gone.** Two
> faults, one cause: the row and its content were separate objects on the page.
>
> - **The section descriptions are removed.** "The prose moved inside" (2026-09-08) kept the
>   sentence and only changed where it was read — but a static line under every heading, five
>   times over, describes to an organiser who is already in the section the thing they can see.
>   The `setupSectionDescriptions` map is gone; the row's `detail` still reports where the section
>   *stands* ("One division · only your organisation runs it"), which is a fact about this
>   tournament rather than a description of the form. The "Doesn't apply" control stays inside the
>   open section, at its top right.
> - **The panel is the rest of the header's card.** The header was `rounded-2xl` on its own
>   surface, and the panel below it was a stack of `<GlassCard>`s on the same surface, separated by
>   a gap — two floating objects with nothing but proximity to say the content belonged to the
>   heading. An expanded row now drops its bottom radius and bottom border, and the panel repeats
>   the surface and closes it with `rounded-b-2xl`, so the section is a single card from heading to
>   last field. The groups inside it (**Details**, **Divisions**, the organiser picker) lost their
>   own card chrome and divide with a hairline `border-t` instead — a card inside a card was the
>   other half of the same mistake. Collapsed rows are unchanged: still a rounded card each.

> **Decided — copy first, and choose what comes across.** "Start from scratch / copy an existing
> tournament" is the first question in the create wizard, since last year's sports day is the best
> template for this year's. Copying then asks **what** to bring — structure, divisions, entrants,
> facilities, participating organisations and **the organiser and convenor assignments** — and
> collects what cannot be copied, chiefly the new dates. This closes the parked "make a copy of an
> event" item for tournaments; whether it closes it for a `SingleMatch` is a separate call.
>
> **Decided — the copy step offers, it never assumes.** Added 2026-09-01. Every element of the source
> tournament that *can* be carried across is offered as a choice, defaulted sensibly and overridable —
> including the people. Last year's netball convenor is usually this year's netball convenor, and
> making the organiser rebuild that list by hand because we guessed they would not want it is the same
> mistake in miniature that D8 and D9 rule out elsewhere: **generate to save labour, never to remove
> control.** The copy wizard is that principle applied to setup rather than to fixtures.
>
> Three things follow for the build:
>
> - **The choices have dependencies.** Entrants imply divisions; convenor assignments imply divisions.
>   Selecting a dependent element selects its parent rather than failing, and says so.
> - **A copied grant is a new grant.** `granted_by_user_id` records whoever ran the copy, not the
>   original grantor, and the appointee is subject to the same withdrawal by any admin. Copying access
>   is a deliberate act by someone who already holds it.
> - **Some things are never offered**, because copying them would be a falsehood rather than a
>   convenience: results, scores, standings, `division_adjustments`, and scheduled times, which belong
>   to dates that no longer apply. The *fixtures themselves* **are** offered, but for a `Festival`
>   only and defaulted off — settled in §17, since a hand-arranged draw is real work a generator
>   cannot reproduce.

> **Decided 2026-09-10 — a tournament is created by naming it, not by a wizard (U45).** This section
> argues that a tournament is not built in one sitting, and then left a seven-field form standing in
> front of it. [create.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/[orgId]/events/create.tsx)
> refuses to write anything until it has a name, a venue, a facility **and** at least one sport
> (`isFormValid`) — more than an organiser knows in March, the very month the argument above rests
> on. It then routes back to the **events list** on success, so the reward for finishing the form is
> to be put somewhere else and have to find the tournament again. The wizard was never the first
> stage of setup; it was a detour in front of it.
>
> Creating a tournament is now one prompt — **a name and a start date** — writing `name`,
> `type: 'Tournament'`, `format` (`Festival` by default, D1), `startDate` and `orgId`, and landing
> the organiser on the new tournament's Setup checklist. (Revised by U48: it landed them on the
> Setup tab with **Basics** expanded while the steps were accordion sections.) Everything else is entered
> where it will be edited for the next six weeks anyway.
>
> - **Not zero fields.** The row has to exist before a division, an entrant or a facility can point
>   at it, and the events list has to have something to show. One field, not seven.
> - **The quick-create modals survive the screen.** New venue, new organisation and new team are
>   genuinely useful mid-setup, and move into the sections that need them rather than being deleted
>   along with the form around them.
> - **Copy becomes its own entry point, not everybody's first question.** The two decisions below
>   still stand — copying offers and never assumes — but "start from scratch or copy?" is no longer
>   asked of someone who has already answered it by pressing *New tournament*. *Start from a previous
>   tournament* is a second action on the events list, and its choose-what-to-copy step is the one
>   part of setting up that genuinely is a wizard.
> - **`SingleMatch` keeps its form.** Two teams and a kickoff time is a different thing: entered in
>   one sitting, complete on save. `create.tsx` stops branching on `type` rather than being deleted.
> - **A half-built tournament needs no new status.** `Event.status` stays
>   `Scheduled | Cancelled | Finished`; the events card reads its setup state from the checklist the
>   Setup tab already computes — *"In setup · 2 of 5 done"* (six until U48 dropped `Schedule`).
>
> **Built 2026-09-10.** The prompt is on the events list; `create.tsx` is the match form only, and
> shrank from 960 lines to under 180 with the tournament path gone — which took three quick-create
> modals and a nomination modal with it that nothing had been able to open since `MatchForm` was
> extracted. The events card still shows no setup state; that is the one part of this decision not
> yet built.

> **Decided 2026-09-10 — the sections are the setup process, and `Structure` is dissolved (U46).**
> First real use of the accordion found the order arbitrary and the first section doing three jobs at
> once: `Structure` held the tournament's identity (name, dates, venue, sports), its shape
> (divisions), and two different kinds of organisation — the ones running it and the ones competing
> in it. That is why it carried seven fields and two pickers while `Entrants` carried one sentence,
> and why its `detail` line could only ever report on part of what it contained.
>
> Six sections, in the order the work is actually done:
>
> | Section | Holds |
> |---|---|
> | **Basics** | name, format, dates, base site, the facilities in play, tournament organisers |
> | **What's being played** | the sports; each division with its sport, age group and facilities |
> | **Entrants** | the organisations invited, then the teams entered — by division or by organisation |
> | **Rules & scoring** | points, tiebreakers, `scoringSubject` |
> | **Fixtures** | the draw |
> | **Schedule** | times and fields |
>
> - **Participating organisations move to Entrants.** Who competes is an entrants question, and
>   entrants are already entered *by organisation* as one of the two axes (U21), so the invite list
>   belongs beside them. It also gives that step a `detail` worth reading: *"8 invited · 5 have
>   entered"* is the number an organiser is chasing in April; *"12 entered"* is not.
> - **Organisers stay in Basics.** Who runs it is known with the name and the dates, it is a single
>   picker, and per-division convenors already live on the division screen as division-scoped grants.
>   The two are separated by what they answer, not by how they are stored.
> - **Scoring moves ahead of Fixtures.** It is a rule of the competition, settled with the divisions
>   that may override it, and it binds the moment the first result lands. Leaving it last is how an
>   organiser scores a morning on the defaults and only then changes them — the same failure `FIX-14`
>   fixed server-side, which the ordering should stop inviting.
> - **The divisions section is named for the work, not the entity.** U15 hides the word "division"
>   entirely when there is only one, so a section called *Divisions* would reintroduce the concept the
>   collapse rule exists to suppress. **"What's being played"** is true at both sizes: collapsed it
>   holds the sport and a *Split into divisions* action; expanded it is the list.
> - **Sports stop being asked twice.** The event carries `sportIds` and every division carries a
>   `sportId`, entered separately and free to drift — a tournament advertising hockey with no hockey
>   division in it. With more than one division the event's sports are **derived** from them and shown
>   as a summary; the picker appears only in the collapsed single-division case, where the chip *is*
>   that division's sport.
>
> **Built 2026-09-10**, with two things settled in the building:
>
> - **A derived list does not make the form dirty.** Every tournament created before this change
>   may already disagree with its own divisions, and a screen that comes up with an unsaved-changes
>   bar over something the organiser never touched is worse than a field that corrects itself: the
>   derived sports go into the payload of whatever save happens next, and nothing else.
> - **Dirtiness is now tracked per section.** One flag over seven fields was enough while they sat
>   in one section; spread across Basics, What's being played and Entrants it would have put the
>   unsaved dot on all three whichever one was touched. The form still saves as one (U43) — the
>   flags only decide which collapsed row is marked.

> **Decided 2026-09-10 — a tournament has a base site *and* a set of facilities, and those are two
> different questions (U47).** The Setup form still edits one `siteId` on the event, which reads as
> "the tournament happens here" and quietly implies "and nowhere else". Both halves are wanted, but
> they are not the same field:
>
> - **The base site is where the tournament is.** It is what the listing says, what a visiting school
>   reads, and the sensible default and first filter when picking facilities. `events.site_id` keeps
>   that meaning and no other.
> - **It bounds nothing.** The facilities in play are `event_facilities`, they may sit at other
>   sites, and a host borrowing the fields next door is normal rather than exceptional. A base site
>   that silently restricted the facility picker would make the common case impossible to express.
> - **A division narrows, or inherits.** `division_facilities` names the subset a division may use;
>   a division naming none may use any of the event's that support its sport — which is the cascade
>   [tournaments.md §7](file:///c:/Fred/Coding/SK/docs/tournaments.md) already decided and the model
>   already stores.
> - **Venue and facility are named together** wherever more than one site is in play (D16). This
>   decision is what makes that the normal case rather than the exception.
>
> **The general rule this settles: a division overrides, else it inherits.** It already holds for
> scoring (`division.settings.scoring` over the event's), for tiebreakers, and for the two grant
> scopes; facilities are the same shape, and every resource a division acquires later should be read
> the same way. It binds the interface as well as the data: a division with no allocation shows
> *"any of the tournament's fields"*, not an empty box, because inheriting is a state and blank is
> not.
>
> **Built 2026-09-10 — the server side existed and nothing could reach it** (`FIX-15`, closed).
> `event_facilities`, `division_facilities`, their manager methods, both actions and the permission
> gates were all in place from Phase 4 with no screen calling any of them. What the build added:
>
> - **A picker grouped by site**, base site first and marked as such, every other site the
>   organisation owns under it — which is the decision above made visible. It is not filtered by
>   the sport a facility supports: `supportedSportIds` is optional and mostly unset, so filtering on
>   it would hide real fields, and the sport rule belongs to the scheduler, which warns (U26).
> - **`facilityIds` on the division itself**, so the event screen can say where each division plays
>   without a query per row — and an empty list renders as *"any of the tournament's fields"*,
>   because inheriting is a state and a blank is not.
>
>   **2026-09-22:** on the Sports & Divisions list the row now gives a **count** in the sport's own
>   `facilityTerm` — *"U13 · 2 courts"*, or *"Any court"* when inheriting — on the same line as the
>   age group, so every row is two lines. The names ran to a third line, and are one tap away on
>   the division. The inheriting case says *any* rather than counting the tournament's facilities,
>   because those include the tuck shop and the parking.
>
>   The same list shows **who runs each division**, right-aligned on the name's line: the first
>   organiser and *+N* for the rest, or nothing when there is none. It is read per sport
>   (`sport_division_organizers`, gated like `sport_organizers`) rather than per division, and
>   re-read when the screen regains focus, since appointing happens on the division screen it pushes.
> - **A second write on the same Save.** Facilities live in their own table behind their own
>   action, so they go out beside `UPDATE_EVENT` rather than being folded into it. U43's "one save,
>   not two" is about two buttons racing over the same row, and this is one press.

> **Parked 2026-09-10 — officials as a schedulable resource.** Raised with U47, because the reason
> per-division facilities are wanted is that the generator can then place fixtures on them, and
> officials are the obvious next resource to place. They are not the same problem yet.
> [`GameOfficial`](file:///c:/Fred/Coding/SK/shared/src/models/event/GameOfficial.ts) is
> `{ gameId, orgProfileId, role }` — a person attached to a fixture that already exists. There is no
> pool of officials in play and nothing at division level. Reaching parity with facilities needs a
> set at event level and an optional narrowing per division, plus one dimension facilities do not
> have: **availability in time.** A field is there all day; a referee is there from eight until
> twelve and cannot take two pitches at once. Same shape, one dimension bigger.
>
> So the greedy scheduler ships with facilities first, and officials are modelled once organisers
> have run a real day with one resource type — the same sequencing §7 of the feature spec applies to
> the optimiser, and for the same reason: which constraints actually matter is not yet known.


> **Revised 2026-09-13 — the checklist is a screen, and so is every step (U48).** Setup came back
> from real use as *too busy*: six accordion sections on one tab, on a phone, with the whole form's
> worth of inputs behind them. It was also **already half-routed** — four steps expanded in place
> while `What's being played` and `Entrants` pushed to screens of their own, so the tab was neither
> one page nor a set of pages, and which it was depended on the row you tapped. The Setup tab is now
> the checklist and nothing else; every row opens a screen.
>
> This reverses U44 rather than refining it, and it is worth being exact about what was wrong with
> it. U44's argument was that a separate checklist makes you travel between the summary and the
> work, so the section should *be* the row. That argument holds only while both live on one scroll.
> Two screens do not make you travel — they navigate, with a back control, a history entry and one
> thing on screen at a time — and the density the accordion was managing was never fixed by it,
> only folded up.
>
> - **A top step-nav was considered and rejected.** It is the obvious shape and it fails twice: U44
>   already removed a horizontal chip stepper because five chips above five rows is the same
>   checklist twice, and six steps do not fit across a phone. The hub *is* the step list.
> - **`Schedule` is dropped.** Its status was hardcoded `todo`, so it could never complete and the
>   progress line could never read *Setup complete* unless the organiser dismissed it — a step that
>   exists to be put away is not a step. Times and fields are still entered on the fixture. It
>   returns when there is a grid behind it; its key is not reused, so an event that dismissed it
>   simply carries an entry that matches nothing.
> - **`Entrants` and `What's being played` route to the screens they already had.** Four new route
>   files, not six. Giving Entrants a second screen would have rebuilt the split this change exists
>   to remove, so the invite list moved *onto* it instead — and it writes on press there, with no
>   save bar, because every other control on that screen does and inviting a school is an act
>   rather than a form.
> - **The danger zone stays at the bottom of the checklist**, reached only by scrolling past every
>   step, which is where it has always been.
>
> **This reverses U43 for setup: a save per screen.** One bar for one form was right when the form
> was one tab; six screens sharing a save bar would mean a bar that follows you between screens
> writing fields you cannot see. Each screen now computes its own dirtiness, carries its own
> [`<FloatingSaveBar>`](file:///c:/Fred/Coding/SK/expo-app/components/FloatingSaveBar.tsx) and
> writes only its own fields — `UPDATE_EVENT` is a patch, so this is fewer fields written per save
> than before, not more. U43's real objection, *two buttons racing over one row*, is untouched:
> there is still exactly one save per screen. What does need saying is the new version of it —
> **`settings` must be spread on every write**, because `UPDATE_EVENT` replaces that column, and
> the scoring screen and the dismissal both live in it.
>
> - **`Next` names the step it goes to**, and saves first when the screen is dirty. A bare `Next`
>   over numbered steps would say the list is ordered and must be walked; naming the destination
>   makes it an offer. Routing it through the discard dialog instead would ask somebody who has
>   just filled a step in whether they want to throw it away.
> - **Back is always the checklist, never the previous step.** There is no `Previous`. An organiser
>   who came from the checklist to fix one thing is one tap from where they started.
> - **A step is still done by the state of the data, never by having been visited** — which matters
>   more now than it did, because a step with its own screen could plausibly have been marked
>   complete by leaving it. This is still U17.
>
> **What this deleted.** `<AccordionHeader>` and every consumer of it; the `stickyHeaderIndices`
> machinery and its flat-children-array constraint; the `position: sticky` web tree with its
> descending z-indices; the Setup tab's separate `ScrollView`; and the per-section dirty flags with
> the dot that marked a collapsed row holding unsaved edits — with a save per screen there is no
> unsaved state you cannot see. The event screen went from 2003 lines to about 1100. `UI-5`, which
> asked which of two collapsible components should survive, is closed by there being one.
>
> Two columns on a wide screen is still not in this change — `UI-4`, rewritten around the hub.


> **Decided 2026-09-19 — a tournament always shows its division, and the step is called `Sports &
> Divisions` (U50).** This withdraws half of U15 for divisions and the naming argument of U46 with
> it. Both rested on "a one-sport festival's organiser must never meet the concept", and in use that
> made setup *less* clear, not more: the process differed by size, an organiser running a small
> tournament never learned what a division was, and so had nothing to reason from on the day a
> second sport or age group arrived — the moment the old design introduced the word, a dialog, a
> previously invisible name and a restructured screen all at once.
>
> - **Every tournament has one division or more, and setup always lists them.** One division is a
>   row like any other: it opens its own screen, and the button under it always reads *Add a
>   division* — *Split into divisions* is gone, because nothing is being split.
> - **The step is named for what is on it.** *What's being played* existed to avoid the word
>   "division" (U46); with the word always on screen, the descriptive name wins.
> - **Both headings carry an info icon** ([`<FieldLabel>`](file:///c:/Fred/Coding/SK/expo-app/components/FieldLabel.tsx),
>   so they follow the one `showFieldHelp` preference). *Sports* holds the sentence that used to sit
>   under the chips; *Divisions* explains the concept — one competition within the tournament,
>   usually a sport at an age group, with its own entrants, fixtures, standings and fields.
> - ~~**Sports are always read off the divisions.**~~ *Reversed by U51, below.* U46 kept an editable chip picker for the
>   single-division case, where "the chip *is* the division's sport". With the division always
>   visible that is the same question asked twice on one screen, so the picker is gone and the list
>   is a summary at every size. The screen therefore has nothing to save and no floating save bar.
> - **A division's sport and age group are edited on the division's screen — which they never were.**
>   Building this found that neither could be set anywhere: the chips wrote to the division only
>   while it was the only one, so every second division read *No sport set* permanently. The
>   division screen now opens with a *Name* / *Sport* / *Age group* form, saved together. The name
>   used to sit behind a pencil in the header; it is an ordinary first field now, as a tournament's
>   is on Basic Info, and the header reads `{tournament} - {division}` like the setup steps.
> - **Sport and age group share a line, both as dropdowns (2026-09-20).** The age group was a row of
>   chips from the sport's list, which needed the full width and so pushed the two fields apart —
>   the pair that the automatic name is made of read as two unrelated sections. `AgeGroupPicker`
>   grew a `dropdown` variant (§B2 of [multi_sport_architecture.md](file:///c:/Fred/Coding/SK/docs/multi_sport_architecture.md)),
>   and the two now sit side by side, in the order the derived name puts them.
> - **A division's name can be left to the app.** Until the organiser types one, it is derived from
>   the sport and age group (`Rugby U14`) and follows them as they change; emptying the field hands
>   it back, with the derived name shown as the placeholder. Nothing is stored to say which kind a
>   name is: a saved name counts as automatic when it is one the app would have produced anyway —
>   the derived name, the tournament's name the first division is created with, or the
>   `Division 2` that *Add a division* hands out.
> - ~~**The server keeps `events.sportIds` equal to the divisions' sports.**~~ *Removed by U51.* U46 had the setup screen
>   write the derived list back "with whatever save happens next", and U48 then gave that screen a
>   save a derived list never triggered — so the write-back had silently stopped, and the
>   new-fixture form, which filters sports by the event's list, could not offer a second division's
>   sport. `ADD_DIVISION`, `UPDATE_DIVISION` (when it carries `sportId`) and `DELETE_DIVISION` now
>   sync it and publish `EVENT_UPDATED`. It is server-side because a convenor may change their
>   division's sport and may not edit the event (D33). Divisions with no sport say nothing: if none
>   has one, the event's list is left alone rather than emptied.
> - **What survives of U15 for divisions is layout.** The Schedule tab still shows a lone division's
>   panel inline rather than a list of one, pickers of one stay hidden (`games/new`, Entrants), and
>   adding the *second* division is still announced, because that is the add that restructures the
>   Schedule tab. A first or third division is added without a dialog. For stages U15 is unchanged.

> **Decided 2026-09-19, the same afternoon — sports and divisions move together (U52).** U51 got
> the direction right (sports first) and the removal rule wrong: moving every division onto a
> tournament's last sport was clever and destructive in the same step. The invariant now is
> **every sport the tournament includes has at least one division, and every division plays one of
> the tournament's sports** — held by the server, explained by the screens.
>
> - **No sport, no division.** A tournament created without a sport has no division, and
>   `ADD_DIVISION` is refused until one is chosen. The Divisions section says to choose a sport
>   first. This replaces U50's "every tournament has at least one division" with "every sport does".
> - **Choosing a sport creates its first division.** At creation (one per sport, named after it) and
>   whenever a sport is added later, if it has none. So a sport is never on the list with nothing to
>   play in, and the organiser meets the division the moment the sport exists.
> - **Divisions are grouped under their sport,** each group ending in *Add a {sport} division* — so
>   a new division's sport is where it was added rather than a question. Divisions from before U52
>   with no sport, or one the tournament does not list, sit in a group of their own to be put right.
> - **The sport chips save as they are pressed.** Choosing one creates a division immediately, which
>   a draft-and-save-bar model could not show honestly; the screen has no save bar again.
> - **A sport cannot be removed while it has divisions.** The server refuses, naming them. Pressing
>   such a chip opens a dialog listing its divisions with two ways out: delete them one by one from
>   their own screens, or delete them all there — which arms only once **every division has been
>   ticked by name**, with no select-all, because it is the most destructive action on the screen.
> - **Deleting a sport's last division removes the sport,** and so does moving it to another sport.
>   The division screen warns before either (*"This is the last Rugby division, so Rugby will also
>   be removed from the tournament"*). Removing every sport this way is the one route to a
>   tournament with no divisions, and it is a deliberate one.
> - **Divisions can be deleted** from their own screen, by event organisers (convenors may not — the
>   gate already said so). This closes `FIX-16`.
> - **The second-division announcement is gone from setup.** U15's dialog existed to introduce a
>   concept nobody had seen; with divisions visible from the first sport, and created by pressing a
>   chip, it announced nothing. The Schedule tab still lists divisions once there are two.
> - **Nothing moves divisions between sports automatically any more;** U51's single-sport move and
>   its confirmation are removed. The automatic name (`divisionAutoName`) stays shared code.
> - **Division names are unique within a tournament, ignoring case and surrounding space**
>   ([divisionName.ts](file:///c:/Fred/Coding/SK/shared/src/utils/divisionName.ts), with tests).
>   Two divisions may share a sport and age group — two U14 rugby pools — but not a name: "Rugby U14"
>   and "rugby u14" read as the same division in a draw or a table. The server refuses a duplicate on
>   `ADD_DIVISION` and `UPDATE_DIVISION`; the division screen checks as the name is typed, marks the
>   field and holds Save back, naming the division that already has it. The automatic name never
>   clashes: the second of a kind is `Rugby U14 - 2` (lowest free number, compared ignoring case),
>   a division keeps a numbered name while nobody else holds it, and *Add a {sport} division* and a
>   newly chosen sport use the same rule. A warning about two divisions sharing a sport and age
>   group was built the same day and taken out again; the name check is what matters.

> **Decided 2026-09-19 — a division's age group narrows the team list; it does not forbid.** Entry
> (U21) offered only teams matching the division's sport *and* age group, with no way past it, but a
> strong U13 side playing up or a school fielding a mixed team is normal. So both axes of the
> entrants screen now share one list
> ([DivisionTeamChoices](file:///c:/Fred/Coding/SK/expo-app/components/tournament/DivisionTeamChoices.tsx),
> rule in [divisionEntry.ts](file:///c:/Fred/Coding/SK/shared/src/utils/divisionEntry.ts), tested):
> qualifying teams first, then an **Other age groups (n)** control that reveals the sport's other
> teams. Entering one is the override — no dialog, since revealing them was the deliberate step —
> and it stays listed on both axes afterwards, tagged `U13 · other age group`, rather than dropping
> into the unexplained extras. **The sport stays strict**: a team of another sport is never offered.
> This is a screen rule only; the server has always accepted any team.

> **Decided 2026-09-19, later the same day — the tournament's sports come first (U51).** *Its
> removal and single-sport rules were replaced by U52 above; the direction stands.* This
> reverses the direction U46 set and U50 kept. Reading the sports off the divisions meant the
> division screen offered every sport in the system, and a tournament's list of sports was a
> by-product of whatever its divisions happened to say. Now the organiser chooses the tournament's
> sports first, on Sports & Divisions, and then sets up a division for each.
>
> - **A division plays one of the tournament's sports.** The division screen offers only those, as
>   a single choice with no way to clear it. The server refuses anything else on `ADD_DIVISION` and
>   `UPDATE_DIVISION`, except a division's *current* sport — a division from before U51 whose sport
>   the tournament does not list still shows it (marked *not in the tournament*) and can be saved.
> - **With one sport, every division plays it.** Nothing to choose, so nothing is asked: a division
>   added with no sport gets the tournament's only one, server-side, which also covers the implicit
>   first division. The division screen still shows the sport as a normal selected chip.
> - **Removing a sport a division plays.** If exactly one sport would remain, every division moves
>   onto it — the single-sport rule again, not a special case — after a confirmation that names each
>   division and the sport it is leaving; automatically named divisions are renamed to match
>   (`Rugby U14` → `Hockey U14`), hand-named ones are not. Otherwise the save is refused, naming the
>   divisions, because there is no way to guess which of the remaining sports each should move to.
>   The screen says so under the chips before the save is tried, and holds the save back.
> - **The server no longer writes the event's sports.** U50's sync from divisions is gone with the
>   direction it served; the new-fixture form reads `events.sportIds` and that list is now the
>   organiser's own answer. A tournament's sports step is done when the list has something in it;
>   the checklist row also counts divisions still without a sport.
> - **The automatic name is shared code** ([divisionName.ts](file:///c:/Fred/Coding/SK/shared/src/utils/divisionName.ts)),
>   because the server now renames divisions when it moves them and has to agree with the screen
>   about which names are automatic.
>
> Changing a division's sport after it has entrants and results is still unchecked — `FIX-17`, now
> reachable through a tournament narrowed to one sport as well as through the division screen.

> **Decided 2026-09-20 — a division's sport is fixed once teams are entered; its age group is not
> (`FIX-17`).** The undecided part was the *rule*, not the mechanism: refuse once fixtures exist,
> refuse once a result exists, or allow with a dialog naming what stops qualifying. Entrants were
> chosen because they are the earliest and plainest line — **you cannot enter a team without having
> decided what the division plays** — and because a rule an organiser can predict beats one that
> depends on how far into the day they are.
>
> - **Only entrants with a team count.** A placeholder (D7) is a label with no team, so it
>   contradicts no sport: a division holding nothing but *Winner of the regional qualifier* is
>   still free to change. `TournamentManager.updateDivision` refuses the rest, naming the count.
> - **The control says so instead of being refused.** The division screen replaces the sport
>   dropdown with the sport as plain text, and the reason goes in the field's **help**: *Fixed now
>   that 8 teams have been entered — remove them to change it, or add a division for the other
>   sport.* The organiser who wants hockey wants a hockey division, not this one emptied, so the
>   message names that rather than only saying no. It began as a permanent line under the field and
>   was moved (2026-09-20): the reason is guidance, true only while teams are entered and read
>   once, which is precisely the copy `<FieldLabel>` exists to fold away. Field help is on by
>   default, so it is still the first thing seen — it is now also dismissible by somebody who has
>   learned it, instead of sitting under the field on every later visit.
> - **Age group stays changeable, with a confirmation that counts.** The teams that no longer match
>   become age-group overrides — a state the entry grid already renders and tags, and one the
>   organiser resolves by swapping teams — so the screen asks rather than refuses, and says *3
>   entered teams are not U15*. Moving to *Any age* creates no overrides and so asks nothing. The
>   dialog is not `danger`: nothing is destroyed, and choosing the old age group again reverses it.
> - **The count comes off the roster**, through `teamAgeGroupId` on each entrant — derived, never
>   stored — so the screen can tell a matching entrant from an override without a teams lookup
>   per row.
>
> What remains is narrower than the original entry: a division with a **hand-added fixture but no
> entrants** can still change sport, since nothing was entered. Logged on `FIX-17` rather than
> folded in, because guarding fixtures is a different rule from the one decided here.

> **Revised 2026-09-20 — the entry grid (U53).** The two axes were right and their *rendering* was
> not: a full-width row per team is honest about one school's six teams and hopeless about five
> schools' thirty, and fifteen divisions in one tab strip is fifteen tabs nobody can scan. Nothing
> about the two-axes model changed; what changed is what a group looks like and how you get to one.
>
> - **The chip is the unit** ([EntrantTeamChip](file:///c:/Fred/Coding/SK/expo-app/components/tournament/EntrantTeamChip.tsx)),
>   and one component renders it on both axes. A column of chips reads as *a list belonging to a
>   school*, which is the shape the task has; a column of full-width bars reads as a wall.
> - **Columns on a wide screen, stacked sections on a phone** — reflowed by
>   [EntrantGrid](file:///c:/Fred/Coding/SK/expo-app/components/tournament/EntrantGrid.tsx), not
>   branched into two renderings. Column count is bounded by legibility rather than arithmetic:
>   fifteen invited schools cannot be fifteen columns on any screen, and two 140px columns on a
>   phone are worse than one clear list. Same breaks as `PaginatedList`, one step narrower.
> - **A group with nothing to offer sinks below the grid**, as a row of buttons. It cannot simply
>   be dropped, because the empty group is the only route to creating the team that is missing —
>   which is the entire reason the organisation axis exists — but nine of them between the
>   organiser and the six that matter is a wall of "nothing qualifying".
> - **The pill says whatever tells a division from its siblings**, which is not always the age
>   group ([divisionSiblingLabels](file:///c:/Fred/Coding/SK/shared/src/utils/divisionName.ts)). The
>   first cut labelled an ageless division *All ages*, and a tournament with two of them showed a
>   Rugby tab over two pills that both read *All ages* and named neither. The order is: a name
>   somebody typed (`Cup`, `Plate`) beats everything, since it was written to carry exactly this
>   distinction; then the age group, which unlike the name does not repeat the sport on the tab
>   above; then the automatic name, which does repeat it and is still better than a label that does
>   not distinguish. Computed for a sport's divisions **together**, because a clash can only be
>   seen at that level — an A/B split at one age (`Rugby U14` and `Rugby U14 - 2`) reduces to *U14*
>   twice by a different route, and only the labels that collide fall back to names, so one clash
>   does not turn `U13 U14 U15` into three repetitions of the sport.
> - **Sport, then age group** replaces the flat division strip. Fifteen divisions are not fifteen
>   unrelated things; they are three sports of five ages, which is how the tournament was built and
>   how an organiser holds it. Three tabs and five pills both fit a phone, so **no dropdown was
>   needed**. Each level collapses independently under U15. A division with no age group is *All
>   ages*; a sport whose divisions have none shows no age row at all.
> - **The organisation tabs carry the crest and the code** — `TabItem.leading` was added for it.
>   Crest alone would not identify, since most organisations have no logo and fall back to a
>   generic mark.
> - **`<Tabs scrollable>` now scrolls the active tab into view.** Scrolling solved the layout and
>   not the problem: a tab selected from elsewhere could be active and off-screen, which reads as
>   nothing being selected. Positions are measured per tab rather than estimated, because the tabs
>   are not equal width.
>
> **Replaced 2026-09-21 — the entry table (U54).** The grid was rebuilt a day earlier and was
> still the wrong shape, which the layers gave away: getting to a team was axis → sport → age
> group → organisation → chip, five levels before anything could be ticked. It is now **one row
> per competitor, a tick, and the division it plays in.** (The tick has since become the row
> itself — see below.)
>
> **The reason is not that the grid was ugly.** It asked *which teams for this division*, so "a
> team plays in one division" was a rule it had to defend — a server refusal, a dimmed chip naming
> where the team went, a Move-here dialog, and the whole tournament's roster threaded through three
> components so a chip could know it was taken. Asked the other way round, a competitor has **one
> division cell** and the invariant stops being sayable rather than being enforced. Moving a team
> is changing a dropdown. That deleted `EntrantGrid`, `EntrantTeamChip`, `DivisionTeamChoices`,
> `NewTeamModal`, the move dialog, and `divisionTeamOptions`/`divisionByTeamId` with their tests.
>
> - **The rows are every candidate team, plus every entrant that is not one of them**
>   ([buildEntrantRows](file:///c:/Fred/Coding/SK/shared/src/utils/entrantRows.ts)). One rule
>   instead of three special cases: team sports list their candidates whether entered or not, a
>   placeholder is an entrant with no team, and an individual sport has no candidates so its rows
>   are exactly what somebody added — nothing is prepopulated, and that falls out rather than being
>   coded for. It also keeps a team that is entered but no longer a candidate, which is a real
>   competitor and would otherwise vanish.
> - **Playing and Division cannot disagree.** Ticking Playing enters the competitor into its only
>   qualifying division, so "playing, but nowhere" — a state an entrant cannot be in, since an
>   entrant *is* a division's entrant — is unreachable. The division is plain text at one choice
>   and a dropdown at two or more (U15); most teams qualify for exactly one division, so most rows
>   carry no control.
> - **The override kept its deliberateness.** `divisionsForTeam` returns `qualifying` and `others`
>   — the same sport, another age group — and the dropdown lists the second group separately,
>   labelled. A flat list would turn entering a u13 side into the u14 division from a decision into
>   a mis-tap, which is what the grid's "Other age groups (3)" control bought.
> - **The two axes became filters.** Division and organisation narrow one list rather than
>   selecting between two layouts with two sets of controls. Neither is applied on arrival: a
>   filter you chose is easier to understand than one that was already on. Filtering by division
>   shows what *could* be in it as well as what is, because that is where entering happens.
> - **The tick became the row (2026-09-22).** On a phone the checkbox column, the page's side
>   padding and the cards' own left too little width for the division beside the name, so it sat
>   underneath and every row was two lines tall. Now the whole row is the control — pressing it
>   enters or withdraws the competitor — and a playing row is highlighted (an orange tint and left
>   edge) rather than ticked. The name and organisation are on the left, the division on the right,
>   and **a row that is not playing shows no division**: it says *Not playing*, with *Click to add
>   to tournament* under it (*Tap* on a phone) because nothing else on the row looks pressable — or
>   "No division" when there is nowhere it could play. The division dropdown is its own touchable,
>   so opening it does not toggle the row. On a phone the entrants screen's cards also run edge to
>   edge.
>
>   Under every name is the **sport and age group** — a team's own, or for a placeholder or person
>   the division it is in. The organisation is its **crest in a square on the far left**, as tall as
>   those two lines, with the name on hover (web) and in the row's accessibility label; it is no
>   longer repeated as text. A generic placeholder keeps an empty square so the names stay aligned.
>
>   A placeholder carries an amber **Placeholder** flag at the start of the line under its name
>   (beside the name it crowded the name out on a phone), so the slots still waiting for a team stand out in a scan — amber because orange
>   already means *playing*.
> - **One button adds what the tournament does not already offer**
>   ([AddEntrantModal](file:///c:/Fred/Coding/SK/expo-app/components/tournament/AddEntrantModal.tsx)):
>   a team that is not on the system, a placeholder, or a person in an individual sport. Sport and
>   organisation are **pickers bounded by the tournament's own**, pre-filled from the active
>   filters — the old dialog took both from the division that opened it and showed them read-only,
>   which only worked because it could only be opened from inside one.
>
> **A placeholder moves through `removeEntrantIds`**, a companion to `takeFromOtherDivisions`: it
> has no team to clash on, and its `division_entrants` row belongs to its division and carries the
> fixtures drawn against it, so a move is genuinely a delete and an insert. Naming the row keeps
> both inside one transaction.
>
> The **division panel** renders the same table narrowed to one division, so the convenor's screen
> and the organiser's cannot drift. It passes no tournament-wide roster — a convenor may not be
> able to join the event-level entrants room — so there a team already entered elsewhere is refused
> by the server with a message naming where it is, rather than being shown up front.

> **Revised 2026-09-21 — an organisation can be created wherever one is chosen.** The entrants
> screen's *Organisations → Add* could only search, so an organiser who found a visiting school
> missing had to leave, create it elsewhere, and come back. Once something is typed it now offers
> **Register “…” — not on ScoreKeeper yet**, whether or not the search found matches, because
> "St John's" may well match a different St John's and the organiser is the one who knows. The
> school is added to the tournament as soon as it exists — that is why it was registered.
>
> It uses [RegisterOrgModal](file:///c:/Fred/Coding/SK/expo-app/components/RegisterOrgModal.tsx),
> which also replaced two near-identical inline copies in the fixture screens. The directory's own
> *Add organisation* keeps its separate dialog on purpose: that one makes **you** its admin, where
> this one records a school somebody else runs and leaves it unclaimed. Merging them would blur the
> line the claim process exists to hold. The contact email is handed back rather than sent, because
> one caller invites straight away and another holds the invitation until its form is saved.

> **Revised 2026-09-21 — whose records the Add dialog may write.** Settled with the organisation
> gate (`PEOPLE-6`): you may create a team or a person in an organisation you run, **or in one
> nobody has claimed**, with only a name, sport and age group — because nobody else can, and an
> outsider doing it is a reason for somebody from that school to claim it. A **claimed** school you
> do not run is its own admins' to fill in.
>
> The dialog asks that question itself, from `OrgBadge.isClaimed` and the user's memberships, so it
> never offers a form the server will refuse. For a claimed school it says so and offers, in the same
> breath, the one thing that *is* open — **Add a placeholder for NHS** — because "you can't" without
> "but you can" is a dead end. For an unclaimed one it says the basics are welcome and the owner will
> fill in the rest. A person not yet on an organisation's roster is now **created** (name only) where
> the rule allows it, rather than being quietly recorded as a placeholder.
>
> **A placeholder is one of two kinds.** A *generic* one — *Winner of the regional qualifier* — has
> no organisation, because none is known. An *org-linked* one — *Northcliff's second team, TBC* —
> has one by definition, and the dialog makes the organisation compulsory for it. The column stays
> nullable only because the generic kind exists. Until this change the organisation was **dropped**
> on the way to the server, so an org-linked placeholder was stored exactly like a generic one: no
> crest, missing from its school's filter, and uncounted in its school's roll-up. The server now
> takes a placeholder's organisation, never a team's or a person's — those carry their own, and a
> payload cannot re-attribute Northcliff's team to Athlone by saying so.

> **Revised 2026-09-21 — the organisations card.** Three changes, and the middle one is a data
> model change rather than a label.
>
> - **"Organisations invited" is now "Organisations"**, because the list is who is *taking part*,
>   and "invited" invited the reading that it is a separate step before entering teams.
> - **The host is in the list, and can be taken out.** Participation was implicit for the host —
>   `event_organizations` held everybody else and every reader unioned `events.org_id` back in —
>   which left nowhere to record *a school running a tournament it does not play in*. An absent row
>   already meant "never added" and so could not also mean "removed". The host is now an ordinary
>   row, written at creation and backfilled for existing events, and `getEventCandidateTeams` reads
>   `event_organizations` alone — which is what makes removing it actually take its teams out of
>   the grid. See "Who is taking part in an event" in [okf/database.md](file:///c:/Fred/Coding/SK/okf/database.md).
> - **Adding is a control, not a permanent field.** The search box sat open on every visit, reading
>   as something to fill in and pushing the list — the card's actual subject — down the page. It is
>   an **Add** button beside the label now, and the box appears under it when pressed and closes
>   once an organisation is picked. Adding a school is done once or twice a season; reading the
>   list happens every visit.
>
> The host may also be **re-added**, which is why the search no longer filters it out. That filter
> was right while the host was always taking part and is wrong now: a host removed by mistake has
> to be findable again.

> **A team plays in one division of a tournament — and the taken chip is shown, not hidden.**
> Hiding it was the obvious reading of the rule and is the wrong one: an organiser who put a team
> in the wrong division goes to the right one, finds it absent, and has nothing on screen saying
> where it went. The mistake becomes unrecoverable at the place it was noticed. So the chip is
> dimmed, labelled *In U14 A — tap to move*, and tapping offers **Move here**.
>
> The rule is enforced in `setDivisionEntrants`, not only in the grid: this is a live multi-user
> screen, and two organisers on two devices would otherwise both succeed. **Move here is a flag on
> that write** (`takeFromOtherDivisions`) rather than a remove and an add, so one transaction
> cannot leave a team in no division at all. The vacated division is recalculated and republished
> in the same handler — it has viewers of its own, and it is the side nobody is looking at while
> the change is made. Moving a team out of a division that has drawn fixtures unresolves them,
> exactly as removing it by hand from that division always has; that is deliberately not a new
> refusal, since a Move stricter than the untick-then-tick it replaces would be a worse tool.
>
> The division panel a convenor reaches passes no roster, because the event-level one is a room
> they may not be able to join. There a double entry is refused by the server with a message naming
> the division that holds the team — worse than the chip, and correct.

> **Revised 2026-09-13 — the checklist explains itself (U49).** U48 got the *structure* right and
> left the page mute. Shown five headings under a progress bar, an organiser using it for the first
> time could not tell what the list was, what any row would ask for before opening it, or which to
> do next — and the only two numbers on screen disagreed with each other. Everything here is
> wording and affordance; no route, no room and no write changed.
>
> - **The count is said once, in one direction.** The Setup tab's badge read `2` — outstanding
>   steps, counting down — directly above a bar filling with *done* steps, counting up. Worse, a
>   bare number beside a tab label is read everywhere else as a count of unread things. The badge
>   becomes a **dot** (`dot` on [`<Tabs>`](file:///c:/Fred/Coding/SK/expo-app/components/Tabs.tsx)),
>   which asserts only that there is work here, and the page says *"3 of 5 steps done"* in words.
> - **The list is introduced.** A heading and one sentence, once, at the top — including the thing
>   organisers actually want to hear, that none of it has to be finished today. Everything under it
>   can then stay terse.
> - **Every step says what it is for, and wears an icon.** A row used to be a label and the state
>   of its data, so an unopened step was a heading with a status next to it. `purpose` lives beside
>   the label and route in
>   [setupSteps.ts](file:///c:/Fred/Coding/SK/expo-app/components/tournament/setupSteps.ts) and
>   shows until there is a `detail` to show instead.
> - **Every outstanding row is tinted, and the DONE / TO DO column is gone.** Five rows each ending
>   in a status word is the same word five times: it costs a column, it makes every row equally
>   loud, and "to do" as a *label* is noise on a list whose whole subject is what is still to do.
>   State moved onto the row's own surface — an outstanding step is tinted orange with a filled
>   orange medallion, a done one drops to the plain surface with a quiet green check and muted
>   text. *What is left* is then answered by the shape of the page before a word of it is read.
> - **A `Next up` card was built first, and removed.** The first cut put the first outstanding step
>   in an emphasised card above the list, repeated in its own place below. It worked, and it was one
>   signal too many: the card said *start here* while the rows under it said nothing, so the page
>   had a summary and a list again — the shape the checklist card already failed as three revisions
>   earlier, and the thing U44 removed a chip stepper for. Tinting the rows says the same thing with
>   no duplication, and says it about *every* outstanding step rather than the first only, which is
>   what somebody picking up a half-built tournament needs. The order is still not enforced (U17):
>   the tint marks where work remains, it does not sequence it.
> - **A third status, `default`.** `Rules & scoring` read *"Using the default 3 / 1 / 0"* and
>   **To do** at once, which told the organiser it was both handled and outstanding. It is neither:
>   3 / 1 / 0 is what the server will use (D17), so nothing is blocked, but nobody has chosen it,
>   so it is not done. It now reads `Defaults` and does not count toward the bar. It *is* tinted
>   like any other outstanding step — it is somewhere the organiser can still act — and the chip is
>   what says the competition is already scorable without it.
> - **The danger zone moves to an overflow menu in the header**, reversing U48's "it stays at the
>   bottom of the checklist". Two reasons: it belongs to the *event*, not to its setup, so living on
>   one tab of three made cancelling an event reachable from Setup and nowhere else; and ending a
>   set-up checklist on a red box offering to delete the thing being set up is a strange note to
>   finish on. [`<OverflowMenu>`](file:///c:/Fred/Coding/SK/expo-app/components/OverflowMenu.tsx) is
>   a modal rather than a popover — the header sits inside a tab strip and a scroll view, so a
>   positioned dropdown would be clipped by whichever ancestor hides overflow on whichever platform.
>   The confirmation modals that actually protect the record are unchanged.
> - **The date at the top is now a sentence.** It printed `startDate.split('T')[0]` — an ISO value,
>   unlabelled, beside nothing that said which date it was. It is written out, labelled `Takes
>   place` / `Runs`, and followed by how far off it is (`Sat 19 Sep 2026 · in 6 days`), which is the
>   half of "when" a date alone never answers.
>   [utils/dates.ts](file:///c:/Fred/Coding/SK/expo-app/utils/dates.ts) holds the formatting; it
>   parses through `new Date` rather than slicing the string, which is safe because the basics step
>   stores these at **noon UTC** precisely so no offset can drag them onto the neighbouring day.
>   **It became the app's one date formatter rather than a fifth.** Checking for an existing helper
>   turned up four renderings of the same idea, two of them one tap apart and disagreeing — the
>   events list card built its own range (`19 Sep 2026 – 21 Sep 2026`) while this header printed
>   raw ISO, the leagues screen showed a season as `2026-09-19 to 2026-12-15`, and three screens
>   each carried an identical copy of a fixture kick-off formatter. All are converted. The one
>   thing deliberately *not* unified is the kick-off separator, where the league screens say `@` and
>   the events list says `·` — that is a design call on five screens, not a refactor, and it is
>   `UI-13`.
>
> - **`Basics` is renamed `Basic Info`, and a step screen names its tournament.** A screen headed
>   only `Basic Info` does not say *whose*, which matters on a hub whose whole point is that you
>   arrive at it repeatedly from different tournaments. `<ScreenHeader>` gains a `context` prop and
>   reads `Fred's Test Tournament - Basic Info` on one line — **dropped to the title alone below
>   768px**, rather than wrapped to two lines or left to truncate. The full string does not fit a
>   phone, and `numberOfLines={1}` clips the *end*, which would keep the tournament and lose the
>   step. A stacked two-line version was built first and rejected as heavier than the problem: on a
>   phone the question barely arises, because you reached this screen by tapping a row on that
>   tournament's own checklist one screen back. 768px is the breakpoint
>   [selection.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/events/%5BeventId%5D/games/%5BgameId%5D/selection.tsx)
>   already uses and that `UI-11` names as the repo's precedent; the narrow branch is the default
>   before hydration measures the window, which is the safe way round. The rename also closed a
>   small trap: every step screen hardcoded its own
>   label twice — its `<ScreenHeader>` and its `<SetupStepFooter>` — so a step was named in three
>   files. They take it from `useSetupStepScreen().step` now, and
>   [setupSteps.ts](file:///c:/Fred/Coding/SK/expo-app/components/tournament/setupSteps.ts) is the
>   only place a step is named. (`entrants.tsx` predates the hook and reads `stepByKey` directly.)
>
> - **Basic Info's three date controls became one.** `Starts`, a full-width `Ends`, and a
>   `Runs over more than one day` switch *between them* were three sibling rows. They are not three
>   fields — they are one question with a shape switch, and the switch was in the one place it must
>   not be: severing the range it governs. At ≥768px the two dates now sit side by side with the
>   switch at the end of the same row, bottom-aligned to the inputs; below that the row stacks. Two
>   things worth keeping: a **date field is date-width** (190px), because a field's size is a
>   promise about its content and a date input spanning a desktop card promises a paragraph; and
>   fixing that width is also what stops `Ends` halving `Starts` when it appears, which two
>   `flex-1` fields would do under the cursor of somebody who has just filled `Starts` in.
>
> - **An end date is required once the tournament runs over more than one day — which fixed a save
>   bar that could never be dismissed.** Toggling the switch on made the form dirty
>   (`isMultiDay !== !!event.endDate`), but with no end date entered the save wrote `endDate: null`
>   over a column that was already null, so **no field changed**; the effect re-seeding the form is
>   keyed on the event's fields, so it never re-ran, `isMultiDay` stayed true, and the form stayed
>   dirty however many times Save was pressed. (`finishSave` clears the unsaved-changes store, but
>   the bar is `visible={isDirty}`, a computed value, so clearing the store does not hide it.) The
>   state was meaningless — a promise of a range with no range — *and* impossible to leave, so the
>   fix makes it unreachable rather than merely recoverable: **Save is blocked** while multi-day has
>   no valid end, and **the toggle seeds the day after the start**, so the state is almost never
>   entered. "More than one day" also means the end must be strictly **after** the start, not equal
>   to it, and that is validated. The general lesson is worth more than the bug: *a dirty flag must
>   be clearable by the save it triggers* — deriving dirtiness from a field the write does not
>   change produces a form that can never be put down.
>
> - **The site and its facilities became one section, and the vocabulary was settled.** They are one
>   question — *where does this happen* — but sat on opposite sides of a divider, `Based at` among
>   the name and dates and the facilities alone below. They now share a **Where** section. Two
>   naming decisions went with it, both of them restoring what the model already said rather than
>   inventing anything: the dropdown asked to "Select a venue" for something the glossary, the
>   table and the admin nav all call a **Site**; and "Fields in play" named a set that is mostly not
>   fields — the `category` values include shop, parking and restrooms, every facility carries a
>   `latitude`/`longitude`, and the tournament map is drawn from all of them. It reads **Tournament
>   Facilities** now, and the guidance lives in the field's `help` and nowhere else: *"Pick every
>   facility this tournament uses — the courts and fields it plays on, and the tuck shop, parking and
>   toilets people will look for. These become the pins on the tournament map."* The picker's
>   `emptyLabel` used to say the same thing a line below it and was dropped. `Sport.facilityTerm`
>   already existed for a sport that wants to say "pitch" or "lane" — a display override on top of
>   the general term, which is the shape that confirms Facility is the general term. The other
>   screens still saying "venue" are `UI-14`.
>
> - **Field guidance became dismissible, and that is now a house pattern.** The facilities
>   explanation is three lines that are necessary the first time and noise on a ninth tournament —
>   the standing conflict in admin forms, where the copy that makes a field learnable is the copy
>   that makes the screen unreadable once learned. `<FieldLabel>` keeps the text but folds it away
>   behind an info icon after the label: **shown by default, dismissible, dismissal remembered per
>   field key**, filled icon while showing and outline once put away, with hover on web bringing it
>   back without moving the layout.
>
>   **Revised the same day, before it spread.** The first cut remembered a dismissal per field key,
>   and that was the wrong model: what a reader learns is not "this paragraph is finished with" but
>   *that the icon holds an explanation* — one fact about the app, not one per field. So the durable
>   control is a single **Show form field help** setting (on by default) and the per-field icon is
>   **ephemeral**, lasting while the screen is open. Two discoverability problems came with it and
>   both are answered in the control itself: a merely *filled* icon never says it can be pressed
>   again, so while help is showing it reads `ⓘ Hide` and pressing removes only the word, leaving
>   the icon where it was — the connection is seen rather than inferred; and the global switch is
>   **offered, not described**, in the space the help just left, the first time anybody hides
>   anything, which is the one moment "you can have that everywhere" will land. A toast was the
>   first cut and a modal was considered; the prompt is neither. Telling somebody to go and find a
>   setting wastes the moment, and a blocking dialog is a heavy answer to a light act — the tell
>   being that such a dialog needs its own "do not show me this again" checkbox, which this does
>   not, because answering it either way settles it for good. `UI-16` tracks the rollout.
>
> - **Appointing an organiser became browsing, not only searching.** The control was an inline
>   input that returned nothing until you typed a name you already knew — fine when you have
>   somebody in mind, useless for "who on our staff could run the netball?", which is the question
>   organisers actually arrive with. `<PersonPickerModal>` opens on a **list** of the organisation's
>   people and narrows it as you type, so it is a superset: typing still works at the same speed.
>   Three scopes, because the server supports exactly three — the host org can be *listed*
>   (`org_members`), while `Taking part` and `Everyone` can only be *searched*
>   (`organizer_candidates` returns nothing without a query), and offering a browse where there is
>   no list to give would be a promise the data cannot keep. `Taking part` appears only once the
>   event has other organisations, which at Basic Info time it does not — entrants are invited two
>   steps later.
> - **"Add as a new person" was removed from the picker.** Creating a profile mid-way through
>   tournament setup is how an org accumulates duplicate people with no role and no email; the
>   empty state points at People & Roles instead. The server still permits it (`PEOPLE-2`) — it is
>   simply not offered from here, which is a real capability removal and worth knowing about.
> - **The autocomplete's stray dropdown was Chrome's, not ours.** The list that sat out of line with
>   the input and ended in "Manage addresses…" was the browser's saved-addresses autofill, covering
>   our own results. A bare name field reads as part of an address form; `autoComplete="off"` opts
>   out, and both this picker and `PersonnelAutocomplete` now set it.
>
> Wide-screen layout is still not in this change — that is `UI-11`.


---

## 8. Setup, running, and finished

The current event screen has `Schedule / Standings / Settings`. On the morning of the tournament the
organiser wants something different from what they wanted the week before: what is running late,
which field is free, one tap to score.

> **Decided — one layout for v1.** The tab *order and default tab* key off phase (setup → live →
> complete), which is cheap and reversible; a genuine day-of mode is a bigger piece and is better
> designed after organisers have run one.

> **Built 2026-09-07.** The tabs are `Setup / Schedule / Standings` for an organiser and
> `Schedule / Standings` for everyone else. The default tab is Setup while any visible checklist
> step is outstanding and Schedule once none is — decided once, when the screen first learns the
> viewer may edit, so a step completing underneath them does not yank the tab. The Setup tab shows
> a badge with the number of steps still to do.
>
> **Revised 2026-09-13 (U48).** The tab now carries the checklist and nothing else, and takes an
> optional `?tab=` param so a step screen has a back destination that survives a refresh or a deep
> link. A push keeps the event screen mounted, so `router.back()` restores the tab on its own; the
> param is only the fallback.

> **Decided — what survives a dropped connection.** A school sports day is close to the worst
> connectivity the app will meet, and it is where failure costs most, because the schedule is the
> only copy of what happens next. So: **reading the schedule works offline**, **entering a result
> queues and sends when the connection returns**, and **generating or rescheduling requires
> connectivity** — they are bulk server operations whose outcome cannot be guessed locally. The app
> already shows an offline indicator, so the state is expressible.

---

## 9. Getting entrants in: the axis problem

The feature spec describes entry per division — for a division of sport S and age group A, offer
each participating org's matching teams, and offer inline team creation where there is no match.
That is the right operation and it makes a good screen.

But it is only one axis. A sports day has fifteen divisions and five schools, and the organiser's
real task usually arrives the other way round: *Northcliff have confirmed — put their teams in.*
Done per division, that is fifteen visits to fifteen screens.

> **Decided — both axes, over one dataset.** **By division** ("who is in the u14 rugby?") and **by
> organisation** ("what is Northcliff entering?"), the second as a division × org grid or a per-org
> checklist. The org axis is also where inline team creation belongs, because that is exactly the
> moment you discover Northcliff has no u16 netball team on the system. Two screens over one set of
> rows; the alternative is fifteen visits, which is the kind of friction that gets a feature
> abandoned during its first real use.

---

## 10. The new components

Roughly in the order they need to exist.

### 10.1 The fixture side

[Data model §2.0](file:///c:/Fred/Coding/SK/docs/tournaments-data-model.md) defines three states for
a side of a fixture: a known entrant, a rule-based placeholder ("Winner QF1"), and an unresolved TBC.
Every surface renders it — the fixtures list, the schedule, the bracket, the game screen, the
standings, and anything printed.

> **Decided — one shared component, built first.** Five independent renderings of "TBC" is a
> guaranteed inconsistency, and this is the component that decides whether placeholders feel
> deliberate or broken. It is also the smallest piece, so it is the natural first thing to build and
> the thing every later screen is checked against.

### 10.2 The schedule

D14 — a greedy pass then the human — means **the editing affordance is the feature**. The algorithm
produces a legal schedule; the organiser produces a good one.

> **Decided — reuse the team-selection interaction, on both platforms.** The draft proposed a "move
> fixture" sheet for v1 with drag as a later enhancement. That is unnecessary caution: the pattern is
> already built and proven in
> [selection.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/[orgId]/events/[eventId]/games/[gameId]/selection.tsx),
> which does **HTML5 drag-and-drop on web** (`onDragEnter` / `onDragOver` / `onDrop` on each position
> slot, with a `dragOver` highlight) and **tap-a-slot-to-open-a-bottom-sheet on mobile**, chosen on
> `Platform.OS`. A schedule slot is the same shape of target as a position slot, so we get the good
> desktop interaction and the good mobile one from an established pattern rather than inventing
> either.

> **Decided — a filtered list on narrow screens, the grid on wide.** Sixty fixtures across eight
> fields does not fit a phone as a grid, so narrow screens get a day-and-facility-filtered list and
> tablet and desktop get the time × facility grid, both over the same data.

> **Decided — the unscheduled tray, and the filter.** Both. A tray on the schedule screen shows what
> still needs placing, because that is where you are when you care; and the fixtures list can filter
> by scheduled time or the lack of one, because that is where you go to audit what is outstanding.
> They serve different moments and neither substitutes for the other.

> **Decided — conflicts warn, in two places.** A double-booked team or field is shown on both
> fixtures *and* collected in a day-level conflicts panel, and the organiser is never blocked —
> per D29, and because organisers routinely know something the app does not. The fixture-level
> warning catches it while you are making it; the panel is how you check the whole day before
> publishing.

### 10.3 The bracket

Bracket geometry is derived rather than stored, which is settled in the data model and is good news
here: the UI computes slot positions from the rule chains.

> **Decided — a round list on narrow screens, a bracket on wide.** Both fed by the same derived
> positions. The round list is not a fallback — per §14 it is also the rendering that lets knockout
> formats ship before the bracket graphic exists.

---

## 11. Standings, overrides and destructive actions

**No points system is still a scoreboard.** Once any game is finished the tab shows played / won /
drawn / lost; the points column is what configuration *adds*, not what makes the table exist.

> **Decided — one table, with a division scope selector.** Rather than a `By division / By
> organisation` toggle, the standings screen ranks one subject and scopes it: **all divisions by
> default**, or one division chosen from a selector, with the choice remembered for the session.

> **Decided — the scope decides the row, not just the filter.** The two scopes rank different
> subjects, and that is the point of the control rather than a wrinkle in it:
>
> - **All divisions** ranks the tournament's `scoringSubject` (D6). For a `Festival` that is the
>   organisation, so the default view is the day's leaderboard by school.
> - **One division** ranks that division's **entrants**. So a school that has entered u14A *and*
>   u14B appears as **two separate rows**, because at that scope the question is which team won the
>   u14 rugby, and collapsing them answers a different question. The two still sum into one school
>   line in the roll-up above, which is correct for the day's total.
>
> For a tournament proper the entrants are teams and `scoringSubject` is `Team`, so both scopes rank
> teams and the distinction never surfaces. One control, one table, and D6's two computations become
> two scopes of one screen rather than two screens.

> **Decided — an override is quiet but discoverable.** A subtle marker on the row, with the reason on
> tap. Loud enough that someone who spots an inconsistency can find out why; quiet enough not to
> alarm the majority of readers, who do not know the tiebreak rules and would only be confused by a
> prominent warning about something they were not questioning. `division_adjustments` supplies the
> reason to show.

> **Decided — the regeneration dialog states the concrete cost.** "This deletes 14 fixtures, 3 of
> which have results", not a generic warning, escalating to a second confirmation step only where
> results exist. The pattern is the destructive card action in
> [design_spec §5.4](file:///c:/Fred/Coding/SK/docs/design_spec.md), one notch stronger.

---

## 12. Live data at tournament volume

The rules for adding to this are set out in
[.agent/skills/live-data](file:///c:/Fred/Coding/SK/.agent/skills/live-data/SKILL.md).

> **Decided — `useLiveRoom` gains a batch reduce kind.** It reduces one message at a time today, so
> `GENERATE_STAGE_FIXTURES` writing ninety rows would produce ninety upserts and ninety renders —
> the cost D13 removes on the server, relocated to the client. An `upsertMany` alongside `replace` /
> `upsert` / `remove` is the shape, and it lands with the batch actions rather than after them.

> **Decided — rooms follow the screen, not the role.** What a client subscribes to is decided by what
> the screen it is showing needs, never by who the viewer is — a convenor looking at the whole event
> needs the event's data exactly as a host does. So the tournament work will add rooms for the new
> structures (a division's fixtures and standings, most obviously), and each screen joins what it
> displays. This is the existing rule in the live-data skill applied to a new set of entities rather
> than a new rule.

---

## 13. What things are called

> **Decided — the UI says `Festival`.** The stored value and the label match, and the create screen's
> "Sports Day" goes. **Built 2026-09-03 (Phase 5):** `EVENT_FORMATS` in the shared model is the single
> list the picker renders and `eventFormatLabel` the single place a stored value becomes a label, so
> the two cannot drift. The create menu now has one container entry rather than two, and the format
> is the first structural choice inside it. Once the organiser is choosing from a list of formats, every entry should name a
> structure; "Sports Day" named an occasion and read oddly beside "Round Robin" and "Knockout".
> **Revised 2026-09-05:** the format is chosen from a dropdown (`CustomSelect`, which now takes an
> optional description per option) rather than a radio list. The open list still shows every format
> with its one-line description; the closed control shows only the chosen name, so the form does not
> grow by a card for every format added. In the same pass the tournament name moved to the top of the
> form and lost its "(Optional)" suffix — it was always required by the Save validation, and the
> label said otherwise.

> **Decided — the word "Division" is used everywhere.** All four slots the question named: the list
> on the event screen, the setup checklist step, the person assignment ("Division organiser", not
> "Convenor"), and the standings scope selector.
>
> The reasoning is the one thing the draft had backwards. It assumed "u14 Rugby" was the friendlier
> label and the abstraction was jargon to be hidden — but a division **need not be a sport and age
> group at all**. D3 explicitly requires that an organiser can split a single-sport, single-age-group
> tournament into "Division A" and "Division B" by hand. Naming the concept after the way it is
> usually filled would describe the default and mislead about everything else, and it would leave the
> organiser without a word for the thing they are being asked to create. Using the general term
> teaches the concept once, and it then covers every arrangement.
>
> Note this does not contradict §6: where a tournament has exactly one division the word still never
> appears, because the concept itself is collapsed away. The decision is about what it is called
> *when it is shown*, not about showing it more often.

> **Decided — the two tabs are `Events` and `Games`.** Deciding this rather than carrying it, since
> it is small and reversible: the repo already uses `Game` as the entity everywhere that matters
> (`GameSummary`, `ADD_GAME`, `game_participants`), while "fixture" is used loosely in prose for both
> altitudes. Naming the tabs after the entities keeps them unambiguous.

---

## 14. Formats, and the order they are built

Review settled that brackets are needed in v1, leaving the build sequence to us.

> **Decided — all four formats in v1, with the bracket graphic last.** `Festival`, `RoundRobin`,
> `Knockout` and `PoolsKnockout` are all in scope. The sequencing insight is that **a knockout is
> fully usable as a round-by-round fixture list before the bracket graphic exists** — and per §10.3
> that list is the narrow-screen rendering we are building anyway. So nothing is thrown away:
>
> 1. `Festival` and `RoundRobin` — the fixture list, the schedule, the table.
> 2. `Knockout` and `PoolsKnockout` on the round-list rendering, including progression and
>    placeholder resolution, which is where the real complexity is.
> 3. The bracket graphic on wide screens, over positions already derived by step 2.
>
> The expensive part of a knockout was never the drawing; it is the progression, and that comes with
> step 2. `Swiss` and the ranked meet formats follow their own specs.

---

## 15. Deliberately not designed here

Named so they do not get built by accident.

- **Public spectator view of a tournament** — the personal framing in §1 is the same body of work.
- **A scheduling optimiser** — deferred (D14). §10.2 designs the manual adjustment that stands in
  for it.
- **Athletics and meet-style screens** — modelled, not built (D27).
- **Officials assignment** across the schedule.
- **Bonus points configuration** — the scoring shape admits them; no UI.

> **Decided — a printable fixture list is parked, and is its own feature.** It will be needed — a
> sports day organiser prints and pins up a schedule — but done properly it means editable templates,
> which is a piece of work in its own right rather than a print stylesheet. Parked deliberately, not
> forgotten.

---

## 16. Related parked work

Per [.agent/skills/todo-checkin](file:///c:/Fred/Coding/SK/.agent/skills/todo-checkin/SKILL.md),
these live in the exact screens this document redesigns. Reviewed in round 3.

### `FIX-1` — an event with no `type` renders as a Tournament

Every consumer tests `type === 'SingleMatch'` and falls through to `Tournament`, so a legacy row
gets the Tournament badge and Tournament navigation. `events.type` is a nullable `TEXT` with no
default. This lands on the card that U4 adds role flags to, and D1 makes `Tournament` the
destination of the `SportsDay` migration — so the fall-through gets *more* wrong, not less.

> **Decided — fail loudly instead of falling back.** An event without a type should not exist; the
> only untyped row is a single-game event created during testing. So rather than a shared
> `getEventType()` helper applying a documented default, the type becomes **required**, and code that
> meets an unknown one raises an error rather than guessing. This follows the general preference for
> surfacing an unexpected state over silently absorbing it.
>
> Concretely — and it rides along with the tournament migration, because that is when the valid
> values change anyway: backfill the one untyped row, make `events.type` `NOT NULL`, and add a
> `CHECK` constraint admitting exactly `SingleMatch` and `Tournament` once `SportsDay` has been
> rewritten (D1). On the client, the `=== 'SingleMatch' ? … : Tournament` fall-through at each of the
> four call sites becomes an explicit branch whose default case is an error state, not a Tournament.

> **Built 2026-09-03 (Phase 5), and it became a rule rather than four fixed call sites.**
> [`resolveEventType`](file:///c:/Fred/Coding/SK/shared/src/utils/eventType.ts) returns one of three
> kinds and deliberately exposes **no `isSingleMatch` boolean** — a boolean has two branches, and the
> entire point is that there are three. `Unknown` renders an error state that names the value it met,
> on the card and on the event screen alike. `'SportsDay'` is gone from `EventType`, so a stale value
> now fails to type-check rather than falling through. Asserted in
> [collapseRule.test.ts](file:///c:/Fred/Coding/SK/shared/src/utils/collapseRule.test.ts).

### `FIX-2` — `allOrgs` is never populated on the event detail screen

Expanded, since the original entry did not say what the decision was.

**What is broken.** [[eventId].tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/[orgId]/events/[eventId].tsx)
asks for `get_data { type: 'organizations' }` and keeps the answer only `if (Array.isArray(res))`.
That handler returns a `PaginatedResponse` — `{ items, … }` — so the test never passes and `allOrgs`
stays empty forever. Nothing errors; three things quietly render wrong: a visiting team loses its org
code in `getTeamName`, the host org's name falls back to the literal `'Host'`, and the
participating-org chips in edit settings never resolve.

**Why it is not simply a one-line fix**, and this is where the review comment lands: the screen uses
a bulk read of *every organisation* to answer two quite different questions, and only one of them
should be a query at all.

- **Displaying the names** of orgs already involved in this event is data a room owns. The fixtures
  list solved exactly this under `FIX-7` by carrying team name and org short name on
  `GameSummary.participants` rather than looking orgs up — which also removed a per-org fetch and a
  silent 100-row cap. The event screen should read from the same place.
- **Choosing which orgs to invite**, in edit settings, is a picker over orgs *not* yet related to the
  event. No room owns that set, so per rule 2 of the live-data skill it is a legitimate one-shot
  `useSocketQuery` — a form's dropdown options. Its bugs are the `Array.isArray` test and the missing
  `limit`, which otherwise silently takes the handler's default page size.

> **Decided — the split, and the picker becomes a typeahead.** Display names come from the event and
> game payloads with no query at all. The invite picker stays a query, but stops being a list of every
> organisation: the user types, and a **search** returns matches.
>
> The pattern already exists and should be mirrored rather than reinvented.
> [PersonnelAutocomplete](file:///c:/Fred/Coding/SK/expo-app/components/PersonnelAutocomplete.tsx)
> does exactly this for people — a two-character minimum, a 300ms debounce, one
> `get_data { type: 'search_people', query, orgId }` per settled keystroke, answered by a trigram
> search in [UserManager](file:///c:/Fred/Coding/SK/server/src/managers/UserManager.ts) under a
> `LIMIT`. An org search is the same shape with three differences: a limit of about **50** rather
> than 10, a **lean projection** — name, code, and nothing else — and an optional **count of
> qualifying teams** when a sport or age group is in play, computed only when one is, so the ordinary
> case does not pay for fifty subqueries.
>
> This also disposes of the missing-`limit` half of `FIX-2` rather than fixing it: there is no page
> size to get wrong once the query is bounded by its own search. And it removes the last reason for
> the screen to hold every organisation in memory, which is what made the original
> `Array.isArray` bug invisible for so long.
>
> One consequence to carry into the build: a new `search_organizations` request type must be
> classified in [dataAccess.ts](file:///c:/Fred/Coding/SK/server/src/wss/dataAccess.ts) — gated at
> `authenticated` rather than to a membership, exactly as `search_people` is and for the same reason,
> since finding an org to invite is cross-org by nature.

### Batch subscriptions

*"Audit and refactor all entity subscriptions … granular summary/data rooms with symmetric batch
subscribe/unsubscribe utilities and automatic cleanup"* (Pending Tasks, unnumbered). U32 and U33 are
this item scoped to one feature.

> **Decided — batch by what the screen shows, reconciled with the join-push rule.** A screen
> batch-subscribes to the entities it is currently displaying and batch-unsubscribes when it leaves,
> or when it moves to another page of them. Whether a list needs live data at all is a per-list
> decision rather than an assumption.
>
> The initial load is the one place this needs care, because rule 2 of the live-data skill says
> **joining a room *is* the initial load** — `useLiveRoom` deliberately issues no query, and
> [events/index.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/[orgId]/events/index.tsx) says so in
> as many words. The reconciliation is a distinction rather than an exception:
>
> - **The room's contents are the screen's contents** — an org's events, a team's roster, a game's
>   feed. The join push *is* the load, and adding a fetch loads everything twice.
> - **The screen shows a window over a larger set** — one page of sixty fixtures, a filtered slice.
>   Here the join push is the wrong shape, so the screen fetches the window and then batch-subscribes
>   to exactly those ids.
>
> Tournaments need both: a division's fixtures are bounded and belong in the first case, while a
> sports day's full schedule is the second. Writing that distinction down is most of the value of the
> parked audit.

### `DATA-1` — `get_data` authorization runs log-only

Also expanded, since "the enforcement flag" was not explained.

All 43 `get_data` request types are classified in
[wss/dataAccess.ts](file:///c:/Fred/Coding/SK/server/src/wss/dataAccess.ts), mostly by deferring to
the room that already owns that data, so there is one rulebook rather than two. But the check does
not yet *block* anything: [index.ts:932](file:///c:/Fred/Coding/SK/server/src/index.ts#L932) reads an
environment variable, `GET_DATA_ENFORCE`, and while it is unset every refusal is logged as
`[DataAccess] WOULD-REFUSE` and then allowed through. Setting it to `true` makes the same decisions
binding. The log-only pass over all 47 call shapes the app actually sends found no false refusals, so
what remains is confidence rather than work.

There is no tournament-specific decision hiding in it. The only question is **ordering**.

> **Decided — enforce first.** `GET_DATA_ENFORCE=true` is set **before** the tournament work adds its
> request types, not after. An enforcing system refuses anything unmapped, so a new type cannot be
> born unauthenticated and the omission surfaces the moment it is called rather than at some later
> audit. Flipping afterwards would mean flipping over a much larger and less exercised surface.
>
> The decision pays for itself immediately: the `search_organizations` type above is the first new
> request this feature adds, and under enforcement it cannot ship unclassified.

---

## 17. Where this leaves us

Forty-eight decisions are recorded above, the four parked items in §16 each have an answer, and the
build order below follows from them.

Nothing is open. The question raised on 2026-09-01 by the refinement to U18 in §7 was answered the
same day and is recorded below.

> **Decided — a `Festival`'s fixtures are offered, like everything else.** The copy step offers every
> carryable element rather than assuming (U18), and the hand-arranged draw is one of them. For a
> `Knockout` the question does not arise — the draw is a consequence of the entrants and is
> regenerated — so the option appears **for `Festival` only**, and is absent rather than disabled
> elsewhere.
>
> The reasoning that decided it: a draw where the u16s play only two of the three possible fixtures
> because one school's u16s were away is real work that no generator reproduces, and refusing to carry
> it would be the wizard overruling the organiser about their own document.
>
> **Defaulted off, and dependent on entrants.** Off, because a copied fixture arrives with no
> scheduled time (dates are collected fresh) and encodes *last year's* absences — a default that
> silently reproduces a decision nobody re-made is the one thing this whole section is against. And
> ticking fixtures ticks entrants, which ticks divisions, because a fixture between entrants that were
> not copied is incoherent; the dependency rule in §7 already covers this and needs no special case.
>
> **Scheduled times never come across** under any combination. They belong to dates that no longer
> apply, and the schedule is regenerated in any case.

The build order that follows from the decisions:

1. **The fixture-side component (U22)** — everything renders it, and it is the smallest piece.
2. **Capability flags and the `AccessManager` check (U9–U12)** — they gate every screen's
   affordances and the §2 filter, and per §1 they must be computed from the user and the event
   rather than from the workspace in the route.
3. **Divisions and stages as screens (U13, U14, U15)** — this settles the route table.
4. **`Festival` and `RoundRobin` end to end** — entrants (U21), generation, schedule (U23–U26),
   standings (U28, U29).
5. **Knockout progression on the round-list rendering, then the bracket graphic (U37).**

Steps 1–3 are shared by every format, so they are worth finishing before any format-specific work
starts.

The parked work slots in around them. `GET_DATA_ENFORCE` (U42) goes **before step 1**, since its
whole value is catching the new request types as they are written. `FIX-1` (U39) rides along with the
migration in step 3, because that is when the valid `type` values change. `FIX-2` and its typeahead
(U41) belong with step 4, which is when the invite picker is next touched. The batch-subscription
rule (U40) applies from step 4 onward, where the first windowed list appears.

The data model ([tournaments-data-model.md](file:///c:/Fred/Coding/SK/docs/tournaments-data-model.md))
is the other half of what implementation needs; between the two, the only thing still to settle
before code is the migration sequencing recorded there.
