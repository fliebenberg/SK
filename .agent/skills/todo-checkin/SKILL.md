---
name: todo-checkin
description: Requires agents to consult the Known Issues & Tech Debt backlog in TODO.md before implementing a feature, and to log newly found issues there instead of fixing them opportunistically.
---

# TODO Check-In

[TODO.md](file:///c:/Fred/Coding/SK/TODO.md) holds two lists: **Pending Tasks** (work we intend to
do) and **Known Issues & Tech Debt** (problems we found and deliberately parked). The second list
is grouped by area, and each entry has a stable ID (e.g. `REP-3`).

## Before implementing a feature

Read the **Known Issues & Tech Debt** section and scan the group(s) covering the area you are about
to touch. If any parked item sits in the same code you are already changing:

1. Raise it with the user **before** writing code — name the ID and say what including it would cost.
2. Let the user decide whether it comes into scope. Do not silently fold it in, and do not silently
   skip it either.

The point is that these are cheapest to fix while the surrounding code is already open.

## When you finish work that closes an item

Check the item off and note where it was addressed. If a fix only partially closes an item, edit the
entry to describe what remains rather than checking it off.

## When you find a new issue mid-task

If the issue is outside the scope of the current request — or fixing it depends on a design decision
that has not been made — do not fix it. Add it to the appropriate group in **Known Issues & Tech
Debt** with the next free ID in that group's prefix, and tell the user you have logged it.

Each entry should state: what is wrong, the observable consequence, and the decision required (if
any). Link to the relevant files. If a whole group is blocked on one decision, record that as an
italic *Blocked on:* line under the group heading rather than repeating it per item.

Create a new group (with a new ID prefix) when an issue does not fit an existing area.

## Related lists

- Feature work we intend to do: **Pending Tasks** in the same file.
- Speculative ideas not yet committed to: [FUTURE_IDEAS.md](file:///c:/Fred/Coding/SK/FUTURE_IDEAS.md).
- See [.agent/skills/project-file-maps/SKILL.md](file:///c:/Fred/Coding/SK/.agent/skills/project-file-maps/SKILL.md)
  for the term-to-file mapping.
