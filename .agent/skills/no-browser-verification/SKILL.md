---
name: NoBrowserVerification
description: Instructs the agent to avoid manual browser verification steps in implementation plans.
---

# NoBrowserVerification Skill

This skill defines a rule for creating implementation plans and verification steps.

## Core Rule

Whenever you are creating an `implementation_plan.md` or describing verification steps to the user:
- **DO NOT** include any manual verification steps that require the user to interact with a browser (e.g., "Open the browser and click the button", "Verify the UI looks correct").
- **PREFER** automated verification methods, such as terminal commands, tests, or scripts.
- If visual verification is absolutely necessary, the agent should use the `browser` tool itself to capture screenshots or recordings and present them to the user in a `walkthrough.md`, rather than asking the user to do it.

## Rationale

The goal is to minimize the manual effort required from the user during the verification phase and to leverage the agent's capabilities for automated and assisted verification.
