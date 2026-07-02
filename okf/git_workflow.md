---
type: concept
title: Git Branching Strategy
description: Git environments, branch naming schemes, pull requests, and the pre-production workflow.
tags:
  - concept
  - git
  - branching
  - workflow
timestamp: 2026-07-02T14:56:00Z
---

# Git Branching Strategy

ScoreKeeper utilizes Git workflows to manage feature sandboxing and code deployments.

For detailed developer commands and staging flows, see [git-branching-strategy.md](file:///c:/Fred/Coding/SK/docs/git-branching-strategy.md).

## Production Branch Flow

*   `main` (Production): Stable source of truth. Commit directly here is restricted in standard environments.
*   `staging` (QA / Testing): Buffer branch for pre-releases.
*   `dev` (Development): Central integration branch. All features merge here.
*   **Workflow**: `feature/*` -> `dev` -> `staging` -> `main`.

## Solo Pre-Production Process (Phase 1)

During initial development, a simplified model is used to reduce overhead:
*   `main`: Houses the latest working build.
*   `feature/*` / `bugfix/*` / `docs/*`: Created from `main` to isolate changes.
*   **Enforcement Rule**: AI agents must verify the active branch at start of task, asking to create feature branches, and provide merge instructions at task wrap-up. Refer to [.agent/skills/git-workflow/SKILL.md](file:///c:/Fred/Coding/SK/.agent/skills/git-workflow/SKILL.md) for details.
