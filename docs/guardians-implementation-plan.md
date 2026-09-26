# Guardians — Phased Implementation Plan

**Status:** **Complete, 2026-09-26.** All five phases done; `MEMBER-3` is closed and archived. What remains is tracked as `MEMBER-5` (Trusted Contacts), `MEMBER-6` (guardians acting for a child) and `PEOPLE-9` (a Guardians view on the People screen). The design as built is [identity_structure.md](file:///c:/Fred/Coding/SK/docs/identity_structure.md) §5; this plan is the record of how it got there.
**Implements:** `MEMBER-3` in [TODO.md](file:///c:/Fred/Coding/SK/TODO.md), designed in
[identity_structure.md](file:///c:/Fred/Coding/SK/docs/identity_structure.md) §5. This plan changes
that design in two places (§0.1, §0.3). The design doc is rewritten to match in Phase 5.
**Reading order:** §0 (decisions) → the phase table → the phases.

## What we are building

Decided with the user on 2026-09-24 and 2026-09-26:

1. **The full way of recording guardians**, not just the tables.
2. Guardians are recorded **on the player's profile** and **when the player is added** (People
   screen and team roster).
3. **A minor gets member privileges only if both the organisation and their guardians allow it — their account still links to their profile either way** (§0.3).
   When they are allowed, **both admins and guardians can invite them**.
4. A guardian who accepts gets **their own profile and a view of the child**, on a **My Family**
   screen.
5. **Guardians are never counted for pricing.**

Out of scope: responding to availability, acknowledging selection, name/photo consent (`PEOPLE-4`),
Trusted Contacts (§5.5), messages addressed to the guardian, and what each level may *read*
(`PEOPLE-8`, parked for the public-viewing work).

Every phase is verified the way the tournaments plan does it: a `ts-node` script over a real socket
against the fixed test organisations (`sk_test`, `fx-` ids; edge-case rows made in the test with
`test-` ids, per [test-org-reuse](file:///c:/Fred/Coding/SK/.agent/skills/test-org-reuse/SKILL.md)),
Vitest for pure rules in `shared/`, and named manual checks in the app. The fixtures already hold
minors: every U14 and U16 player has a birthdate that makes them one. They hold no guardians.

---

## 0. Decisions

### 0.1 Being a guardian is derived from a link, never stored as a membership — *decided 2026-09-26*

This changes §5.1, which gave guardians a `Guardian` org membership role. Checked against the code,
that role would have been dangerous in three places:

- **A membership row is a permission.** Any active membership of any role opens the org's people
  list, every roster and every game's internals (`PEOPLE-8`), and the client's `AuthGuard` would
  open the whole admin area. A parent would see every other child in the school.
- **A person can hold only one active org role.** `UserManager.addOrganizationMember` *replaces* the
  existing role, so a teacher who is also a parent would lose `Staff`.
- **Every role check would need an exception**, and missing one would leak data.

So a guardian is an ordinary `org_profile` in the child's org with their own email, and **holds no
membership** unless they have one for another reason. Everything a guardian may see or do comes from
an active `profile_guardians` link, for that child only. The same principle as "External is derived,
never stored" (`MEMBER-2`).

What this settles:
- **Pricing.** No membership means no count. The counting-role allow-list and the `TeamManager` fix
  (§5.6) stay recorded for any future non-counting role, but this plan needs neither.
- **A parent who is also staff or a coach** keeps their own membership. The link adds to it.

What it costs: **guardian-only profiles are not in the People list**, which lists memberships and
routes by `membershipId`. Here they are found and edited through the child's profile. A Guardians
view on the People screen is carried forward.

### 0.2 The guardian's screen is "My Family" — *decided 2026-09-26*

A new screen in the main tabs and the desktop rail, shown only when the signed-in user is a guardian
of at least one player. For each child it shows:
- their name, photo, org and teams;
- upcoming fixtures;
- whether they may have their own account;
- the guardian's own details at that org.

The admin area is not an option, because a guardian has no membership.

### 0.3 Minors' access: the org decides first, then the guardians — *decided 2026-09-26*

This changes §5.3, which said age must never decide the answer. For **account access** it now does,
deliberately and per organisation.

**Who is a minor, per organisation.** A player is a minor in an org when either:
- their birthdate makes them younger than **the org's minor age**, which defaults to **18** and can be
  changed by an admin (for example 16, if older teenagers may have full access); or
- they have **an active guardian link**, whatever their age. Whoever answers for them decides.

A player with no birthdate and no guardian is treated as an adult.

**The rule, resolved in this order:**

1. **Org switch "Minors may have their own ScoreKeeper account"** is **off by default**. While it is
   off, **no minor has access**, whatever any guardian says.
2. **The switch is on:** every minor is **allowed by default**,
3. **unless the minor's own setting says otherwise.** This is **one setting per minor**, not one per
   guardian. Any of the minor's active guardians may change it, and the last change stands. It is
   stored as a tri-state: `NULL` (never set, so it follows the default), `true` or `false`. Like
   §7.4, a blank must never mean the same as an explicit refusal. The time it was set and who set it
   are recorded.

A minor with no guardian recorded is allowed whenever the switch is on.

**A blocked minor is still a member, but without a member's privileges** — *clarified by the user
2026-09-26.* Linking an account to a profile by email stays exactly as it is: a minor who signs up
with the address on their profile is linked to it, sees that they belong to the organisation and
which teams they are on, and can see their own record. What they do not get is anything a membership
*grants*. They are treated as an outsider for every org-wide privilege check, so they cannot:
- read the org's people list, or any roster other than a team they coach or score for (below);
- read game internals, other than those games;
- use the full search projection;
- enter the admin area.

**Team-role duties still work** — *decided by the user 2026-09-26.* A restricted minor appointed as
a coach, assistant coach or scorer can still do that job, **limited to the team, or game, the role
belongs to**. That needs something new. Today a coach reads their team's roster and games through
their *org membership*, not their team role. The scorer and coach checks in `canScoreGame` already
key off the role, but reading the game first goes through membership. So Phase 1 adds a **team-duty
grant** next to the existing tournament grants (`grantsFor` in `roomAccess.ts`):
- An active coach or assistant-coach team membership opens that team's `team:{id}` and
  `team:{id}:members`, and the `game:*` rooms of games that team plays.
- A `game_officials` scorer entry opens that game's `game:*` rooms.

It applies to everyone, not only minors. For an unrestricted member it changes nothing, because their
membership already opens the same rooms.

So the gate sits on **org-wide privileges, not on identity or on team duties**. There are three
separate questions, and each code path uses one of them:

| Question | Used by | Restricted minor |
|---|---|---|
| **Who is this account?** (the email match, unchanged) | the user's own memberships list, their own record, `self` rooms, `hasAccount` | Linked as normal |
| **What may this account do in the org?** | `getMembershipSnapshot`, `getOrganizationRole` and everything built on it (`isOrgMember`, `canManageOrgPeople`, `canEditEventOrGame`, `canViewGameInternals`), `isAdminOrCoach`, `ownsOrgProfile` for writes | No privileges |
| **What duty does this account hold on a team or game?** | the coach and scorer checks in `canScoreGame`, the new team-duty grant | Allowed, for that team or game only |

The email match is written out in **13 places** across `AccessManager`, `UserManager`, `TeamManager`
and `index.ts`. Phase 1 sorts each into one column of that table, and the privilege column gets one
shared SQL rule instead of its own copy. As a result:
- A guardian switching the setting off, or the org switching off or raising the age, **removes the
  privileges at once**. There is no invite to withdraw and no link to break, and switching back on
  restores them.
- The membership push tells the app, so it shows the membership as **restricted, with the reason**,
  and `AuthGuard` keeps them out of the admin area.
- **Invites are still refused** for a minor who would be restricted, with the reason. Admins and
  guardians invite only a minor who is allowed (decision 3).
- The admin sees "On ScoreKeeper, member access restricted: {reason}".

Where the settings live:
- **Org:** `organizations.settings` is an untyped bag today. This adds a declared shape to the shared
  `Organization` model, `minors: { accountsAllowed: boolean; minorAge: number }`, which the
  consent settings in `PEOPLE-4` can extend later. Only an Admin may change it.
- **Minor:** `org_profiles.own_account_allowed` (nullable boolean), `own_account_set_at` and
  `own_account_set_by` (→ `org_profiles`).

**Who may set the per-minor value** — *decided by the user 2026-09-26:*
- **Any active guardian of the minor.**
- **An org Admin, but only while the minor has no active guardian.** Once a guardian is recorded,
  the value an admin set stays in place, but only guardians can change it. `own_account_set_by`
  records whichever of them set it.

### 0.4 Parked to-do items in the same code — *decided 2026-09-26: deal with each as it becomes relevant*

| ID | Where it will come up |
|---|---|
| `PEOPLE-7` | Phase 2, which creates players and guardians through the same `addOrgProfile` upsert. Raise it again at the start of that phase. |
| `PEOPLE-8` | Parked for the public-viewing work. **This plan relies on guardians having no membership.** Its only other change to read access is the team-duty grant (§0.3), which adds a way in for coaches and scorers and takes nothing away. |
| `PEOPLE-5` | The guardian picker is kept inside the child's org, so this plan adds no cross-org exposure. |
| `PEOPLE-4` | Becomes buildable once guardians exist. |
| `MEMBER-2` | Not needed: a guardian always gets a profile in the child's org. |

---

## The phases at a glance

| Phase | Builds | Exit criterion (short) |
|---|---|---|
| 1 | Schema, shared rules, the privilege rule, guardian actions and access | Test script: links work, misuse is refused, a guardian cannot read the org's people, and a restricted minor is linked but has no member privileges, and gains them the moment they are allowed |
| 2 | Admin screens: the org's minor settings, and recording guardians | An admin sets the minor age and switch, and adds, edits and ends guardians on a profile and while adding a player, live on a second screen |
| 3 | Invites for minors | An invite for a minor offers the guardian or the child, is refused when the minor is blocked, and the guardian's email names the child |
| 4 | My Family | A guardian sees their children and nothing else, changes the per-minor setting with immediate effect, and can invite the child when allowed |
| 5 | Close-out | Docs and to-do list agree with the code; `MEMBER-3` rewritten to what remains |

Each phase starts from the one before it passing. Docs are updated inside each phase, as
[okf-maintenance](file:///c:/Fred/Coding/SK/.agent/skills/okf-maintenance/SKILL.md) requires.

---

## Phase 1 — Schema, shared rules, server

### Schema

One migration, mirrored into `init-db.ts` and catalogued in `okf/database.md`.

**`profile_guardians`:**

| Column | Notes |
|---|---|
| `id` | TEXT PK |
| `org_id` | → `organizations`. Must equal both profiles' org (checked in the manager) |
| `guardian_profile_id` | → `org_profiles` ON DELETE CASCADE |
| `player_profile_id` | → `org_profiles` ON DELETE CASCADE |
| `relationship` | `parent` / `guardian` / `grandparent` / `other`, as a CHECK constraint |
| `is_primary` | BOOLEAN default false. At most one active primary per player (partial unique index) |
| `start_date`, `end_date` | Mirrors `org_memberships`: ending a link keeps history |
| `created_by_profile_id` | → `org_profiles` ON DELETE SET NULL, like the organiser grant tables |

Plus a partial unique index on active `(guardian_profile_id, player_profile_id)` and an index on
`player_profile_id`.

**`org_profiles`:** `own_account_allowed BOOLEAN NULL`, `own_account_set_at TIMESTAMPTZ`,
`own_account_set_by TEXT → org_profiles ON DELETE SET NULL`.

**The org's `minors` settings** go inside `organizations.settings` (JSONB), so they need no column. A
missing value reads as `{ accountsAllowed: false, minorAge: 18 }`.

`deleteFixtureData` already cleans any `…_profile_id` column that starts with `fx-`, so the fixtures
need no change.

### Shared

- `ProfileGuardian` model and `GuardianRelationship` type; payloads and `ProtocolMap` entries.
- `OrgProfile` gains `ownAccountAllowed?` (`boolean | null`), `ownAccountSetAt?` and `ownAccountSetBy?`.
- `Organization.settings` gains its first declared key, `minors`.
- `shared/src/utils/guardians.ts`, pure rules with **Vitest tests**:
  - `isMinorIn(profile, orgSettings, hasActiveGuardian, today)`;
  - `accountAccess(...)`, returning `allowed`, or `blocked` with a reason (`org-off`, `guardian-off`);
  - which links are active, and who the responsible party is (§5.3);
  - whether a new link is valid.
  The tests must cover the edges: the birthday itself, no birthdate, an adult with a guardian, the org
  raising or lowering the age, and `NULL` versus `true`.
- `InviteToScoreKeeper`'s hard-coded `ADULT_AGE = 18` is replaced by the org's minor age.

### Server

**The privilege rule (§0.3).** Sort each of the 13 copies of the "user id or verified email" match
into *identity* or *privilege*.
- **The identity copies stay as they are.**
- **The privilege copies** use one shared SQL fragment for "memberships that carry privileges". It
  applies §0.3, the same logic as `accountAccess`, and drops a membership whose profile is a
  restricted minor. That covers `getMembershipSnapshot`, `getOrganizationRole`, `isAdminOrCoach` and
  `ownsOrgProfile` where it gates a write.
- **The coach and scorer checks in `canScoreGame` are left alone.** They are team duties (§0.3) and
  already key off the role, not the membership.

**The team-duty grant (§0.3).** A new `dutiesFor` on a room policy, checked next to `grantsFor`
in `canJoinRoom`:
- An active `role-coach` or `role-assistant-coach` team membership opens `team:{id}` and
  `team:{id}:members` for that team, and `game:{id}` / `:events` / `:disputes` for games the team
  plays.
- A `game_officials` `SCORER` entry opens that game's rooms.

The duties are resolved once per user alongside the membership snapshot, and share its cache and its
invalidation. The matching `get_data` types (`team_members`, `team_games`, game detail) follow their
rooms, as `dataAccess.ts` already does.

`getUserOrgMemberships` / `getUserTeamMemberships` still return every membership, each with a
`restricted` reason when it applies, so the app can show "Member — restricted". `hasAccount` is
unchanged, and a derived `memberAccess` (`full`, or `restricted` with a reason) is added next to it on
`OrgMember` and `TeamMember`.

This is the riskiest step in the plan, so it is done and tested **before** anything else in the
phase: every existing permission script must still pass unchanged.

**`GuardianManager`** lists a player's links, adds, updates (relationship, primary) and ends them.
Adding refuses:
- profiles in different orgs;
- a person as their own guardian;
- a guardian whose email equals the child's. Access is matched by email, so the parent would *become*
  the child.

**Actions:**
- `ADD_PROFILE_GUARDIAN`, `UPDATE_PROFILE_GUARDIAN` and `END_PROFILE_GUARDIAN`, gated as `manage-org`
  on the player's org (Admin or Staff).
- `SET_MINOR_ACCOUNT_ACCESS { playerProfileId, allowed: boolean | null }`, gated in a new rule:
  - allowed for an **active guardian** of that player;
  - allowed for an **org Admin only while the player has no active guardian**;
  - refused for everyone else, including Staff.
- The org's `minors` setting is saved through the existing org-settings update, gated to Admin. Its
  values are validated: `minorAge` is a whole number from 1 to 21.

Every new action is named in a gate file, or `org-permissions.ts` fails.

**Reads:** `get_data 'profile_guardians'` `{ orgId, playerProfileId }`, at the `org:{id}:members`
tier.

**Live data:**
- **A link change** broadcasts `PROFILE_GUARDIANS_UPDATED` on `org:{id}:members` with the player's
  full current link list (data, not a nudge; see
  [live-data](file:///c:/Fred/Coding/SK/.agent/skills/live-data/SKILL.md)).
- **A link change, or a change to the per-minor setting,** calls `publishUserMemberships` for every
  affected account: the guardian's and the minor's. That also clears their cached access, so a block
  takes effect immediately rather than after the 30-second cache.
- **An org-setting change** does the same for every minor in the org who has an account.

**Guardian access.** `USER_MEMBERSHIPS_UPDATED` gains `dependants`, resolved through the same access
rule:

```
{ playerProfileId, orgId, orgName, name, image, ownAccountAllowed, accountAccess, teams: [{ teamId, name, roleId }] }
```

Fixtures for those teams are already public, so a guardian needs no new room.

### Exit criterion

`server/src/scripts/test-guardians.ts` passes. It checks that:
- links can be added, changed and ended, and there is only one primary per player;
- cross-org links, self-links and shared emails are refused;
- a stranger and a plain member are refused every write;
- a signed-up guardian with no membership gets `dependants`, and is refused `org:{id}:members`,
  `team:{id}:members` and `get_data org_members`;
- **a minor who signs up with their profile email** (no invite) while the org switch is off:
  - is linked to their profile, and their membership push lists the org and their teams as
    `restricted`;
  - is refused `org:{id}:members`, other teams' `team:{id}:members`, other games' `game:{id}`, and
    the full search projection;
  - **as a coach of one team**, can join that team's roster and its games' rooms, score those games,
    and nothing beyond them;
  - **as the appointed scorer of one game**, can join and score that game only;
- that minor gets member privileges as soon as the switch is turned on;
- the minor loses them at once when a guardian sets their access off;
- the minor loses them when the org's minor age is raised above them, and regains them when it is
  lowered;
- an Admin can set the value for a minor with no guardian, is refused once a guardian exists, and
  Staff are always refused.

`org-permissions.ts`, `phase4-permissions.ts`, `test-members.ts` and `test-member-invite.ts` all
pass unchanged. `npm run check:migrations` and `verify:rooms` pass.

Docs: `database_structure.md`, `okf/database.md`, `api_actions.md`, `okf/live_rooms.md`,
`auth_control.md`.

### Done — 2026-09-26

Exit criterion met: `test-guardians.ts` passes all 65 checks; `org-permissions.ts` (46),
`test-member-invite.ts` (19), `test-transactions.ts` and `verify:rooms` pass unchanged; the shared
minors rule has 25 Vitest tests (166 in `shared/` in all); `check:migrations` passes; a fresh
`init-db.ts` build matches the migrated database for `profile_guardians` and the new `org_profiles`
columns. `phase4-permissions.ts` and `phase3-access-audit.ts` fail 2 and 5 checks — **the same
checks on the committed code before this phase**, all from the division room made public on
2026-09-11 and already logged as `LIVE-20`.

What was built, and where it differs from the plan above:

- **Only three places decide privilege, not the thirteen email matches.** Sorting them showed most
  answer *identity*. `ownsOrgProfile` and `PROFILE_IDS_FOR_USER` both mean "is this profile mine" —
  the second also carries the tournament-organiser grants, which are duties like coaching — so they
  stay identity, not privilege as §0.3's table first said. The rule sits in `getOrganizationRole`,
  `getMembershipSnapshot` and the org-admin half of `isAdminOrCoach`, through one SQL fragment in
  [minorAccess.ts](file:///c:/Fred/Coding/SK/server/src/managers/minorAccess.ts) that mirrors
  `memberAccess` in [guardians.ts](file:///c:/Fred/Coding/SK/shared/src/utils/guardians.ts).
- **`canScoreGame`'s coach and scorer checks now match by identity**, not `user_id` alone. They used
  to miss everyone linked by email, which would have stopped a minor who signed up by email from
  scoring as a coach — and also affected adults.
- **The minors setting has its own action**, `SET_ORG_MINORS_SETTINGS`, rather than going through
  `UPDATE_ORG`. The settings screen saves the whole `settings` object, so an open screen would have
  undone a minors change; `UPDATE_ORG` now keeps whatever `settings.minors` holds.
- The restriction reasons are `org-off` and `minor-off` (not `guardian-off`), because an Admin can
  also set the minor's value while there is no guardian.
- **Pulled forward from Phase 4:** the app's `AuthGuard` keeps a restricted member out of the org
  workspace — unless they coach a team there, since coaching happens in those screens.
- Found and logged, not fixed: `DB-3` (`last_invite_email`'s column position differs between a
  migrated and a fresh database, from 2026-09-24).

---

## Phase 2 — Admin screens

Raise `PEOPLE-7` first (§0.4).

**Org settings:** a **Minors** section, editable by Admin only, with:
- the switch "Minors may have their own ScoreKeeper account", off by default;
- the minor age, 18 by default;
- a one-line explanation of how guardians can switch it off for their child.

**The player's profile**
([people/[membershipId].tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/people/%5BmembershipId%5D.tsx)):
- A **Guardians** section listing each link: name, relationship, primary badge, email or phone, and
  invite status.
- Add a guardian through `PersonnelAutocomplete`, limited to this org, or create a new person (name,
  email, cellphone, relationship). Edit a guardian's details and the link in a modal. End a link
  through `ConfirmationModal`.
- Each change is its own action and saves immediately, not through the form's save bar. It is
  blocked while the form has unsaved changes, as the invite card is.
- For a minor, an **Account access** line reads, for example, "Allowed (org default)", "Switched off
  by {guardian} on {date}" or "Not allowed: minors are switched off for this organisation". **An
  Admin can change it while the minor has no guardian**. Once a guardian exists it is read-only here,
  with "Set by the guardian".
- The read-only `view.tsx` gets the same Guardians card and access line.

**When adding a player,** in the People screen's Add Person modal and the roster's Add Player modal:
- An optional **Guardian** block, open by default when the birthdate makes the player a minor under
  the org's minor age.
- The save becomes profile → membership or team → guardian profile → link, under one
  `useRequestScope`. If the player saves but the guardian does not, the screen says so and keeps the
  guardian fields filled so it can be retried
  ([action-replies](file:///c:/Fred/Coding/SK/.agent/skills/action-replies/SKILL.md)).
- Siblings: picking an existing guardian links the same profile to a second child.

**People list and roster:** a small "Guardian: {name}" line on players who have one.

**Exit criterion:** as an admin in the app:
- set the minor age to 16 and switch minors on;
- add a U14 player with a new guardian from the roster;
- add a guardian to an existing player from their profile;
- link one guardian to two siblings;
- make a second guardian primary;
- end a link.

A second window on the People screen shows each change without a refresh. Staff and plain members
cannot change the minors setting.

### Done — 2026-09-26

Exit criterion met, by driving the web app rather than by hand
([no-browser-verification](file:///c:/Fred/Coding/SK/.agent/skills/no-browser-verification/SKILL.md)):
headless Chrome, signed in as Doringkloof's admin, added a guardian to a U14 player through the
profile's modal and watched the card, the People list and the roster pick it up live; opened Add
Person and Add Player with a 2012–2013 birthdate and saw the guardian block open by itself; and
checked the Minors card on Org Settings. `test-guardians.ts` grew to 72 checks and passes, with
`test-member-invite.ts`, `org-permissions.ts` and `verify:rooms` (which now includes the new room).
The data the UI check created was removed.

What was built, and where it differs from the plan above:

- **Guardians got a room of their own, `org:{id}:guardians`**, instead of riding on
  `org:{id}:members`. Rule 2 of [live-data](file:///c:/Fred/Coding/SK/.agent/skills/live-data/SKILL.md)
  makes the join push the initial load, and the member list's push carries no guardians; rule 4 makes
  it a room rather than a field on every member. Same tier as the member list. `useOrgGuardians`
  holds it; `PROFILE_GUARDIANS_UPDATED` replaces one player's slice.
- **Editing a guardian's own details republishes every list they appear in**, and
  `UPDATE_ORG_PROFILE` now refuses an email that would make a guardian and their child share an
  address — the link check alone missed an edit made afterwards.
- **`PEOPLE-7` was not brought in.** The guardian block never asks for an org ID number, so a guardian
  cannot hit the collision, and the player forms behave exactly as before.
- **Guardian changes are not blocked while the profile form is dirty**, unlike the invite card. The
  invite can overwrite the profile's email; a guardian change touches nothing on the form, so there
  is nothing to protect.
- **The Minors settings save on their own, behind a confirmation**, not through the settings
  screen's save bar — one switch changes what every minor in the org can see.
- **`restrictedReason` is an explicit `null` for full access**, not an absent key: the screens merge
  an updated member row over the old one, and an absent key left a stale reason in place.
- **Fixed on the way:** `isUnderAge` sliced the date out of a birthdate timestamp, which is a day
  early because `pg` sends a `DATE` as the server's local midnight in UTC (`DATE-1`); it now reads a
  timestamp in local time, as the app's `parseCalendarDate` does. The roster's add-a-person errors
  now show in the modal instead of through `Alert.alert`, which does nothing on web (`UI-17`).
- Logged: `UI-22` (the People "+" and the roster's Invite buttons show to people who cannot use
  them).

---

## Phase 3 — Invites for minors

- **The invite screen** (`InviteModal` in
  [InviteToScoreKeeper.tsx](file:///c:/Fred/Coding/SK/expo-app/components/InviteToScoreKeeper.tsx)),
  for a player with guardians, offers a choice between **each guardian**, with their own status, and
  **{child} directly**. For a minor, the guardian is the default.
- **The child option** follows §0.3:
  - When the minor is blocked, the option is disabled and the screen says why: the org switch, with
    a link to settings for an admin, or "{guardian} has switched this off".
  - When the minor is allowed, the invite goes out with no warning.
  - The old advisory warning is removed, because the rule now enforces what it asked for.
- **The server refuses** a child invite that §0.3 would block, so the client cannot be the only
  guard.
- The `InviteButton` on the People list and roster opens the screen already set to the guardian for
  a minor.
- **Guardian wording.** `SEND_MEMBER_INVITE` on a guardian profile sends a guardian invitation:
  "You are recorded as {child}'s parent at {org}", listing every child when there are siblings.
  The cooldown, the resend rule and the refusals stay as they are.
- Confirm that the `profileOrg` gate resolves a profile that has no membership.

**Exit criterion:** `test-member-invite.ts` extended with:
- a guardian invite, where the email names the child;
- siblings, where the email names both;
- a child invite refused while the org switch is off, and again while a guardian has switched it off;
- a child invite accepted once the minor is allowed;
- the cooldown still applied per address.

In the app, a U14 player's invite defaults to their guardian.

### Done — 2026-09-26

Exit criterion met. `test-member-invite.ts` grew from 19 to 31 checks and passes: a guardian with no
membership is invited; the invitation names both sisters; a minor is refused while the org has
minors off and while her own setting says no, and invited once allowed; an invite cannot give a
guardian their child's address or the other way round; the cooldown checks are unchanged.
`test-guardians.ts` (72) and `org-permissions.ts` (46) pass. In the web app, driven headless as
Doringkloof's admin: a U14 player's invite opens on her guardian, and choosing her directly shows why
she cannot be invited, with Send disabled; the guardian row on her profile has its own Invite.

Where it differs from the plan above:

- **The player with no guardian gets no "Add a guardian" link**, only the words "Record a guardian
  on their profile to invite them instead": the modal is opened from lists that hold no route to the
  profile, and on the profile the Guardians card sits directly below.
- **Guardians can also be invited from the Guardians card** on the child's profile — an Invite pill
  per guardian not on ScoreKeeper — which covers a child already on ScoreKeeper, whose own Invite
  button is gone.
- **The invitation's wording moved into `memberInvitationContent`**, a pure function, so the test
  reads the guardian wording without sending mail.
- **An existing check changed its subject.** It invited a U16 player (Ruan Potgieter), whom the
  default-off rule now correctly refuses; it uses an adult 1st XV player instead.
- **Found and added to `DATE-1`:** saving a profile moves its birthdate back a day — the edit form
  sends back the timestamp it was seeded with. Pre-existing, and now more serious because a birthdate
  decides who is a minor.

---

## Phase 4 — My Family

- **Accepting the invite needs no new code.** Signing up with the invited address links the guardian
  through the single access rule. Verify it.
- **The My Family screen** (§0.2) reads `dependants` from the auth store. For each child it shows:
  - name and photo, org, teams;
  - upcoming and recent fixtures, from `team_games` and the public `org:{id}:fixtures` room;
  - **"Own ScoreKeeper account"**:
    - While the org switch is off, it reads "{org} does not allow accounts for under-{age}s", with no
      control.
    - While the switch is on, a switch sends `SET_MINOR_ACCOUNT_ACCESS`, and the line shows who last
      changed it and when.
    - When allowed and the child is not yet on ScoreKeeper, an **Invite {child}** button sends
      through the same invite path and cooldown. It refuses the guardian's own email.
  - the guardian's own name, email and phone at that org, read-only, with "ask {org} to change
    these".

  The screen is shown only when `dependants` is not empty.

**Exit criterion:**
- Signed up as a fixture guardian, My Family shows the child, their team and fixtures.
- The People and team admin screens, and every other child, stay out of reach. A direct URL to
  `/admin/{orgId}` is refused.
- Switching access off removes the minor's member privileges while they are signed in: they still
  see the org listed as theirs, marked restricted, but the admin area and rosters close. The admin's
  profile screen shows who switched it off.
- Inviting the child from My Family works when they are allowed.
- Ending the link removes the child from My Family live.

### Done — 2026-09-26

Exit criterion met. `test-guardians.ts` grew to 85 checks and passes, now including: what a guardian's
`dependants` carry (their own details, the org's minors setting, who set the child's value); a
sibling appearing when linked; a guardian's invite of their own child refused to an admin, to a
stranger, while minors are off, while the child's own value is an admin's earlier no, and to the
guardian's own address — then sent once the guardian allows the child; and ending one child's link
leaving the sibling. `test-member-invite.ts` (31) and `org-permissions.ts` (46) pass. In the web app,
driven headless as a test guardian of two Doringkloof sisters: My Family shows both, their team and
the fixture; switching one child on shows who changed it and when, live; inviting the other shows the
address, date and cooldown; the rail and the phone bottom menu carry My Family; and
`/admin/fx-org-dkl` is refused. All test data was removed.

Where it differs from the plan above:

- **The child's invite is its own action, `SEND_DEPENDANT_INVITE`**, gated to the child's guardians,
  rather than a guardian calling `SEND_MEMBER_INVITE` (admin and staff only). Both run
  `sendMemberInvite`, moved out of the socket handler into `wss/memberInvite.ts`, so the rules cannot
  drift apart.
- **The switch records an explicit yes as well as a no**, so "last changed by" names whoever turned
  it on. Clearing it back to "the organisation's default" is not offered to a guardian; an admin can
  still do that while there is no guardian.
- **`Dependant` moved into `@sk/shared`** and carries the org's minors settings, so My Family can say
  why without reading the org.
- The rail's footer still labels a guardian with no membership "Member", as it does every signed-in
  user without an admin or coach role. Left as it is.

---

## Phase 5 — Close-out

- `identity_structure.md` §5 rewritten to match what was built: a derived guardian (§0.1), the link,
  what it grants, and minors' access (§0.3). This includes recording that age now decides account
  access, per org. The glossary in `okf/project_overview.md` drops `role-org-guardian`.
- `MEMBER-3` rewritten in `TODO.md` to what remains (Trusted Contacts, availability, a Guardians view
  on the People screen). The finished part goes word for word to `TODO-archive.md`.
- `npm run check:actions` in `expo-app/`.

### Done — 2026-09-26

- [identity_structure.md](file:///c:/Fred/Coding/SK/docs/identity_structure.md) §5 rewritten to what
  was built: a guardian is derived from the link and holds no membership (§5.1, with why the role was
  dropped), the link and its email rule (§5.2), who answers and the minors rule with its per-org age
  (§5.3), what the link grants — built and not (§5.4) — and pricing, where guardians are uncounted by
  construction and the two counting rules are kept for any future non-counting role (§5.6).
- The glossary in `okf/project_overview.md` no longer lists `role-org-guardian`; the interviews
  summary and `FUTURE_IDEAS.md` point at what is built and at the new IDs.
- **`MEMBER-3` was archived whole rather than rewritten in place.** Its problem — nothing linked a
  guardian to a player — is closed; what was left are separate features, each logged with its own ID
  (`MEMBER-5`, `MEMBER-6`, `PEOPLE-9`) so each can be picked up on its own.
- The OKF files this feature touched carry a new timestamp. Every check still passes:
  `check:actions`, `check:migrations`, the shared tests, and the server and app type-checks.

---

## Carried forward, deliberately

- **A Guardians view on the People screen:** guardian-only profiles, searchable, with their
  children — `PEOPLE-9`.
- **Guardians answering availability and acknowledging selection:** the "Act" half of §5.4 —
  `MEMBER-6`.
- **Name/photo consent held by the guardian:** `PEOPLE-4`. It can reuse the `organizations.settings`
  `minors` shape and the per-profile tri-state pattern introduced here.
- **What a minor with access can see:** `PEOPLE-8`. With the org switch on, an allowed minor who is
  a `Member` still reads the whole people list until `PEOPLE-8` is settled. **Worth saying on the
  org-settings switch until then.**
- **Trusted Contacts:** §5.5 — `MEMBER-5`. Waits for the public side of the app.
- **Outside coaches:** `MEMBER-4`. A local profile with no membership, building on the team-duty
  grant from Phase 1.

## Small issues found while planning (to log when their phase starts)

- The **"+" on the People screen** is shown to every member, not only editors, and the **roster
  `InviteButton`** is not gated by `canEdit`. The server refuses both, so it is cosmetic.
- The doc comment on `SEND_MEMBER_INVITE` in `SocketActions.ts` describes an older payload.
- **Birthdate is typed as free text ("YYYY-MM-DD")** in every people form, although `DatePicker`
  exists. It matters more now that birthdate decides access.
