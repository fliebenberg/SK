# Database dumps

`pg_dump --format=custom` snapshots of the working database. **The dumps themselves are
git-ignored** — they carry real names, emails and phone numbers — so this directory is tracked
only for this file.

Taken because [tournaments-data-model.md §12](../../docs/tournaments-data-model.md) is emphatic
that the tournaments migration must be run with `db:migrate` and **never** `db:setup`: `db:setup`
runs `reset-db.ts`, which is a `DROP SCHEMA public CASCADE`. The dump is what makes that mistake
survivable.

## Take one

```bash
# from the repo root; password comes from server/.env
pg_dump -h localhost -p 5432 -U sk_admin -d sk --format=custom \
  --file="server/backups/sk-$(date +%Y%m%d)-<label>.dump"
```

## Restore one

Custom format restores with `pg_restore`, not `psql`. Restore into a *new* database first and
check it before touching anything real:

```bash
psql -h localhost -U sk_admin -d postgres -c "CREATE DATABASE sk_restore_test;"
pg_restore -h localhost -U sk_admin -d sk_restore_test --no-owner server/backups/<file>.dump
```

Then compare the row counts that matter against the source before pointing anything at it:

```sql
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
SELECT (SELECT count(*) FROM events), (SELECT count(*) FROM organizations),
       (SELECT count(*) FROM games),  (SELECT count(*) FROM org_profiles),
       (SELECT count(*) FROM schema_migrations);
```

## Log

| File | Taken | Why | Test-restored |
|---|---|---|---|
| `sk-20260901-phase0.dump` | 2026-09-01 | Tournaments Phase 0 pre-flight | Yes — 41 tables, 1/11/1/29 events/orgs/games/profiles, 7 migrations, identical to source |
| `sk-20260901-phase1-pre.dump` | 2026-09-01 | Immediately before the tournaments migration, which deletes 8 orphaned `game_participants` rows (`FIX-10`) — the one destructive statement in it | Yes — restored into `sk_phase1_migrate`, counts identical to source, and `db:migrate` then run against that copy as Phase 1's exit criterion |
