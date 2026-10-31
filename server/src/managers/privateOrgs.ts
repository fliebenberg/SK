import { query } from '../db';
import type { Tx } from './BaseManager';

/**
 * Private organisations (`ORG-14`, docs/org-profile.md §5.3).
 *
 * A private organisation is seen only by its **current members** — and app admins, who already
 * bypass every read check. To everyone else it does not exist: the org lists, searches, Home and
 * the map leave it out, and its public rooms (summary, fixtures, teams, venues, its events and
 * games) close to them. Former members keep the games they played in (`canSeePrivateGame`).
 *
 * A private org **plays only among itself**: no event, game or season of it may involve another
 * organisation. That is what lets every room decide on one owner — an event's host is the only org
 * in it — and it is enforced as one invariant inside each write's transaction
 * (`assertEventKeepsPrivateOrgsApart`, `assertSeasonKeepsPrivateOrgsApart`) rather than by every
 * screen that picks an opponent. An org that has ever shared an event or season with another can
 * therefore never go private (`hasExternalHistory`).
 *
 * "Belongs" here is any current membership, matched as `getOrganizationRole` matches it — by the
 * profile's account or a verified email — and deliberately **not** narrowed by the restricted-minor
 * rule (`memberPrivilegedSql`): that rule is about privileges inside the org, and seeing one's own
 * organisation is not one. Guardians, Trusted Contacts and profiles without a membership do not
 * belong (decided 2026-10-31: kept as simple as possible).
 */

const pooled: Tx = (text, params) => query(text, params);

/** SQL: the user `viewer` (a parameter like `$3`) has a current membership of organisation `org`. */
const BELONGS = (org: string, viewer: string) => `EXISTS (
  SELECT 1 FROM org_memberships vm JOIN org_profiles vp ON vp.id = vm.org_profile_id
   WHERE vm.org_id = ${org}
     AND (vm.end_date IS NULL OR vm.end_date > NOW())
     AND (vp.user_id = ${viewer} OR vp.email IN (
           SELECT email FROM user_emails WHERE user_id = ${viewer} AND verified_at IS NOT NULL
           UNION SELECT email FROM users WHERE id = ${viewer})))`;

/** SQL: the user `viewer` is an app admin — matched by account only, as `isAppAdmin` does. */
const IS_APP_ADMIN = (viewer: string) => `EXISTS (
  SELECT 1 FROM org_memberships am JOIN org_profiles ap ON ap.id = am.org_profile_id
   WHERE am.org_id = 'org-system-admins' AND ap.user_id = ${viewer}
     AND (am.end_date IS NULL OR am.end_date > NOW()))`;

/**
 * SQL: organisation alias `o` may be shown to the user `viewer` (a parameter such as `$4`, holding a
 * user id or `NULL` for a signed-out visitor). Every query that lists or finds organisations — or
 * their teams and sites — adds this.
 */
export const ORG_VISIBLE = (o: string, viewer: string) =>
  `(NOT ${o}.is_private OR (${viewer}::text IS NOT NULL AND (${BELONGS(`${o}.id`, `${viewer}::text`)} OR ${IS_APP_ADMIN(`${viewer}::text`)})))`;

/** SQL: event alias `e` is hosted by a public organisation — the condition `PUBLIC_EVENT` adds. */
export const HOST_IS_PUBLIC = (e: string) =>
  `NOT EXISTS (SELECT 1 FROM organizations hp WHERE hp.id = ${e}.org_id AND hp.is_private)`;

/** A user id the queries above can use: the handshake's anonymous markers are nobody. */
export function viewerOf(userId: string | null | undefined): string | null {
  return userId && userId !== 'anonymous' && userId !== 'invalid-token' ? userId : null;
}

// -------------------------------------------------------------------------------------------------
// Reading: which private org owns a room's subject, and may this user see it
// -------------------------------------------------------------------------------------------------

/** The subject kinds whose public rooms close for a private org. */
export type PrivateSubject = 'org' | 'site' | 'facility' | 'league' | 'season' | 'event' | 'division' | 'game';

/**
 * The private organisation that owns a room's subject, or `null` when its owner is public (or the
 * subject does not exist — the room's own rules decide that case). One query per public room join.
 *
 * An event's, division's or game's owner is its event's host: a private org's events involve no
 * other organisation, so the host is the only one there is.
 */
