# Database Setup Scripts

Scripts for building, resetting and seeding the ScoreKeeper database. Run them from `server/`.

## The two seed tiers

- **Core** ([seedCore.ts](seedCore.ts)): what the app needs to work. Sports and their event
  templates, starter age groups, system settings, the System Administration organisation, and the
  initial admin when `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` are set. Safe for production.
- **Development**: the test organisations in [fixtures/testOrgs.ts](fixtures/testOrgs.ts). Never
  loaded when `NODE_ENV=production`.

## Commands

```bash
npm run db:setup        # wipe, create tables, seed core + test organisations
npm run db:reset        # wipe and create tables (no data)
npm run db:seed         # seed core + test organisations (test orgs are replaced, not merged)
npm run db:seed:core    # seed core only (production)
npm run db:test-orgs    # delete and reload only the test organisations; nothing else is touched
npm run db:test:setup   # build the separate test database (sk_test) from nothing
```

> [!WARNING]
> `db:reset` and `db:setup` delete everything in the database `DB_NAME` names. Take a `pg_dump`
> first if it holds anything you want to keep.

## The test organisations

Four made-up organisations, each with "Test" in its name:

| Id | Name | Teams |
| --- | --- | --- |
| `fx-org-dkl` | Test Hoërskool Doringkloof | Rugby U16 A, 1st XV; Netball U14 A, U16 A |
| `fx-org-sac` | Test St Aldric's College | Rugby U16 A, 1st XV; Netball U14 A, U16 A |
| `fx-org-rbh` | Test Riverbend High School | Rugby U16 A, 1st XV; Netball U14 A, U16 A |
| `fx-org-ksc` | Test Kwaggafontein Sports Club | Rugby U16 Lions, U19 Colts; Netball U14 Meteors, U16 Comets |

Each organisation has one site with two rugby fields and three netball courts, an admin, staff,
a coach for each team, 18 players in each rugby team and 10 in each netball team.

**Logging in.** Every account uses the password `Test1234!`. Each organisation has an account for
its admin, a staff member, its U16 rugby coach and one 1st XV (U19) player. For example,
`johan.vandermerwe@doringkloof.test` is the admin at Doringkloof. [testOrgs.ts](fixtures/testOrgs.ts)
lists every person with `account: true`.

**Deliberate cases in the base data:**
- Lerato Mokoena has one account and a profile in two organisations: staff at Doringkloof, and
  netball coach at Kwaggafontein.
- Ethan Murray left Riverbend's 1st XV on 2026-03-31, so his organisation and team memberships
  have ended.

Anything a test needs beyond this, it adds itself. Keep this file as the shared base.

**Ids** are built from names (`fx-team-dkl-rugby-u16a`, `fx-prof-dkl-ruan-potgieter`) by
`fixtureIds` in [testOrgs.ts](fixtures/testOrgs.ts). A test should import that helper rather than
write the ids out by hand.

**Reproducible.** Every id, date and password hash is fixed, so deleting and reloading gives
identical rows. `db:test-orgs` also deletes whatever the app built on the test organisations since
the last load, such as events, games and extra players.

## The test database

`npm run db:test:setup` creates `sk_test` if it is missing, then wipes it and rebuilds it from
scratch. `DB_TEST_NAME` overrides the name, and the script refuses to run if it matches `DB_NAME`.
To run the server against it:

```powershell
$env:DB_NAME='sk_test'; npm run dev
```

After reseeding a database the server is using, restart the server so its caches reload.
