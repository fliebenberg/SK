# Permissions: who can see and do what

**Status:** decided and built on 2026-10-31 (`ORG-13`, `PERM-1` to `PERM-12`). §2 says what each role
is for, §4 what each may do, area by area, and §5 what was changed to get there and what is left.
New permission questions go in §3; when a rule changes, change it here and in the code together.

How the server enforces these rules (the gates, `AccessManager`, rooms):
[okf/auth_control.md](file:///c:/Fred/Coding/SK/okf/auth_control.md). This doc is the product view of
the same rules: one row per thing a person might want to do.

---

## 1. The roles

There is no single role list. Authority comes from seven different places:

| Source | Roles | Where it is stored |
| --- | --- | --- |
| **Not signed in** | Visitor | — |
| **Signed in, no link to the org** | Signed-in user | `users` |
| **Org role** (one per person per org) | **Admin**, **Staff**, **Member** | `org_memberships.role_id` (`role-org-admin`, `role-org-staff`, `role-org-member`) |
| **Team role** (per team) | **Coach**, **Assistant Coach**, **Scorer**, Medic, Player. *Manager and team Staff exist today and are to be removed (§5).* | `team_memberships.role_id`. Everyone on a team is at least a Member of its org (`MEMBER-4`) |
| **Event grant** (per tournament, sport or division, not a membership) | **Tournament organiser**, **Sport organiser**, **Division convenor** | `event_organizers`, `event_sport_organizers`, `division_organizers` |
| **Game official** (per game) | **Scorer**, **Match official** (referee or umpire), **Timekeeper** | `game_officials.role`. `JUDGE`, which the model also allows, is to be dropped. **Nothing can appoint an official yet** (§5) |
| **Personal link** (not a membership) | **Guardian**, **Trusted Contact** (*designed, not built*) | `profile_guardians`; Trusted Contact has no table yet ([identity_structure.md §5.5](file:///c:/Fred/Coding/SK/docs/identity_structure.md)) |
| **Platform** | **App admin** | Membership of `org-system-admins` |

Some of these modify the roles above rather than standing alone:

- **Restricted minor.** A Member who is a minor, in an org that does not give minors their own account,
  is treated as an outsider for org-wide rights. Team duties (coach, scorer) still work.
  See auth_control §6.
- **Unclaimed org** (no Admin yet). Today any signed-in user may create a team or a person in it with
  only the minimum details. Decided to narrow (Q10).
- **Private org** (`ORG-14`). Only its current members and app admins can see it at all.

**Roles combine.** A person holds their org role and any team, tournament and game roles at the same
time, and gets the rights of each. A coach who is also Staff has Staff rights across the org and a
coach's rights over their team; a coach who is a Member has a coach's rights over their team and
nothing more.

---

## 2. What each role is for

Decided 2026-10-31, and built the same day (§5).

### 2.1 The principles

- **P1. The workspace shows what you have a role in, and nothing else.** Each role opens the part of
  the workspace it is for (§2.2), and the menu lists only those parts. Someone with no role that needs
  the workspace does not get one; the public pages are their view of the org.
- **P2. Whoever can open an admin page sees what is on it, but only the people who may change it get
  edit controls.** For everyone else the page reads the same, without Edit links, empty-state actions
  or switches.
- **P3. No "only admins can change this" messages.** A page says nothing about edit rights it does not
  give you. (Today the Privacy and Minors cards on Settings each carry one. They are to go.)
- **P4. Team, tournament, division and game roles keep their functions whatever the person's org
  role.** A coach who is a Member still runs their team; an organiser from another org, or from none,
  still runs their tournament.
- **P5. Speaking for someone is not acting as them.** A guardian or Trusted Contact may *answer* for a
  player (availability, acknowledging selection) when given that right. Neither ever inherits the
  player's roles: a guardian of a team's scorer cannot score.

### 2.2 The roles

**Admin: runs the organisation itself.** Everything Staff can do, plus:
- Profile: name, logo, colours, about, address, sports.
- Settings: timezone, private or public, minors.
- **Who holds which org role**: making someone Staff or Admin, changing anyone's role, removing Staff
  or an Admin.
- Deleting the organisation.

**Staff: run the org's day-to-day admin.** The role exists so that a large org can appoint people to
help with general admin without giving them the power to change the org itself.
- **People**: add people **as Members**, edit their details, guardians, invites, the spreadsheet import
  (as Members only), and remove a Member. Not: any org-role change, or removing Staff or an Admin.
- **Teams**: create and maintain them, including appointing coaches and every other team role.
- **Sites and facilities, fixtures, tournaments, leagues and seasons**: create and maintain, as today.
- **Answering tournament invitations** for the org.
- **Scoring and team sheets** for the org's games, as today.

**Member: belongs to the org, but runs nothing in it.** **No workspace.** Membership still carries
rights the public does not get, now and later: seeing a private org, the org's members' chat (a future
feature), and others not yet thought of. A Member who also holds a team, tournament, division or game
role gets the part of the workspace for that role (P4).

**Coach: an Admin's rights over their own team**, except two things:
- **Deleting the team**: Staff and Admins only.
- **Changing the Coach**: appointing or removing a Coach is Staff's or Admins'.

Within that: the team's record, its roster, appointing and changing every other team role (Assistant
Coach, Scorer, Medic, Player), adding a new person to the org as a Member linked to the team, the team's fixtures
(including creating friendlies), its team sheets, scoring its games, and answering for it in
tournaments. What a coach sees **outside** the team is whatever their org role gives: a coach who is a
Member sees only their team's people.

**Assistant Coach: the Coach's rights, except appointing or removing Assistant Coaches.** (Decided
2026-10-31, for now.)

**Team Scorer: may score every game the team plays**, whether or not the game also has appointed
scorers.

**Tournament organiser: everything in their tournament.** They open the tournament's workspace and can
see and edit every part of it, whether or not they belong to the host org or any org.

**Sport organiser: everything a division convenor can do, for every division of their sport**, plus
the division records and adding and deleting divisions of the sport (not its last one), as today.

**Division convenor: everything in their division.** A division always sits in a tournament, so they
open the tournament's workspace too, and edit only their own division. Of the rest of the tournament
they see the outline (its divisions, schedule and venues, which they need to plan around) but not
other divisions' teams and rosters until the tournament is public, when anyone can see them. The same
applies to a sport organiser outside their sport.

**Game officials: appointed per game, by whoever may edit the fixture**: the host's Admins and Staff,
or the tournament's organisers and the division's convenor. A coach needs no extra right here: they
appoint their team's Scorer, who may score every game the team plays.
- **Scorer**: may score that game.
- **Match official** (referee or umpire): the same rights as a scorer for now. It is a separate role
  because an official may get other rights later (for example confirming a result or settling a
  dispute).
- **Timekeeper**: keeps the game's time — starting, stopping and adjusting the game clock, and timing
  sin-bin periods and substitutions. Not the score or other match events. They see the scorer's
  screen with only its timekeeping section. A scorer can do all of this too, for games with no
  dedicated timekeeper.

**Guardian: answers for their child, never acts as them** (P5). Sees the child's fixtures (Family
tab), sets the child's own-account setting and invites the child. Answering for the child is
`MEMBER-6`, parked. Nothing more for now.