export async function privateOwnerOf(kind: PrivateSubject, id: string): Promise<string | null> {
  if (!id) return null;
  const sql: Record<PrivateSubject, string> = {
    org: `SELECT o.id FROM organizations o WHERE o.id = $1 AND o.is_private`,
    site: `SELECT o.id FROM sites s JOIN organizations o ON o.id = s.org_id WHERE s.id = $1 AND o.is_private`,
    facility: `SELECT o.id FROM facilities f JOIN sites s ON s.id = f.site_id JOIN organizations o ON o.id = s.org_id
                WHERE f.id = $1 AND o.is_private`,
    league: `SELECT o.id FROM leagues l JOIN organizations o ON o.id = l.org_id WHERE l.id = $1 AND o.is_private`,
    season: `SELECT o.id FROM seasons s JOIN leagues l ON l.id = s.league_id JOIN organizations o ON o.id = l.org_id
              WHERE s.id = $1 AND o.is_private`,
    event: `SELECT o.id FROM events e JOIN organizations o ON o.id = e.org_id WHERE e.id = $1 AND o.is_private`,
    division: `SELECT o.id FROM tournament_divisions d JOIN events e ON e.id = d.event_id JOIN organizations o ON o.id = e.org_id
                WHERE d.id = $1 AND o.is_private`,
    game: `SELECT o.id FROM games g JOIN events e ON e.id = g.event_id JOIN organizations o ON o.id = e.org_id
            WHERE g.id = $1 AND o.is_private`,
  };
  const res = await query(sql[kind], [id]);
  return res.rows[0]?.id ?? null;
}

/** Whether this user may see private organisation `orgId`: a current member, or an app admin. */
export async function canSeePrivateOrg(userId: string | null | undefined, orgId: string): Promise<boolean> {
  const viewer = viewerOf(userId);
  if (!viewer) return false;
  const res = await query(`SELECT (${BELONGS('$1', '$2')} OR ${IS_APP_ADMIN('$2')}) AS ok`, [orgId, viewer]);
  return res.rows[0]?.ok === true;
}

/** The subjects a player keeps through a game they played in: the game, and what it needs to show. */
export type PlayedSubject = 'game' | 'event' | 'site' | 'facility';

/**
 * Whether this user played in this game — or in a game of this event, or at this venue or field —
 * on a side's team sheet, or as the side in an individual sport, through any profile of theirs,
 * current membership or not.
 *
 * A former member of a private org keeps the games they played in (decided 2026-10-31), and a game
 * page cannot be read without its event's record and its venue's name, so those come with it. The
 * org itself, its other fixtures, its tables and its teams do not.
 */
export async function playedIn(userId: string | null | undefined, kind: PlayedSubject, id: string): Promise<boolean> {
  const viewer = viewerOf(userId);
  if (!viewer || !id) return false;
  const where: Record<PlayedSubject, string> = {
    game: 'g.id = $1',
    event: 'g.event_id = $1',
    site: `(g.site_id = $1 OR (g.site_id IS NULL AND e.site_id = $1)
            OR EXISTS (SELECT 1 FROM facilities pf WHERE pf.id = COALESCE(g.facility_id, e.facility_id) AND pf.site_id = $1))`,
    facility: 'COALESCE(g.facility_id, e.facility_id) = $1',
  };
  const res = await query(
    `SELECT 1 FROM games g
       JOIN events e ON e.id = g.event_id
       JOIN game_participants gp ON gp.game_id = g.id
       LEFT JOIN game_rosters gr ON gr.game_participant_id = gp.id
       JOIN org_profiles op ON op.id = COALESCE(gr.org_profile_id, gp.org_profile_id)
      WHERE ${where[kind]} AND op.user_id = $2
      LIMIT 1`,
    [id, viewer]
  );
  return res.rows.length > 0;
}

// -------------------------------------------------------------------------------------------------
// Writing: a private org plays only among itself
// -------------------------------------------------------------------------------------------------

/**
 * SQL: every organisation taking part in event `$1` — its host, the organisations listed on it
 * (except one that declined), the organisations of its entrants (except declined or rejected
 * ones) and of every side in its games.
 */
const EVENT_ORGS = `
  SELECT e.org_id AS org_id FROM events e WHERE e.id = $1
  UNION SELECT eo.org_id FROM event_organizations eo WHERE eo.event_id = $1 AND eo.invitation <> 'declined'
  UNION SELECT de.org_id FROM division_entrants de JOIN tournament_divisions d ON d.id = de.division_id
         WHERE d.event_id = $1 AND de.org_id IS NOT NULL AND de.status NOT IN ('declined', 'rejected')
  UNION SELECT COALESCE(t.org_id, op.org_id) FROM games g
          JOIN game_participants gp ON gp.game_id = g.id
          LEFT JOIN teams t ON t.id = gp.team_id
          LEFT JOIN org_profiles op ON op.id = gp.org_profile_id
         WHERE g.event_id = $1`;

