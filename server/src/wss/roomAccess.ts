import { accessManager } from '../managers/AccessManager';

/**
 * Who may subscribe to a room.
 *
 * Room membership is the read boundary for every live update: a broadcast
 * carries the data itself, not a nudge to refetch, so whatever a socket can
 * join, it can read. `join_room` used to accept any string and immediately
 * push that room's full state back, which meant an anonymous socket could
 * read any org's member list by guessing an id.
 *
 *  - `public` — anything a spectator may legitimately see: fixtures, results,
 *    venues, team names, league tables. The org directory is browsable while
 *    logged out, so `public` deliberately includes anonymous sockets.
 *  - `member` — carries a person's data (member lists, rosters) or an org's
 *    internal state. Requires a current membership of a related org.
 *  - `self`  — the socket's own user.
 *
 * An unrecognised room shape is denied. Adding a room means adding it here.
 */
export type RoomAccess = 'public' | 'member' | 'self';

export interface RoomPolicy {
  access: RoomAccess;
  /** Orgs whose membership grants access, for `member` rooms. */
  orgsFor?: (id: string) => Promise<string[] | null>;
  /**
   * The tournament grants that also open this `member` room (D33).
   *
   * A membership is not the only way to have business here. An appointed convenor may hold no
   * membership anywhere — that is the whole point of being able to appoint an external specialist
   * — and without this they would be given a division to run and then refused its roster. So a
   * room that belongs to a tournament names the event and division whose organisers may read it,
   * and the check below admits a grant on either.
   */
  grantsFor?: (id: string) => Promise<{ eventId?: string | null; divisionId?: string | null } | null>;
  /**
   * The team duties that also open this `member` room (`MEMBER-3` plan §0.3): a coach of one of
   * `teamIds`, or the appointed scorer of `gameId`. The same reasoning as `grantsFor` — a duty is
   * business here without a membership — and needed because a restricted minor's membership opens
   * nothing while their coaching or scoring must still work, for that team or game only.
   */
  dutiesFor?: (id: string) => Promise<{ teamIds?: string[]; gameId?: string | null } | null>;
  /** The user id that must match the socket, for `self` rooms. */
  selfId?: string;
}

/**
 * Classify a room name. Returns null when the shape is not one we publish to,
 * which the caller must treat as a refusal rather than as "no restriction".
 */
