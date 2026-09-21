# Future Ideas

This document is a space to jot down brilliant ideas for the application while working on other tasks. You can refer to this list later to plan and prioritize new features.

## Ideas Bucket

- [ ] **Let a tournament's organiser open entry to the schools taking part, so each fills in its own
  teams and players.** Raised 2026-09-21 while settling who may create records in another
  organisation. Today the organiser enters everybody: they may add a team or a person to an
  organisation they run, or — with only a name, sport and age group — to one nobody has claimed; a
  **claimed** school's records are its own admins' to write, so for one of those the organiser can
  only reserve a slot. This idea hands that slot to the school: the organiser switches on
  self-entry, and each participating organisation's admins enter and name their own competitors.
  **Org-linked placeholders are already the mechanism** — *Northcliff's second team, TBC* is a slot
  that belongs to Northcliff by definition (`division_entrants.org_id`, carried since 2026-09-21), so
  "fill in your placeholders" is the natural shape of the task for the visiting school, and
  resolving one updates every fixture drawn against it at once (D7). Open questions for when it is
  built: whether a school may only fill slots the organiser reserved or may add beyond them; a
  deadline after which entry closes; whether the organiser approves each resolution or it simply
  takes effect; and what a school sees of the rest of the tournament while entering. The permission
  half would be a new grant — the school's admins acting within *this* tournament's divisions —
  which belongs beside the event, sport and division organiser scopes in `AccessManager`.

- [ ] **A fault analyser for the failures log, so recurring failures point at weak processes.**
  Since 2026-09-19 (SYNC-2) every failure a user meets is written to
  `server/logs/failures-YYYY-MM-DD.jsonl`, one JSON object per line: server refusals and the
  client's own no-answers and unreadable replies, each with its action type, message, user, request
  id, platform and screen. A system-admin screen (or a report to begin with) that reads it and
  shows: the most frequent failures by action and message, trends over time, which failures
  cluster on one screen, organisation or platform, how often "no answer" is followed by a
  successful replay, and which users hit the same refusal repeatedly — the last being the clearest
  sign of a confusing process rather than a bug. Grouping should normalise messages that embed ids
  or names. Two design notes: the log holds user ids, so access is system-admin only and retention
  stays bounded (90 days today); and if the analysis needs querying rather than scanning files,
  that is the point to move the log into a table.
