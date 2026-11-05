import {
  GameSummary,
  HOME_RADIUS_KM,
  HomeNearby,
  HomeNearbyOrganizations,
  HomeSearchResult,
  MyHome,
  MyHomeRunEvent,
  NearbyOrganization,
  ViewerPosition,
  roundViewerPosition,
} from '@sk/shared';
import { BaseManager } from './BaseManager';
import { accessManager } from './AccessManager';
import { eventManager } from './EventManager';
import { restrictedReasonSql } from './minorAccess';
import { chooseMyGames, MyGameCandidate } from './myGames';
import { viewerChildIsMemberSql, viewerIsMemberSql, viewerOnTeamFieldsSql } from './TeamManager';
import { PUBLIC_EVENT } from './eventVisibility';
import { ORG_VISIBLE, viewerOf } from './privateOrgs';

/**
 * What the Home page reads (`HOME-1`, docs/home.md): what is on near the viewer, one search across
 * organisations, teams and sites, and the signed-in viewer's own games.
 *
 * **The viewer's position is used and forgotten.** It arrives rounded to about a kilometre, is a
 * query parameter and nothing else, and is never stored or logged (`near` is redacted by the socket
 * loggers).
 *
 * Distances are straight lines, worked out in the query. At today's size that is a scan of the
 * month's fixtures and every organisation; an index on the pins (PostGIS, or a bounding box first)
 * is the next step when it stops being cheap.
 */

/** How many single matches and tournaments to consider; the app shows the first few. */
const EVENTS_LIMIT = 40;
/** How many to show when nothing is within the radius: the closest, so the page is never empty. */
const BEYOND_LIMIT = 5;
const ORGS_LIMIT = 20;
const SEARCH_LIMIT = 10;
/** How many days ahead to read. A little over the month the app shows: its calendar decides. */
const WINDOW_DAYS = 32;
/** How far back *My games* looks for a result. */
const RESULT_DAYS = 7;

/**
 * The order for a query's `found` rows (`km`, `at`) ahead of the cap: within the radius or with no
 * position at all, soonest first, a game with no time at all at the top; beyond it, closest first.
 */
const SOONEST_WITHIN_RADIUS = `
  (km IS NULL OR km <= ${HOME_RADIUS_KM}) DESC,
  CASE WHEN km IS NULL OR km <= ${HOME_RADIUS_KM} THEN at END NULLS FIRST,
  km`;

/** Straight-line kilometres from the viewer (`$1`, `$2`) to a pin; `NULL` when either is missing. */
const KM = (lat: string, lng: string) => `(6371 * 2 * ASIN(SQRT(
    POWER(SIN(RADIANS(${lat} - $1::float8) / 2), 2)
    + COS(RADIANS($1::float8)) * COS(RADIANS(${lat})) * POWER(SIN(RADIANS(${lng} - $2::float8) / 2), 2))))`;

/**
 * An event's pin: its site's, else the site of one of the facilities it uses, else its host's
 * address. Used for a tournament, which has no game of its own to place it.
 */
const EVENT_PIN_JOINS = `
  LEFT JOIN sites es ON es.id = e.site_id
  LEFT JOIN addresses esa ON esa.id = es.address_id
  LEFT JOIN LATERAL (
    SELECT fa.latitude, fa.longitude FROM event_facilities ef
      JOIN facilities ff ON ff.id = ef.facility_id
      JOIN sites fs ON fs.id = ff.site_id
      JOIN addresses fa ON fa.id = fs.address_id
     WHERE ef.event_id = e.id AND fa.latitude IS NOT NULL
     LIMIT 1
  ) efa ON true
  LEFT JOIN organizations ho ON ho.id = e.org_id
  LEFT JOIN addresses hoa ON hoa.id = ho.address_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(esa.latitude, efa.latitude, hoa.latitude) AS lat,
           COALESCE(esa.longitude, efa.longitude, hoa.longitude) AS lng
  ) pin`;

