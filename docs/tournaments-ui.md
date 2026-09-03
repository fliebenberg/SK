# Tournaments — UI Design

**Status:** Settled — nothing open. Four review rounds: round 1 on 2026-08-30 (34 comments, 29
questions), then rounds 2, 3 and 4 on 2026-08-31 closing the remainder and the parked work in §16.
Forty-two decisions recorded. Ready to build.
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
| **D22 / D31 / D33** | A tournament and a division are each surfaces that can be handed to one person. |
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

---

## 7. Setup is a checklist, not a wizard

[design_spec §5.2](file:///c:/Fred/Coding/SK/docs/design_spec.md) prescribes multi-step wizards for
complex creation, and the current
[create.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/[orgId]/events/create.tsx) is a 945-line
screen doing that for all three event types.

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

---

## 8. Setup, running, and finished

The current event screen has `Schedule / Standings / Settings`. On the morning of the tournament the
organiser wants something different from what they wanted the week before: what is running late,
which field is free, one tap to score.

> **Decided — one layout for v1.** The tab *order and default tab* key off phase (setup → live →
> complete), which is cheap and reversible; a genuine day-of mode is a bigger piece and is better
> designed after organisers have run one.

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
> "Sports Day" goes. Once the organiser is choosing from a list of formats, every entry should name a
> structure; "Sports Day" named an occasion and read oddly beside "Round Robin" and "Knockout".

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

Forty-two decisions are recorded above, the four parked items in §16 each have an answer, and the
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
