---
type: concept
title: Authentication & Authorization Levels
description: User authentication, JWT handlers, global vs local roles, and permission levels.
tags:
  - concept
  - authentication
  - roles
  - permissions
  - security
timestamp: 2026-08-08T17:35:00Z
---

# Authentication & Authorization Levels

ScoreKeeper secures routes and resources using JWT tokens and membership-based permission levels.

## Authentication Strategy

*   **Mechanism**: JWT token authentication stored in local `SecureStore` (mobile) or cookies/session storage (web).
*   **Token Refresh & Handlers**: Managed via the client authentication store and auth headers on HTTP/WS handshakes.

## Authorization Hierarchy

1.  **Public (Unauthenticated)**:
    - View landing page, directories, search, and watch live scoreboards.
2.  **Authenticated User**:
    - Manage their own profiles, save user preferences, and follow teams.
3.  **Organization/Team Member**:
    - Permissions are granted at the **Membership** level, not the User level. A single User can have different roles across different organizations.
    - **Owner / Admin**: Full administrative control over the Organization.
    - **Manager**: Manage event schedules, add teams, and edit rosters.
    - **Scorekeeper / Official**: Authorized to open the scoring console and update game states in real-time.
    - **Coach**: Manage team lineups and view restricted rosters.
    - **Player**: View personal schedules and access internal team details.
4.  **Global Admin**:
    - **Single Source of Truth**: Global Admin status (`globalRole === 'admin'`) is derived dynamically from active membership in the System Administration Organization (`org-system-admins`, `id: 'org-system-admins'`).
    - **Privileged Account Isolation**: Global Admins use dedicated admin user accounts that belong exclusively to `org-system-admins` and cannot hold memberships in standard user organizations/teams, preventing profile collision.
    - **Platform Access**: Has complete, unrestricted read/write administrative access across the platform.
