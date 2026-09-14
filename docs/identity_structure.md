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

*   **`org_memberships`:** Links an `org_profile` to specific overarching organization roles (e.g., "Org Admin", "Member"). An individual might have multiple entries here if they hold multiple distinct administrative roles.
*   **`team_memberships`:** Links an `org_profile` to a specific team with a specific role (e.g., "Coach", "Assistant Coach", "Player", "Manager"). It tracks the `startDate` and `endDate` of when that persona was active on the team.

*Note: The system supports individuals holding multiple concurrent roles (e.g., returning as both a Coach for one team and a Player on another).*

## 4. Handling External Entities & Referees
External entities that operate across multiple organizations (like centralized referees or independent league officials) are handled systematically:

1.  **System Organizations:** A hidden, top-level "System Organization" (e.g., "Independent Officials" or "Referees Org") is created.
2.  **Centralized Profiles:** Referees have their authoritative `org_profiles` created within this system organization.
3.  **Cross-Org Allocation:** When a host school creates a Game, they can invite/assign these central referee profiles to the match without needing to add the referee to their own local school directory.
4.  **Clean Directories:** This ensures that a school's internal `org_profiles` list strictly contains true members (students, staff, parents), while still allowing the system to robustly track the historical involvement of external officials.

## 5. Guardians and Responsible Parties

> **Status: designed, not built.** Nothing in the schema links a guardian to a player today. Raised
> by user research — two interviews (Tableview FC 2026-09-09, Wynberg Boys' Primary 2026-09-11)
> both showed that for a **minor** player, availability decisions, transport arrangements and
> essentially all communication happen with an adult, not with the player. For an **adult** player
> the same decisions are made by the player. The identity model currently has no way to express that
> difference. Tracked as `MEMBER-3`.

### 5.1 A guardian is an ordinary org profile

A guardian is an `org_profile` in the **same organization as the player**, holding a `Guardian`
membership role. Nothing new is invented, and three existing properties do real work:

*   **Unlinked profiles (§2)** — a school can record every child's parents at registration, long
    before any of them log in. That is already the normal state for students.
*   **The claim / invite flow** — `last_invite_sent_at` and the existing nomination machinery turn an
    unlinked guardian profile into a real account when the guardian is ready.
*   **Persona isolation (§2)** — the same human is a parent at their child's school and possibly a
    coach at a club, with separate profiles and no bleed between them.

### 5.2 The link itself

A new join table, `profile_guardians`:

| Column | Notes |
|---|---|
| `id` | |
| `org_id` | Scoped like everything else |
| `guardian_profile_id` | → `org_profiles` |
| `player_profile_id` | → `org_profiles` |
| `relationship` | `parent` / `guardian` / `grandparent` / `other` — for display and the org's records |
| `is_primary` | Which guardian is the default contact. Schools work this way |
| `start_date`, `end_date` | Mirrors `org_memberships`; the link lapses without deleting history |

**Many-to-many on purpose.** One guardian to several children (siblings — one of the strongest
reasons a parent wants a single view), and one child to several guardians (both parents; separated
parents who each need the fixture and may each do transport on different days).

### 5.3 Who answers for a player is *derived*, never stored

Resolve at read time: **if a player has active guardian links, the guardians are the responsible
party; otherwise it is the player's own linked user.** An adult player therefore needs no special
casing — they simply have no guardian links.

**Age is a prompt, not a rule.** `org_profiles.birthdate` may drive whether registration *asks* for
a guardian, but must never decide the answer: a 17-year-old may self-manage, and an adult may have a
guardian. This follows the same principle as the "External is derived, never stored" decision in
`MEMBER-2` — a status that can be computed from relationships should not become a stored role.

### 5.4 What the link grants

*   **Read:** that child's fixtures, selection, times, venue and field, kit requirements, attendance.
*   **Act (guardian only):** respond to availability, acknowledge selection, and hold the consent
    flags for the child's name and photograph.
*   **Never:** anything about another child, or any org-wide administration. A guardian is not a
    member of the organisation in the administrative sense — they are a responsible party for one
    person in it.

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
built before the consumer side exists.

### 5.6 Only counting roles may be priced

**This is a live trap, not a hypothetical.** `member_count` is a raw count of active memberships —
`COUNT(*) FROM org_memberships WHERE org_id = … AND (end_date IS NULL OR end_date > NOW())` in
[OrganizationManager.ts](file:///c:/Fred/Coding/SK/server/src/managers/OrganizationManager.ts) (also
`active_people`). The moment a guardian holds an `org_membership`, every one of those counts silently
includes them.

That matters because **pricing counts players and staff, and explicitly does not count parents,
spectators or fans**. A school of ~800 learners has on the order of 1,200–1,600 parents; counting
them would roughly triple its bill for people who are supposed to be free.

**The rule: the priced count is an allow-list of *counting roles*, never "everyone with a
membership."**

| Role | Counts | Why |
|---|---|---|
| `role-org-admin` | **Yes** | Staff |
| `role-org-staff` | **Yes** | Staff — and already treated as admin-equivalent throughout `AccessManager` |
| `role-org-member` | **Yes** | The affiliation every player receives (see below) |
| `role-org-guardian` | **No** | A responsible party for one member, not a member |
| `role-trusted-contact` | **No** | A consumer, and not an org membership at all |

**Today this allow-list changes no number** — `Admin`, `Staff` and `Member` are the complete
canonical list in `OrganizationManager.organizationRoles`. Its whole value is forward-looking: it
**inverts the default**, so a new consumer-shaped role cannot silently become billable. Cheap
insurance, not a fix.

#### The latent bug this exposes

**Anyone involved with a team must hold at least one counting role.** Today that happens
automatically: [TeamManager.ts](file:///c:/Fred/Coding/SK/server/src/managers/TeamManager.ts) gives
anyone added to a team a `role-org-member` org membership. But it inserts that row **only when no
active membership exists at all**:

```
WHERE org_profile_id = $1 AND org_id = $2 AND (end_date IS NULL OR end_date > NOW())
→ if rowCount === 0, INSERT role-org-member
```

Once a non-counting role exists, a parent who is a `Guardian` and then joins a team — as a
social-side player, or as a coach — **already has a membership**, so the check passes and they never
receive `Member`. The result is a real player who is never counted, and who also misses the baseline
affiliation that `role-org-member` grants.

**The check must test for a *counting* role, not for any role.** Harmless today; must be fixed in
the same change that introduces the first non-counting role.

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
