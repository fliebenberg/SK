# Reports & Moderation

The `reports` table serves two distinct purposes that share one schema: **user-submitted moderation reports** and **system-generated audit records**. Both are surfaced to app admins on the same screen.

Schema: [database_structure.md §20](database_structure.md). Socket actions: [api_actions.md §7](api_actions.md).

## Producers

### 1. User moderation reports

Raised by a signed-in user against an entity they believe is problematic.

*   **Reasons**: `impersonation` (impersonation / false organization), `inappropriate_content`, `spam`, `other`, plus an optional free-text description.
*   **Entity types**: the payload type allows `organization`, `event` and `user`.
*   **Purpose**: give users a way to flag bad or fraudulent entities — most importantly organizations claimed or created by someone who has no connection to them.

### 2. System accuracy-audit reports

Written by the `accuracy-audit` scheduled job ([AccuracyAuditJob.ts](../server/src/jobs/handlers/AccuracyAuditJob.ts)).

*   **Shape**: `entityType: 'system_audit'`, `reason: 'other'`, `reporterUserId: null`, `entityId` = the audited organization.
*   **Purpose**: leave an audit trail whenever the job silently corrects drift in an organization's cached counts (`team_count`, `member_count`, `site_count`), so an automatic correction is still reviewable after the fact. Global admins also get a `system_alert` notification pointing at the reports screen.
*   These rows are informational. They are not moderation items and need no action.

## Consumer

A single admin screen listing all reports, newest first. Access is enforced server-side by `isAppAdmin` — non-admins get an empty list, not an error.

The list is **read-only**: there is no way to investigate, resolve or dismiss a report from the UI.

## Client status

*   **`expo-app/` (active client)** — [admin/reports.tsx](../expo-app/app/(tabs)/admin/reports.tsx) is a **UI mockup only**. It renders a hardcoded `reportItems` array and never calls the server, so nothing in this document is actually reachable from the shipping app yet. Its filter tabs, metric tiles ("Audit Accuracy", "Avg Resolution") and `impact` field have no backing data.
*   **`client/` (deprecated, reference only)** — has the real wiring: [admin/reports/page.tsx](../client/src/app/admin/reports/page.tsx) fetching via the store, and [ReportDialog.tsx](../client/src/components/ui/ReportDialog.tsx) for submission, mounted only on the org detail page.

## Known limitations

The resolution workflow, the entity coverage gaps and the UI/data mismatches are tracked under **Reports & Moderation** in [TODO.md](../TODO.md). These are deliberately parked until the admin functionality is designed as a whole.
