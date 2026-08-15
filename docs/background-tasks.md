# Background Tasks

**The server currently runs no scheduled work.** This document records why the previous job runner was removed and what to do when background work is genuinely needed again.

## What was removed (2026-08-14)

An in-process `JobManager` ran two jobs on `setInterval`:

| Job | Interval | Purpose |
|---|---|---|
| `membership-expiry` | 1 hour | Decrement `organizations.member_count` when memberships lapsed |
| `accuracy-audit` | 24 hours | Recompute `team_count` / `member_count` / `site_count` and log the corrections |

Both existed solely to maintain three denormalized counter columns. Those columns are now derived (see below), so both jobs, the runner, and the `fix_counts.ts` repair script were deleted.

### Why the counters could not be made to work

`member_count` counted memberships where `end_date IS NULL OR end_date > NOW()`. **That is a function of time, not of writes** — a membership lapses when the clock passes a threshold, with no INSERT, UPDATE or DELETE at that moment.

This has two consequences:

1. A database trigger cannot maintain it. Triggers fire on writes; nothing writes when a date passes. So the design *required* a polling job.
2. The polling job applied an incremental delta (`member_count = member_count - n`) while `refreshOrgSummary` did a full recompute on certain reads. If a recompute landed between a membership lapsing and the hourly job processing it, the recompute had already excluded that member and the job then subtracted it a second time. The two strategies are irreconcilable, and the error only ever accumulated downward.

Several write paths also bypassed `refreshOrgSummary` entirely — the seed scripts, and the org claim flow — so counts started wrong and drifted further.

### What replaced it

The counts are computed live in the organization queries via a `LEFT JOIN LATERAL` (`ORG_COUNTS_JOIN` in [OrganizationManager.ts](../server/src/managers/OrganizationManager.ts)), backed by indexes on `teams(org_id)`, `sites(org_id)` and `org_memberships(org_id)`. There is no cached copy, so nothing can drift and there is nothing to audit.

This is affordable because every caller is paginated — the aggregate is evaluated for a page of organizations, not the whole table. It also sits alongside `eventCount`, which was already computed live with a considerably heavier subquery.

`refreshOrgSummary` became `getOrgSummary` and is now a pure read. It previously issued an `UPDATE` inside a read path, so merely viewing an organization wrote to its row.

Migration: [20260814_derive_org_counts.ts](../server/src/scripts/migrations/20260814_derive_org_counts.ts).

## When background work is needed again

Known candidates are image cleanup, transactional email, and membership-expiry notifications (all in [TODO.md](../TODO.md)).

**Do not reintroduce an in-process scheduler.** Scheduling happens externally — system cron, the container platform's scheduler, or a hosted scheduler — invoking the server over HTTP. This keeps the server stateless, makes runs observable and alertable by the scheduler, and avoids the failure modes of the old runner: it ran on every instance with no coordination, held no state (so a 24h job never fired if you deployed daily), had no retry, and silently postponed one job five minutes on every boot.

The shape to follow:

*   **Endpoint**: `POST /api/admin/tasks/:name`, authenticated with a shared secret in a header — not a user session.
*   **Locking**: wrap the body in a Postgres advisory lock (`pg_try_advisory_lock`), returning immediately if not acquired. External schedulers double-fire on retries and overlapping runs, and the deployment topology is not fixed. This costs nothing on a single instance and is already correct on several.
*   **Response**: JSON reporting what was processed, with a non-2xx status on failure so the scheduler can alert.
*   **Idempotency**: assume the task may run twice. Prefer tasks that recompute or that guard on a persisted marker over ones that apply deltas — the delta approach is exactly what failed above.

### Before adding a task, check whether you need one

The counters above needed two jobs and still could not stay correct. Ask first whether the value can simply be derived on read. A scheduled task is warranted when work must *happen* at a time (send an email, delete a file, call an external service), not merely when a value must *appear* correct.
