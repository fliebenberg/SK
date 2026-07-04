---
name: okf-maintenance
description: Guidelines on how to maintain the Open Knowledge Format (OKF) files in the codebase when implementing new features, modifying APIs, database schemas, or project rules.
---

# OKF Maintenance Guidelines

To keep the codebase map accurate and lightweight for AI agents, developers and agentic assistants must keep the Open Knowledge Format (OKF) bundle in `okf/` up-to-date.

## When to Update OKF Files

Update the OKF files under `okf/` whenever your task involves:
1. **Adding/Removing System Folders or Modules**: Update [architecture.md](file:///c:/Fred/Coding/SK/okf/architecture.md) if folder boundaries shift.
2. **Database migrations or storage shifts**: Update [database.md](file:///c:/Fred/Coding/SK/okf/database.md) if schemas, tables, seed strategies, or caching systems change.
3. **API endpoint additions or WebSockets protocol updates**: Update [api_comms.md](file:///c:/Fred/Coding/SK/okf/api_comms.md) to register new route managers, WebSocket namespaces, or modular registries.
4. **Style adjustments or theme updates**: Update [design_system.md](file:///c:/Fred/Coding/SK/okf/design_system.md) if variables, colors, or fonts change.
5. **New Agentic rules or skills**: Update [skills_index.md](file:///c:/Fred/Coding/SK/okf/skills_index.md) if new skills are created in `.agent/skills/`.

## General Principles

1. **Reference-First**: Do not write low-level code implementation details in the OKF. Instead, reference the actual files (e.g. `server/src/db.ts`) or detailed docs (e.g. `docs/design_spec.md`).
2. **YAML Frontmatter Integrity**: Every OKF document must maintain its frontmatter header:
   ```yaml
   ---
   type: concept  # or "index" for index.md
   title: <Title of the Concept>
   description: <One-line summary>
   tags:
     - <tag1>
     - <tag2>
   timestamp: <YYYY-MM-DDTHH:mm:ssZ>
   ---
   ```
3. **Links**: Use absolute file links (e.g. `[db.ts](file:///c:/Fred/Coding/SK/server/src/db.ts)`) for files. Ensure they are correct and clickable.
