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
timestamp: 2026-10-31T00:00:00Z
---

# Authentication & Authorization Levels

ScoreKeeper secures routes and resources using JWT tokens and membership-based permission levels.

What each role may see and do, page by page — and the permission questions still open — is in
[docs/permissions.md](file:///c:/Fred/Coding/SK/docs/permissions.md). This file is how the server enforces it.

## Authentication Strategy

*   **Mechanism**: JWT token authentication stored in local `SecureStore` (mobile) or cookies/session storage (web).
*   **Token Refresh & Handlers**: Managed via the client authentication store and auth headers on HTTP/WS handshakes.

## Authorization Hierarchy

1.  **Public (Unauthenticated)**:
    - View landing page, directories, search, and watch live scoreboards.
    - **Except a private organisation** (`ORG-14`): it and everything it owns are seen only by its
      current members and app admins, at the read boundary (lists filter with `ORG_VISIBLE`, public
      rooms close) — never by hiding in the app. Rules: [org-profile.md](file:///c:/Fred/Coding/SK/docs/org-profile.md) §5.3.
2.  **Authenticated User**:
    - Manage their own profiles, save user preferences, and follow teams.
3.  **Organization/Team Member**:
    - Permissions are granted at the **Membership** level, not the User level. A single User can have different roles across different organizations.
    - **What each role is for, and what it may do page by page, is
      [docs/permissions.md](file:///c:/Fred/Coding/SK/docs/permissions.md)** (decided and built
      2026-10-31). In short:
    - **Admin**: the organisation itself — its profile, settings and who holds which org role. There is no separate owner role: the org's creator (`creator_id`) is a record of who created it, not a permission or a label (`ORG-11`).
    - **Staff**: its day-to-day admin — people (as Members), teams, sites, fixtures, tournaments, leagues, scoring, answering invitations. No org-role decisions (`PERM-2`).
    - **Member**: belongs to it; no workspace (`PERM-4`).
    - **Coach** (team role): an admin's rights over their own team, bar deleting it and changing its Coach; an **Assistant Coach** the same, bar appointing assistant coaches (`PERM-5`). Checked by `AccessManager.teamCoachRole`, `coachesPerson` and `coachesInOrg`, used by the org gate's `team-record`, `team-roster`, `team-person`, `add-event` and the profile gate. A coach also runs their team's **single matches** (`coachesSingleMatch`, inside `canEditEventOrGame`), creating one through `add-event` plus `organize-fixture`, which holds its game to one of their teams.
    - **Team Scorer** (team role): scores every game the team plays (`PERM-6`).
    - **Game officials** (`game_officials`, per game): `SCORER` and `REFEREE` (*Match official*) score; `TIMEKEEPER` keeps time only — `UPDATE_GAME_CLOCK`, `UPDATE_GAME_STATUS` (not cancelling) and `REMOVE_SIN_BIN`, through `canKeepTime` in the scoring gate (`PERM-7`). Appointed by whoever may edit the fixture (`ADD_GAME_OFFICIAL`, the org gate's `appoint-official`), from the host's people.
    - **Who picks a side's team for a game** (`SCORE-19`, 2026-10-22; `AccessManager.canPickSide`, org
      gate `pick-side`): each organisation its own — the side's coach, or its organisation's admins and
      staff. In a tournament the people who run it — organisers, the division's convenors, the host's
      admins and staff — may pick for any side as well; in a single match the host picks only its own.
      Scoring a game does not include picking the other side's team.
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
    - **A sport organiser and a division convenor edit, score and pick sides for their divisions'
      fixtures** (`PERM-6`): `runsGameDivision` — a division grant, or a sport grant covering the
      division — is checked in `canEditEventOrGame`, `canScoreGame` and `canPickSide`.
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

5.  **Team duty (coach, assistant coach, appointed scorer)** — added 2026-09-26 (`MEMBER-3`):
    - **A third way into a `member` room**, after membership and tournament grants. An active
      `role-coach` / `role-assistant-coach` team membership opens that team's `team:{id}` and
      `team:{id}:members` rooms and the `game:*` rooms of games it plays; a `game_officials`
      `SCORER` entry opens that game's rooms. `canScoreGame`'s coach and scorer checks are the
      write-side half. Both match the user's profiles by **identity** (`PROFILE_IDS_FOR_USER`: user
      id or verified email) — until 2026-09-26 `canScoreGame` matched `user_id` only, which missed
      everyone linked by email.
    - Team scorers (`role-scorer`) and every kind of game official count as duties too (`PERM-6`,
      `PERM-7`), in `getDutySnapshot` and `canScoreGame`.
    - It changes nothing for an ordinary member, whose membership already opens the same rooms. It
      exists for a **restricted minor** (below) appointed to coach or score. There are no outside
      coaches: everyone on a team is a Member of its organisation at least (`MEMBER-4`, decided
      2026-10-22), and `ADD_TEAM_MEMBER` refuses a profile from another organisation.

6.  **Minors: a membership without a member's privileges** — added 2026-09-26 (`MEMBER-3`):
    - A minor (younger than the org's minor age, or anyone with an active guardian) has member
      privileges only if the organisation allows minors their own account **and** the minor's own
      setting is not an explicit no. Otherwise the membership is **restricted**.
    - **Privilege, not identity.** A restricted minor is still linked to their profile by email,
      still listed in their own memberships (with `restrictedReason`), and still sees the org as
      theirs. Only the org-wide privilege checks — `getOrganizationRole`, `getMembershipSnapshot`
      (and everything built on them), the admin half of `isAdminOrCoach` — treat them as an
      outsider, through one SQL rule in
      [minorAccess.ts](file:///c:/Fred/Coding/SK/server/src/managers/minorAccess.ts) that must match
      `memberAccess` in `@sk/shared`. Identity checks (`ownsOrgProfile`, `PROFILE_IDS_FOR_USER`,
      organiser grants) and team duties are untouched.
    - **The app's workspace follows the role** (`PERM-4`). `orgAccess` in
      [orgAccess.ts](file:///c:/Fred/Coding/SK/expo-app/utils/orgAccess.ts) (`useOrgAccess` on a
      screen) says how much is the viewer's: `full` for Admin and Staff, `team` for a team duty
      (coach, assistant coach, team scorer — restricted minors included), nothing for a plain Member.
      `AuthGuard` admits on it, or on an appointment the server reports (`event_capabilities`,
      `game_capabilities`) for that tournament's or game's pages; the workspace menu and Control
      Panel list only the pages the scope opens (`mayOpenWorkspacePage`), and any other page goes back
      to the Control Panel. The Organisations list and an org's public page use the same rule:
      *Manage Workspace* for Admin and Staff, *Open Workspace* for a team duty.
    - **Guardians hold no membership.** Being a guardian is derived from an active
      `profile_guardians` link, so a guardian reads nothing org-wide; what they see of their child
      arrives as `dependants` in their own `USER_MEMBERSHIPS_UPDATED`.
    - Who may change what: guardian links — admin or staff; a minor's own setting — an active
      guardian, or an Admin only while the minor has none; the org's minors setting — Admin only.
      See [identity_structure.md](file:///c:/Fred/Coding/SK/docs/identity_structure.md) §5.
    - **A spreadsheet import (`IMPORT_ORG_PEOPLE`) is admin or staff**, because it never makes an
      Admin, changes an Admin's role, or changes the email of someone on ScoreKeeper — each would move
      access. Rules: [identity_structure.md](file:///c:/Fred/Coding/SK/docs/identity_structure.md) §8.

7.  **Global Admin**:
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
| May they score this fixture, or record its result? | `canScoreGame` (admits the host's admins and staff, an organiser and the division's convenor — so every editor is also a scorer) |
| What may they do in this tournament? | `getEventCapabilities` → `{ canEditEvent, convenesDivisionIds }` |
| May they join this room / read this query? | `wss/roomAccess.ts` / `wss/dataAccess.ts` |
| May this tournament write proceed? | `wss/tournamentGate.ts` — one gate for every tournament action |
| May they write this person record? | `canManageOrgPeople`, enforced by `wss/profileGate.ts` |
| May they write this organisation's things? | `wss/orgGate.ts` — one table for teams, sites, facilities, members, leagues and events |

**Every authorisation decision happens in a gate, before the handler runs — and nowhere else.**
No handler checks who is asking: if an action reaches the switch in `index.ts`, a gate let it
through. That is asserted rather than hoped:
[org-permissions.ts](file:///c:/Fred/Coding/SK/server/src/scripts/org-permissions.ts) reads the
handler's `case` list from source and fails on any action no gate names, with **no list of
exceptions**. Five actions (`UPDATE_EVENT`, `DELETE_EVENT`, `UPDATE_GAME`, `DELETE_GAME`,
`ADD_AGE_GROUP`) checked inside their handlers until 2026-09-21 and sat on an allowlist; moving them
into `orgGate` removed the list, which matters more than the tidiness — an allowlist entry could lose
its handler check and the coverage check would never notice.

**Gates decide permission; handlers decide validity.** `ADD_AGE_GROUP` shows the line: whether you
may add one (signed in) is the gate's, whether the sport exists ("Choose a sport first") is the
handler's. Keeping that line is what stops the gate becoming a second copy of every handler.

**A fixture has two write paths, planning and the result, each with its own permission.**
`UPDATE_GAME` is planning — teams, time, venue, cancel and reinstate — under `edit-fixture`.
The result belongs to the scoring actions, and `RECORD_GAME_RESULT` records it after the fact (a
score, or *score not provided*) under `canScoreGame`. What each path may carry is validation, in the
handler, by [fixtureRules.ts](file:///c:/Fred/Coding/SK/server/src/wss/fixtureRules.ts). Until
2026-09-21 `UPDATE_GAME` carried both and picked its rule by inspecting the payload.

**A refusal is logged once, naming the gate and the rule.** Each gate runs inside `gate()` in
`index.ts`, which writes `[Gate] organisation refused DELETE_TEAM for user-… rule=manage-org: …`
before the client is told. The `rule` comes from `GateRefusal`, so it reaches the log and never the
client — which is also where the identity gate records *which* profile somebody tried to act as.

## An organisation's things are written by the people who run it

[orgGate.ts](file:///c:/Fred/Coding/SK/server/src/wss/orgGate.ts) holds one rule per action: how to
find the organisation it touches, and what the caller must be. Until 2026-09-21 none of these
actions checked anything — not even a sign-in — and several were serious: `ADD_ORG_MEMBER` would
make anybody an admin of any organisation, `DELETE_ORG` and `DELETE_TEAM` acted on anybody's, and
`CLAIM_ORG` took the claimant from the payload.

- **Admin or staff** manage the organisation's things — the same pair `canManageOrgPeople`,
  `canEditEventOrGame` and `canScoreGame` use.
- **Admin only** for its identity, its settings and who runs it: its profile, timezone, privacy and
  minors settings, deleting it, and **every org-role decision** (`PERM-2`, 2026-10-31). Staff add
  and remove **Members** only: `ADD_ORG_MEMBER` from staff must give `role-org-member`,
  `UPDATE_ORG_MEMBER` (whose only change is the role) is admin-only, `REMOVE_ORG_MEMBER` from staff
  must name a Member, and a staff spreadsheet import has its role column dropped by the gate, so it
  adds Members and changes nobody's role. Otherwise a staff member could promote themselves or
  demote the admins.
- **Answering a tournament invitation** for the organisation or one of its teams — accepting,
  declining, asking to withdraw or to enter, naming its own place — is its **admins and staff**
  (the `answer-invitation`, `answer-entrant`, `request-entry` and `own-placeholder` gates; admins
  only from `FIX-31` until `PERM-2`), plus a team's coach for their own team.
- **App administrators** for the operator's levers — the cache resets that broadcast a refresh to
  every connected client. (The direct `CLAIM_ORG` was removed 2026-10-03, `ORG-12`: an app admin is
  never an org's admin, so it could only mark an org claimed with nobody running it.)
- **The caller** for anything naming a user: a payload's `userId` must be the socket's, including a
  claim by token, which makes that user an admin. A notification is its owner's.
- **The token** for the email-link actions, whose pages are opened signed out.

**Two ways to become an admin without being made one** (docs/nomination-process.md §4). A claim
link: whoever holds it becomes admin — nobody may nominate their own address, but a nomination proves
nothing about who is nominated (`ORG-9`). And `TAKE_ORG_ADMIN`, for an org with **no active admin**:
a member of `admin_takeover_min_days` standing (member and staff alike), or anyone when no one else
with an account is a member. The gate only requires a sign-in; `ReferralManager.getAdminTakeover`
decides. `is_claimed` is stored, so every path that changes an org's memberships must end in
`syncClaimedStatus`, or an org keeps claiming an admin it no longer has — and **nothing else writes
it** (`ORG-12`): a new org is saved unclaimed, and `ADD_ORG` and `UPDATE_ORG` ignore `isClaimed`.
The one exception is `claimOrgViaToken`, which sets it in the transaction that inserts the admin.

## Person records are identity, and are written by the organisation that holds them

`org_profiles` is what `AccessManager` resolves a user *into* — by `user_id` or verified email — and
a profile's memberships are what confer org rights. A write to a profile is therefore a write to
identity, which is why `ADD_ORG_PROFILE`, `UPDATE_ORG_PROFILE`, `DELETE_ORG_PROFILE` and
`LINK_USER_PROFILE` are gated on **admin or staff of the organisation holding the profile**
(`PEOPLE-2`, closed 2026-09-03). Two of them were previously an org-admin takeover available to any
signed-in user.

The one exception is creation: somebody who may organise an event may create a profile in the org
**hosting that event**, so an organiser can appoint a convenor who is not on the app yet (U12).

**Unclaimed organisations accept a minimum from somebody setting up a game or tournament** (2026-09-21;
narrowed 2026-10-31, `PERM-11`). Nobody owns an unclaimed organisation, so nobody else can add its teams
or people — and an outsider doing so is an incentive for somebody from it to claim it. So anyone who
may set up fixtures (`AccessManager.maySetUpFixtures`: Admin or Staff somewhere, a coach, or an
appointed organiser) may create a team (name, sport and age group) or a person (a name) in one, with the gate **cutting the payload down** to those fields
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
