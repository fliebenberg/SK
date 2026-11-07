---
name: Live Data & Subscriptions
description: How real-time data reaches a client — rooms as the read boundary, broadcasts that carry data rather than nudges, and the summary tier. Read before adding a room, a broadcast, or a screen that shows changing data.
---

# Live Data & Subscriptions

Four rules. All four are load-bearing; breaking any one of them has already caused a
bug in this repo.

Two principles sit over them (decided 2026-11-03, after Home's once-a-minute poll):

- **Live information comes through rooms, never a poll.** A timed read is only for finding out
  *what* to show, as often as that really changes: Home's list every few minutes, varied so that
  clients do not fall into step. See *A row in a list* below.
- **Nothing is read while the app is not in front of someone.** A timer that reads stops when its
  screen is not on screen (`useIsFocused`, since a tab stays mounted) or the app is hidden
  (`useAppActive`). After five hidden minutes the app closes its connection altogether
  ([idleDisconnect.ts](file:///c:/Fred/Coding/SK/expo-app/services/idleDisconnect.ts)), and every
  screen joins and reads again on return. Five, because an open idle connection costs little and
  coming back to a closed one costs every room and read again: someone who jumps to another tab and
  back should not pay that.

**First decide whether the list should be live at all.** A list that may be very long is static, and
so is a short one that does not need live data; a static list is read a page at a time with
`get_data`. If it is not clear, ask the user. The rule and every list's kind are in
[okf/live_rooms.md](file:///c:/Fred/Coding/SK/okf/live_rooms.md).

## 1. A broadcast carries the data. It is never a nudge to refetch.

**Never** react to an update by issuing a `get_data` for the thing that just changed.

With N clients subscribed to an org, "notify, then everyone refetches" costs one fan-out
*plus N round trips*, each running its own queries. Sending the object costs one fan-out
of a few hundred bytes. At a thousand clients that is roughly a hundredfold difference,
and it is also simpler — merging a whole object is `map(x => x.id === data.id ? data : x)`,
with no partial-merge-over-a-stale-base hazard.

```ts
// Wrong — this is the pattern the whole design exists to remove
if (msg.type === 'GAME_UPDATED') {
  wsService.emit('get_data', { type: 'games', orgId }, res => setGames(res));
}

// Right
if (msg.type === 'GAME_SUMMARY_UPDATED') {
  setGames(prev => upsertById(prev, msg.data));
}
```

**Send the whole object, not a patch.** There are no exceptions left. The game clock used to be
one — `UPDATE_GAME_CLOCK` published a hand-built partial under the `GAME_UPDATED` type name that
elsewhere carries a whole `Game`, so no receiver could tell them apart — and it was the only
non-idempotent merge in the system, which is what forced the client to replay a message log instead
of keeping state. It now sends the whole game (`LIVE-16`). A clock action is a button press, not a
tick: the clock runs locally off `lastStartedAt` (`useGameTimer`), so the server hears from it a
handful of times per match.

## 2. Joining a room *is* the initial load.

`join_room` pushes the room's current state back to the socket that joined
([index.ts](file:///c:/Fred/Coding/SK/server/src/index.ts), `socket.on('join_room')`).
A screen that joins a room and *also* fetches the same data on mount loads everything
twice. Use [`useLiveRoom`](file:///c:/Fred/Coding/SK/expo-app/hooks/useLiveRoom.ts),
which never issues a query.

`useSocketQuery` remains correct for genuine one-shot reads (a form's dropdown options,
a report) — data that no room owns. Asking for what another screen is already asking costs nothing:
the socket service shares the answer, and keeps `sports` and `roles` for a while (`LIVE-11`). So a
screen need not pass reference data around to save a read.

**A hold outlasts a dropped connection (`LIVE-13`).** Without a connection nothing is sent, and the
room is joined when the socket connects. So an effect that subscribes does not list `isConnected`, and
a screen keeps what it has while the connection is away. An effect that reads does list it, since
nothing else brings that data up to date on return: when a screen does both, they are two effects.

**The push reaches only the socket that joined, once.** The client reference-counts room
holders and sends `join_room` for the first one only, and each screen reduces a room's messages
into its own state — there is no shared store. A screen that subscribes to a room another
still-mounted screen already holds would therefore start empty (`LIVE-9`). The socket service
covers this by logging what each held room has delivered
([roomLedger.ts](file:///c:/Fred/Coding/SK/expo-app/services/roomLedger.ts)) and replaying the log
into a late subscriber's handler: `subscribeToRoom(room, onReplay)`. `useLiveRoom` does this for
you. **Do not call `subscribeToRoom` directly in new code** — without a replay handler a screen
still inherits the gap, and without a status handler nobody hears that the room failed.
`npm run check:rooms` refuses it outside the socket layer. A screen whose first data comes from a
read and whose merging does not fit `LiveAction` (the scoring screens) holds its rooms with
`useRoom(room, onMessage?)`, which is `useLiveRoom` with the reducer handed to the screen.

### When a room does not arrive (`LIVE-25`)

**The server answers every `join_room`**, after the room's join push: `{ status: 'ok' }` once
whatever the room hands over has been sent — possibly nothing, for a room that holds nothing — or
`{ status: 'error', error, message }` (`RoomAccessDenied`, `RoomReadFailed` when the push threw,
`InvalidRoom`). **A room for one record that does not exist pushes `ENTITY_NOT_FOUND`** rather than
nothing (`team:`, `event:`, `division:`, `season:`, `site:`, `facility:`, `game:` and the org summary).
Before 2026-11-07 neither existed, and a join with no reply left its screen loading for ever.

**The socket service times every join** — the first, a re-join on reconnect, a retry — and keeps a
status per held room, shared by every screen holding it: `waiting`, `ready`, or `failed` with the
reason (`Cannot connect to the server.` after 10 s without a connection, `The server did not answer
in time.`, or the server's own message). `useLiveRoom` turns it into state: `ready` ends `isLoading`
even if nothing was pushed, `ENTITY_NOT_FOUND` is `notFound`, a failure is `failure` with
**`isLoading` left true** — with nothing held the room has still not arrived, and an empty state
("No leagues yet") over a failure would be false. Every room hook hands back its `room` (or `rooms`).

**Say it once, in one of two places.** A page puts
[`<RoomFailure rooms={[…]} what="The leagues" stale={…} />`](file:///c:/Fred/Coding/SK/expo-app/components/RoomFailure.tsx)
where the content would have been, covering all the rooms that content comes from; while on screen it
*claims* those rooms. The app-wide `RoomFailureNotice` (root layout) speaks for every failed room no
screen has claimed. So a page that forgets is still not silent, and a room is never reported twice.
*Try again* re-joins the failed rooms; the fresh join push lands as a replace for every holder, and a
connection coming back re-joins and clears the failure by itself.

**`npm run check:rooms` makes it a rule** (pre-commit hook): every call in `app/` and `components/` of
`useLiveRoom` or of a hook built on it (found by the script, not listed) must pass its room to a
`RoomFailure` in the same file, or carry `// rooms-ok: <reason>` on its line or the line above. Fair
reasons: the room only carries updates after a read that says its own failure (capabilities); the
workspace layout's box already covers it (the workspace org's summary); a dialog or section whose
page covers the same rooms; the root layout's route-guard room, which the notice speaks for.

**One reducer per room, in a hook.** Several screens join the same rooms, and a room's messages are
read once, in its hook — never in a copy on each screen, where a message type taught to one copy
and not another shows the same record differently on each (2026-10-09). The event rooms are in
[useEventRooms.ts](file:///c:/Fred/Coding/SK/expo-app/hooks/useEventRooms.ts) (`useEventRecord`,
`useEventDivisions`, `useEventFixtures`, `useEventFacilityIds`), an org's sites and facilities in
[useOrgSites](file:///c:/Fred/Coding/SK/expo-app/hooks/useOrgSites.ts), and a tournament's pages
take the set from [useTournamentData](file:///c:/Fred/Coding/SK/expo-app/hooks/useTournamentData.ts).
A room only one screen reads (the event's standings) may stay on that screen.

## 3. Rooms are the read boundary, and every room is declared.

Because a broadcast carries data, whatever a socket can join, it can read. Room access is
therefore an authorization decision, made in
[wss/roomAccess.ts](file:///c:/Fred/Coding/SK/server/src/wss/roomAccess.ts) and checked
*before* the join.

**An unrecognised room name is refused.** Adding a room means adding it to `classifyRoom`
with one of three access levels:

| Access | Meaning | Examples |
| --- | --- | --- |
| `public` | A spectator may legitimately see this. Includes anonymous sockets, because the org directory is browsable logged out. | `org:*:events`, `org:*:teams`, `org:*:sites`, `event:*`, `game:*:summary`, `game:*:events` (players public until `PEOPLE-4`), `season:*:standings` |
| `staff` | Personal data, or an org's internal state. Requires being Admin or Staff of a related org, or a grant or duty the room names; a plain Member reads what the public reads (`PEOPLE-8`). | `org:*:members`, `team:*` (rosters), `game:*`, `game:*:disputes` |
| `self` | The socket's own user. | `user:*` |

The identity is `socket.userId`, proven by the handshake — never anything in a payload. It is
resolved **once per user**, not once per room: `getMembershipSnapshot` returns every current org
in one query, behind a 30-second TTL, so a screen joining several rooms pays for one lookup.

That cache is **read-path only**. Writes go through `isOrganizationAdmin` / `canEditEventOrGame` /
`canScoreGame`, which query directly every time — deliberately, so no cached identity can ever
authorize a mutation. Do not reuse it there.

Access is checked when a room is **joined**, and re-checked on **revocation**: publishing
`USER_MEMBERSHIPS_UPDATED` for a user drops their cached identity and then runs
`revalidateUserRooms`, which re-applies `canJoinRoom` to the rooms their sockets already hold and
leaves the ones that now fail, emitting `ROOM_ACCESS_REVOKED`. Any new path that changes a
membership gets this for free, as long as it publishes that message.

A membership that lapses purely on the clock (a future-dated `end_date` passing) executes no code
and so is *not* caught at that instant; it is picked up at the socket's next reconnect, since every
reconnect re-joins every room through this same check. That is deliberate — see `LIVE-5`.

## 4. One room, one dataset.

A room is a **subscription unit**: one collection, or one record, at one scope, at one access
tier. If a screen would want half of what a room carries, it is two rooms.

The naming grammar follows from that, and every room name obeys it:

| Shape | Means | Examples |
| --- | --- | --- |
| `{entity}:{id}` | the record itself | `site:{id}`, `event:{id}`, `division:{id}` |
| `{entity}:{id}:{collection}` | one collection belonging to it | `org:{id}:teams`, `event:{id}:fixtures`, `user:{id}:notifications` |

`classifyRoom` refuses anything with more than three segments, so a collection of a collection is
named with an underscore (`division:{id}:stage_entrants`) rather than a fourth segment.

**Why, concretely.** `event:{id}` used to carry five datasets — the event, its fixtures, its
divisions, its facilities and its standings table. The entrants screen joins it wanting two of
them and was handed all five, so three server queries ran per join for data nothing read. Worse,
the room name told you nothing about what you had subscribed to: five `useLiveRoom` calls on one
string, each reducer claiming its own types and ignoring the rest, and no way to see from the
outside which screen depended on which half.

### Scope is a design decision, not a mechanical one

"One dataset" fixes what a room carries. It does **not** tell you how widely to scope it, and
getting that wrong is the opposite failure — a room per row means a join per row.

`event:{id}:entrants` is the worked example. It carries the whole tournament's roster, every
division at once, because the entry screens work two axes over it (*who is in the u14 rugby?* and
*what is Northcliff entering?*). Scoping it per division would be correct by the letter of the rule
and fifteen joins on one screen open. Same reasoning keeps `division:{id}:stage_entrants` at the
division rather than at the stage.

So: **scope a collection at the level screens read it as a unit.** One dataset, at the widest scope
any screen wants whole.

### A different access tier is always a different room

Implied by rule 3 but worth stating, because it is the one split you cannot defer: if part of a
collection is spectator-visible and part is not, they are two rooms. `game:{id}:summary` is
`public` and `game:{id}` is `member` for exactly this reason (`LIVE-4`). A room cannot hand over
"most of" its dataset to a viewer with a lower tier — the push is all or nothing.

This is also the forward-looking argument for splitting early. Everything in an event was `public`
when it was one room; the moment one slice needs a tier of its own, it has to become a room, and
doing it then means changing publishers and screens under pressure.

### Adding a room

1. Declare it in `classifyRoom` with its access tier — an undeclared name is refused.
2. Give it a join push in the `join_room` handler. A joinable room that pushes nothing starts every
   screen empty (`LIVE-14`). A room for one record pushes `ENTITY_NOT_FOUND` when it is missing, and
   the handler's reply after the push must not be skipped by an early `return` (`LIVE-25`).
3. Give it a publisher. A room that hands data over on join and never republishes goes stale the
   moment anything changes (`FIX-4`, `LIVE-8`).
4. Add it to [okf/live_rooms.md](file:///c:/Fred/Coding/SK/okf/live_rooms.md), which is the one
   place all three of those are listed together.

Steps 2 and 3 are the ones that get forgotten, and both fail silently.

## `get_data` is the other half of the read boundary

Gating rooms while leaving queries open is a lock on one of two doors. Every `get_data`
request is classified in
[wss/dataAccess.ts](file:///c:/Fred/Coding/SK/server/src/wss/dataAccess.ts), and **an unmapped
type is refused** — so adding a `get_data` case means classifying it, the same way adding a room
means declaring it.

Almost every type resolves to the room that already owns that data and defers to `canJoinRoom`,
so there is one rulebook rather than two. Only data no room owns (`sports`, `roles`,
`user_memberships`, `search_people`) carries a standalone level.

Currently **log-only** — refusals are logged as `[DataAccess] WOULD-REFUSE` and allowed through.
`GET_DATA_ENFORCE=true` enforces. See `DATA-1`.

## Publishing

Every broadcast goes through [wss/broadcast.ts](file:///c:/Fred/Coding/SK/server/src/wss/broadcast.ts),
which stamps the `topic` on. Do not call `io.to(...).emit('update', ...)` directly.

- `broadcast(topic, type, data)` — to a room.
- `pushToSocket(socket, topic, type, data)` — the state a room hands over on join.

The `topic` matters: socket.io does not tell a receiver which room delivered a message, so
without it a client can only filter on `type` and ends up reacting to rooms it never
joined. `useLiveRoom` drops anything whose topic is not its own.

For fixtures specifically, use [wss/fixtures.ts](file:///c:/Fred/Coding/SK/server/src/wss/fixtures.ts)
rather than open-coding an audience:

- `publishGameSummary(gameId)` — after **any** change to score, clock, status, kick-off,
  venue or participants.
- `captureFixtureRooms(gameId)` then `publishGameRemoved(...)` — for a delete, because
  afterwards there is no row left to resolve the audience from.
- `publishEventToOrgs(orgIds, type, data)` — for event-level changes.

The audience is the hosting org, the orgs registered on the event, **and** the orgs owning
the participating teams. Hand-rolling `[event.orgId, ...participatingOrgIds]` misses the
third, and is how `DELETE_GAME`, `UPDATE_GAME_SCORE` and `ADD_GAME_EVENT` each ended up
reaching nobody's fixtures list.

## The summary tier

A game has two tiers, and they are different rooms:

- **`GameSummary`** ([shared](file:///c:/Fred/Coding/SK/shared/src/models/event/GameSummary.ts)) —
  status, scores, clock, times, venue ids, and participants **with their team name and org
  short name**. Published to `org:*:events` and `game:{id}:summary`.
- **The full `Game` plus its feed** — recorded events, disputes, rosters, sin bins.
  `game:{id}`, `game:{id}:events` (the feed, public) and `game:{id}:disputes` only.

A list wants the summary. Never subscribe a list to `game:{id}:events` to get a score: that
room hands over every recorded event in the match.

Because the summary names each participant's org, a client rendering a fixture needs **no**
teams or organizations lookup — and the label cannot go stale, since a rename republishes
the summary.

## A row in a list

A live thing has a room per level of detail, and a list wants the lightest. **When a list holds a
room per row, that room carries only what changes on the row while it is on**, in as few bytes as
possible; the list's own read brings what does not change, such as who is playing.

- `game:{id}:row` — `GameListRow`: status, score, period and times, with no sides. It is still a whole
  object under keep-the-latest (rule 1): the object is simply small.
- `event:{id}:row` — `EventListRow`: how many games, how many live. It says nothing when a score
  changes neither, and costs no query while nobody is in the room.

Hold a room only for a row **on screen that can change now**. Every join costs its access check and
its push, on every reconnect, so a room for each of forty rows is a stampede when the server
restarts. Use [`useGameRows` / `useEventRows`](file:///c:/Fred/Coding/SK/expo-app/hooks/useListRows.ts),
which join and leave only the difference as the list changes. A new kind of live thing shown in a
list gets its own light room on this pattern. Lists still on a whole fixtures room: `LIVE-23`.
