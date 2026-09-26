# Identity Architecture

The SportKeeper application utilizes a dual-layered identity architecture to manage users and their various personas within different organizations. This separation ensures strict data scoping, robust privacy, and the flexibility for an individual to have different details associated with different roles.

## 1. Global Users (`users` table)
At the highest level is the **User**. This represents the real-world human being who authenticates with the application.

*   **Authentication & Access:** The `users` table is responsible for login credentials (handled via NextAuth/Supabase) and global application preferences.
*   **Global Admin Status (Single Source of Truth):** Global App Admin privileges (`globalRole = 'admin'`) are derived dynamically from active membership in the dedicated **System Administration Organization** (`org-system-admins`, `id: 'org-system-admins'`).
*   **Privileged Account Isolation:** System Admins use dedicated administrative accounts that belong exclusively to `org-system-admins` and cannot hold memberships in standard user organizations/teams. This prevents identity ambiguity and profile collisions across the platform.
*   **One-to-Many:** A single standard User can represent multiple distinct entities across the platform (e.g., a teacher at one school, a parent at another, and a referee in an independent league).
*   **Fields:** Includes global profile picture, primary email, display name, etc.

## 2. Organization Personas (`org_profiles` table)
Below the global User is the **Organization Profile** (`org_profile`). This is the core record for assigning roles, tracking memberships, and displaying directory information within a specific organization.

