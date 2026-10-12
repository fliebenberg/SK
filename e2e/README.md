# End-to-end tests

The app on the web, driven by [Playwright](https://playwright.dev), against the dev API and its database.
Added 2026-10-10 for the tournament setup work (`FIX-26` to `FIX-33`).

**Run** (from the repo root, with Metro on :8081 — `npm run web` in `expo-app/` — and the API on :3001 —
`npm run dev` in `server/`):

```
npm run e2e            # every test, phone first, then desktop
npm run e2e:report     # the last run's report, with traces of any failure
```

- **Every run resets the data.** `global-setup.ts` runs `npm run db:test-orgs` in `server/` — the test
  organisations, and the tournament *Test Spring Festival* (`fx-tour-spring`, `TEST_TOURNAMENTS` in
  `server/src/scripts/setup/fixtures/testOrgs.ts`), which holds every kind of team answer, and *Test
  Saturday Fixtures* (`fx-tour-saturday`), drawn and scheduled for the Schedule tab — and restarts
  the API so its caches reload. That deletes anything made by hand under a test organisation.
  `E2E_SKIP_RESET=1` runs against the data as it is.
- **The files run in order, one at a time,** and later ones start from what earlier ones did: the
  tournament page, the division page, a coach, an organisation's own page, then invitations (which takes
  organisations out, so it is last). A single file run on its own may therefore fail where the suite
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