- [ ] Add the ability to set up an ongoing "ladder" tournament where players can challenge each other to move up teh ladder. It could have rules like how many places above you you can challenge and how often a peson can be challenged (you dont want one player being challenged by several different players in a short period of time). It could facilitate the scheduling of matches etc.
- [ ] Add venue scheduling functionality to avoid multiple games being scheduled at the same venue at the same time. It could also allow for venues to be booked for private events etc.
- [ ] Add functionality to merge organizations and teams, to handle duplicates created as placeholders during event setup.
- [ ] **Allocate a pool of referees / officials to a tournament or division, then assign them to
  fixtures as part of fixture planning.** The organiser nominates the officials available for the
  event (or for one division), and assignment becomes part of laying out the schedule rather than a
  separate WhatsApp exercise. Raised by a club admin who is also head of referees (Tableview FC,
  2026-09-09) — his club runs a real officials operation: U16 players paid R80 a game to referee
  mini matches, all mini coaches put through a mandatory LFA referee course, and a standing split
  where the LFA supplies officials for promotional games and clubs supply them for non-promotional
  ones. Note that **officials assignment is explicitly out of scope for v1** in
  [docs/tournaments.md](file:///c:/Fred/Coding/SK/docs/tournaments.md) §11; this entry does not
  reopen that, it records that a real user asked for it.
    - Worth designing against the same constraint the scheduler already has — an official cannot be
      in two places at once — so it likely belongs beside the greedy scheduling pass (§7) rather
      than bolted on after.
    - An official is not necessarily a user of the app, and at this club is often a **minor** (a
      U16 player). Whatever holds them cannot assume an account, and consent/minors rules apply.
- [ ] **Grade referees, and use the grade when assigning them.** So a stronger official lands on the
  fixture that needs one — a promotional game, a final, an older age group. Extends the entry above.
  **Low priority** — flagged as such when raised, and only one club has asked. Records the idea so
  it is not re-derived from scratch.
- [ ] **A tournament-scoped site map.** Show only the venues that are actually in play for *this*
  tournament. A map carrying every facility on the site is worse than no map, because a parent
  cannot tell which pitch is theirs.
    - **The subdivision needs no new model.** A club that splits one full-size field into four mini
      pitches for a youth tournament (Tableview FC, 2026-09-09) simply creates them all as
      facilities on the same site — `Field A` alongside `Field A1`…`A4`, each with its own location.
      The organiser then picks `Field A` for a senior fixture or `Field A1` for a mini one. This is
      what [Facility](file:///c:/Fred/Coding/SK/shared/src/models/venue/Facility.ts) already
      supports.
    - **Which makes the map scoping the actual requirement**, not a nicety: because all five
      facilities are permanent and coexist on the site, an unscoped map shows `Field A` at a
      tournament played entirely on the mini fields. The data to scope it largely exists —
      [docs/tournaments.md](file:///c:/Fred/Coding/SK/docs/tournaments.md) §7 "Venues cascade down"
      already has the event holding a *set* of facilities, narrowed from the venue and allocatable
      down to a division or pool. **What is missing is the map rendering of that set.**
    - **Overlapping facilities are settled, and moved out of this list.** `Field A` and
      `Field A1`–`A4` are the same grass, so the scheduler needs to know. Decided as **D34** in
      [docs/tournaments.md](file:///c:/Fred/Coding/SK/docs/tournaments.md) §7 and scheduled into
      Phase 7 — a facility declares what it conflicts with, symmetric but not transitive. Not a
      future idea any more; noted here only because it came out of the same conversation.
    - Pairs naturally with the tournament public/spectator view (§11, out of scope for v1) and the
      shareable-output task in [TODO.md](file:///c:/Fred/Coding/SK/TODO.md) — "which field am I on"
      is exactly what a parent opens a shared link to find out.
    - *Source note: the field-subdivision detail is the interviewer's recollection from the room and
      does not appear in the machine transcript — worth confirming with the Tableview FC club admin
      (2026-09-09).*

- [ ] Add the ability to create sub-rooms for specific regions (e.g., `games-za`, `games-usa`) to further optimize data usage.

- [ ] Build a user notification system for in-app notifications (e.g., claim invitations, report updates, org activity). This would replace the need for custom per-feature notification handling and provide a unified notification inbox.
- [ ] **In-app communication — a major feature, deliberately parked.** User research (Tableview FC,
  2026-09-09) put this higher than expected: **running a club is mostly communication**, and
  essentially all of it happens in WhatsApp groups — committee to committee, coordinator to coaches,
  coaches to parents, club to supporters. The fixtures coordinator posts the week's opponent, time
  and venue to a group chat; results reach parents through a whiteboard at the ground and a message
  in the same chat. If ScoreKeeper holds the fixtures and the results, it is already holding the
  substance of most of those messages.
    - **The incumbent is strong and should be respected.** WhatsApp Communities already solve the
      structural problem — the club's minis run all age-group chats under one umbrella with a
      broadcast announcement channel, and the interviewee's stated goal was to extend that to every
      age group. We would be displacing something that works and that everyone already has. The
      near-term move is therefore to **feed** WhatsApp rather than replace it — see the shareable
      output task in [TODO.md](file:///c:/Fred/Coding/SK/TODO.md).
    - **Where in-app comms could beat a group chat:** messages that are *addressed by role and
      context* rather than by whoever is in the group — this team's parents, this event's coaches,
      this division's entrants — and that carry the fixture or result as structured data, so a
      change to a kick-off time updates the schedule instead of scrolling away as text. Also an
      audit trail, which a group chat has none of.
    - **What it drags in:** moderation (a club chat that goes wrong is the `REP-*` workflow that
      does not exist), consent and minors' data, notification delivery and preferences, and
      retention. It would also overlap the unified notification inbox above — decide whether that
      is the foundation for this or a separate thing.
    - **Not committed.** Recorded so the research does not evaporate. Revisit once more interviews
      confirm it generalises beyond one club — the interviews README lists this as untested.
    - **Confirmed 2026-09-11 (Wynberg Boys' Primary), from the opposite end.** It does generalise,
      and the parent's version of the problem is *worse* than the club's. Communication mattered
      more to her than scores or stats — as it did to the club admin — which makes this the one
      theme both interviews put first. Raw material for the workshop is gathered in the entry below.

- [ ] **Communication — pain points and candidate features, gathered for a strategy workshop.**
  **Not a plan and not a commitment.** Both interviews so far put communication ahead of scoring, so
  this entry exists to stop the evidence evaporating before we sit down and design a communication
  strategy and feature plan properly. Pull it together then; do not build from this list piecemeal.

    **The governing constraint — avoid the D6 trap.** D6 is the school communicator at Wynberg. It
    is installed, sanctioned, carries the newsletter, and the parent **does not open it**: *"I
    usually don't navigate through D6; I just check the pop-up notification."* It tries to do
    everything for the whole school, so nothing in it is reliably for you, and the result is an app
    reduced to a notification glance. **Breadth is what cost it attention.** So our communication
    must be **specific to what is relevant to the recipient** — scoped by the recipient's actual
    relationship to the thing (their child, their team, their fixture), which ScoreKeeper can do
    because it holds rosters and fixtures and a newsletter tool structurally cannot. **That is the
    advantage over D6 — relevance, not features.** Every candidate below should have to answer
    *"who specifically is this for, and why would they not mute it?"* A general-purpose broadcast
    channel fails that test and would make us D6.

    **Pain points observed (all from real accounts, not speculation):**
    - **There is no single place.** Wynberg runs seven channels in parallel — newsletter by email
      *and* D6, a linked read-only sheet of all sporting codes, class WhatsApp groups, one teacher's
      Google Classroom, PDF match-day flyers, festival document packs, and a hard-copy letter sent
      home with a Grade 2 child. **No standard exists**; each teacher picks what suits them. Parents
      complain *"it's everywhere"*, and some did not know a hockey group existed while their child
      played hockey all term.
    - **It is worse than one organisation.** Children also play at **clubs** outside school — this
      parent's cricket and golf are run and paid for separately. So even a school that consolidated
      perfectly leaves a parent assembling from several organisations. **The unit that matters to a
      parent is the child, not the organisation.**
    - **Missing a message costs the child selection.** *"If you don't pitch, next time they might
      not want to pick you."* A letter that never arrived meant she did not attend — and the match
      turned out to have been cancelled. **Nothing confirms a parent has seen anything.**
    - **Attendance is unrecorded on both sides.** She cannot tell whether her son attended 07:00
      cross country; the teacher running it announced attendance was poor while admitting *"we don't
      know who, when, and what."*
    - **Away-day logistics fail hardest.** At an unfamiliar venue she checked **parking first, then
      which field** — neither is a fixture. Food and facilities were carried only by PA
      announcements: *"we walked all around the fields trying to find food while rushing between
      match fields."*
    - **A parent rebuilt the school's festival document with AI** because the school's own was *"all
      over the place"*, and other parents used hers — groups down the page, each child's name, match
      times. **Unpaid work to fix an information-architecture failure** is the strongest demand
      signal in either interview, and it is revealed behaviour rather than a stated wish.
    - **Nobody knows who is actually in the audience.** Class WhatsApp groups are run by a **class
      rep — a parent, not staff** — and people join by asking; a parent may add a grandparent or
      nanny who does the school run. The org holds their number and not their identity.

    **Candidate features (unranked, unvalidated):**
    - **One view of everything one child plays**, across every school and club involved.
    - **A day view for a festival or tournament** — groups, each child's name, match times, *plus*
      parking, the site map and facilities. Overlaps the tournament-scoped site map idea above,
      which **two interviews have now independently asked for**, from the organiser's end and the
      parent's.
    - **Selection acknowledgement** — "your child is selected, are they coming?", with the coach
      seeing who has answered. Addresses both the parent's risk and the coach's reciprocal problem.
    - **Attendance marking** — a teacher taps names, the guardian sees it. Cheap, and it serves both
      ends of a handover that is currently blind at both.
    - **Uniform / kit requirements per sporting code**, practice vs match day. The **only feature the
      parent volunteered unprompted**, and a reason to open the app midweek rather than on match day.
    - **Change and cancellation notices that carry the change**, so a moved kick-off updates the
      schedule rather than scrolling away as text.
    - **Guardian-scoped delivery** — messages addressed to the responsible party for a player rather
      than to whoever is in a group. Depends on `MEMBER-3` /
      [identity_structure.md](file:///c:/Fred/Coding/SK/docs/identity_structure.md) §5.
    - **Trusted Contacts** — a guardian, or an adult player for themselves, grants a nanny,
      grandparent, driver or partner the same *view* of one player's schedule without any of their
      authority ([identity_structure.md](file:///c:/Fred/Coding/SK/docs/identity_structure.md) §5.5).
      Logged-in users only; only very general information is ever public to a signed-out visitor.

    - **Polls and structured requests** — a coach or organiser asks a set question of a squad and
      gets a tally back. Its own entry below; transport is the first case.
    - **Communication with every participating organisation in a tournament.** Getting information
      to and from the people at every other school is a named frustration
      (Van Riebeeckstrand Primary sports office, 2026-09-14): some counterparts answer a voice note
      at once, some never answer email, some schools have no sports coordinator at all, and an agreed
      date was disputed months later with no record of what was agreed. **This needs a designated
      main contact per participating organisation in a tournament** — the person the tournament
      addresses on that org's behalf.
        - **"Main contact", deliberately not "organiser".** A main contact **has no permissions over
          the tournament** — it is an addressing role, not a grant. Someone who is a main contact *and*
          appears among the tournament's organisers has organiser rights because of the second role,
          never the first. This keeps the two apart from
          [docs/tournaments.md](file:///c:/Fred/Coding/SK/docs/tournaments.md) §10, where "organiser"
          (D33) and "convenor" (D22/D31) both mean edit rights.
        - Today §10 names people only on the **hosting** side; participating orgs have no named person
          at all. Like D33, the designation belongs to **one event** and should lapse with it.
        - Open: who designates the main contact (the host, or the participating org itself); whether
          they must be a user, since many participating orgs are unclaimed and a contact may only have
          an email address; and whether an org may name more than one.

    **Dependencies to settle in the workshop:** this is mostly **public / consumer-side** work and
    that side of the app has not been started, which is why read access, permissioned sharing and
    audience identity are all currently unanswered. Also drags in moderation (`REP-*`), consent and
    minors' data, notification preferences, and the unified notification inbox above.

- [ ] **Polls — a general way for coaches and organisers to get structured answers from players and
  parents.** Requested repeatedly in interviews. The clearest case is **match transport** (Van
  Riebeeckstrand Primary sports office, 2026-09-14): coaches build a WhatsApp poll per team every
  week — *drive self*, *bus there and back*, *bus there only*, *bus back only* — and the sports office
  books buses off the counts by a Tuesday 11:00 deadline. Buses cost R30,000–R40,000 a trip, and
  parents changing their answer on match morning leaves 60-seaters half-empty. Building one poll per
  team by hand is itself named as a time cost.
    - **Build the service, not the transport form.** The same shape answers "is your child
      available?", "which practice slot?", "kit size?", "who can help at the tuck shop?" A poll is a
      question, a set of options, an audience, and a deadline.
    - **Audience comes from data we hold** — a team, a match squad, an event's entrants — rather than
      whoever is in a chat group. **For a minor, the guardian answers** (`MEMBER-3`,
      [identity_structure.md](file:///c:/Fred/Coding/SK/docs/identity_structure.md) §5.3); an adult
      player answers for themselves.
    - **What the asker needs back:** a live tally, **who has not answered** (to chase them), and
      **answers changed after the deadline** made visible rather than discovered at the bus.
    - **Attach a poll to what it is about** — a game, a training session, an event — so the answer
      travels with the fixture. The transport case pairs naturally with the coach-initiated roll call
      below (*"confirming everyone who said they'd take the bus is actually on the bus"*).
    - **Depends on** notification delivery (the unified notification inbox above) and on the consumer
      side, which is not built. Belongs in the communication workshop, not built piecemeal.
    - Open: single vs multiple choice, free-text answers, whether respondents see the tally, and
      whether a poll can be reused week to week for the same team.
- [ ] **An organisation calendar — its own dates, visible to other organisations.** User research
  (Van Riebeeckstrand Primary sports office, 2026-09-14): the **biggest pain named, raised unprompted**,
  is agreeing next year's dates with other schools before the school calendar prints in November.
  Western Cape primary schools no longer wait on a governing body — they arrange dates bilaterally,
  by phone, voice note and email. The sports coordinator **cannot see other schools' calendars**, waits
  on schools whose planning runs on a different cycle, and one requested swap cascades into several
  more. His own suggestion: see which weekends another school has open, and approach them directly.
  He pre-empted the privacy objection — the calendar is already printed and sent home to parents.
    - **Near term: a calendar view per organisation** — fixtures, tournaments and training, plus
      dates that are not fixtures (sports days, photo days, kit presentations sit on the same board).
      Useful to the org itself on day one.
    - **Then: publish it**, including **open / blocked dates**, readable by another org's organiser.
      Decide what a signed-out visitor sees — only very general information is public elsewhere.
    - **Later: date proposals between organisations** — propose, accept, request a swap — with a
      record of what was agreed. The same school had a long-standing event date disputed by the other
      school mid-year; it was settled only because the other side had no proof of a change.
    - **Network effect, stated by the interviewee himself** — *"if everyone used the same platform."*
      Cross-org visibility is worth little until counterparts are on the app, so the per-org calendar
      has to stand on its own first. Adoption here looks peer-to-peer (coordinators who know each
      other), not through a league.
    - Related: venue scheduling (above), the repeating Training event type in
      [TODO.md](file:///c:/Fred/Coding/SK/TODO.md), the **team event** type below (which is how the
      non-fixture dates get into the calendar at all), and main contacts per participating
      organisation in the communication workshop entry.
- [ ] **A "Team event" type — something a team does that is not a match.** A photo shoot, a team
  outing, a kit presentation, a team dinner — and training. Prompted by the school calendar (Van Riebeeckstrand
  Primary sports office, 2026-09-14), where **photo days and kit presentations are locked into the
  year alongside match days** but have nowhere to live in ScoreKeeper: `EventType` is only
  `'SingleMatch' | 'Tournament'`
  ([Event.ts](file:///c:/Fred/Coding/SK/shared/src/models/event/Event.ts)), and both assume an
  opponent.
    - **Shape:** one team (or several of the org's own teams), **no opposing team, no score**. A
      date and time, a venue — optional, since an outing may be off-site — and **the people
      involved**, selected the way players are selected for a match but **without positions**.
    - **Decided 2026-09-15:**
        - **Training is a special case of a team event**, not a separate type. So a team event is
          either **once-off or recurring** — a photo shoot happens once, Tuesday practice repeats.
          This absorbs the "Training" event type in [TODO.md](file:///c:/Fred/Coding/SK/TODO.md):
          selection, attendance and roll call are built once.
        - **The event belongs to one organisation**, and only its own teams take part as teams. That
          does **not** stop people from outside the org being involved: anyone from another
          organisation is **invited as an individual**, not as part of their org.
        - **People who are not on a team can take part** — a parent helping, a photographer, a
          driver, a visiting coach. They join the event the way a **match official already joins a
          game without being on either team** (`game_officials`,
          [GameOfficial.ts](file:///c:/Fred/Coding/SK/shared/src/models/event/GameOfficial.ts)).
        - **No label for what a non-team participant is there to do.** The coach or organiser knows.
          (Note the contrast with officials, whose `role` column is required — a team-event
          participant would not carry one.)
        - **No scoring screen.** The type simply has none; nothing to hide or disable.
    - **General principle, wider than this entry: every event type should admit non-team
      participants.** Today that exists only at game level, for officials. A team event is the first
      type where it is the main case rather than an exception, so it is the right place to design it
      generally — a tournament's photographer or first-aider is the same kind of person.
    - **Watch the counting rule.** [TeamManager.ts](file:///c:/Fred/Coding/SK/server/src/managers/TeamManager.ts)
      gives anyone added to a team a `role-org-member` membership, and `MEMBER-3` records the agreed
      rule that anyone involved with a team holds a counting (priced) role. A parent or photographer
      added to a team event must **not** become a billable member through that path, so taking part in
      an event has to be separate from being on the team.
    - **Outside individuals need a person record.** `game_officials` points at an `org_profile`, which
      is per organisation. An invited individual from another org has no profile in the host org, and
      creating one there is the "whichever org touched them first owns them" problem in `MEMBER-2`.
      Settle with that item rather than around it.
    - **Transport options** where the event travels, which is the transport poll in the entry above
      applied to a non-match event — another reason to build polls as a service rather than a match
      feature.
    - **What it inherits for free once it exists:** a place on the organisation calendar (above),
      the same guardian-scoped notifications a match would get, and roll call for who actually came.
    - **Still open:** how recurrence is expressed (a series with exceptions — a cancelled Tuesday, a
      moved session — or independent copies), and whether a change to the series updates events
      already in the past.

- [ ] Set up a dedicated ScoreKeeper mail service for production email sending (transactional emails, notifications, password resets, etc.)
- [ ] Optimize organization caching and search:
    - Limit the number of organizations cached on the client (e.g., closest 1000).
    - Implement a hybrid search strategy where the autocomplete first searches the client cache.
    - Provide an option to "Expand search to all organizations" which triggers a full fuzzy search on the backend.
    - Ensure fuzzy search logic (like Levenshtein) is implemented on both frontend and backend for a consistent experience.
- [ ] Add leagues feature
    - any org can create a league
    - teams can then join a league (league owner can specify if anyone can join or if they need to be approved) and assign specific matches to a league (league owner can choose to approve matches as well)
    - when setting up a league the owner can specify how points and ranking will work
    - **Reference to look at when we build this:** <https://cttfass.leaguerepublic.com/index.html>
      (Central Table Tennis on LeagueRepublic) — an example of a public league site: fixtures,
      results, standings, divisions and club/team pages. Worth reviewing for what a league's public
      face needs to show and how it is navigated, before designing ours. Noted 2026-09-10.
- [ ] Add a coach-initiated roll call so a coach can take attendance for a team on demand. Useful for practice attendance, and for ad-hoc headcounts (e.g. confirming everyone who said they'd take the bus is actually on the bus). Coach starts a roll call against a team (optionally tied to a game, practice or trip), marks each player present/absent/excused, and the result is stored for later review.
- [ ] **Lane-based race timing by consensus start.** Replace the stopwatch-and-shout process at
  non-professional meets: one timekeeper per lane in the app, each pressing start on the gun and stop
  on their competitor, with the app attributing the time to the right competitor automatically.
  **Athletics is the first case, but the shape is generic** — any lane-and-heat sport timed by hand
  fits unchanged: swimming, rowing, track cycling, and with a single shared finish line rather than
  lanes, cross-country and road running. Worth designing against that generality from the start
  rather than building it into a rugby-shaped sport model.
    - **Swimming is prior art for the core idea.** Manual swim timing already puts multiple watches
      on a lane and takes the *middle* of the three, precisely because the median is robust to one
      timekeeper fumbling. This proposal applies that same reasoning to the start instead of the
      finish, and gets it across lanes for free. (Confirm current governing-body wording before
      encoding any of it.) The
  transcription step — reading times aloud to a recorder — is where the *gross* errors live (wrong
  athlete, misheard time, transposed digits), and removing it is the actual value; the timing
  precision below is a secondary gain.
    - **Consensus start.** Every timekeeper is reacting to the *same* event, so take the **median**
      of their start presses as the one start time for the whole race. This cancels most of the
      start-side reaction spread (the median of n samples has ~`1.25/√n` of one sample's spread),
      leaving only the finish press as per-lane human error. It costs the timekeepers nothing extra —
      they already press start — and degrades gracefully: with one timekeeper the median is just
      their own press, i.e. the plain local stopwatch.
    - **Consensus finish, where the bodies exist.** Where a lane has more than one timer, take the
      median of their finish presses too. Note the asymmetry: the *start* median pools every
      timekeeper at the meet (8–24 people on one gun), while the *finish* median pools only that
      lane's timers (realistically 1, sometimes 2) — so the start consensus is strong and free, the
      finish consensus is weak and costs a volunteer per sample. Support it, but do not depend on it.
      Median spread vs. a single timer: 2 → 0.71, 3 → 0.67, 5 → 0.54.
    - **With exactly 2 timers on a lane, do not silently average.** The 2 → 3 step barely improves
      precision but is where *robustness* appears: a median of 3 discards one fumbled press, whereas
      a median of 2 is their mean and a single bad press drags the result halfway. This is why
      swimming uses three watches. With 2, if they disagree beyond a threshold, raise it for the
      recorder to adjudicate — a plausible-looking wrong time is worse than a visible conflict.
    - **Assign timekeepers to lanes, not to competitors.** Lanes persist across heats while
      competitors rotate through them, so a timekeeper selects "lane 4" once for the session and the
      competitor resolves per heat from the start list. Removing the between-heats re-selection is
      most of the usability win.
    - **Store every raw press; derive the published time.** Never discard the inputs. Gives dispute
      resolution, lets a result be re-derived if a device's clock is later found bad, and over a full
      meet allows each timekeeper's systematic bias against the consensus to be measured and
      eventually corrected. (Bias correction is well past a first version.)
    - **Measure durations, not timestamps.** Each device should time its own press-to-press interval
      on a *monotonic* clock and report that. Comparing raw timestamps across devices adds both
      devices' clock-offset errors instead of cancelling them. A per-lane median damps the residual
      clock error too, not just the human error — extra timers help on both axes.
    - **This re-couples to `LIVE-7`.** Placing each device's start press on a common timeline to
      compute the median needs a clock offset good to a few tens of ms. With today's single-sample
      sync the added clock error can exceed the reaction spread the median removes, making consensus
      start a net *loss*. Fix `LIVE-7` first, or the feature is not worth building.
    - **Guard rails.** Only pool start presses inside a window (~±2s of the first) so a press meant
      for the previous heat cannot poison the median; require ≥3 presses before using a median at all;
      bound the per-lane start correction and flag a lane whose correction is implausible rather than
      publishing a silently wrong time.
    - **Do not** broadcast a start signal from the server and have devices start on receipt: that
      keeps one person's full reaction error *and* adds per-device network jitter, which distorts the
      gaps between athletes — the thing coaches actually read.
    - Hand times stay hand times. World Athletics' hand-to-electronic conversion (roughly +0.24s up
      to 400m, +0.14s beyond — verify the current rule before encoding it) still applies; the
      consensus start reduces the *spread*, not the systematic bias. Each sport carries its own
      conversion convention, so this belongs in sport configuration, not in the timing code.
    - Fits the ranked-meet gap already carved out in
      [docs/tournaments.md §4](file:///c:/Fred/Coding/SK/docs/tournaments.md).

- [ ] **Athletics performance scoring: pick which scale(s) we support, and keep them separate.**
  Reminder for when we implement athletics scoring and athletics tournaments — a track & field result
  is not self-ranking the way a rugby score is. Turning `10.23s` into a comparable number is a
  deliberate choice between several established systems that are routinely conflated, and they answer
  different questions. Decide per competition, not globally.
    - **World Athletics Scoring Tables (Spiriev).** The Bojidar/Attila Spiriev tables that World
      Athletics publishes (periodically revised — the edition matters, results are not comparable
      across editions). Maps an *absolute* performance in any event to a points value on a single
      scale, so a 100m time and a javelin distance become directly comparable. This is what we'd want
      for "best performance of the meet", multi-event team scoring, and cross-event ranking.
      Published as tables rather than as an open formula, and the publication is copyrighted — check
      the licensing position before shipping a derived lookup table.
    - **Combined events tables (decathlon/heptathlon) are a different thing.** These have an
      explicitly published closed-form: points are of the form `A·(B − P)^C` for track events and
      `A·(P − B)^C` for field events, with per-event `A`/`B`/`C` coefficients, truncated to an
      integer. Cheap to implement exactly, no lookup table, but they are calibrated for combined
      events and are *not* a substitute for the Spiriev scoring tables. Don't let the fact that we
      can implement this one easily decide which scale we adopt.
    - **Age-graded tables (WMA — Alan Jones / Howard Grubb) answer a third question.** These adjust
      for age and sex against an open-class standard, yielding an age-graded percentage (roughly
      performance vs. the world best for that age/sex, so ~100% = world-class for that group) and an
      age-graded equivalent time. This is the one that makes a 55-year-old's 5000m comparable with a
      22-year-old's — the right tool for club, schools and masters events, and the wrong tool for
      ranking an open final. The factor tables are published openly and revised periodically.
    - **Implementation shape.** Likely a seeded reference dataset keyed by
      `(sport, discipline, sex, edition)` rather than code: coefficient rows where a closed form
      exists (combined events, age factors) and performance→points rows where it doesn't (Spiriev),
      with interpolation rules and rounding/truncation direction pinned down explicitly — off-by-one
      points from rounding the wrong way is the classic bug here. Store the raw performance as the
      source of truth and derive points on read, so a table edition change or a corrected result
      re-derives cleanly; record which table edition a published score came from.
    - **Hand vs. electronic timing feeds straight into this.** Points tables assume fully automatic
      timing, so a hand time needs the governing-body conversion applied *before* scoring, or every
      score is inflated. Ties to the lane-timing idea above and to `LIVE-7`.
    - Every specific number, coefficient and conversion above is from memory and must be verified
      against the current published tables before anything is encoded.
    - Ranked-meet scoring is the gap noted in
      [docs/tournaments.md §4](file:///c:/Fred/Coding/SK/docs/tournaments.md).


---
*Note: You can ask me to update this list, add details to ideas, or promote them to the main [TODO.md](file:///c:/Fred/Coding/SK/TODO.md) when you're ready to start working on them.*