*   **Organization Scoped:** Every `org_profile` is strictly tied to an `organization_id`. It represents "who this person is" *in the context of this specific org*.
*   **Linking to Users:** An `org_profile` can (and ideally should) be linked to a global `user_id`. When linked, the global User gains access to the permissions and roles associated with that `org_profile`.
*   **Unlinked Profiles:** It is common for `org_profiles` to exist without a linked `user_id` (e.g., a school creates profiles for all students, but the students haven't logged into the app yet).
*   **Persona Isolation:** Because an individual has separate `org_profiles` in different organizations, they can maintain distinct data for each:
    *   **Images:** A person might have a formal headshot for their teaching `org_profile` and a casual picture for their global `user` profile or a different club's `org_profile`.
    *   **Identifiers:** A student's ID number `identifier` is stored directly on their school's `org_profile`.
*   **UI Cache:** The table includes `primary_role_id` to quickly cache and display their main organization-level role.

## 3. Memberships & Roles
Specific relationships and permissions are attached to the `org_profile`, not directly to the global `user`.

*   **`org_memberships`:** Links an `org_profile` to an organisation role — **Admin**, **Staff** or **Member**, the three in `OrganizationManager.organizationRoles`. An individual might have multiple entries here if they hold multiple distinct administrative roles.
*   **`team_memberships`:** Links an `org_profile` to a specific team with a specific role (e.g., "Coach", "Assistant Coach", "Player", "Manager"). It tracks the `startDate` and `endDate` of when that persona was active on the team.

*Note: The system supports individuals holding multiple concurrent roles (e.g., returning as both a Coach for one team and a Player on another).*

## 4. Handling External Entities & Referees
External entities that operate across multiple organizations (like centralized referees or independent league officials) are handled systematically:

1.  **System Organizations:** A hidden, top-level "System Organization" (e.g., "Independent Officials" or "Referees Org") is created.
2.  **Centralized Profiles:** Referees have their authoritative `org_profiles` created within this system organization.
3.  **Cross-Org Allocation:** When a host school creates a Game, they can invite/assign these central referee profiles to the match without needing to add the referee to their own local school directory.
4.  **Clean Directories:** This ensures that a school's internal `org_profiles` list strictly contains true members (students, staff, parents), while still allowing the system to robustly track the historical involvement of external officials.

## 5. Guardians and Responsible Parties

> **Status: built 2026-09-26** (`MEMBER-3`, closed), in five phases recorded in
> [guardians-implementation-plan.md](file:///c:/Fred/Coding/SK/docs/guardians-implementation-plan.md).
> Raised by user research — two interviews (Tableview FC 2026-09-09, Wynberg Boys' Primary
> 2026-09-11) both showed that for a **minor** player, availability decisions, transport
> arrangements and essentially all communication happen with an adult, not with the player; for an
> **adult** player the same decisions are made by the player. Still open: Trusted Contacts (§5.5,
> `MEMBER-5`), guardians acting for a child (§5.4, `MEMBER-6`), and a Guardians view on the People
> screen (`PEOPLE-9`).

### 5.1 A guardian is an ordinary org profile — and holds no membership

A guardian is an `org_profile` in the **same organisation as the player**, with their own email.
Three existing properties do real work:

*   **Unlinked profiles (§2)** — a school can record every child's parents at registration, long
    before any of them sign in.
*   **The invite flow** — a guardian is invited like anyone else, and signing up with the invited
    address links the account to their profile by email.
*   **Persona isolation (§2)** — the same human is a parent at their child's school and possibly a
    coach at a club, with separate profiles and no bleed between them.

**Being a guardian is derived from an active link (§5.2), never stored as a role or an
`org_memberships` row.** The original design (2026-09-12) gave guardians a `Guardian` membership
role; it was changed before building, for three reasons found in the code:

*   **A membership row is a permission.** Any active membership opens the org's member list (every
    person's contact and identity details), every roster and every game's internals, and the admin
    area in the app (`PEOPLE-8`). A parent would have seen every other child in the school.
*   **A person holds one active org role at a time.** `addOrganizationMember` replaces the role, so a
    teacher who is also a parent would have lost `Staff`.
*   **Every role check would have needed an exception**, and a missed one is a data leak.

This is the same principle as "External is derived, never stored" (`MEMBER-2`). A parent who is also
staff or a coach keeps their own membership; the link adds to it.

### 5.2 The link itself

`profile_guardians` ([database_structure.md](file:///c:/Fred/Coding/SK/docs/database_structure.md)
§8a): `guardian_profile_id` and `player_profile_id` in one `org_id`, a `relationship` (`parent` /
`guardian` / `grandparent` / `other`, display only), `is_primary` (the default contact — one active
primary per player), and `start_date` / `end_date` so ending a link keeps its history.

**Many-to-many on purpose.** One guardian to several children (siblings — one of the strongest
reasons a parent wants a single view), and one child to several guardians (both parents; separated
parents who each need the fixture and may each do transport on different days).

A guardian and their child may **never share an email**: access is matched by email, so the one
would *become* the other. It is refused when a link is made, when either profile's email is edited,
and when an invite would save an address to either.

### 5.3 Who answers for a player, and who may use their own account

**Who answers is derived, never stored:** if a player has active guardian links, the guardians are
the responsible party; otherwise it is the player's own account. An adult player needs no special
case — they simply have no guardian links.

**Whether a minor's membership carries a member's privileges** is decided per organisation — and,
unlike the original design, **age does decide it**, deliberately, because an organisation needs a
rule it can state ("members under 16 do not use the app themselves"):

1.  A player is a **minor** in an org when they are younger than the org's **minor age**
    (`settings.minors.minorAge`, default 18, 1–21), **or** have any active guardian, whatever their
    age. No birthdate and no guardian means an adult.
2.  While the org's switch **"Minors may have member access"** is **off** — the default — no minor
    has member privileges, whatever their guardians say.
3.  While it is on, a minor has them **unless their own setting is an explicit no**
    (`org_profiles.own_account_allowed`, tri-state: `NULL` follows the org). Any active guardian may
    change it; an org Admin only while the minor has no guardian.

A restricted minor is **still a member**: their account links to their profile, they see the org as
theirs, and a team duty still works — a pupil appointed to coach or score does that job for that team
or game only. What they lose is every org-wide privilege check. The rule is `memberAccess` in
[guardians.ts](file:///c:/Fred/Coding/SK/shared/src/utils/guardians.ts), mirrored in SQL by
[minorAccess.ts](file:///c:/Fred/Coding/SK/server/src/managers/minorAccess.ts); see
[auth_control.md](file:///c:/Fred/Coding/SK/okf/auth_control.md) §5–6.

### 5.4 What the link grants

*   **See** (built): on **My Family**, that child's teams and fixtures, whether they may use their own
    account, their invite status, and the guardian's own details at that org. The data arrives in the
    guardian's own `USER_MEMBERSHIPS_UPDATED` (`dependants`); fixtures come from the org's public
    fixtures room.
*   **Decide** (built): the child's own-account setting (§5.3), and inviting the child once allowed
    (`SEND_DEPENDANT_INVITE`).
*   **Act** (not built — `MEMBER-6`): respond to availability, acknowledge selection, receive the
    messages meant for whoever answers for the player; and hold the name and photo consent flags
    (`PEOPLE-4`).
*   **Never:** anything about another child, or any org-wide administration. A guardian is not a
    member of the organisation in the administrative sense — they answer for one person in it.

Admins and staff record guardians on the player's profile and when adding a player, and a minor's
invite goes to the guardian by default; a minor the rule restricts is not invited at all.

### 5.5 Trusted Contacts — the nanny, the grandparent, the lift club

A guardian also needs to give a **grandparent, nanny or driver** access to one child's schedule,
because that is the adult doing the school run. An **adult player** has the same need and grants it
for themselves — a partner or parent who wants to know when and where they are playing. The same
mechanism serves both: **the person whose information it is grants access to someone else.**

The role is called **Trusted Contact** (`role-trusted-contact`).

> **On the name.** Three obvious alternatives are already taken in ways that would mislead.
> **Guest** currently means *no relationship at all* — `role = 'Guest'` in
> [organizations/index.tsx](file:///c:/Fred/Coding/SK/expo-app/app/(tabs)/organizations/index.tsx)
> and "browsing as a guest" in settings. **Delegate** is the wrong word here because "delegation" in
> this product consistently means handing *organisational duties* to another org person — division
> delegation to a convenor (`D22`, `D31`), admin guide §11, and the "Delegated Control" language in
> [nomination-process.md](file:///c:/Fred/Coding/SK/docs/nomination-process.md). **Nominee** and
> **Follower** are likewise taken, by the org-contact referral flow and by
> `UserPreferences.followedTeams`.

**This is deliberately not an org membership and not org-approved**, for an evidenced reason: the
research shows a school structures its class WhatsApp groups but **does not know who is in them** —
a parent asks for whoever transports the child to be added. Requiring the organisation to administer
those people asks it to do something it demonstrably cannot do.

#### The governing principle

**A Trusted Contact inherits the granter's *view*, never the granter's *authority*.**

| | Permission |
|---|---|
| **See** *(default)* | Fixtures for that player's teams — date, time, venue, field, map, what to bring. Whether the player is selected. Kit and uniform requirements. That player's attendance record. Results and recaps at whatever level the org publishes. Change and cancellation notices, including the notification. |
| **Respond** *(optional toggle, off by default)* | Answer availability and acknowledge selection, recorded as **"answered by X on behalf of Y"** so accountability stays visible. Worth granting because the nanny is often the only person who knows about the dentist appointment — but it must be a deliberate choice, never the default. |
| **Never** *(regardless of toggle)* | **Any other child** — each grant is per-player, so a nanny minding two children needs a grant from each child's guardian. **Other people's contact details**, which is precisely what a group chat leaks today. **Consent flags** for name and photograph — a guardian's legal responsibility. **Money** — subs, fees, payment status. **Any org administration**, other teams or other rosters. **Onward granting** — no re-delegation, or the audit trail disappears. |

#### Lifecycle

*   **Requires a logged-in account.** Invited by email or phone. Only very general public information
    is ever exposed to someone not signed in.
*   **Revocable instantly by the granter**, with an **expiry prompt at season rollover** — a nanny
    changes jobs and nobody ever remembers to revoke.
*   **Lapses automatically** when the underlying relationship does: the guardian link ends, or the
    player leaves the organisation.
*   **Visible to the org, but not approved by it.** With minors a school has a legitimate
    safeguarding interest in seeing that a child's information is visible to three non-parent
    adults, and in revoking in extremis. But it must never *gate creation* — that is the thing the
    organisation demonstrably cannot do. **The org audits; the guardian creates and revokes.**
*   **Never counted for pricing** — a Trusted Contact is a consumer (§5.6).

**This belongs to the public / consumer side of the app, which is not built yet.** It is recorded
here so the guardian link in §5.2 is not designed in a way that forecloses it; it should not be
built before the consumer side exists. Tracked as `MEMBER-5`.

### 5.6 Only counting roles may be priced

**Pricing counts players and staff, and explicitly does not count parents, spectators or fans.** A
school of ~800 learners has on the order of 1,200–1,600 parents; counting them would roughly triple
its bill for people who are supposed to be free.

**Guardians are not counted, by construction:** they hold no `org_memberships` row (§5.1), and
`member_count` / `active_people` in
[OrganizationManager.ts](file:///c:/Fred/Coding/SK/server/src/managers/OrganizationManager.ts) count
memberships. Trusted Contacts (§5.5) are not memberships either.

Two rules were agreed on 2026-09-13 for the guardian-as-a-role design and are **kept for any future
role that is a membership but must not be priced**. Nothing needs them today — `Admin`, `Staff` and
`Member` are the whole of `OrganizationManager.organizationRoles`, and all three count — but whoever
adds such a role must apply both in the same change:

*   **The priced count is an allow-list of counting roles**, never "everyone with a membership", so a
    new consumer-shaped role cannot silently become billable.
*   **Anyone involved with a team must hold at least one counting role.**
    [TeamManager.ts](file:///c:/Fred/Coding/SK/server/src/managers/TeamManager.ts) gives anyone added
    to a team a `role-org-member` membership, but only when they hold **no** active membership at all.
    With a non-counting role in existence, a person holding only that role who joins a team would
    never receive `Member` — under-counted, and missing the baseline affiliation. The check must test
    for a *counting* role, not for any role.

## 6. Image Update Permissions

## 7. Publishing Names and Photographs

> **Status: designed, not built.** Nothing today controls whether a person's name or photograph may
> be shown to anyone. Tracked as `PEOPLE-4`.
>
> **Not to be confused with §6.** `allowUserImageUpdates` governs who may *edit* an image; this
> governs whether a name or image may be *published at all*. Different axis, and §6 is not yet
> wired up in `expo-app/`.

Both organisations interviewed already run a consent process on paper — a form at registration with
an opt-out at one, a marketing-material opt-in at application at the other. This digitises an
existing practice rather than introducing a new obligation.

### 7.1 The boundary is the admin screen

**"Public" means anything outside the organisation's own admin screens.**

*   **Inside org admin:** names and photographs are always visible. This is operational necessity —
    you cannot pick a team, print a team sheet or run a registration desk otherwise.
*   **Everywhere else the rules apply.** Signed-out visitors, signed-in fans, other organisations,
    Trusted Contacts — **and members of the organisation itself** whenever they are not on an admin
    screen. There is no middle tier and no "but they're one of us" exemption.

This is deliberately one blunt line rather than a tiered model, because it is the only version that
can be enforced in **one place** instead of screen by screen.

**Enforcement is server-side, at the read boundary.** Hiding a name in the client is not consent —
the data has already left the building. A name or image that fails the rules must never be in the
payload.

**One necessary carve-out: you always see your own record.** A person sees their own name and photo,
and a **responsible party** (§5.3) sees them for the player they answer for, regardless of the
rules. Otherwise a parent who opted their child out could no longer see their own child's name,
which is absurd. The carve-out is *self and dependants only* — it never extends to a team-mate.

### 7.2 Two attributes, two settings each

**Name and photograph are separate permissions.** They are routinely answered differently — a parent
may be relaxed about a surname on a team sheet and firm about a face on Instagram.

For each attribute the organisation holds two values:

*   **`default`** — `allow` or `disallow`. What applies to someone who has expressed nothing.
*   **`personCanOverride`** — whether the person may set their own value at all.

Together they express the three policies an organisation actually needs, without a separate
opt-in/opt-out concept:

| Org default | Person may override | Effective policy |
|---|---|---|
| `disallow` | yes | **Opt-in** — nothing is published until someone says yes |
| `allow` | yes | **Opt-out** — the org permits it, a family may still refuse |
| either | no | The organisation decides for everyone, no exceptions |

### 7.3 Resolution order

1.  If the organisation **forbids override** for that attribute → the org default wins, absolutely.
2.  Else if the **responsible party has expressed a value** → that value wins, in either direction.
3.  Else → the org default.

**Who "the person" is comes from §5.3** — the guardian for a minor, the player themselves for an
adult. No new rule is needed, and it settles the awkward question of whether a fourteen-year-old can
overrule their parent: they cannot, their guardian holds it.

### 7.4 Storage — and why `NULL` must not mean `false`

*   **Organisation:** in `organizations.settings`. That column is an untyped `Record<string, any>`
    bag today; something with legal weight deserves a **declared shape in the shared model**, not
    another loose key.
*   **Person:** two **nullable** columns on `org_profiles` — `publish_name`, `publish_photo`.

**The tri-state is the whole point.** `NULL` means *"never expressed — use the org default"*;
`false` means *"explicitly refused"*. Collapse the two and you cannot tell a refusal from silence —
and **every explicit opt-out silently evaporates the next time the organisation changes its
default.**

Holding this on `org_profiles` also makes consent **per organisation**, so the same child can be
answered differently at their school and at their club. That is persona isolation (§2) doing its
job.

### 7.5 Consent has to be provable

A school asked *"what permission did you have to publish this photograph?"* needs to answer with a
date and a person. Each attribute carries `*_set_at` and `*_set_by` alongside its value.

### 7.6 What this deliberately does not do

**Withdrawal does not un-publish.** A name already in a shared link someone posted to a group chat,
or a photograph already in the yearbook, is beyond reach. The setting governs what ScoreKeeper will
serve from now on, and the UI should not imply more than that.

### 7.7 Still open

*   **Whether the answer changes with age**, and whether families want the override at all, is
    **untested** — the parent interview asked the headline question and never reached either. Both
    guides now ask it: spectator §8.6–8.8, admin §8.10–8.13.
*   **Whether a league can impose a policy its clubs cannot relax.** The interviews README notes the
    league is where minors' policy usually originates; nothing here models a constraint arriving
    from above the organisation.
