# Sites list and site page

On 2026-10-04 the org admin's Sites & Facilities screens were redesigned to the read-first rules in
[okf/design_system.md](file:///c:/Fred/Coding/SK/okf/design_system.md) (*Read-first record pages*),
following the People and Teams screens ([people.md](file:///c:/Fred/Coding/SK/docs/people.md),
[teams.md](file:///c:/Fred/Coding/SK/docs/teams.md)). This document records what each screen shows
and why.

## 1. What changed

There were five screens: the list, a read-only **site view**, a **site edit** screen with a
floating save bar (also used, as `sites/new`, to add a site), and a **facility view** and
**facility edit** screen. Admin and Staff were sent to the edit screens, everyone else to the views,
and rows had an eye button for the view. They are now **two**: the list, and one site page at
`/admin/[orgId]/sites/[siteId]` that a viewer who cannot edit sees without Edit, Add, the row menus
or the ⋯ menu. The `/view` and facility routes are gone; Add site, Edit site, Edit location and
Add / Edit facility are dialogs ([SiteDialogs.tsx](file:///c:/Fred/Coding/SK/expo-app/components/sites/SiteDialogs.tsx)).

A facility has **no page of its own**: it has five fields and a pin, all on its row, so its row
opens Edit facility.

## 2. The list — `/admin/[orgId]/sites`

[sites.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/sites.tsx). A row is the site at
a glance, and opens its page.

- **The name, then the street, suburb and town.** An organisation's sites are usually in one town
  and often on one street, so "14 Valley Road" and "29 Valley Road" are what tell them apart, and
  the town alone would not. When there is no room, parts are dropped **whole from the back** — the
  town, then the suburb — and only the street is ever cut short
  ([`SiteAddressLine`](file:///c:/Fred/Coding/SK/expo-app/components/sites/SiteBits.tsx)). A site
  without an address says "No address yet".
- **Wide**: a column with the sports the site's active facilities can host, and under it the other
  facilities — parking, restrooms, a shop, a clubhouse — as **icons only**, the same marks as on the
  map. **Phone, two lines**: the name with those icons on the right; the address on the left and the
  sports on the right.
- **No games-coming-up count**, and **no filters**: an organisation has a handful of sites. Search
  covers the name, the address and the facilities (name or sport, so "netball" finds the sites with
  courts).
- **Inactive sites** sit in a collapsed section at the bottom, so the main list needs no Inactive
  badge.
- **Add site** is a labelled button for Admin and Staff only: a name and the shared
  `AddressInput`. The address is **optional** — so it is the field marked — because a site can be
  added by name first and placed later. Saving opens the new site.

## 3. The site page — `/admin/[orgId]/sites/[siteId]`

[\[siteId\].tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/sites/%5BsiteId%5D.tsx).

- **Banner**: a pin where a team has its crest, the name, an Inactive badge when it is, the address
  line and the number of facilities (left out on a phone, where it would cut the street short). Its
  Edit opens **Edit site** — the name alone; the address is the Location card's.
- **Facilities**, split into *Playing areas* (fields, courts, halls) and *Other* (clubhouse, shop,
  parking, restrooms). A row shows the facility's map mark, its name, its sports and surface (or
  what it is), "No pin" for an editor when it has none, and Inactive. The row opens **Edit
  facility**; its one ⋯ menu holds Deactivate or Reactivate, and Delete — disabled with the reason
  once games are on it.
- **Location**: the address, the timezone line — from the pin, or the organisation's — and the map
  (`AddressMap`, not interactive) with the site pin and every facility pin. It draws on web too,
  which the old view screens' map did not (`VENUE-4`). Its Edit opens **Edit location**, the shared
  address input with the facility pins fixed on its map. A site with no address says what that means
  — no map, and kick-offs in the organisation's timezone — with Add address.
- **Coming up**: the organisation's games here, next first — the date, who is playing (its own
  teams by name, others with their organisation's short name), and the time, facility and
  competition — each opening the game. Three until "Show all".
- **⋯ menu**: Deactivate site (confirmed) or Reactivate, and Delete site — disabled while games are
  played here, or events based here, saying so. An inactive site says so under the banner, with
  Reactivate beside it.
- **Empty cards** say what is missing and offer the one action that fills it; Coming up has none,
  since games are added to an event.

### One search, and jumping on a phone

As on the team page: one search covers **facilities** (name, what it is, sport, surface) and the
**games coming up** (teams, facility, sport, competition), each card counting its matches. Wide, it
sits above the two columns (Facilities left; Location and Coming up right). On a phone it is pinned
under the header with Facilities / Location / Coming up buttons
([`JumpBar`](file:///c:/Fred/Coding/SK/expo-app/components/JumpBar.tsx), shared with the team page),
which drop their counts when any label would otherwise be cut. A site with no facilities and nothing
coming up has neither.

### Edit facility

Name; **what it is** (a dropdown — seven categories); the **sports played here**, as chips, and one
of them **starred**: the starred sport sets the facility's icon on the map (`primarySportId`), which
the old screen asked for in a separate "Primary sport" picker. Tapping a sport chooses it, tapping a
chosen one stars it, tapping the starred one drops it; the first chosen is starred. The sports
offered are the ones the organisation plays, plus any already on the facility. **Surface** is
optional. Sports and surface are for playing areas only, and are cleared when a facility becomes
something else.

**Where it is**: a facility has no address of its own — it is a pin at its site — so it gets a map
and no address input: its own pin to drag, drawn with its own icon (`AddressMap`'s `pinIcon`), and
the site's pin and the other facilities fixed beside it. A new facility's pin starts on the site's.
A site with no pin has no map to place it on, and the dialog says so. This replaced the facility
editor's own map and Google Maps loader (`VENUE-3`).

## 4. Inactive sites and facilities

Nothing could be deactivated before: the site form kept `isActive` with no control for it, and a
new facility was always saved active. An inactive site or facility is now **left out of the
pickers** — the game form (`MatchForm`), the add-fixture screen, the tournament's base site, and
`FacilityPicker` (a tournament's and a division's facilities, where a facility at an inactive site
counts as inactive) — through `pickableSites` / `pickableFacilities`, which keep one **already
chosen**, as `pickableTeams` does. Its games and history are kept.

## 5. Data and live updates

The list and the page read sites and facilities from `org:{id}:sites` and `org:{id}:facilities`
([useOrgSites](file:///c:/Fred/Coding/SK/expo-app/hooks/useOrgSites.ts)), the games and events from
`org:{id}:fixtures` and `org:{id}:events`
([useSiteGames](file:///c:/Fred/Coding/SK/expo-app/hooks/useSiteGames.ts), through `useOrgFixtures`,
which `useTeamGames` uses too), and the organisation — its timezone and sports — from its summary
room (`useOrgSummary`). Nothing is fetched, and a save shows everywhere at once.

**Only the organisation's own fixtures are on the client.** Another organisation's game at this site
is not counted, so Delete can look available while the server's own check
(`SiteManager.deleteSite`, `FacilityManager.deleteFacility`) still refuses; its message is shown in
the confirmation.

## 6. Not settled here

- Removing an address: `UPDATE_SITE` cannot clear one, and nothing offers to.
- Showing other organisations' games at a site, which wants a per-site fixtures room (as `FIX-23`
  does for clash checks).
