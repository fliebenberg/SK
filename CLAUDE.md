# ScoreKeeper — Agent Instructions

## Start here

Read the [OKF Index](file:///c:/Fred/Coding/SK/okf/index.md) before making changes. It maps the
architecture, database, API, auth model and design system to their implementations, and links the
workspace rules under [.agent/skills/](file:///c:/Fred/Coding/SK/.agent/skills/) — catalogued in
[okf/skills_index.md](file:///c:/Fred/Coding/SK/okf/skills_index.md). Those rules apply to all work
in this repo; read the relevant one before working in its domain.

## `client/` is deprecated

All client development happens in `expo-app/`. The root `client/` folder is web-only, kept for
reference, and must not be modified. See
[.agent/skills/deprecated-client/SKILL.md](file:///c:/Fred/Coding/SK/.agent/skills/deprecated-client/SKILL.md).

When answering questions about how a feature works on the client, check `expo-app/` — describing
`client/` behaviour as current is misleading, since parts of `expo-app/` are still UI mockups on
hardcoded data.

## Always check the to-do list before building a feature

[TODO.md](file:///c:/Fred/Coding/SK/TODO.md) has a **Known Issues & Tech Debt** section: problems we
found and deliberately parked, grouped by area, each with a stable ID.

- **Before implementing a feature**, scan the group(s) covering the code you are about to touch. If a
  parked item lives in the same code, raise it by ID and let the user decide whether it comes into
  scope — do not fold it in or skip it silently.
- **When you find a new issue** outside the current scope, or one whose fix depends on an undecided
  design question, log it in that section instead of fixing it, and say so.
- **When work closes an item**, check it off; if it only partly closes it, rewrite the entry to
  describe what remains.

Full rule: [.agent/skills/todo-checkin/SKILL.md](file:///c:/Fred/Coding/SK/.agent/skills/todo-checkin/SKILL.md).

## Keep the docs in step

Feature, schema, API and workflow changes must be reflected in `okf/` and `docs/` as part of the same
change — see
[.agent/skills/okf-maintenance/SKILL.md](file:///c:/Fred/Coding/SK/.agent/skills/okf-maintenance/SKILL.md).

## Commits

This repo uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) to drive
versioning. See [README.md](file:///c:/Fred/Coding/SK/README.md) for the prefix table and release
process.