/** The organisation fields Home lists, from `organizations o` and `addresses a`. */
/** What an organisation's card shows; `a` is its address. */
const ORG_CARD_FIELDS = `
  o.id, o.name, o.short_name AS "shortName", o.logo,
  o.primary_color AS "primaryColor", o.secondary_color AS "secondaryColor", o.tertiary_color AS "tertiaryColor",
  o.type, o.custom_type AS "customType", o.is_private AS "isPrivate",
  COALESCE(NULLIF(a.address_line_2, ''), NULLIF(a.city, '')) AS locality`;

const ORG_FIELDS = `
  ${ORG_CARD_FIELDS},
  ARRAY(SELECT sport_id FROM organization_sports WHERE org_id = o.id) AS "sportIds",
  (SELECT COUNT(*)::int FROM teams t WHERE t.org_id = o.id AND t.is_active = true) AS "teamCount"`;

/** A position the server will use, or `null`: anything else from a socket is ignored, not trusted. */
export function readViewerPosition(value: unknown): ViewerPosition | null {
  if (!value || typeof value !== 'object') return null;
  const { lat, lng } = value as { lat?: unknown; lng?: unknown };
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return roundViewerPosition({ lat, lng });
}

const roundKm = (km: unknown): number | null =>
  km === null || km === undefined ? null : Math.round(Number(km) * 10) / 10;

/** Those within the radius, or — when there are none — the closest few, and which it was. */
function withinOrClosest<T extends { km: number | null }>(rows: T[], near: ViewerPosition | null, limit: number) {
  if (!near) return { rows: rows.slice(0, limit), beyond: false };
  const within = rows.filter(r => r.km !== null && r.km <= HOME_RADIUS_KM);
  return within.length ? { rows: within.slice(0, limit), beyond: false } : { rows: rows.slice(0, BEYOND_LIMIT), beyond: true };
}

