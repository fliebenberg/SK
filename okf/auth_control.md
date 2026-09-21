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
timestamp: 2026-09-21T12:00:00Z
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
4.  **Event-Scoped Grant (Tournament Organiser / Sport Organiser / Division Convenor)**:
    - **Not a membership, and not an org role.** A named person is granted edit rights over one
      container: a whole tournament (`event_organizers`), one of its sports
      (`event_sport_organizers`, added 2026-09-20) or one of its divisions
      (`division_organizers`). This is the only source of authority in the app that is neither
      derived from a membership nor global. Added by the tournaments work (D33); see
      [tournaments-implementation-plan.md §0.1](file:///c:/Fred/Coding/SK/docs/tournaments-implementation-plan.md).
    - **Which scope a payload names is `organizerScopeOf`'s answer**, in
      [shared/src/utils/organizerScope.ts](file:///c:/Fred/Coding/SK/shared/src/utils/organizerScope.ts),
      and never a field test written out again. A sport grant carries an `eventId` *and* a
      `sportId`, so "has an `eventId`" stopped meaning "event scope" when the sport scope arrived;
      the gate, the manager, both handlers and the picker all ask the one function.
    - **Keyed on the profile, not the user account.** `AccessManager` already resolves a user into a
      set of `org_profiles` ids, matching by `user_id` **or** verified email, so a grant can be made
      before the person has an account and needs no rewrite when they claim one.
    - **What each scope carries**:
        - *Event organiser* — everything an org admin can do **within that tournament**, including
          deleting it, changing which orgs are invited, and appointing further organisers. Nothing
          outside it. Safe because the two grants have different sources: the hosting org's admins
          get their rights from *being admins*, so an appointee can never lock them out, and any
          admin can withdraw the grant at any time.
        - *Sport organiser* (2026-09-20) — everything a convenor of **every division of that
          sport** holds, plus the two things a convenor does not: the division's own record
          (name, age group, weighting) and **adding and deleting divisions** of their sport. They
          may appoint co-organisers of their sport and convenors to its divisions, withdrawing only
          the people they appointed. **A rule, not a list**: it covers a division of that sport
          added tomorrow, and stops covering one moved to another sport, with no row touched. Three
          things are outside it and all are decisions about the *tournament* rather than the sport:
          moving a division between sports, deleting the sport's **last** division (which would take
          the sport out of the tournament, U52 — refused in the handler), and any event-scope
          appointment. The key is **(event, sport)**: the same sport at another tournament is
          somebody else's job.
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
      membership snapshot (30s TTL) and **never** on the write path. A **sport** grant is resolved
      into the divisions it currently covers inside `getGrantSnapshot`, rather than becoming a third
      set every reader has to know about — every reader is asking "may they join this division's
      room?", and the answer is the same whichever scope supplies it.

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
| May they write this organisation's things? | `wss/orgGate.ts` — one table for teams, sites, facilities, members, leagues and events |

**Every action the server handles is authorised somewhere**, and that is now asserted rather than
hoped: [org-permissions.ts](file:///c:/Fred/Coding/SK/server/src/scripts/org-permissions.ts) reads the
action handler's `case` list from source and fails on any action that is in none of the four gates
(tournament, profile, organisation, scoring) and not one of the five that check in their own
handler. Add a handler without a gate and that script says so, which is the property that was
missing for forty-five actions until 2026-09-21.

## An organisation's things are written by the people who run it

[orgGate.ts](file:///c:/Fred/Coding/SK/server/src/wss/orgGate.ts) holds one rule per action: how to
find the organisation it touches, and what the caller must be. Until 2026-09-21 none of these
actions checked anything — not even a sign-in — and several were serious: `ADD_ORG_MEMBER` would
make anybody an admin of any organisation, `DELETE_ORG` and `DELETE_TEAM` acted on anybody's, and
`CLAIM_ORG` took the claimant from the payload.

- **Admin or staff** manage the organisation's things — the same pair `canManageOrgPeople`,
  `canEditEventOrGame` and `canScoreGame` use.
- **Admin only** for its identity and who runs it: renaming or deleting it, and **handing out the
  admin role**. Staff may add an ordinary member, but granting admin is how a staff member would
  otherwise promote themselves, so it has a check of its own.
- **App administrators** for the operator's levers — the direct `CLAIM_ORG`, which no client sends,
  and the cache resets that broadcast a refresh to every connected client.
- **The caller** for anything naming a user: a payload's `userId` must be the socket's, including a
  claim by token, which makes that user an admin. A notification is its owner's.
- **The token** for the email-link actions, whose pages are opened signed out.

## Person records are identity, and are written by the organisation that holds them

`org_profiles` is what `AccessManager` resolves a user *into* — by `user_id` or verified email — and
a profile's memberships are what confer org rights. A write to a profile is therefore a write to
identity, which is why `ADD_ORG_PROFILE`, `UPDATE_ORG_PROFILE`, `DELETE_ORG_PROFILE` and
`LINK_USER_PROFILE` are gated on **admin or staff of the organisation holding the profile**
(`PEOPLE-2`, closed 2026-09-03). Two of them were previously an org-admin takeover available to any
signed-in user.

The one exception is creation: somebody who may organise an event may create a profile in the org
**hosting that event**, so an organiser can appoint a convenor who is not on the app yet (U12).

**Unclaimed organisations accept a minimum from anybody signed in** (2026-09-21). Nobody owns an
unclaimed organisation, so nobody else can add its teams or people — and an outsider doing so is an
incentive for somebody from it to claim it. So any signed-in user may create a team (name, sport and
age group) or a person (a name) in one, with the gate **cutting the payload down** to those fields
rather than trusting the client to have sent less. A person's email is the field that matters most
to leave behind: `AccessManager` matches users to profiles by verified email, so a profile carrying
somebody's address is one that can be matched to them. Once the organisation is claimed, none of
this applies and the rest waits for its owners.

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
