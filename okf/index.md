---
type: index
title: Open Knowledge Format Index
description: Primary entrypoint for the ScoreKeeper Open Knowledge Format (OKF) bundle.
tags:
  - index
  - entrypoint
  - documentation
timestamp: 2026-08-08T17:35:00Z
---

# ScoreKeeper OKF Index

Welcome to the ScoreKeeper Open Knowledge Format (OKF) index. This directory provides a structured, agent-friendly map of the ScoreKeeper codebase, mapping high-level concepts and system requirements to their respective implementations and detailed documentation.

## Knowledge Graph

Below are the key concept files in this bundle. AI agents should read these to ground themselves in specific domains before making codebase modifications:

- **[Project Overview](file:///c:/Fred/Coding/SK/okf/project_overview.md)** (`type: concept`): High-level system context, user archetypes, and project-wide glossary.
- **[Codebase Architecture](file:///c:/Fred/Coding/SK/okf/architecture.md)** (`type: concept`): Map of project directories, active vs deprecated client folders, and architectural boundaries.
- **[Client Routing & Pages](file:///c:/Fred/Coding/SK/okf/client_routing.md)** (`type: concept`): Map of public and admin routes, layout structures, and navigation guard requirements.
- **[Authentication & Roles](file:///c:/Fred/Coding/SK/okf/auth_control.md)** (`type: concept`): Authentication strategy, JWT tokens, membership roles, and permission hierarchies.
- **[Design System](file:///c:/Fred/Coding/SK/okf/design_system.md)** (`type: concept`): Visual/styling rules, colors, typography, and Light Mode AAA accessibility requirements.
- **[Database & Persistence](file:///c:/Fred/Coding/SK/okf/database.md)**: Persistence engines, PostgreSQL configurations, schema details, and migration steps.
- **[API & WebSockets](file:///c:/Fred/Coding/SK/okf/api_comms.md)** (`type: concept`): Real-time communications framework, subscription models, REST fallbacks, and sport scoring registries.
- **[Git Workflow](file:///c:/Fred/Coding/SK/okf/git_workflow.md)** (`type: concept`): Git branching rules and development workflows.
- **[Agentic Skills Index](file:///c:/Fred/Coding/SK/okf/skills_index.md)** (`type: concept`): Catalog of workspace-specific agent guidelines under `.agent/skills/`.


## Maintenance

This OKF bundle is maintained automatically by development agents following the instructions in [.agent/skills/okf-maintenance/SKILL.md](file:///c:/Fred/Coding/SK/.agent/skills/okf-maintenance/SKILL.md). Whenever features, schemas, designs, or workflows are altered, these OKF documents must be reviewed and updated accordingly.