export class HomeManager extends BaseManager {
  /**
   * Single matches and tournaments on now or in the coming month. With no position, the same lists.
   *
   * The window is generous on both sides — the viewer's own calendar decides what is *today*, so
   * the app trims it. A match whose kick-off passed less than three hours ago and has not started
   * is still shown: it is late, not gone.
   *
   * **The cap keeps the soonest, not the closest.** Within the radius, what is on next matters more
   * than a few kilometres, so a busy area loses the end of the month and never today's games. Only
   * when nothing is within the radius does distance choose, to find the closest there are.
   *
   * A tournament comes with its counts rather than its fixtures: its row shows no more, and this is
   * read again every few minutes by everyone with Home open.
   */
  async getNearby(nearInput: unknown): Promise<HomeNearby> {
    const near = readViewerPosition(nearInput);
    const params = [near?.lat ?? null, near?.lng ?? null];

    const gamesRes = await this.query(`
      SELECT id, km, at FROM (
        SELECT g.id, ${KM('pin.lat', 'pin.lng')} AS km,
               EXTRACT(EPOCH FROM COALESCE(g.scheduled_start_time, g.start_time, e.start_date::timestamptz))::float8 AS at
          FROM games g
          JOIN events e ON e.id = g.event_id
          LEFT JOIN facilities f ON f.id = COALESCE(g.facility_id, e.facility_id)
          LEFT JOIN sites s ON s.id = COALESCE(g.site_id, e.site_id, f.site_id)
          LEFT JOIN addresses sa ON sa.id = s.address_id
          LEFT JOIN organizations ho ON ho.id = e.org_id
          LEFT JOIN addresses hoa ON hoa.id = ho.address_id
          CROSS JOIN LATERAL (
            SELECT COALESCE(f.latitude, sa.latitude, hoa.latitude) AS lat,
                   COALESCE(f.longitude, sa.longitude, hoa.longitude) AS lng
          ) pin
         WHERE e.type = 'SingleMatch'
           AND ${PUBLIC_EVENT('e')}
           AND e.status IS DISTINCT FROM 'Cancelled'
           AND (g.status = 'Live' OR (g.status = 'Scheduled' AND (
                 COALESCE(g.scheduled_start_time, g.start_time) BETWEEN NOW() - INTERVAL '3 hours' AND NOW() + INTERVAL '${WINDOW_DAYS} days'
                 OR (COALESCE(g.scheduled_start_time, g.start_time) IS NULL
                     AND e.start_date BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE + ${WINDOW_DAYS}))))
           AND ($1::float8 IS NULL OR pin.lat IS NOT NULL)
      ) found
       ORDER BY ${SOONEST_WITHIN_RADIUS}, id
       LIMIT ${EVENTS_LIMIT}
    `, params);

    const tournamentsRes = await this.query(`
      SELECT id, km, at FROM (
        SELECT e.id, ${KM('pin.lat', 'pin.lng')} AS km,
               EXTRACT(EPOCH FROM e.start_date::timestamptz)::float8 AS at
          FROM events e
          ${EVENT_PIN_JOINS}
         WHERE e.type = 'Tournament'
           AND ${PUBLIC_EVENT('e')}
           AND e.status IS DISTINCT FROM 'Cancelled'
           AND e.start_date <= CURRENT_DATE + ${WINDOW_DAYS}
           AND COALESCE(e.end_date, e.start_date) >= CURRENT_DATE - 1
           AND ($1::float8 IS NULL OR pin.lat IS NOT NULL)
      ) found
       ORDER BY ${SOONEST_WITHIN_RADIUS}, id
       LIMIT ${EVENTS_LIMIT}
    `, params);

    // One list of events decides together whether anything is within the radius, and the same rule
    // as the queries' decides which are kept: the soonest if so, the closest if not.
    const candidates = [
      ...gamesRes.rows.map((r: any) => ({ kind: 'game' as const, id: r.id as string, km: roundKm(r.km), at: r.at as number | null })),
      ...tournamentsRes.rows.map((r: any) => ({ kind: 'tournament' as const, id: r.id as string, km: roundKm(r.km), at: r.at as number | null })),
    ];
    const bySoonest = !near || candidates.some(c => c.km !== null && c.km <= HOME_RADIUS_KM);
    candidates.sort((a, b) => bySoonest
      ? (a.at ?? -Infinity) - (b.at ?? -Infinity)
      : (a.km ?? Infinity) - (b.km ?? Infinity));
    const events = withinOrClosest(candidates, near, EVENTS_LIMIT);
    const gameKm = new Map(events.rows.filter(c => c.kind === 'game').map(c => [c.id, c.km]));
    const tournamentKm = new Map(events.rows.filter(c => c.kind === 'tournament').map(c => [c.id, c.km]));

    const [gameSummaries, tournamentEvents, tournamentCounts] = await Promise.all([
      eventManager.getGameSummariesByIds([...gameKm.keys()]),
      eventManager.getEventsByIds([...tournamentKm.keys()]),
      this.query(`
        SELECT event_id AS "eventId", COUNT(*)::int AS "gameCount",
               (COUNT(*) FILTER (WHERE status = 'Live'))::int AS "liveCount"
          FROM games WHERE event_id = ANY($1) GROUP BY event_id`, [[...tournamentKm.keys()]]),
    ]);
    const counts = new Map<string, any>(tournamentCounts.rows.map((r: any) => [r.eventId, r]));

    const names = await this.venueNames(gameSummaries, tournamentEvents.flatMap(e => (e.siteId ? [e.siteId] : [])));

    return {
      games: gameSummaries.map(game => ({ game, km: gameKm.get(game.id) ?? null })),
      tournaments: tournamentEvents.map(event => ({
        event,
        gameCount: counts.get(event.id)?.gameCount ?? 0,
        liveCount: counts.get(event.id)?.liveCount ?? 0,
        km: tournamentKm.get(event.id) ?? null,
      })),
      eventsBeyondRadius: events.beyond,
      ...names,
    };
  }