export function classifyRoom(room: unknown): RoomPolicy | null {
  // `room` arrives over a socket, so its declared type at the call site is a claim rather than a
  // guarantee. This is the choke point every room check goes through, so it is the right place to
  // stop a non-string: an object here used to reach `.split` and throw, and a throw inside an async
  // socket handler is an unhandled rejection, which ends the process (`SOCK-1`).
  if (typeof room !== 'string' || room.length === 0) return null;

  const parts = room.split(':');
  const [kind, id, sub] = parts;
  if (!kind || !id || parts.length > 3) return null;

  switch (kind) {
    case 'user':
      // Rule 4: the user room was three datasets in one — notifications, memberships and event
      // capabilities. Each is its own room now, and the bare name is no longer joinable, so a
      // screen cannot accidentally subscribe to all three by asking for none of them.
      if (sub !== 'notifications' && sub !== 'memberships' && sub !== 'capabilities') return null;
      return { access: 'self', selfId: id };

    case 'org':
      switch (sub) {
        // An org's people and its commercial relationships.
        case 'members':
        case 'referrals':
          return { access: 'member', orgsFor: async () => [id] };
        // Fixtures, venues, teams and competitions are public information.
        case 'summary':
        case 'events':
        // The game summaries under those events — `org:{id}:events` used to carry both, which is
        // the rule 4 violation a fixtures list pays for: it wants this half and not the other.
        case 'fixtures':
        case 'teams':
        case 'sites':
        case 'facilities':
        case 'leagues':
          return { access: 'public' };
        default:
          return null;
      }

    case 'team':
      // The roster is personal data, and often a minor's — so it is `member` like the team record,
      // but a separate room (rule 4), because a team picker wants the name and not the children.
      if (sub && sub !== 'members') return null;
      return {
        access: 'member',
        orgsFor: async () => {
          const orgId = await accessManager.getTeamOrgId(id);
          return orgId ? [orgId] : null;
        },
        // A coach reads their own team's roster through the duty, not the membership.
        dutiesFor: async () => ({ teamIds: [id] }),
      };

    case 'game':
      switch (sub) {
        // The summary tier is the spectator view: score, clock, status, teams.
        case 'summary':
          return { access: 'public' };
        // The base room carries the full game; `:events` the scoring feed and `:disputes` the
        // open disputes. All three are internal. `:detail` was a second name for the base room and
        // was removed 2026-09-11 under rule 4 — one dataset, one room, one name.
        case undefined:
        case 'events':
        // Open disputes were pushed to `game:{id}:events` alongside the scoring feed — two datasets,
        // one room. Same tier: a dispute names who raised it.
        case 'disputes':
          return {
            access: 'member',
            orgsFor: async () => {
              const orgIds = await accessManager.getGameOrgIds(id);
              return orgIds.length ? orgIds : null;
            },
            // Entering a result means reading the fixture first. A fixture with no stage resolves
            // to no division, which is the right answer rather than a missing one: it belongs to
            // no convenor.
            grantsFor: async () => ({
              eventId: await accessManager.getGameEventId(id),
              divisionId: await accessManager.getGameDivisionId(id),
            }),
            // Its scorer, and the coaches of the teams playing in it.
            dutiesFor: async () => ({
              gameId: id,
              teamIds: await accessManager.getGameTeamIds(id),
            }),
          };
        default:
          return null;
      }

    case 'event':
      // The event itself is public — fixtures, results and the divisions they sit in.
      if (!sub) return { access: 'public' };
      // The tournament's whole roster, at the same tier as one division's (U21). An entrant may be
      // a person rather than a team, and an unresolved one carries a label somebody wrote about a
      // school that has not confirmed yet; neither is spectator information. A convenor holds no
      // membership of the hosting org, so the grant is the other way in — exactly as it is for
      // `division:{id}`.
      // The event room used to carry five datasets. These four are the public ones, split out by
      // rule 4; the roster below is `member` and was already separate.
      if (sub === 'fixtures' || sub === 'divisions' || sub === 'facilities' || sub === 'standings') {
        return { access: 'public' };
      }
      if (sub === 'entrants') {
        return {
          access: 'member',
          orgsFor: async () => {
            const orgIds = await accessManager.getEventOrgIds(id);
            return orgIds.length ? orgIds : null;
          },
          grantsFor: async () => ({ eventId: id, divisionId: null }),
        };
      }
      return null;

    case 'site':
    case 'facility':
      return sub ? null : { access: 'public' };

    case 'league':
      return sub === 'seasons' ? { access: 'public' } : null;

    case 'season':
      return sub === 'standings' ? { access: 'public' } : null;

    // A tournament division. Rooms follow the screen's data needs, never the viewer's role (U33):
    // a convenor looking at the whole event needs its data exactly as the host does, so the split
    // below is by *what is in the room*, not by who is allowed to organise.
    case 'division':
      switch (sub) {
        // Fixtures and results are public information, exactly as `org:*:events` and
        // `season:*:standings` already are — a spectator may legitimately read the draw and the
        // table. These two carry the division and its stages as well, because a fixture list has
        // to be able to name the stage a fixture is in.
        case 'fixtures':
        case 'standings':
        // Split out of `division:{id}:fixtures`, which carried four datasets. A draw and a table are
        // spectator information, and so are the stages they sit in and the venues they use.
        case 'stages':
        case 'facilities':
          return { access: 'public' };
        // The base room is the organiser's tier: the roster, pool membership, and the manual
        // points adjustments — which carry a reason written by a person ("ineligible player") and
        // the author's id. An entrant may also *be* a person rather than a team, so a roster here
        // is the same kind of data as `team:{id}`, and gets the same level.
        // **Tier change, 2026-09-11, and it is a restoration rather than a widening.** The base
        // room is now the division *record*, and that record was already public: it was pushed to
        // the public `division:{id}:fixtures` room as `DIVISION_UPDATED` before the split. Leaving
        // it at `member` would have taken the division's name away from the spectator reading its
        // draw.
        case undefined:
          return { access: 'public' };
        // The roster, the pool membership and the manual adjustments: three datasets that shared the
        // base room, now one room each (rule 4). All `member` for the reason the base room was — an
        // entrant may be a person, and an adjustment carries a reason somebody wrote and their id.
        // `stage_entrants` keeps the division scope rather than becoming `stage:{id}:entrants`,
        // because the screen reads every stage at once.
        case 'entrants':
        case 'adjustments':
        case 'stage_entrants':
          return {
            access: 'member',
            orgsFor: async () => {
              const orgIds = await accessManager.getDivisionOrgIds(id);
              return orgIds.length ? orgIds : null;
            },
            grantsFor: async () => ({
              eventId: await accessManager.getDivisionEventId(id),
              divisionId: id,
            }),
          };
        default:
          return null;
      }

    default:
      return null;
  }
}

/**
 * Short-lived cache of "which orgs is this user in, and what has this user been granted".
 *
 * A screen typically joins several rooms at once, and resolving the identity
 * per room meant two queries per room. Resolving it once per user covers the
 * whole burst.
 *
 * The TTL is short and there is no explicit invalidation, because membership
 * validity depends on the clock as well as on writes — `end_date` lapses with
 * no row being touched, so a cache that only cleared on write would hold a
 * lapsed membership open indefinitely. Thirty seconds bounds the staleness in
 * both directions: a revoked membership stops granting joins within the window,
 * and a newly added one starts working within it.
 *
 * Read path only. Writes go through `isOrganizationAdmin` / `canEditEventOrGame`
 * / `canScoreGame`, which query directly every time — deliberately, so that no
 * cached identity can ever authorize a mutation. Do not reuse this there.
 */