**Trusted Contact: sees one player's schedule, granted by that player or their guardian.** Designed
in [identity_structure.md §5.5](file:///c:/Fred/Coding/SK/docs/identity_structure.md), not built
(`MEMBER-5`). Inherits the granter's *view*, never their authority:
- **Sees** that player's fixtures, selection, kit requirements, attendance and change notices.
- **May answer** availability and acknowledge selection, only if the granter turns that on, recorded
  as "answered by X on behalf of Y".
- **Never**: another child, other people's contact details, consent flags, money, any org
  administration, other teams or rosters, or granting access onward.
- Not an org membership and not approved by the org: the org can see the grants and revoke one in
  extremis, but does not create them.

**App admin: can do everything, everywhere**, including in private orgs.

---

## 3. Open questions

None at the moment (2026-10-31). Answered questions are removed once their answer is in §2; the
changes they need are in §5.

---

## 4. Area by area

**Legend:** **Edit** = may change it · **View** = sees it, no edit · **—** = cannot reach it.
As built on 2026-10-31 (§5). "Coach" means a coach who is otherwise a Member; a coach who is Staff has
the Staff column as well. "Organiser" means a tournament organiser, sport organiser or division
convenor, each within their own scope.

### 4.1 Getting into the org workspace

| | Visitor | Signed in | Member | Staff | Admin | Coach | Organiser | App admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Public org page | View | View | View | View | View | View | View | View |
| Open the workspace | — | — | — | View | Edit | Their teams and fixtures | Their tournament, even with no membership | Edit |
| Workspace menu | — | — | — | Every page | Every page | Teams, Fixtures & Events | — | Every page |

Private org: everything above is "—" for anyone who is not a current member (or app admin).

### 4.2 Organisation profile and settings (`ORG-13`)

| | Member | Staff | Admin | App admin |
| --- | --- | --- | --- | --- |
| See Profile and Settings | — | View | View | View |
| Name, logo, colours, about, address, sports | — | View | Edit | Edit |
| Timezone | — | View | Edit | Edit |
| Private / public | — | View | Edit | Edit |
| Minors setting | — | View | Edit | Edit |
| Delete the organisation | — | — | Edit | Edit |

### 4.3 People and roles

| | Member | Staff | Admin | Coach | App admin |
| --- | --- | --- | --- | --- | --- |
| See the people list and contact details | — | View | View | Their team's people, from the roster; everyone else's name and photo, to add them to the team | View |
| Add, edit, import a person | — | Edit, as Members only | Edit | Add a Member for their team; edit their team's people | Edit |
| Make someone Staff, or change anyone's org role | — | — | Edit | — | Edit |
| Make someone an Admin | — | — | Edit | — | Edit |
| Remove a Member | — | Edit | Edit | — | Edit |
| Remove Staff or an Admin | — | — | Edit | — | Edit |
| Send an invite | — | Edit | Edit | Their team's people | Edit |
| Guardians of a player | — | Edit | Edit | Their team's players | Edit |
| A minor's own-account setting | — | — | Edit, only while the minor has no guardian | — | Edit |

Guardian: sets their own child's account setting, and invites the child.

### 4.4 Teams

| | Visitor | Member | Staff | Admin | Coach (own team) | App admin |
| --- | --- | --- | --- | --- | --- | --- |
| Team page, public part | View | View | View | View | View | View |
| Roster and members' details | — | Public part only | View | View | View | View |
| Add a team | — | — | Edit | Edit | — | Edit |
| Edit the team's record and roster | — | — | Edit | Edit | Edit | Edit |
| Appoint team roles other than coach | — | — | Edit | Edit | Edit | Edit |
| Appoint an Assistant Coach | — | — | Edit | Edit | Coach: Edit. Assistant Coach: — | Edit |
| Appoint a Coach | — | — | Edit | Edit | — | Edit |
| Delete the team | — | — | Edit | Edit | — | Edit |
| Answer a tournament invitation for the team | — | — | Edit | Edit | Edit | Edit |
| Pick the team for a game | — | — | Edit | Edit | Edit | Edit |

### 4.5 Sites and facilities

| | Visitor | Member | Staff | Admin | App admin |
| --- | --- | --- | --- | --- | --- |
| Site page and map | View | View | View | View | View |
| Add, edit, delete a site or facility | — | — | Edit | Edit | Edit |

### 4.6 Fixtures and single matches

| | Visitor | Member | Staff | Admin | Coach | Organiser | App admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fixture list and game page | View (public games) | View | View | View | View | View | View |
| Tournaments I run, at the top of Home | — | — | | | | Shown | |
| Create a match | — | — | Edit | Edit | For their team | In their tournament | Edit |
| Edit time, venue, teams; cancel; delete | — | — | Edit | Edit | Their team's single matches | Edit, in their scope | Edit |
| Clash check for a facility | — | — | View | View | View | | View |

### 4.7 Tournaments

| | Visitor | Member | Staff | Admin (host) | Coach | Tournament organiser | Sport organiser | Division convenor | App admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Public tournament pages | View (`FIX-38`) | View | View | View | View | View | View | View | View |
| Open the tournament's workspace | — | — | View | View | Their team's part | Always | Always | Always | View |
| Other divisions' teams before it is public | — | | View | View | | View | Outline only | Outline only | View |
| Create a tournament | — | — | Edit | Edit | — | — | — | — | Edit |
| Tournament settings, invited orgs, delete | — | — | Edit | Edit | — | Edit | — | — | Edit |
| Appoint organisers | — | — | Edit | Edit | — | Edit | Co-organisers and convenors of their sport | Co-convenors | Edit |
| Divisions: add, delete, own record | — | — | Edit | Edit | — | Edit | Their sport (not its last division) | — | Edit |
| Entrants, stages, fixtures, results in a division | — | — | Edit | Edit | — | Edit | Their sport's divisions | Their division | Edit |
| Answer the org's invitation | — | — | Edit | Edit | — | — | — | — | Edit |
| Answer for a team; ask to enter or withdraw | — | — | Edit | Edit | Own team | — | — | — | Edit |

Opening the tournament from another org's workspace: its saves go as the host, so they work (B5, fixed).

### 4.8 Leagues and seasons

| | Member | Staff | Admin | App admin |
| --- | --- | --- | --- | --- |
| See leagues and seasons | Public view | View | View | View |
| Create, edit, delete; add teams and games | — | Edit | Edit | Edit |

### 4.9 Scoring and team sheets

| | Member | Staff | Admin | Coach (either side) | Team Scorer | Game scorer or match official | Organiser | App admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Score a game live, record or correct a result | — | Edit (host or either side's org) | Edit | Edit | Edit, their team's games | Edit | Edit, in their scope | Edit |
| Game clock and sin-bins only | | | | | | Timekeeper: Edit | | |
| Pick a side's team | — | Own org's side | Own org's side | Own side | — | — | Any side in their scope | Edit |

---

## 5. Built 2026-10-31, and what is left

What the survey found and the decisions changed, each with the to-do that carried it (now in
[TODO-archive.md](file:///c:/Fred/Coding/SK/TODO-archive.md)).

- **Profile and Settings** (`ORG-13`, B1): Admins only edit; everyone else who opens them reads them
  with no Edit links, switches or "only admins" notes (P2, P3). The logo save now reports a failure.
- **One permission helper** (`PERM-1`, B10): `orgAccess` / `useOrgAccess` in the app — `canManage`,
  `isAdmin`, `workspace`, `coachedTeamIds` — replaces the Admin-or-Staff test written out per screen,
  and leaves restricted minors out of org-wide rights.
- **Staff** (`PERM-2`, B3, B13): add and import people as Members only, change no org role, remove
  only Members; answer tournament invitations for the org and its teams. The app offers Staff the
  Member role alone, so no half-made record is left.
- **The workspace by role** (`PERM-3`, `PERM-4`, B2, C1): Members have none; a coach, assistant coach
  or team scorer gets Teams and Fixtures & Events, their teams only, and a person's page from their
  roster. A page a role does not open goes back to the Control Panel. Leagues are Admin and Staff
  only, so their missing checks no longer matter.
- **Coaches** (`PERM-5`, B9, C2): their team's record (not switching it off or deleting it), roster
  and roles (not the Coach; an assistant not other assistants), its people's details, invites and
  guardians, a new Member for the team, single matches for it, its team sheets. The Teams tab's
  *My Coached Teams* lists their real teams, each opening its team page (B12).
- **Scoring and fixtures** (`PERM-6`, B4, B6, B8, C4, C5): team scorers score their team's games;
  convenors and sport organisers score, pick sides and edit the fixtures of their divisions; Score is
  no longer offered to an org that neither hosts nor plays.
- **Game officials** (`PERM-7`, C9, C12, C13): an *Officials* card on the game page for whoever may
  edit the fixture appoints a scorer, match official (`REFEREE`) or timekeeper from the host's
  people. A timekeeper gets *Keep time*: the scorer's screen with the clock and sin-bins only.
  `JUDGE` is gone from the model.
- **Organisers' way in** (`PERM-8`, B5, B7, C7): *Tournaments I run* heads Home's *My …* card and
  opens the tournament's workspace, which admits an appointment as well as a membership; tournament
  saves go as the host; *New team* is offered only to those who run the organisation.
- **Outline only** (`PERM-9`, C6): already how the server reads it — an appointed convenor or sport
  organiser opens only their own divisions' rosters.
- **Team roles** (`PERM-10`, C8): Manager and team Staff removed; their memberships ended.
- **Unclaimed organisations** (`PERM-11`, C10): only someone who sets up games or tournaments — Admin
  or Staff somewhere, a coach, or an appointed organiser — may add a team or person to one.
- **Acting profile** (`PERM-12`, B11): scoring, votes and fixture changes are credited to the
  caller's profile for that game, not their first membership.

**Left, and why:**

- **Substitution timing** for a timekeeper: the scoring screen has no substitution event yet.
