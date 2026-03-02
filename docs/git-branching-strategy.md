# Git Branching Strategy

This document outlines the standard Git branching strategy for this project. It is based on an environment-driven workflow designed to maintain stability across production, testing, and development environments.

## Core Branches

*   **`main` (Production):** The source of truth for the live production environment. Code is never committed directly here. It only accepts merges from `staging` (or `hotfix` branches).
*   **`staging` (Testing / Pre-production):** The environment for Quality Assurance (QA) and User Acceptance Testing (UAT). It acts as a buffer before releasing to `main`.
*   **`dev` (Development):** The central integration branch for day-to-day development. All completed features are merged here.

## Supporting Branches

*   **`feature/*`:** Short-lived branches where active development occurs. Branched from `dev` and merged back into `dev`.
*   **`hotfix/*`:** Urgent branches created from `main` to address critical production issues. Must be merged back into both `main` and `dev` (and occasionally `staging` if it diverges).

## Best Practices and Principles

1.  **Code Flows Upward:** `feature` -> `dev` -> `staging` -> `main`.
2.  **Keep Feature Branches Fresh:** Regularly pull or rebase from `dev` into your active `feature` branches to minimize merge conflicts.
3.  **Use Pull/Merge Requests (PRs/MRs):** Never merge directly into `dev`, `staging`, or `main` locally. Always use PRs/MRs for code review and automated testing.
4.  **Squash and Merge:** When merging a feature into `dev`, squash the commits to keep the development history clean and semantic.
5.  **Naming Conventions:** Always use descriptive branch names with appropriate prefixes:
    *   `feature/user-authentication`
    *   `bugfix/nav-bar-overlap`
    *   `hotfix/payment-gateway-crash`
    *   `docs/readme-update`
6.  **Tag Releases:** When merging `staging` to `main`, tag the commit with the appropriate version number (e.g., `v1.2.0`) to create an immutable snapshot of that release.

## Typical Developer Workflow

1.  **Checkout dev:** `git checkout dev`
2.  **Update local dev:** `git pull origin dev`
3.  **Create feature branch:** `git checkout -b feature/my-new-feature`
4.  **Develop:** Write code and commit locally.
5.  **Stay updated:** Regularly pull changes from `dev` into your feature branch (`git fetch origin` then `git merge origin/dev` or `git rebase origin/dev`).
6.  **Push:** Push your feature branch to the remote repository.
7.  **Review:** Open a Pull Request targeting the `dev` branch.
8.  **Merge:** Once approved, squash and merge the PR into `dev`.
9.  **Cleanup:** Delete the remote and local feature branch.

---

## Phase 1: Initial Process (Solo Pre-production)

When operating as a single developer prior to launching a production version, the full environment-based strategy can add unnecessary overhead. The following simplified process keeps work isolated in feature branches without the complexity of managing multiple base environments.

### Core Branch

*   **`main` (The Source of Truth):** Combines `dev` and `production` into a single branch. This branch should always contain your latest, verified, working code. It acts as the anchor point that is known to work.

### Sandbox Branches

*   **`feature/*`:** Branch off `main` for every new task or when delegating work to an AI agent. This provides a safe sandbox where changes will not break the project.
*   **`experiment/*` (Optional):** Used manually or by AI to generate Proof of Concepts (PoC) that might be discarded.

### Simplified Developer Workflow

1.  **Start fresh:** `git checkout main`
2.  **Create a safe space:** `git checkout -b feature/add-new-feature`
3.  **Develop & Experiment:** Write code, make mistakes, and commit freely to this branch. If an AI agent breaks the codebase, you can easily discard the branch.
4.  **Review & Test:** Run the app locally and verify the functionality.
5.  **Merge back to source:** `git checkout main` followed by `git merge feature/add-new-feature`. (Preferably use `git merge --squash feature/add-new-feature` followed by a commit, to condense history and keep `main` clean).
6.  **Clean up:** Delete the feature branch (`git branch -D feature/add-new-feature`).
