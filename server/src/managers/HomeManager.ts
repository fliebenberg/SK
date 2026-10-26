import {
  HOME_RADIUS_KM,
  HomeNearby,
  HomeSearchResult,
  MyHome,
  NearbyOrganization,
  ViewerPosition,
  roundViewerPosition,
} from '@sk/shared';
import { BaseManager } from './BaseManager';
import { eventManager } from './EventManager';
import { userManager } from './UserManager';
import { PUBLIC_EVENT } from './eventVisibility';

/**
 * What the Home page reads (`HOME-1`, docs/home.md): what is on near the viewer, one search across
 * organisations, teams and sites, and the signed-in viewer's own organisations and teams.
 *
 * **The viewer's position is used and forgotten.** It arrives rounded to about a kilometre, is a
 * query parameter and nothing else, and is never stored or logged (`near` is redacted by the socket
 * loggers).
 *
 * Distances are straight lines, worked out in the query. At today's size that is a scan of the
 * week's fixtures and every organisation; an index on the pins (PostGIS, or a bounding box first)
 * is the next step when it stops being cheap.
 */

/** How many single matches and tournaments to consider; the app shows the first few. */
const EVENTS_LIMIT = 40;
/** How many to show when nothing is within the radius: the closest, so the page is never empty. */
const BEYOND_LIMIT = 5;
const ORGS_LIMIT = 20;
const SEARCH_LIMIT = 10;

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
const ORG_FIELDS = `
  o.id, o.name, o.short_name AS "shortName", o.logo, o.settings->'logoConfig' AS "logoConfig",
  o.primary_color AS "primaryColor",
  COALESCE(NULLIF(a.address_line_2, ''), NULLIF(a.city, '')) AS locality,
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
   * Single matches and tournaments on now or in the coming week, and organisations, closest first.
   * With no position, the same lists by time, and organisations by size.
   *
   * The window is generous on both sides — the viewer's own calendar decides what is *today*, so
   * the app trims it. A match whose kick-off passed less than three hours ago and has not started
   * is still shown: it is late, not gone.
   */
  async getNearby(nearInput: unknown): Promise<HomeNearby> {
    const near = readViewerPosition(nearInput);
    const params = [near?.lat ?? null, near?.lng ?? null];

    const gamesRes = await this.query(`
      SELECT g.id, ${KM('pin.lat', 'pin.lng')} AS km
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
               COALESCE(g.scheduled_start_time, g.start_time) BETWEEN NOW() - INTERVAL '3 hours' AND NOW() + INTERVAL '8 days'
               OR (COALESCE(g.scheduled_start_time, g.start_time) IS NULL
                   AND e.start_date BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE + 8))))
         AND ($1::float8 IS NULL OR pin.lat IS NOT NULL)
       ORDER BY km NULLS LAST, COALESCE(g.scheduled_start_time, g.start_time) NULLS LAST, g.id
       LIMIT ${EVENTS_LIMIT}
    `, params);

    const tournamentsRes = await this.query(`
      SELECT e.id, ${KM('pin.lat', 'pin.lng')} AS km
        FROM events e
        ${EVENT_PIN_JOINS}
       WHERE e.type = 'Tournament'
         AND ${PUBLIC_EVENT('e')}
         AND e.status IS DISTINCT FROM 'Cancelled'
         AND e.start_date <= CURRENT_DATE + 8
         AND COALESCE(e.end_date, e.start_date) >= CURRENT_DATE - 1
         AND ($1::float8 IS NULL OR pin.lat IS NOT NULL)
       ORDER BY km NULLS LAST, e.start_date, e.id
       LIMIT ${EVENTS_LIMIT}
    `, params);

    const orgsRes = await this.query(`
      SELECT ${ORG_FIELDS}, ${KM('a.latitude', 'a.longitude')} AS km
        FROM organizations o
        LEFT JOIN addresses a ON a.id = o.address_id
       WHERE o.is_active IS DISTINCT FROM false
         AND ($1::float8 IS NULL OR a.latitude IS NOT NULL)
       ORDER BY km NULLS LAST, "teamCount" DESC, o.name
       LIMIT ${ORGS_LIMIT}
    `, params);

    // One list of events, closest first, decides together whether anything is within the radius.
    const candidates = [
      ...gamesRes.rows.map((r: any) => ({ kind: 'game' as const, id: r.id as string, km: roundKm(r.km) })),
      ...tournamentsRes.rows.map((r: any) => ({ kind: 'tournament' as const, id: r.id as string, km: roundKm(r.km) })),
    ].sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
    const events = withinOrClosest(candidates, near, EVENTS_LIMIT);
    const gameKm = new Map(events.rows.filter(c => c.kind === 'game').map(c => [c.id, c.km]));
    const tournamentKm = new Map(events.rows.filter(c => c.kind === 'tournament').map(c => [c.id, c.km]));

    const [gameSummaries, tournamentEvents, tournamentGames] = await Promise.all([
      eventManager.getGameSummariesByIds([...gameKm.keys()]),
      eventManager.getEventsByIds([...tournamentKm.keys()]),
      eventManager.getGameSummariesByEvents([...tournamentKm.keys()]),
    ]);

    const orgs = withinOrClosest(
      orgsRes.rows.map((r: any): NearbyOrganization => ({ ...r, km: roundKm(r.km) })),
      near,
      ORGS_LIMIT
    );

    const siteIds = new Set<string>();
    const facilityIds = new Set<string>();
    for (const g of [...gameSummaries, ...tournamentGames]) {
      if (g.siteId) siteIds.add(g.siteId);
      if (g.facilityId) facilityIds.add(g.facilityId);
    }
    for (const e of tournamentEvents) if (e.siteId) siteIds.add(e.siteId);
    const [sites, facilities] = await Promise.all([
      this.query(`SELECT id, name FROM sites WHERE id = ANY($1)`, [[...siteIds]]),
      this.query(`SELECT id, name FROM facilities WHERE id = ANY($1)`, [[...facilityIds]]),
    ]);

    return {
      games: gameSummaries.map(game => ({ game, km: gameKm.get(game.id) ?? null })),
      tournaments: tournamentEvents.map(event => ({
        event,
        games: tournamentGames.filter(g => g.eventId === event.id),
        km: tournamentKm.get(event.id) ?? null,
      })),
      organizations: orgs.rows,
      eventsBeyondRadius: events.beyond,
      organizationsBeyondRadius: orgs.beyond,
      siteNames: Object.fromEntries(sites.rows.map((r: any) => [r.id, r.name])),
      facilityNames: Object.fromEntries(facilities.rows.map((r: any) => [r.id, r.name])),
    };
  }

  /**
   * Organisations, teams and sites matching every word typed, anywhere, closest first.
   *
   * A team matches on its organisation's name too, so "doringkloof u14" finds Doringkloof's U14
   * teams; a site the same way. Inactive teams and sites are left out.
   */
  async search(query: unknown, nearInput: unknown): Promise<HomeSearchResult> {
    const words = typeof query === 'string'
      ? query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6).map(w => `%${w.replace(/[\\%_]/g, '\\$&')}%`)
      : [];
    if (!words.length) return { organizations: [], teams: [], sites: [] };
    const near = readViewerPosition(nearInput);
    const params = [near?.lat ?? null, near?.lng ?? null, words];
    const matches = (haystack: string) =>
      `NOT EXISTS (SELECT 1 FROM unnest($3::text[]) w WHERE NOT (${haystack}) ILIKE w)`;

    const [orgs, teams, sites] = await Promise.all([
      this.query(`
        SELECT ${ORG_FIELDS}, ${KM('a.latitude', 'a.longitude')} AS km
          FROM organizations o
          LEFT JOIN addresses a ON a.id = o.address_id
         WHERE o.is_active IS DISTINCT FROM false
           AND ${matches(`o.name || ' ' || o.short_name || ' ' || COALESCE(a.address_line_2, '') || ' ' || COALESCE(a.city, '')`)}
         ORDER BY km NULLS LAST, o.name
         LIMIT ${SEARCH_LIMIT}`, params),
      this.query(`
        SELECT t.id, t.name, t.sport_id AS "sportId", o.id AS "orgId", o.name AS "orgName",
               ${KM('a.latitude', 'a.longitude')} AS km
          FROM teams t
          JOIN organizations o ON o.id = t.org_id
          LEFT JOIN addresses a ON a.id = o.address_id
          LEFT JOIN sports sp ON sp.id = t.sport_id
          LEFT JOIN sport_age_groups ag ON ag.sport_id = t.sport_id AND ag.id = t.age_group_id
         WHERE t.is_active = true
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
           AND ${matches(`o.name || ' ' || o.short_name || ' ' || s.name || ' ' || COALESCE(sa.address_line_2, '') || ' ' || COALESCE(sa.city, '')`)}
         ORDER BY km NULLS LAST, s.name
         LIMIT ${SEARCH_LIMIT}`, params),
    ]);

    const withKm = (rows: any[]) => rows.map(r => ({ ...r, km: roundKm(r.km) }));
    return { organizations: withKm(orgs.rows), teams: withKm(teams.rows), sites: withKm(sites.rows) };
  }

  /**
   * The caller's organisations and teams (their memberships — following comes with `FIX-37`), each
   * organisation with how many games it has live, and each team with the game it is playing now or
   * plays next.
   */
  async getMine(userId: string): Promise<MyHome> {
    const [orgMemberships, teamMemberships] = await Promise.all([
      userManager.getUserOrgMemberships(userId),
      userManager.getUserTeamMemberships(userId),
    ]);
    // A person can hold two roles in one organisation; the list shows it once, under the first.
    const orgRole = new Map<string, string>();
    for (const m of orgMemberships) if (!orgRole.has(m.orgId)) orgRole.set(m.orgId, m.roleId);
    const teamRole = new Map<string, string>();
    for (const m of teamMemberships) if (!teamRole.has(m.teamId)) teamRole.set(m.teamId, m.roleId);
    if (!orgRole.size && !teamRole.size) return { organizations: [], teams: [] };

    const [orgs, teams] = await Promise.all([
      this.query(`
        SELECT o.id, o.name, o.short_name AS "shortName", o.logo, o.settings->'logoConfig' AS "logoConfig",
               o.primary_color AS "primaryColor",
               (SELECT COUNT(DISTINCT g.id)::int FROM games g JOIN events e ON e.id = g.event_id
                 WHERE g.status = 'Live'
                   AND (e.org_id = o.id
                        OR EXISTS (SELECT 1 FROM game_participants gp JOIN teams t ON t.id = gp.team_id
                                    WHERE gp.game_id = g.id AND t.org_id = o.id))) AS "liveCount"
          FROM organizations o
         WHERE o.id = ANY($1)
         ORDER BY o.name`, [[...orgRole.keys()]]),
      this.query(`
        SELECT t.id, t.name, t.sport_id AS "sportId", o.id AS "orgId", o.name AS "orgName",
               (SELECT g.id FROM games g JOIN game_participants gp ON gp.game_id = g.id
                 WHERE gp.team_id = t.id
                   AND (g.status = 'Live' OR (g.status = 'Scheduled'
                        AND COALESCE(g.scheduled_start_time, g.start_time) >= NOW() - INTERVAL '3 hours'))
                 ORDER BY (g.status = 'Live') DESC, COALESCE(g.scheduled_start_time, g.start_time) NULLS LAST
                 LIMIT 1) AS "gameId"
          FROM teams t
          JOIN organizations o ON o.id = t.org_id
         WHERE t.id = ANY($1) AND t.is_active = true
         ORDER BY o.name, t.name`, [[...teamRole.keys()]]),
    ]);

    const games = await eventManager.getGameSummariesByIds(teams.rows.map((t: any) => t.gameId).filter(Boolean));
    const gameById = new Map(games.map(g => [g.id, g]));
    return {
      organizations: orgs.rows.map((o: any) => ({ ...o, roleId: orgRole.get(o.id)! })),
      teams: teams.rows.map(({ gameId, ...t }: any) => ({
        ...t,
        roleId: teamRole.get(t.id)!,
        game: gameId ? gameById.get(gameId) ?? null : null,
      })),
    };
  }
}

export const homeManager = new HomeManager();