  /** Names for the rows' Where: every site and facility these games name, and any other sites. */
  private async venueNames(games: GameSummary[], otherSiteIds: string[] = []) {
    const siteIds = new Set(otherSiteIds);
    const facilityIds = new Set<string>();
    for (const g of games) {
      if (g.siteId) siteIds.add(g.siteId);
      if (g.facilityId) facilityIds.add(g.facilityId);
    }
    const [sites, facilities] = await Promise.all([
      this.query(`SELECT id, name FROM sites WHERE id = ANY($1)`, [[...siteIds]]),
      this.query(`SELECT id, name FROM facilities WHERE id = ANY($1)`, [[...facilityIds]]),
    ]);
    return {
      siteNames: Object.fromEntries(sites.rows.map((r: any) => [r.id, r.name])) as Record<string, string>,
      facilityNames: Object.fromEntries(facilities.rows.map((r: any) => [r.id, r.name])) as Record<string, string>,
    };
  }

  /**
   * Organisations closest first, or by size with no position. A private one is listed only for those
   * who belong to it (`ORG-14`).
   */
  async getNearbyOrganizations(nearInput: unknown, viewerId?: string | null): Promise<HomeNearbyOrganizations> {
    const near = readViewerPosition(nearInput);
    const res = await this.query(`
      SELECT ${ORG_FIELDS}, ${KM('a.latitude', 'a.longitude')} AS km
        FROM organizations o
        LEFT JOIN addresses a ON a.id = o.address_id
       WHERE o.is_active IS DISTINCT FROM false
         AND ${ORG_VISIBLE('o', '$3')}
         AND ($1::float8 IS NULL OR a.latitude IS NOT NULL)
       ORDER BY km NULLS LAST, "teamCount" DESC, o.name
       LIMIT ${ORGS_LIMIT}
    `, [near?.lat ?? null, near?.lng ?? null, viewerOf(viewerId)]);

    const orgs = withinOrClosest(
      res.rows.map((r: any): NearbyOrganization => ({ ...r, km: roundKm(r.km) })),
      near,
      ORGS_LIMIT
    );
    return { organizations: orgs.rows, organizationsBeyondRadius: orgs.beyond };
  }

  /**
   * Organisations, teams and sites matching every word typed, anywhere, closest first.
   *
   * A team matches on its organisation's name too, so "doringkloof u14" finds Doringkloof's U14
   * teams; a site the same way. Inactive teams and sites are left out.
   */
  async search(query: unknown, nearInput: unknown, viewerId?: string | null): Promise<HomeSearchResult> {
    const words = typeof query === 'string'
      ? query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6).map(w => `%${w.replace(/[\\%_]/g, '\\$&')}%`)
      : [];
    if (!words.length) return { organizations: [], teams: [], sites: [] };
    const near = readViewerPosition(nearInput);
    // A private organisation, and its teams and sites, only for those who belong to it (`ORG-14`).
    const params = [near?.lat ?? null, near?.lng ?? null, words, viewerOf(viewerId)];
    const matches = (haystack: string) =>
      `NOT EXISTS (SELECT 1 FROM unnest($3::text[]) w WHERE NOT (${haystack}) ILIKE w)`;

