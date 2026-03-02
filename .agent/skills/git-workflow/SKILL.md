---
name: Git Branching Reminder
description: Instructs agents to enforce the project's Git branching strategy by asking to create feature branches at the start of a task and reminding the user to merge PRs at the end.
---

# Git Branching Strategy Enforcement

When you are assisting a user in this repository, you must actively enforce the project's branching strategy outlined in `docs/git-branching-strategy.md`.

## Start of Conversation / New Task

When a user gives you a request to build a new feature, fix a bug, or make any code changes, **BEFORE YOU WRITE ANY CODE OR MAKE ANY EDITS:**

1.  Check the current Git branch using the `run_command` tool (e.g., `git branch --show-current`).
2.  If the current branch is `main` or `dev`, **STOP** and ask the user if you should create a new `feature/*` (or `bugfix/*`, `experiment/*`) branch for this work.
3.  Wait for the user's explicit permission to create the branch.
4.  Once permission is granted, use the `run_command` tool to create and checkout the new branch (e.g., `git checkout -b feature/name-of-task`).

## End of Task / Conversation Conclusion

When a task or feature has been fully implemented, tested, and you are wrapping up the conversation with the user:

1.  Proactively remind the user that they are currently on a feature branch.
2.  Ask the user if they would like you to help them merge this branch back into `main` (if following the Solo Pre-production process) or `dev` (if following the standard process).
3.  Suggest that they review the changes and run any final tests before merging.
4.  Provide the exact Git commands they would need to run (e.g., `git checkout main`, `git merge --squash feature/branch-name`, or push and open a PR). Do not auto-run the merge commands unless explicitly instructed by the user.
