---
name: todo-kickoff
description: When a session opens with the user asking to work on a specific to-do item, start with a short reminder of what the item is about, a suggested implementation plan, and any questions that need the user's input — before writing code.
---

# To-Do Kickoff

## When this applies

Only when the user's **first request in a session** is to work on a specific to-do item — by ID
(e.g. "let's do `UI-8`") or by describing an entry in [TODO.md](file:///c:/Fred/Coding/SK/TODO.md).

It does **not** apply when a to-do comes up later in a session that is already under way. By then
the context is shared; skip the reminder and go straight to the plan or the work.

## What to give the user first

Before writing any code, read the entry (search both TODO.md and
[TODO-archive.md](file:///c:/Fred/Coding/SK/TODO-archive.md) for the ID) and the code it points to,
then reply with three short parts:

1. **What it's about** — a quick reminder in plain words: what is wrong or missing, what the user
   sees because of it, and any decision already recorded in the entry. A few lines, not a re-paste
   of the entry.
2. **Suggested plan** — the steps you would take, naming the main files touched. Include the
   checks and doc updates the change will need (`check:actions`, `check:dates`, `check:colors`, `okf/`, `docs/`)
   where they apply.
3. **Questions for you** — anything that needs the user's decision before starting: open design
   choices, scope boundaries, and any parked item in the same code that could come into scope (per
   [todo-checkin](file:///c:/Fred/Coding/SK/.agent/skills/todo-checkin/SKILL.md)). If there are
   none, say so.

Then wait for the user's go-ahead before implementing (see
[explicit-approval](file:///c:/Fred/Coding/SK/.agent/skills/explicit-approval/SKILL.md)).

If the ID cannot be found, or the entry is already archived as done, say so instead of guessing.
