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
timestamp: 2026-09-03T00:00:00Z
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
4.  **Event-Scoped Grant (Tournament Organiser / Division Convenor)**:
    - **Not a membership, and not an org role.** A named person is granted edit rights over one
      container: a whole tournament (`event_organizers`) or one of its divisions
      (`division_organizers`). This is the only source of authority in the app that is neither
      derived from a membership nor global. Added by the tournaments work (D33); see
      [tournaments-implementation-plan.md §0.1](file:///c:/Fred/Coding/SK/docs/tournaments-implementation-plan.md).
    - **Keyed on the profile, not the user account.** `AccessManager` already resolves a user into a
      set of `org_profiles` ids, matching by `user_id` **or** verified email, so a grant can be made
      before the person has an account and needs no rewrite when they claim one.
    - **What each scope carries**:
        - *Event organiser* — everything an org admin can do **within that tournament**, including
          deleting it, changing which orgs are invited, and appointing further organisers. Nothing
          outside it. Safe because the two grants have different sources: the hosting org's admins
          get their rights from *being admins*, so an appointee can never lock them out, and any
          admin can withdraw the grant at any time.
        - *Division convenor* — everything within their division: entrants, stages, fixtures,
          results and adjustments — and **co-convenors** for that division: they may appoint them,
          and withdraw only the ones they appointed (revised 2026-09-19; the handler checks
          `granted_by_org_profile_id`). Not the division's own record (name, sport, age group,
          weighting), not the event's settings, not another division, and never an event-scope
          appointment.
    - **The workspace constraint does not apply to a grant.** `canEditEventOrGame` normally requires
      the caller to be acting from the event's own org, which stops a membership-derived right
      leaking across workspaces. An appointee may hold no membership anywhere — that is the point of
      being able to appoint an external specialist — so there is no workspace for them to act from,
      and the grant is checked before that constraint.
    - **The grant ends with the event.** Both tables cascade from their parent.
    - **Reads as well as writes.** A convenor with no membership must still see the roster of the
      division they run, so `roomAccess` admits a grant on `division:{id}` and on the internal
      `game:{id}` tiers of that division's fixtures. Grants are cached on the read path beside the
      membership snapshot (30s TTL) and **never** on the write path.

5.  **Global Admin**:
    - **Single Source of Truth**: Global Admin status (`globalRole === 'admin'`) is derived dynamically from active membership in the System Administration Organization (`org-system-admins`, `id: 'org-system-admins'`).
    - **Privileged Account Isolation**: Global Admins use dedicated admin user accounts that belong exclusively to `org-system-admins` and cannot hold memberships in standard user organizations/teams, preventing profile collision.
    - **Platform Access**: Has complete, unrestricted read/write administrative access across the platform.

## Where each decision is made

There is one rulebook: [AccessManager](file:///c:/Fred/Coding/SK/server/src/managers/AccessManager.ts).
Screens never re-derive a permission the server enforces — the one place a client answers the same
question is [matchPermissions.ts](file:///c:/Fred/Coding/SK/expo-app/utils/matchPermissions.ts), and
it is written to mirror `canEditEventOrGame` rather than to invent a second rule.

| Question | Function |
| --- | --- |
| May they edit this event or fixture? | `canEditEventOrGame` (admits an appointed event organiser) |
| May they organise this event, asked without a workspace? | `canOrganizeEvent` |
| May they organise this division? | `canOrganizeDivision` |
| May they score this fixture? | `canScoreGame` (admits an organiser and the division's convenor) |
| What may they do in this tournament? | `getEventCapabilities` → `{ canEditEvent, convenesDivisionIds }` |
| May they join this room / read this query? | `wss/roomAccess.ts` / `wss/dataAccess.ts` |
| May this tournament write proceed? | `wss/tournamentGate.ts` — one gate for every tournament action |
| May they write this person record? | `canManageOrgPeople`, enforced by `wss/profileGate.ts` |

## Person records are identity, and are written by the organisation that holds them

`org_profiles` is what `AccessManager` resolves a user *into* — by `user_id` or verified email — and
a profile's memberships are what confer org rights. A write to a profile is therefore a write to
identity, which is why `ADD_ORG_PROFILE`, `UPDATE_ORG_PROFILE`, `DELETE_ORG_PROFILE` and
`LINK_USER_PROFILE` are gated on **admin or staff of the organisation holding the profile**
(`PEOPLE-2`, closed 2026-09-03). Two of them were previously an org-admin takeover available to any
signed-in user.

The one exception is creation: somebody who may organise an event may create a profile in the org
**hosting that event**, so an organiser can appoint a convenor who is not on the app yet (U12).

**A profile is not a membership.** A person with a profile and no `org_memberships` row is recorded
by that organisation and belongs to it in no way that confers anything — which is exactly what an
external tournament convenor is. "External" is a *derived* label, never a stored role: a
`role-org-external` membership row would be counted by `getMembershipSnapshot` like any other and
would open the org's member-tier rooms. See `MEMBER-1` and `MEMBER-2` in `TODO.md` for the
invite/apply membership model and the reserved home for unaffiliated people.

**Capability flags are computed from the user and the event, never from the `orgId` in the route**,
and they are delivered as their own per-user read (`get_data { type: 'event_capabilities' }`) rather
than stamped onto the event or the division — a room broadcast reaches everyone in the room, so one
viewer's `canEdit` on a shared object would be shown to every other viewer of it.

`server/src/scripts/phase4-permissions.ts` replays this whole model against the real gate and
asserts both directions of every rule.
