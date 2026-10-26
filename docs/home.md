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
| The search | The search |
| *Your location* | *Your location* |
| *On now & next near you* and *Organisations near you*, side by side on a wide screen | the same |

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
- **On now & next** is single matches and tournaments, **grouped by time** — on now, later today,
  this week — and **closest first inside each group** (decided 2026-10-22). Sorting by distance alone
  would put next Friday's game above one live now down the road. The groups follow the viewer's own
  calendar, so the server sends a generous window and the app trims it
  ([NearbyEventsCard.tsx](file:///c:/Fred/Coding/SK/expo-app/components/home/NearbyEventsCard.tsx)).
  The rows are the Fixtures & Events list's own
  ([EventRows.tsx](file:///c:/Fred/Coding/SK/expo-app/components/events/EventRows.tsx)), with the
  distance added.
- **Organisations near you**, closest first, each with its suburb, sports and number of teams. Teams
  have no card of their own: they are found through the search (decided 2026-10-22).
- **Nothing within 25 km still shows something**: the closest there are, and the card says so once
  ("Nothing on within 25 km. The closest:"). A new visitor never lands on an empty page.
- **Where a game is** is its facility's pin, else its site's, else its host's address; a tournament's
  is its site's, else the site of a facility it uses, else its host's
  ([HomeManager.ts](file:///c:/Fred/Coding/SK/server/src/managers/HomeManager.ts)).
- **Which events are public** goes through one stand-in, `PUBLIC_EVENT` in
  [eventVisibility.ts](file:///c:/Fred/Coding/SK/server/src/managers/eventVisibility.ts), which lets
  every event through until the organisers can make a tournament public (`FIX-38`).
- Home **reads again every minute** while it is open, so a live score moves. It is a one-shot read
  rather than a room: no room owns "what is near a point".

## 3. Your location

Two lines in a card: *Your location* and where Home is looking ("Near Pretoria"), then how that was
found and **Set my location** (**Change location** once one is set). Where Home looks is, in order:

1. **A town or suburb the viewer typed** in the dialog, searched in our own place list
   (`place_search`, below) — not Google, so a keystroke costs nothing. Home needs no more than a
   suburb, so it offers no streets. It stays until they choose *Use my location* again, so the device
   moving never overwrites it.
2. **The device's position**, once the viewer has tapped *Use my location* and allowed it. Read again
   each time Home opens, in the foreground only — never in the background — and kept once it has
   moved a kilometre. Whether the phone or browser asks again is its own decision: iPhone's *Allow
   Once* and Android's *Only this time* ask the next time, *While using the app* does not. Refused for
   good, the dialog says so and points to Settings.
3. **The server's guess from the connection** (`approximate_location`), labelled *Approximate*. Asked
   once a visit; no prompt.

Otherwise *Not set*, and the cards show what is on by time and the largest organisations.

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
| `home_nearby` `{ near? }` | public | `HomeNearby`: games, tournaments and organisations, with distances |
| `home_search` `{ query, near? }` | public | `HomeSearchResult` |
| `approximate_location` | public | `ApproximateLocation` or `null` |
| `place_name` `{ near }` | public | `PlaceName` (`{ label }`) or `null` |
| `place_search` `{ query, near? }` | public | `PlaceMatch[]`: towns and suburbs, at most eight |
| `home_mine` | signed in | `MyHome`, for the caller |

The types are in [shared/src/models/home/Home.ts](file:///c:/Fred/Coding/SK/shared/src/models/home/Home.ts).
