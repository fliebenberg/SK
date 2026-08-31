# Future Ideas

This document is a space to jot down brilliant ideas for the application while working on other tasks. You can refer to this list later to plan and prioritize new features.

## Ideas Bucket

- [ ] Add the ability to set up an ongoing "ladder" tournament where players can challenge each other to move up teh ladder. It could have rules like how many places above you you can challenge and how often a peson can be challenged (you dont want one player being challenged by several different players in a short period of time). It could facilitate the scheduling of matches etc.
- [ ] Add venue scheduling functionality to avoid multiple games being scheduled at the same venue at the same time. It could also allow for venues to be booked for private events etc.
- [ ] Add functionality to merge organizations and teams, to handle duplicates created as placeholders during event setup.
- [ ] Add the ability to create sub-rooms for specific regions (e.g., `games-za`, `games-usa`) to further optimize data usage.

- [ ] Build a user notification system for in-app notifications (e.g., claim invitations, report updates, org activity). This would replace the need for custom per-feature notification handling and provide a unified notification inbox.
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
