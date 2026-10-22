# End-to-end tests

The app on the web, driven by [Playwright](https://playwright.dev), against the dev API and its database.
Added 2026-10-10 for the tournament setup work (`FIX-26` to `FIX-33`).

**Run** (from the repo root, with Metro on :8081 — `npm run web` in `expo-app/` — and the API on :3001 —
`npm run dev` in `server/`):

```
npm run e2e            # every test, phone first, then desktop
npm run e2e:report     # the last run's report, with traces of any failure
```

- **One session at a time.** Two runs at once reset the same database and share `test-results/`, and
  break each other. So a run takes the tests as it starts ([runLock.js](runLock.js)) — `npx playwright
  test` as much as `npm run e2e` — and when it ends **its session keeps them for 15 minutes**
  (`E2E_HOLD`), so it can fix a failure and run again without another session slipping in; each run
  renews the hold. The session is the Claude Code session, or `E2E_OWNER`, or you at a terminal.
  Anyone else **waits**, saying for whom, for up to 60 minutes (`E2E_LOCK_WAIT`; `0` fails at once),
  until the hold runs out, the owning Claude session closes, or the owner runs **`npm run
  e2e:release`** — do that when you are done. `npm run e2e:lock` says who has the tests. A run that
  was killed is not waited for, and nothing ever needs deleting by hand.
- **Editing a script under `server/src/scripts/` no longer restarts the API** (nodemon ignores them;
  see that folder's [setup README](../server/src/scripts/setup/README.md)), so another session can
  work on those during a run. Editing the API's own code still restarts it, and a test running at
  that moment fails with "No connection".
- **Every run resets the data.** `global-setup.ts` runs `npm run db:test-orgs` in `server/` — the test
  organisations, and the tournament *Test Spring Festival* (`fx-tour-spring`, `TEST_TOURNAMENTS` in
  `server/src/scripts/setup/fixtures/testOrgs.ts`), which holds every kind of team answer, and *Test
  Saturday Fixtures* (`fx-tour-saturday`), drawn and scheduled for the Schedule tab, and *Test Head to
  Head* (`fx-tour-h2h`), played with one of every result, and *Test Autumn Festival* (`fx-tour-autumn`),
  under way with its tables rebuilt for the Standings tab — and restarts
  the API so its caches reload. That deletes anything made by hand under a test organisation.
  `E2E_SKIP_RESET=1` runs against the data as it is.
- **The files run in order, one at a time,** and later ones start from what earlier ones did: the
  tournament page, the division page, a coach, an organisation's own page, invitations (which takes
  organisations out), then scheduling setup (`06-schedule-setup.spec.ts`: When, the gaps, a
  division's Where and When, on *Test Saturday Fixtures* and the Spring Festival's days)), then running the scheduler (`07-scheduling.spec.ts`: division states, Schedule all,
  Schedule again, and the Spring Festival's Netball U14 scheduled with its draw in `02-division`), then the
  Schedule tab (`08-schedule-tab.spec.ts`: the grid and its filters, the list on a phone, the clashes, a
  move by the sheet with Undo, a real drag that lands at the time aimed for, dragging the day's hours,
  Schedule again, adding a fixture by a click on the grid and by *＋ Add a fixture*, and the division page's
  *Edit in the Schedule*), then results entered offline (`09-offline-results.spec.ts`: the connection cut by
  routing the socket through the test — Playwright's offline mode leaves an open WebSocket alone —
  a result waiting and then sent, and one refused over a result changed meanwhile), then a Head to Head (`10-head-to-head.spec.ts`: one made from the
  events list against St Aldric's, its divisions from Doringkloof's age groups, *Pair all*, a division's games changed in its two
  columns, and St Aldric's accepting it and its teams; then *Test Head to Head*'s results, the same from both sides), then the game page (`11-game-page.spec.ts`), then the
  Standings tab (`12-standings.spec.ts`: the leaderboard and divisions on *Test Autumn Festival*, an organisation's
  and a team's results pages, and the division page from both), then the view choice across a tournament
  (`13-view-scope.spec.ts`: Kwaggafontein's admin starting on My organisation, Taking part left whole, and the
  choice following them to a division, the Schedule and the Standings), then To do (`14-todo.spec.ts`: Riverbend's
  teams to answer and its place to name on the Overview's card and on the To do page, with its sport filter; on the
  desktop, last, Riverbend naming the place with its 1st XV), then proposed teams (`15-team-picking.spec.ts`: on
  *Test Saturday Fixtures*, Kwaggafontein's U16 Lions coach's two games with a proposed team, its admin seeing them
  as the coach's; on the desktop the coach confirms one from its game page), then My Organisations
  (`16-my-organisations.spec.ts`: Kwaggafontein's U16 Lions coach seeing Kwaggafontein, as a Member, with
  *Open Workspace*, and St Aldric's staff seeing theirs to manage). A single file run on its own may therefore fail where the suite
  passes.
- **The phone runs first and only tests tagged `@phone`** — ones that read and change nothing — so it sees
  the data before the desktop tests change it.
- **People and ids** are in `support.ts`: the fixture accounts (password `Test1234!`) and the tournament's
  ids. Rows are found by test id (`entrant-…`, `request-…`, `team-card-…`, `division-…`, `team-entry-…`,
  `team-invite-…`) built from the fixture entrant ids, since a division often has several teams of the same
  name.
- **`explore/`** takes screenshots of each screen as each kind of user, into `e2e/shots/`, for looking at
  rather than testing: `E2E_EXPLORE=1 npx playwright test --config e2e/playwright.config.ts e2e/explore`.

Output (`test-results/`, `report/`, `shots/`) is not committed.
