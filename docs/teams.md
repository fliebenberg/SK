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

Since 2026-10-22 the page is in **tabs** (agreed on the local `mockups/team-tabs.html`, option A):
the banner and any invitation strip above them, then **Overview, Games, Results, Players,
Competitions** (`?tab=` opens one). On a phone the five fit on one line; the strip scrolls if a
larger text size does not let them.

- **Banner**: crest, name, an Inactive badge when it is, "Sport · age group", and the **season**
  picker — beside the name wide, under it on a phone. A season is a **calendar year** for now
  ([`seasonOf`](file:///c:/Fred/Coding/SK/expo-app/utils/dates.ts), in the viewer's calendar): the
  current year first, then each year the team has games. It narrows every tab but Players' list of
  people. Its Edit opens **Edit team** — the same dialog as Add team. Changing the sport clears the age group (it belongs
  to one sport) and says so beside the field at that moment.
- **Overview**: Live now or Next (with Pick team for editors), Last result, the season's record
  and form, the Squad (players, top scorer, coach) and the season's competitions — each with a link
  to its tab.
- **Games**: what is still to come. **Results**: the season's results, beside **Statistics** wide;
  on a phone a Statistics | Results switch, Statistics first. Statistics are the record, form (last
  five, newest first), points for and against, home and away, the biggest win, the top scorer and
  the record by competition, worked out from the games' scores (a game whose score was not provided
  is not counted, as in the standings). The top scorer, and each player's season, come from team
  sheets and match events (below), with a line saying how many games had match events.
- **Players** tab: one search over players and staff, then the **Players** and **Staff** cards
  (all staff, by role, coach first). A row opens that person's page, where their name, contact
  details and guardians are edited; the old screen edited them here, a third copy of the person
  fields. The row's **one ⋯ menu** holds only what belongs to the team: Change role (staff),
  Invite to ScoreKeeper (while they are not on it), Remove from team. A player shows the same Minor
  or Dependant tag and org ID as the People list; staff show their role, coach first. Under a
  player's name, their season: "#11 · Left Wing · 4 games · 4 tries · 1 card".
- **Competitions**: the team's tournaments and invitations, answered here (`FIX-31`); the
  invitation strip above the tabs opens it.
- **⋯ menu**: Deactivate (confirmed) or Reactivate, and Delete — which while the team has games is
  shown disabled with the reason ("Deactivate it instead") rather than hidden. An inactive team says
  so under the banner, with Reactivate beside it.
- **Empty cards** say what is missing and offer the one action that fills it; Games has no action,
  since games are added to an event.

The tabs replaced the one long page of 2026-10-03, whose search covered players, staff and games
and was pinned under the header on a phone with a jump bar: each tab is now short enough not to need
either, and the search stays where the people are.

### A player's season

[`useTeamSeasonStats`](file:///c:/Fred/Coding/SK/expo-app/hooks/useTeamSeasonStats.ts) asks the
server (`get_data` `team_season_stats`, `TeamManager.getTeamSeasonStats`) for the season's finished
games: **games played** from their team sheets (`game_rosters`), **scores** by the sport's own words
("Try", "Conversion") and **cards** from their match events (`game_events`; a removed event, and a
missed kick — a scoring event worth nothing — are not counted), and each player's **number and
position from their latest team sheet**, since a squad keeps neither; the position's id is named
from the sport ("10" → "Fly-half"). The kind of score worth the most points names the top scorer.
A game scored without match events counts in the record but not in the scorers, which the line under
Statistics says.

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
**left out of the team pickers** — the game form (`MatchForm`) and a league season's
registration — through `pickableTeams`, which keeps one that is **already chosen**, so editing an
old game never quietly drops the team it was played by. The tournament entrant list already left
them out (`getEventCandidateTeams`). Its games, results and roster are kept.

## 5. Data and live updates

The list and the page read teams from `org:{id}:teams` ([useOrgTeams](file:///c:/Fred/Coding/SK/expo-app/hooks/useOrgTeams.ts)),
the roster from `team:{id}:members` ([useTeamRoster](file:///c:/Fred/Coding/SK/expo-app/hooks/useTeamRoster.ts)),
games from `org:{id}:fixtures` and competition names from `org:{id}:events`
([useTeamGames](file:///c:/Fred/Coding/SK/expo-app/hooks/useTeamGames.ts)), the players' season
from `team_season_stats` (read once per team and season, at the `org:{id}:teams` level: players'
names, numbers and positions are public by decision until `PEOPLE-4` gives a way to hide them —
never contact or identity details), and the sports the
organisation plays from its summary room (`useOrgSummary`) — so nothing is fetched and a save shows
everywhere at once. Roster names, photos and org IDs come from the org's members, which update the
moment a person page saves. For the list's head coach to stay right, `UPDATE_TEAM_MEMBER` now
republishes the team to `org:{id}:teams`, as adding and removing already did, and
`UPDATE_ORG_PROFILE` does too for the teams a renamed person coaches.

**Everyone on a team is one of its organisation's people** (decided 2026-10-22, `MEMBER-4`).
Adding someone to a team makes them a Member of the organisation if they are not one yet, coaches
included — there are no outside coaches: one hired from elsewhere is added as a new person, and their
account links up by email. `ADD_TEAM_MEMBER` refuses a profile from another organisation.

## 6. Not settled here

- Who may read a team's roster (`PEOPLE-8`) — today any member can open the page read-only.
- Picking players for a match from the team page itself; Pick team opens the existing selection
  screen.