const MEMBERSHIP_TTL_MS = 30_000;

interface CachedMembership {
  orgIds: Set<string>;
  isAppAdmin: boolean;
  /** Tournament grants, resolved in the same burst and under the same TTL. */
  grantedEventIds: Set<string>;
  grantedDivisionIds: Set<string>;
  /** Team duties (`getDutySnapshot`): teams coached, games scored. */
  dutyTeamIds: Set<string>;
  dutyGameIds: Set<string>;
  expiresAt: number;
}

const membershipCache = new Map<string, CachedMembership>();

async function getMembership(userId: string): Promise<CachedMembership> {
  const now = Date.now();
  const cached = membershipCache.get(userId);
  if (cached && cached.expiresAt > now) return cached;

  // Both halves of the identity in one burst: a screen joining several rooms asks about the same
  // user each time, and a grant lookup per room is the cost this cache exists to remove.
  const [snapshot, grants, duties] = await Promise.all([
    accessManager.getMembershipSnapshot(userId),
    accessManager.getGrantSnapshot(userId),
    accessManager.getDutySnapshot(userId),
  ]);
  const entry: CachedMembership = {
    ...snapshot,
    grantedEventIds: grants.eventIds,
    grantedDivisionIds: grants.divisionIds,
    dutyTeamIds: duties.teamIds,
    dutyGameIds: duties.gameIds,
    expiresAt: now + MEMBERSHIP_TTL_MS,
  };
  membershipCache.set(userId, entry);

  // The map is only ever added to, so evict what has aged out while we are here.
  if (membershipCache.size > 128) {
    for (const [key, value] of membershipCache) {
      if (value.expiresAt <= now) membershipCache.delete(key);
    }
  }
  return entry;
}

/** Drop a user's cached memberships, for a change that must take effect at once. */
export function invalidateMembership(userId: string) {
  membershipCache.delete(userId);
}

/**
 * `userId` is the identity proven by the socket handshake — never anything the
 * client put in a payload. `'anonymous'` and `'invalid-token'` are the two
 * values the handshake middleware assigns when no valid token was presented.
 *
 * Note this is checked when a room is *joined*. A membership that lapses while
 * a socket is already in a room keeps delivering until it disconnects; see
 * `LIVE-5` in TODO.md.
 */
export async function canJoinRoom(userId: string, room: unknown): Promise<boolean> {
  // `unknown` rather than `string` because the value comes off a socket. `classifyRoom` refuses a
  // non-string on its own, but this function goes on to re-split `room` below, so it needs the
  // narrowing in its own right rather than inferring it from a non-null policy.
  if (typeof room !== 'string') return false;

  const policy = classifyRoom(room);
  if (!policy) return false;

  if (policy.access === 'public') return true;

  const isAuthenticated = !!userId && userId !== 'anonymous' && userId !== 'invalid-token';
  if (!isAuthenticated) return false;

  if (policy.access === 'self') return policy.selfId === userId;

  const membership = await getMembership(userId);
  if (membership.isAppAdmin) return true;

  // Only now resolve which orgs the *resource* belongs to — an app admin never
  // needs the lookup, and a stranger is rejected without it either way.
  const subjectId = room.split(':')[1];
  const orgIds = policy.orgsFor ? await policy.orgsFor(subjectId) : null;
  if (orgIds && orgIds.some(orgId => membership.orgIds.has(orgId))) return true;

  // A grant is the other way in, and it is checked second because membership is the ordinary case
  // and costs nothing extra. Someone with neither is refused exactly as before.
  if (policy.grantsFor && (membership.grantedEventIds.size || membership.grantedDivisionIds.size)) {
    const scope = await policy.grantsFor(subjectId);
    if (scope?.eventId && membership.grantedEventIds.has(scope.eventId)) return true;
    if (scope?.divisionId && membership.grantedDivisionIds.has(scope.divisionId)) return true;
  }

  // A team duty is the third, checked last for the same reason: it only matters to someone whose
  // membership does not already open the room — in practice a restricted minor who coaches or scores.
  if (policy.dutiesFor && (membership.dutyTeamIds.size || membership.dutyGameIds.size)) {
    const duty = await policy.dutiesFor(subjectId);
    if (duty?.gameId && membership.dutyGameIds.has(duty.gameId)) return true;
    if (duty?.teamIds?.some(teamId => membership.dutyTeamIds.has(teamId))) return true;
  }

  return false;
}