/** SQL: every organisation in season `$1` — its league's, and those of its teams. */
const SEASON_ORGS = `
  SELECT l.org_id AS org_id FROM seasons s JOIN leagues l ON l.id = s.league_id WHERE s.id = $1
  UNION SELECT t.org_id FROM season_teams st JOIN teams t ON t.id = st.team_id WHERE st.season_id = $1`;

const MIXED_REFUSAL = 'A private organisation plays only among its own members, so it cannot take part in a game, tournament or season with another organisation.';

async function assertKeptApart(q: Tx, orgsSql: string, id: string): Promise<void> {
  const res = await q(
    `SELECT COUNT(DISTINCT x.org_id)::int AS orgs, COALESCE(bool_or(o.is_private), false) AS "anyPrivate"
       FROM (${orgsSql}) x JOIN organizations o ON o.id = x.org_id`,
    [id]
  );
  const { orgs, anyPrivate } = res.rows[0] ?? {};
  if (anyPrivate && orgs > 1) throw new Error(MIXED_REFUSAL);
}

/**
 * Refuse — and so roll back — a write that leaves a private organisation sharing event `eventId`
 * with another. Call it inside the write's transaction, after the write, with its `tx`: checking the
 * result rather than each input is what covers every way in (a game's sides, the organisations
 * list, an entrant) with one rule.
 */
export async function assertEventKeepsPrivateOrgsApart(q: Tx, eventId: string | null | undefined): Promise<void> {
  if (eventId) await assertKeptApart(q, EVENT_ORGS, eventId);
}

/** The same, for the event a tournament division belongs to — the entrant writes. */
export async function assertDivisionKeepsPrivateOrgsApart(q: Tx, divisionId: string | null | undefined): Promise<void> {
  if (!divisionId) return;
  const res = await q('SELECT event_id FROM tournament_divisions WHERE id = $1', [divisionId]);
  await assertEventKeepsPrivateOrgsApart(q, res.rows[0]?.event_id);
}

/** The same for a league season: a private org's seasons hold only its own teams. */
export async function assertSeasonKeepsPrivateOrgsApart(q: Tx, seasonId: string | null | undefined): Promise<void> {
  if (seasonId) await assertKeptApart(q, SEASON_ORGS, seasonId);
}

/**
 * Whether organisation `orgId` has ever shared an event or a season with another organisation —
 * which closes the way to going private for good (decided 2026-10-31). Counted as `EVENT_ORGS` and
 * `SEASON_ORGS` count, so an organisation that only declined an invitation has no history.
 */
export async function hasExternalHistory(orgId: string, q: Tx = pooled): Promise<boolean> {
  const res = await q(
    `SELECT EXISTS (
       SELECT 1 FROM events e
        WHERE e.id IN (
                SELECT ev.id FROM events ev WHERE ev.org_id = $1
                UNION SELECT eo.event_id FROM event_organizations eo WHERE eo.org_id = $1 AND eo.invitation <> 'declined'
                UNION SELECT d.event_id FROM division_entrants de JOIN tournament_divisions d ON d.id = de.division_id
                       WHERE de.org_id = $1 AND de.status NOT IN ('declined', 'rejected')
                UNION SELECT g.event_id FROM games g JOIN game_participants gp ON gp.game_id = g.id
                       LEFT JOIN teams t ON t.id = gp.team_id LEFT JOIN org_profiles op ON op.id = gp.org_profile_id
                       WHERE COALESCE(t.org_id, op.org_id) = $1)
          AND (e.org_id <> $1
               OR EXISTS (SELECT 1 FROM event_organizations eo WHERE eo.event_id = e.id AND eo.org_id <> $1 AND eo.invitation <> 'declined')
               OR EXISTS (SELECT 1 FROM division_entrants de JOIN tournament_divisions d ON d.id = de.division_id
                           WHERE d.event_id = e.id AND de.org_id <> $1 AND de.status NOT IN ('declined', 'rejected'))
               OR EXISTS (SELECT 1 FROM games g JOIN game_participants gp ON gp.game_id = g.id
                           LEFT JOIN teams t ON t.id = gp.team_id LEFT JOIN org_profiles op ON op.id = gp.org_profile_id
                           WHERE g.event_id = e.id AND COALESCE(t.org_id, op.org_id) <> $1))
     ) OR EXISTS (
       SELECT 1 FROM season_teams st
         JOIN teams t ON t.id = st.team_id
         JOIN seasons s ON s.id = st.season_id
         JOIN leagues l ON l.id = s.league_id
        WHERE (l.org_id = $1) <> (t.org_id = $1)
     ) AS "has"`,
    [orgId]
  );
  return res.rows[0]?.has === true;
}