    const [orgs, teams, sites] = await Promise.all([
      this.query(`
        SELECT ${ORG_FIELDS}, ${KM('a.latitude', 'a.longitude')} AS km
          FROM organizations o
          LEFT JOIN addresses a ON a.id = o.address_id
         WHERE o.is_active IS DISTINCT FROM false
           AND ${ORG_VISIBLE('o', '$4')}
           AND ${matches(`o.name || ' ' || o.short_name || ' ' || COALESCE(a.address_line_2, '') || ' ' || COALESCE(a.city, '')`)}
         ORDER BY km NULLS LAST, o.name
         LIMIT ${SEARCH_LIMIT}`, params),
      this.query(`
        SELECT t.id, t.name, t.short_name AS "shortName", ag.name AS "ageGroup",
               t.sport_id AS "sportId", sp.name AS "sportName", t.is_active AS "isActive",
               o.id AS "orgId", o.name AS "orgName", o.logo AS "orgLogo",
               o.primary_color AS "orgPrimaryColor", o.secondary_color AS "orgSecondaryColor", o.tertiary_color AS "orgTertiaryColor",
               o.is_private AS "orgIsPrivate",
               ${KM('a.latitude', 'a.longitude')} AS km
          FROM teams t
          JOIN organizations o ON o.id = t.org_id
          LEFT JOIN addresses a ON a.id = o.address_id
          LEFT JOIN sports sp ON sp.id = t.sport_id
          LEFT JOIN sport_age_groups ag ON ag.sport_id = t.sport_id AND ag.id = t.age_group_id
         WHERE t.is_active = true
           AND ${ORG_VISIBLE('o', '$4')}
           AND ${matches(`o.name || ' ' || o.short_name || ' ' || t.name || ' ' || COALESCE(t.short_name, '') || ' ' || COALESCE(sp.name, '') || ' ' || COALESCE(ag.name, '')`)}
         ORDER BY km NULLS LAST, o.name, t.name
         LIMIT ${SEARCH_LIMIT}`, params),
      this.query(`
        SELECT s.id, s.name, o.id AS "orgId", o.name AS "orgName",
               ${KM('COALESCE(sa.latitude, a.latitude)', 'COALESCE(sa.longitude, a.longitude)')} AS km
          FROM sites s
          JOIN organizations o ON o.id = s.org_id
          LEFT JOIN addresses sa ON sa.id = s.address_id
          LEFT JOIN addresses a ON a.id = o.address_id
         WHERE s.is_active IS DISTINCT FROM false
           AND ${ORG_VISIBLE('o', '$4')}
           AND ${matches(`o.name || ' ' || o.short_name || ' ' || s.name || ' ' || COALESCE(sa.address_line_2, '') || ' ' || COALESCE(sa.city, '')`)}
         ORDER BY km NULLS LAST, s.name
         LIMIT ${SEARCH_LIMIT}`, params),
    ]);

    // What the team's card says of the viewer, in its own query since these go by `$1`.
    const viewer = viewerOf(viewerId);
    const onTeam = viewer && teams.rows.length
      ? await this.query(`SELECT t.id, ${viewerOnTeamFieldsSql()} FROM teams t WHERE t.id = ANY($2)`, [viewer, teams.rows.map((t: any) => t.id)])
      : { rows: [] };
    const viewerOn = new Map<string, any>(onTeam.rows.map((r: any) => [r.id, r]));
    const withViewer = teams.rows.map((t: any) => ({
      ...t,
      myRoleId: viewerOn.get(t.id)?.myRoleId ?? null,
      childNames: viewerOn.get(t.id)?.childNames ?? [],
    }));

