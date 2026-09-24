---
name: todo-checkin
description: Requires agents to consult the Known Issues & Tech Debt backlog in TODO.md before implementing a feature, and to log newly found issues there instead of fixing them opportunistically.
---

# TODO Check-In

[TODO.md](file:///c:/Fred/Coding/SK/TODO.md) holds two lists: **Pending Tasks** (work we intend to
do) and **Known Issues & Tech Debt** (problems we found and deliberately parked). The second list
is grouped by area, and each entry has a stable ID (e.g. `REP-3`).

TODO.md holds **open items only**. Finished items live in
[TODO-archive.md](file:///c:/Fred/Coding/SK/TODO-archive.md), word for word and under the same
headings, because their history (what was wrong, what was decided, what fixed it) is still useful.

**IDs are unique across both files and never reused.** To follow a reference like `UI-8`, search
both files for it. A doc that says an ID is "in TODO.md" may be older than the entry's archiving; the
ID is what counts. When writing a new reference, the ID alone is enough.

## Before implementing a feature

Read the **Known Issues & Tech Debt** section and scan the group(s) covering the area you are about
to touch. If any parked item sits in the same code you are already changing:

1. Raise it with the user **before** writing code — name the ID and say what including it would cost.
2. Let the user decide whether it comes into scope. Do not silently fold it in, and do not silently
   skip it either.

The point is that these are cheapest to fix while the surrounding code is already open.

## When you finish work that closes an item

1. Check the item off (`- [x]`) and add a short resolution: the date, the commit, and what fixed it.
2. **Move the entry to the same section of
   [TODO-archive.md](file:///c:/Fred/Coding/SK/TODO-archive.md)** in the same change, creating the
   section heading there if it does not exist yet. Do not leave finished items in TODO.md.

If a fix only partly closes an item, leave it in TODO.md and rewrite the entry to describe what
remains.

## When you find a new issue mid-task

If the issue is outside the scope of the current request — or fixing it depends on a design decision
that has not been made — do not fix it. Add it to the appropriate group in **Known Issues & Tech
Debt** with the next free ID in that group's prefix (check **both** files, since the highest ID may already
be archived), and tell the user you have logged it.

Each entry should state: what is wrong, the observable consequence, and the decision required (if
any). Link to the relevant files. If a whole group is blocked on one decision, record that as an
italic *Blocked on:* line under the group heading rather than repeating it per item.

Create a new group (with a new ID prefix) when an issue does not fit an existing area.

## Related lists

- Feature work we intend to do: **Pending Tasks** in the same file.
- Speculative ideas not yet committed to: [FUTURE_IDEAS.md](file:///c:/Fred/Coding/SK/FUTURE_IDEAS.md).
- See [.agent/skills/project-file-maps/SKILL.md](file:///c:/Fred/Coding/SK/.agent/skills/project-file-maps/SKILL.md)
  for the term-to-file mapping.
