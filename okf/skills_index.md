---
type: concept
title: Agentic Skills Catalog
description: Index and summaries of local agent guidelines under the .agent/skills/ directory.
tags:
  - concept
  - skills
  - agent-rules
timestamp: 2026-07-02T14:56:00Z
---

# Agentic Skills Catalog

The `.agent/skills/` directory contains rules and instructions for coding agents. Before completing tasks in these domains, agents must review the specific guidelines:

1. **[client-rendering](file:///c:/Fred/Coding/SK/.agent/skills/client-rendering/SKILL.md)**: Enforces purely client-side rendering for dynamic components and bypasses Next.js server actions.
2. **[deprecated-client](file:///c:/Fred/Coding/SK/.agent/skills/deprecated-client/SKILL.md)**: Rules enforcing that the root-level `/client/` directory is read-only and reference-only.
3. **[explicit-approval](file:///c:/Fred/Coding/SK/.agent/skills/explicit-approval/SKILL.md)**: Instructs agents to wait for explicit approval before running plans.
4. **[git-workflow](file:///c:/Fred/Coding/SK/.agent/skills/git-workflow/SKILL.md)**: Enforces the Git branching strategy (branch checks on start, merge directions on finish).
5. **[no-browser-verification](file:///c:/Fred/Coding/SK/.agent/skills/no-browser-verification/SKILL.md)**: Warns agents to avoid manual web browser testing/verification in plans.
6. **[efficiency](file:///c:/Fred/Coding/SK/.agent/skills/efficiency/SKILL.md)**: Guidelines to avoid infinite rendering loops, redundant requests, and store spamming.
7. **[project-file-maps](file:///c:/Fred/Coding/SK/.agent/skills/project-file-maps/SKILL.md)**: Maps terms like "future ideas file" and "todo list" to specific files in the workspace root.
8. **[date-formatting](file:///c:/Fred/Coding/SK/.agent/skills/date-formatting/SKILL.md)**: Standards for handling dates and times (use `date-fns`, UTC storage, and prevent database parsing errors).
9. **[test-org-reuse](file:///c:/Fred/Coding/SK/.agent/skills/test-org-reuse/SKILL.md)**: Enforces reuse of the common "App Test Org" in integration tests.
10. **[unsaved-changes-warning](file:///c:/Fred/Coding/SK/.agent/skills/unsaved-changes-warning/SKILL.md)**: Mandates the `useUnsavedChanges` hook on all pages that allow data editing.
11. **[okf-maintenance](file:///c:/Fred/Coding/SK/.agent/skills/okf-maintenance/SKILL.md)** (NEW): Procedural guide for maintaining OKF index documents.
