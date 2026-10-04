# Teams list and team page

On 2026-10-03 the org admin's Teams screens were redesigned to the read-first rules in
[okf/design_system.md](file:///c:/Fred/Coding/SK/okf/design_system.md) (*Read-first record pages*),
following the People screens ([people.md](file:///c:/Fred/Coding/SK/docs/people.md)). This document
records what each screen shows and why.

## 1. What changed

There were four screens: the list, a full-screen **new team** form, a read-only **view** screen, and
an **edit** screen with five tabs (Details, Players, Staff, Events, Stats) and a floating save bar.
Admin and Staff were sent to the edit screen, everyone else to the view; the list had an eye button
for the view. They are now **two**: the list, and one team page at `/admin/[orgId]/teams/[teamId]`
that a viewer who cannot edit sees without Edit, Add, the row menus, Pick team or the ⋯ menu. The
`/view` and `/new` routes are gone; Add team is a dialog.

## 2. The list — `/admin/[orgId]/teams`

[teams.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/teams.tsx). A row is the team at
a glance, and opens its page.

- **The crest, then the name and age group.** The crest ([`TeamCrest`](file:///c:/Fred/Coding/SK/expo-app/components/teams/TeamBits.tsx))
  is where a logo or photo sits elsewhere: the organisation's logo with the team's **short name** in
  a band of the organisation's colour — or, for an organisation with no logo (most), a shield in its
  colour. A team with no short name shows its age group in the band. The short name is **not also
  written beside the name**, on the list or the page: the crest is where it is shown. The band's
  text is black or white, whichever reads better on that colour (`readableTextOn`).
- **Wide**: the head coach in a column (the longest-serving current Coach, `coachName`, joined in by
  the server), then player and staff counts. **Phone, two lines**: name with the player count on the
  right; age group on the left and the coach on the right.
- **Grouped by sport** only when the teams span more than one, in the sport's own age-group order.
- **Inactive teams** sit in a collapsed section at the bottom, so the main list needs no Inactive
  badge.
- **Filter by sport** (segmented, with counts) and **age group** (a dropdown — there can be many);
  search by name, short name or coach.
- **Add team** is a labelled button for Admin and Staff only. It opens
  [`TeamDetailsDialog`](file:///c:/Fred/Coding/SK/expo-app/components/teams/TeamDialogs.tsx): name,
  short name (the one optional field, so the only one marked), sport (left out when the organisation
  plays one) and age group. Saving opens the new team.

## 3. The team page — `/admin/[orgId]/teams/[teamId]`

[\[teamId\].tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/teams/%5BteamId%5D.tsx).

- **Banner**: crest, name, an Inactive badge when it is, and "Sport · age group". Its Edit opens
  **Edit team** — the same dialog as Add team. Changing the sport clears the age group (it belongs
  to one sport) and says so beside the field at that moment.
- **Players** and **Staff** cards. A row opens that person's page, where their name, contact
  details and guardians are edited; the old screen edited them here, a third copy of the person
  fields. The row's **one ⋯ menu** holds only what belongs to the team: Change role (staff),
  Invite to ScoreKeeper (while they are not on it), Remove from team. A player shows the same Minor
  or Dependant tag and org ID as the People list; staff show their role, coach first.
- **Games** card: the record (played, won, drawn, lost and points — points is left out when the
  strip has no room for it on one line, which on a phone it does not), the next games with **Pick
  team** for editors (the existing selection screen), and the results, opponents by name. Each game
  opens. Three of each until "Show all". A fuller stats view is a to-do.
- **⋯ menu**: Deactivate (confirmed) or Reactivate, and Delete — which while the team has games is
  shown disabled with the reason ("Deactivate it instead") rather than hidden. An inactive team says
  so under the banner, with Reactivate beside it.
- **Empty cards** say what is missing and offer the one action that fills it; Games has no action,
  since games are added to an event.

### One search, and jumping on a phone

One search covers the whole page: **players** (name, org ID), **staff** (name, role — "coach" finds
the coaches) and **games** (opponent, competition). Each card counts what matches ("1 of 22"), and a
card with nothing says so in one line rather than vanishing. While searching, the record counts only
the matching games — a head-to-head when the search names an opponent.

Wide, the search sits above the two columns (Players left; Staff and Games right). On a phone the
page is one long column, so the search is **pinned under the header** with Players / Staff / Games
buttons that jump to each card and highlight the one in view ([`JumpBar`](file:///c:/Fred/Coding/SK/expo-app/components/JumpBar.tsx),
shared with the site page since 2026-10-04, which drops the counts when a label would be cut). A team with nobody and no games has
neither.

### Adding people

- **Add players** picks several of the organisation's people at once — a squad is fifteen and more.
  Someone already a player here is greyed out; a minor or dependant says so. One `ADD_TEAM_MEMBER`
  each, in turn; a failure stops there and says who was not added.
- **Add staff** picks one person and their role (a dropdown: there are six).
- **Someone new to the organisation**, from either, opens the People page's
  [`AddPersonDialog`](file:///c:/Fred/Coding/SK/expo-app/components/people/AddPersonDialog.tsx)
  with the team and role: it adds the person to the organisation and then to this team.

## 4. Inactive teams

Deactivating a team used to do nothing outside the Teams screens: it could still be picked for a new
game or league, while the edit screen said it was "hidden from schedules". An inactive team is now
**left out of the team pickers** — the game form (`MatchForm`, `games/new`) and a league season's
registration — through `pickableTeams`, which keeps one that is **already chosen**, so editing an
old game never quietly drops the team it was played by. The tournament entrant list already left
them out (`getEventCandidateTeams`). Its games, results and roster are kept.

## 5. Data and live updates

The list and the page read teams from `org:{id}:teams` ([useOrgTeams](file:///c:/Fred/Coding/SK/expo-app/hooks/useOrgTeams.ts)),
the roster from `team:{id}:members` ([useTeamRoster](file:///c:/Fred/Coding/SK/expo-app/hooks/useTeamRoster.ts)),
games from `org:{id}:fixtures` and competition names from `org:{id}:events`
([useTeamGames](file:///c:/Fred/Coding/SK/expo-app/hooks/useTeamGames.ts)), and the sports the
organisation plays from its summary room (`useOrgSummary`) — so nothing is fetched and a save shows
everywhere at once. Roster names, photos and org IDs come from the org's members, which update the
moment a person page saves. For the list's head coach to stay right, `UPDATE_TEAM_MEMBER` now
republishes the team to `org:{id}:teams`, as adding and removing already did, and
`UPDATE_ORG_PROFILE` does too for the teams a renamed person coaches.

## 6. Not settled here

- An outside coach who is not a member of the organisation (`MEMBER-4`).
- Who may read a team's roster (`PEOPLE-8`) — today any member can open the page read-only.
- Picking players for a match from the team page itself; Pick team opens the existing selection
  screen.
