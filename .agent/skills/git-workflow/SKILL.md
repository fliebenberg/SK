---
name: Git Branching Reminder
description: Agents must never create a Git branch without the user's explicit permission. Working directly on `main` is the normal mode during development; feature branches are opt-in.
---

# Git Branching Rule

The project's full branching strategy lives in `docs/git-branching-strategy.md`. While the app is in
development, the user usually works directly on `main`, and feature branches are used only when the
user asks for one. Agents must not decide this on their own.

## Never create a branch without asking

**Before running `git checkout -b`, `git switch -c`, or any other command that creates a branch:**

1. Ask the user whether they want a new branch for this work, and wait for an explicit yes.
2. If the user says no, or does not answer (for example in a non-interactive or autonomous session),
   stay on the current branch, including `main`, and make the changes there.
3. Being on `main` is **not** by itself a reason to branch. Do not create a branch "to be safe", and
   do not treat this rule as satisfied by mentioning the branch after the fact.

When the user does approve a branch, use the naming prefixes from the strategy document
(`feature/*`, `bugfix/*`, `experiment/*`, `hotfix/*`).

## End of task

If, and only if, the work was done on a branch other than `main`:

1. Remind the user that they are on that branch.
2. Offer the commands to merge it back (`git checkout main`, `git merge --squash <branch>`, then a
   commit), or to push and open a PR. Do not run the merge unless the user explicitly asks.

Commits themselves follow the repo's Conventional Commits rule in `README.md`, and are only made when
the user asks.
