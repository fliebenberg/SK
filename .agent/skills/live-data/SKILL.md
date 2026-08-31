---
name: Live Data & Subscriptions
description: How real-time data reaches a client — rooms as the read boundary, broadcasts that carry data rather than nudges, and the summary tier. Read before adding a room, a broadcast, or a screen that shows changing data.
---

# Live Data & Subscriptions

Three rules. All three are load-bearing; breaking any one of them has already caused a
bug in this repo.

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

**Send the whole object, not a patch.** The one deliberate exception is the game clock
delta, which predates this rule.

## 2. Joining a room *is* the initial load.

`join_room` pushes the room's current state back to the socket that joined
([index.ts](file:///c:/Fred/Coding/SK/server/src/index.ts), `socket.on('join_room')`).
A screen that joins a room and *also* fetches the same data on mount loads everything
twice. Use [`useLiveRoom`](file:///c:/Fred/Coding/SK/expo-app/hooks/useLiveRoom.ts),
which never issues a query.

`useSocketQuery` remains correct for genuine one-shot reads (a form's dropdown options,
a report) — data that no room owns.

## 3. Rooms are the read boundary, and every room is declared.

Because a broadcast carries data, whatever a socket can join, it can read. Room access is
therefore an authorization decision, made in
[wss/roomAccess.ts](file:///c:/Fred/Coding/SK/server/src/wss/roomAccess.ts) and checked
*before* the join.

**An unrecognised room name is refused.** Adding a room means adding it to `classifyRoom`
with one of three access levels:

| Access | Meaning | Examples |
| --- | --- | --- |
| `public` | A spectator may legitimately see this. Includes anonymous sockets, because the org directory is browsable logged out. | `org:*:events`, `org:*:teams`, `org:*:sites`, `event:*`, `game:*:summary`, `season:*:standings` |
| `member` | Personal data, or an org's internal state. Requires a current membership of a related org. | `org:*:members`, `team:*` (rosters), `game:*`, `game:*:events` |
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
  `game:{id}` and `game:{id}:events` only.

A list wants the summary. Never subscribe a list to `game:{id}:events` to get a score: that
room hands over every recorded event in the match.

Because the summary names each participant's org, a client rendering a fixture needs **no**
teams or organizations lookup — and the label cannot go stale, since a rename republishes
the summary.