    const withKm = (rows: any[]) => rows.map(r => ({ ...r, km: roundKm(r.km) }));
    return { organizations: withKm(orgs.rows), teams: withKm(withViewer), sites: withKm(sites.rows) };
  }

  /**
   * The tournaments the caller runs by appointment (`PERM-8`): organiser, sport organiser or
   * division convenor, each event once under the widest of its appointments. Not finished ones.
   */
  async getRuns(userId: string): Promise<MyHomeRunEvent[]> {
    const ids = accessManager.PROFILE_IDS_FOR_USER;
    const res = await this.query(`
      WITH grants AS (
        SELECT event_id, 1 AS rank FROM event_organizers WHERE org_profile_id IN (${ids})
        UNION ALL
        SELECT event_id, 2 FROM event_sport_organizers WHERE org_profile_id IN (${ids})
        UNION ALL
        SELECT d.event_id, 3 FROM division_organizers dor JOIN tournament_divisions d ON d.id = dor.division_id
         WHERE dor.org_profile_id IN (${ids})
      ), widest AS (SELECT event_id, MIN(rank) AS rank FROM grants GROUP BY event_id)
      SELECT e.id, e.name, e.org_id AS "orgId", o.name AS "orgName",
             e.start_date::text AS "startDate", e.end_date::text AS "endDate",
             CASE w.rank WHEN 1 THEN 'event' WHEN 2 THEN 'sport' ELSE 'division' END AS scope
        FROM widest w
        JOIN events e ON e.id = w.event_id
        JOIN organizations o ON o.id = e.org_id
       WHERE COALESCE(e.end_date, e.start_date) IS NULL OR COALESCE(e.end_date, e.start_date) >= CURRENT_DATE
       ORDER BY e.start_date NULLS LAST, e.name`, [userId]);
    return res.rows;
  }

  /**
   * The games that could be on the caller's *My games*, one row per team in each: live, in the coming
   * month (late rather than gone for three hours after kick-off, as on *On now & next*), or finished
   * in the last week. A fixture with no team yet ("Winner QF1") is left out: it has nobody to follow.
   */
  private async getMyGameCandidates(userId: string): Promise<MyGameCandidate[]> {
    const ids = accessManager.PROFILE_IDS_FOR_USER;
    const res = await this.query(`
      SELECT id AS "gameId", team_id AS "teamId", status, at,
             CASE WHEN own THEN 1 WHEN running THEN 2 WHEN org_team THEN 3 END AS tier
        FROM (
          SELECT g.id, gp.team_id, g.status,
                 EXTRACT(EPOCH FROM CASE WHEN g.status = 'Finished'
                   THEN COALESCE(g.finish_time, g.scheduled_start_time, g.start_time)
                   ELSE COALESCE(g.scheduled_start_time, g.start_time, e.start_date::timestamptz) END)::float8 AS at,
                 EXISTS (SELECT 1 FROM team_memberships tm
                          WHERE tm.team_id = t.id AND (tm.end_date IS NULL OR tm.end_date > NOW())
                            AND (${viewerIsMemberSql()} OR ${viewerChildIsMemberSql()})) AS own,
                 (EXISTS (SELECT 1 FROM event_organizers eo WHERE eo.event_id = g.event_id AND eo.org_profile_id IN (${ids}))
                  OR EXISTS (SELECT 1 FROM event_sport_organizers so
                              WHERE so.event_id = g.event_id AND so.sport_id = g.sport_id AND so.org_profile_id IN (${ids}))
                  OR EXISTS (SELECT 1 FROM division_stages ds JOIN division_organizers dor ON dor.division_id = ds.division_id
                              WHERE ds.id = g.stage_id AND dor.org_profile_id IN (${ids}))) AS running,
                 EXISTS (SELECT 1 FROM org_memberships om JOIN org_profiles op ON op.id = om.org_profile_id
                          WHERE om.org_id = t.org_id AND om.role_id = 'role-org-admin'
                            AND (om.end_date IS NULL OR om.end_date > NOW())
                            AND om.org_profile_id IN (${ids})
                            AND (${restrictedReasonSql('op', 'om.org_id')}) IS NULL) AS org_team
            FROM games g
            JOIN events e ON e.id = g.event_id
            JOIN game_participants gp ON gp.game_id = g.id
            JOIN teams t ON t.id = gp.team_id
           WHERE t.is_active = true
             AND e.status IS DISTINCT FROM 'Cancelled'
             AND gp.status IS DISTINCT FROM 'withdrawn' AND gp.status IS DISTINCT FROM 'disqualified'
             AND (g.status = 'Live'
                  OR (g.status = 'Scheduled' AND (
                        COALESCE(g.scheduled_start_time, g.start_time) BETWEEN NOW() - INTERVAL '3 hours' AND NOW() + INTERVAL '${WINDOW_DAYS} days'
                        OR (COALESCE(g.scheduled_start_time, g.start_time) IS NULL
                            AND e.start_date BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE + ${WINDOW_DAYS})))
                  OR (g.status = 'Finished'
                      AND COALESCE(g.finish_time, g.scheduled_start_time, g.start_time) >= NOW() - INTERVAL '${RESULT_DAYS} days'))
        ) found`, [userId]);
    return res.rows;
  }

  /** The caller's *My games* and the tournaments they run (`home_mine`, docs/home.md §5). */
  async getMine(userId: string): Promise<MyHome> {
    const [runs, candidates] = await Promise.all([this.getRuns(userId), this.getMyGameCandidates(userId)]);
    const games = await eventManager.getGameSummariesByIds(chooseMyGames(candidates, Date.now() / 1000));
    return { runs, games, ...(await this.venueNames(games)) };
  }
}

export const homeManager = new HomeManager();
