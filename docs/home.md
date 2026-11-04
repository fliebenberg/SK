# Home

Built 2026-10-23 for `HOME-1`, from the mockup agreed on 2026-10-22 (`mockups/home-near-you.html`,
option B; the mockup is local and not in git). This document records what Home shows, where its data
comes from, and the decisions behind it.

## 1. One page for everyone

Home is [app/(tabs)/index.tsx](file:///c:/Fred/Coding/SK/expo-app/app/(tabs)/index.tsx), at `/`. It is
what anyone gets when they open the app without a link, **signed in or not**. Before it there were two
half-built homes: a signed-out landing page with made-up live games, and a signed-in "Live Feed"
placeholder. [app/index.tsx](file:///c:/Fred/Coding/SK/expo-app/app/index.tsx) now sends everyone to
Home, and the sidebar and tab bar call it **Home**.

From top to bottom:

| Signed out | Signed in |
| --- | --- |
| **The hero**: a headline, *Create an account*, *Log in*, *What is ScoreKeeper? ›*, and — on a wide screen — the closest game live right now as a preview of what the app does (no live game, no preview) | **My organisations & teams** |
| The search and the location, on one line on a wide screen and one under the other on a phone | the same |
| *On now & next near you* and *Organisations near you*, side by side once the page's content is 900px wide (`LAYOUT.twoColumnsMinWidth`, measured, since the sidebar takes its share), and stacked under that | the same |

- **Every block shares the page's left and right edges**, inside the app's standard page padding
  (decided 2026-10-22; whether phones should go edge to edge is `UI-35`).
- **The hero is in the theme's own colours**, light and dark, with its accent in the bottom-right
  corner only (design rule 29). A fixed dark band was tried and dropped: it was not a theme token and
  did not follow the theme. **The hero is to be refined in a session of its own** (decided
  2026-10-22).
- **The sign-in pitch is said once**, in the hero. It promises only what an account gives today.
  What an account should add for a member of the public is `FIX-37`.
- *What is ScoreKeeper?* opens today's old landing page until the info page (`HOME-2`) replaces it.
  The link is in [homeLinks.ts](file:///c:/Fred/Coding/SK/expo-app/components/home/homeLinks.ts),
  with every other place Home opens.

## 2. Near you

- **Within 25 km, straight-line** (`HOME_RADIUS_KM`), not offered as a choice for now (decided
  2026-10-22).
- **On now & next** is single matches and tournaments for the **next month** (decided 2026-11-04,
  it was a week), **grouped by time** — on now, later today, this week, coming weeks. Sorting by
  distance alone would put next Friday's game above one live now down the road. **On now is closest
  first**, since all of it has started; **the other groups are soonest first** (decided 2026-11-04),
  since people want what is on next more than what is a few kilometres nearer. The groups follow the viewer's own calendar, so the server sends a generous window and the app
  trims it
  ([NearbyEventsCard.tsx](file:///c:/Fred/Coding/SK/expo-app/components/home/NearbyEventsCard.tsx)).
- **Six rows, then *Show more***, up to 40. **The cap of 40 keeps the soonest**, not the closest, so
  a busy area loses the end of the month and never today's games.
- The rows are the Fixtures & Events list's own
  ([EventRows.tsx](file:///c:/Fred/Coding/SK/expo-app/components/events/EventRows.tsx)), with the
  distance added.
- **Organisations near you**, closest first, each on the same card as the Organisations page
  ([`<OrgListCard>`](file:///c:/Fred/Coding/SK/expo-app/components/org/OrgListCard.tsx), decided 2026-11-02):
  its suburb, its type and its distance on the right. An organisation found by the search and one on
  *My organisations & teams* use it too, the latter with how many games are live as a flag. It opens
  what the viewer runs in the workspace, and otherwise the public page, as it does everywhere. Teams
  have no card of their own on Home: they are found through the search (decided 2026-10-22), and their
  rows keep the old look for now (`UI-42`).
- **Nothing within 25 km still shows something**: the closest there are, and the card says so once
  ("Nothing on within 25 km. The closest:"). A new visitor never lands on an empty page.
- **Where a game is** is its facility's pin, else its site's, else its host's address; a tournament's
  is its site's, else the site of a facility it uses, else its host's
  ([HomeManager.ts](file:///c:/Fred/Coding/SK/server/src/managers/HomeManager.ts)).
- **Which events are public** goes through one stand-in, `PUBLIC_EVENT` in
  [eventVisibility.ts](file:///c:/Fred/Coding/SK/server/src/managers/eventVisibility.ts), which lets
  every event through until the organisers can make a tournament public (`FIX-38`).
- **The list is a read, and what moves on it comes through rooms.** No room owns "what is near a
  point", so `home_nearby` says what to show, and is read again every 4–6 minutes (it varies, so
  clients do not fall into step) while Home is on screen, to pick up what has been added or has
  dropped off. Coming back to Home after longer than that reads at once. Organisations are read once
  a visit (`home_nearby_orgs`): they barely change.
- **Only rows on screen that can change now hold a room**: live, or on today. A single match, the
  hero's preview and a team's game under *My organisations & teams* hold `game:{id}:row`, with the
  status, score and times; a tournament holds `event:{id}:row`, with how many games and how many live
  ([useListRows.ts](file:///c:/Fred/Coding/SK/expo-app/hooks/useListRows.ts)). A row merges over what
  the read gave it, so it moves between *On now* and *Later today* on its own. Going to another tab
  lets go of the rooms and stops the reads, though the tab stays mounted.

## 3. Your location

Two lines in a card: where Home is looking ("Near Pretoria"), with **Set my location** under it
(**Change location** once one is set). There is no heading and no line on how it was found (decided
2026-11-04); the place says enough, and the dialog gives the 25 km. On a wide screen the card sits to
the right of the search, the two lined up with the columns of cards below, and stays there during a
search. On a phone it is under the search, and a search's results take its place. Where Home looks
is, in order:

1. **A town or suburb the viewer typed** in the dialog, searched in our own place list
   (`place_search`, below) — not Google, so a keystroke costs nothing. Home needs no more than a
   suburb, so it offers no streets. It stays until they choose *Use my location* again, so the device
   moving never overwrites it.
2. **The device's position**, once the viewer has tapped *Use my location* and allowed it. Read again
   each time Home opens, in the foreground only — never in the background — and kept once it has
   moved a kilometre. Whether the phone or browser asks again is its own decision: iPhone's *Allow
   Once* and Android's *Only this time* ask the next time, *While using the app* does not. Refused for
   good, the dialog says so and points to Settings.
3. **The server's guess from the connection** (`approximate_location`), marked *(approximate)* after
   the place. Asked once a visit; no prompt.

Otherwise *Location not set*, and the cards show what is on by time and the largest organisations.

**Privacy (POPIA).** The location is kept **on the device only**
([locationStore.ts](file:///c:/Fred/Coding/SK/expo-app/store/locationStore.ts)). It leaves the device
rounded to two decimals (about a kilometre), always in a field called `near`, which the server's
loggers redact (`redactViewerPosition` in
[socketLog.ts](file:///c:/Fred/Coding/SK/server/src/wss/socketLog.ts)); the server answers from it
and keeps nothing.

**Naming a place.** The device's position is named ("Near Doringkloof, Centurion") by the server
from its own place list (`place_name`), on web and phones alike: the nearest suburb or village
within 3 km — OpenStreetMap's when it has one, else GeoNames' — with the town a suburb belongs to;
else the town that draws the position (a city or large town over a small one nearer by) within
25 km. With no answer the card says *Your current location*. The name is asked once the connection
is up, so a position read before it still gets one.

**The place list.** South Africa's towns, villages and suburbs, about 18,000, in
[server/data/places-za.json.gz](file:///c:/Fred/Coding/SK/server/data/places-za.json.gz), answered in
memory by [services/places.ts](file:///c:/Fred/Coding/SK/server/src/services/places.ts) — no request
leaves the server, so no map service sees a position and nothing is billed. Built by
`npm run places:build` in `server/`
([build-places.ts](file:///c:/Fred/Coding/SK/server/src/scripts/build-places.ts)) from two free
sources: **OpenStreetMap** (ODbL), which knows the suburbs, through the Overpass API, and
**GeoNames** (CC BY 4.0), which adds populations and provinces. The same name within 3 km is one
place; a suburb's town is the one that draws it most. Rebuild from time to time to pick up new
suburbs, and commit the file. Both licences ask for a credit where the names are shown: the
dialog's *Place names © OpenStreetMap contributors and GeoNames*. Another country is a matter of
running the build for it. **Never add to the list from Google's results** — the Maps Platform terms
forbid building a mapping dataset from Google content. (Decided 2026-10-26, `HOME-4`, instead of
Google's Geocoding API, which is billed per request.)

**Setup.**
- The approximate location needs a MaxMind GeoLite2 City database on the server: download
  `GeoLite2-City.mmdb` (a free MaxMind account) and set `GEOIP_CITY_DB` to its path
  ([server/.env.example](file:///c:/Fred/Coding/SK/server/.env.example)); `*.mmdb` is kept out of
  git. Without it the guess is off and Home asks the viewer instead. A developer's connection is
  local and has no answer in it; `HOME_APPROX_LOCATION="-25.85,28.19,Pretoria"` stands in for one
  ([approximateLocation.ts](file:///c:/Fred/Coding/SK/server/src/services/approximateLocation.ts)).
- The phones' permission prompt reads the text set for `expo-location` in
  [app.json](file:///c:/Fred/Coding/SK/expo-app/app.json); it takes effect in the next native build.

## 4. The search

One box for **organisations, teams and sites, anywhere**, closest first, at most ten of each. A team
matches on its organisation's name too, so "doringkloof u14" finds Doringkloof's U14 teams; a site
the same way. While the box has a term, the results take the place of the cards below it.

## 5. My organisations & teams

The signed-in viewer's **memberships** — organisations they hold a role in, teams they coach or play
for — until following exists (`FIX-37`). An organisation shows its role (Admin and Staff only, as
everywhere) and how many of its games are live; a team shows the game it is playing now or plays
next. Nobody else's can be asked for: `home_mine` answers for the signed-in caller.

## 6. The reads

| `get_data` type | Access | Answers |
| --- | --- | --- |
| `home_nearby` `{ near? }` | public | `HomeNearby`: games and tournaments, with distances; a tournament with its counts and one live game, not its fixtures |
| `home_nearby_orgs` `{ near? }` | public | `HomeNearbyOrganizations`: organisations, with distances |
| `home_search` `{ query, near? }` | public | `HomeSearchResult` |
| `approximate_location` | public | `ApproximateLocation` or `null` |
| `place_name` `{ near }` | public | `PlaceName` (`{ label }`) or `null` |
| `place_search` `{ query, near? }` | public | `PlaceMatch[]`: towns and suburbs, at most eight |
| `home_mine` | signed in | `MyHome`, for the caller |

The types are in [shared/src/models/home/Home.ts](file:///c:/Fred/Coding/SK/shared/src/models/home/Home.ts).
