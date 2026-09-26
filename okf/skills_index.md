---
type: concept
title: Agentic Skills Catalog
description: Index and summaries of local agent guidelines under the .agent/skills/ directory.
tags:
  - concept
  - skills
  - agent-rules
timestamp: 2026-09-26T12:00:00Z
---

# Agentic Skills Catalog

The `.agent/skills/` directory contains rules and instructions for coding agents. Before completing tasks in these domains, agents must review the specific guidelines:

1. **[explicit-approval](file:///c:/Fred/Coding/SK/.agent/skills/explicit-approval/SKILL.md)**: Instructs agents to wait for explicit approval before running plans.
2. **[git-workflow](file:///c:/Fred/Coding/SK/.agent/skills/git-workflow/SKILL.md)**: Agents must never create a branch without explicit permission; working on `main` is the default during development, with merge guidance only when a branch was approved.
3. **[no-browser-verification](file:///c:/Fred/Coding/SK/.agent/skills/no-browser-verification/SKILL.md)**: Warns agents to avoid manual web browser testing/verification in plans.
4. **[efficiency](file:///c:/Fred/Coding/SK/.agent/skills/efficiency/SKILL.md)**: Guidelines to avoid infinite rendering loops, redundant requests, and store spamming.
5. **[project-file-maps](file:///c:/Fred/Coding/SK/.agent/skills/project-file-maps/SKILL.md)**: Maps terms like "future ideas file" and "todo list" to specific files in the workspace root.
6. **[date-formatting](file:///c:/Fred/Coding/SK/.agent/skills/date-formatting/SKILL.md)**: The date and time policy — three kinds of "when" (instant, calendar date, instant with the time not set), how each is stored, sent, entered and shown, and why. All app date handling goes through [`expo-app/utils/dates.ts`](file:///c:/Fred/Coding/SK/expo-app/utils/dates.ts), enforced by `npm run check:dates`. Rewritten 2026-09-26 after `DATE-1`, when a birthdate and a kick-off were each found drifting on every save.
7. **[test-org-reuse](file:///c:/Fred/Coding/SK/.agent/skills/test-org-reuse/SKILL.md)**: Start integration tests from the fixed test organisations (`fx-` ids, `sk_test`), adding edge cases in the test rather than in the shared dataset; older scripts still reuse the common "App Test Org".
8. **[unsaved-changes-warning](file:///c:/Fred/Coding/SK/.agent/skills/unsaved-changes-warning/SKILL.md)**: Mandates the `useUnsavedChanges` hook on all pages that allow data editing, and the save rules that go with it — every action reads its acknowledgement, a failed save never looks like a successful one, a dirty flag must be clearable by the save it triggers, and dirtiness is measured against a **baseline** rather than against live data. Extended 2026-09-15 after both failure modes were found on one screen (`LIVE-19`), and again 2026-09-20 after a live record changing under an open form was found to flash the save bar on other viewers and silently discard their typing.
9. **[okf-maintenance](file:///c:/Fred/Coding/SK/.agent/skills/okf-maintenance/SKILL.md)**: Procedural guide for maintaining OKF index documents.
10. **[live-data](file:///c:/Fred/Coding/SK/.agent/skills/live-data/SKILL.md)** (NEW): How real-time data reaches a client - rooms as the read boundary, broadcasts that carry data rather than a nudge to refetch, and the game summary tier. Read before adding a room, a broadcast, or a screen showing changing data.
11. **[todo-checkin](file:///c:/Fred/Coding/SK/.agent/skills/todo-checkin/SKILL.md)** (NEW): Requires consulting the Known Issues & Tech Debt backlog in `TODO.md` (finished items move to `TODO-archive.md`) before implementing a feature, and logging newly found issues there rather than fixing them opportunistically.
12. **[review-artifact](file:///c:/Fred/Coding/SK/.agent/skills/review-artifact/SKILL.md)** (NEW): How to build a local review page for a long design document so the user can comment block by block, plus the `Open`/`Decided` blockquote conventions and the comment round-trip. Read before offering to review a spec, data model or catalogue.
13. **[interview-writeup](file:///c:/Fred/Coding/SK/.agent/skills/interview-writeup/SKILL.md)** (NEW): How a recorded user-research interview becomes its two committed documents — the cleaned speaker-labelled transcript and the 17-section structured summary — plus the folder and filename conventions under `docs/interviews/records/`. Read when asked to write up, summarise or transcribe an interview.
14. **[action-replies](file:///c:/Fred/Coding/SK/.agent/skills/action-replies/SKILL.md)** (NEW): How the client talks to the server with no silent failures — every socket action goes through `sendAction` (enforced by `npm run check:actions` in `expo-app/`), the three reply formats (actions `{ status, data }`, `get_data` unwrapped, REST thrown errors), and what a call site owes on failure. Read before writing any code that sends an action, reads `get_data`, or calls the REST API. Added 2026-09-19 after an audit found the reply misread four ways.
