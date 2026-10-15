import { BaseManager, Tx } from './BaseManager';
import {
  Booking, CalendarDate, Clash, DayWindow, DivisionDay, EventDay, PlanFixture, SharedGround, SportSettings,
  dayWindows, findClashes, fixtureMinutes, instantToZonedInputs, isCalendarDate, minuteOfDay, planDivision,
  sharedGroundMap, timeOfDay, zonedInputsToInstant, DEFAULT_TIME_ZONE,
} from '@sk/shared';

/**
 * Tournament scheduling (Phase 7): playing days, the scheduling gaps, shared ground, and placing a
 * division's fixtures — by the greedy pass or by hand.
 *
 * **The rules are not here.** How long a game is, when a division plays, what clashes and how the
 * greedy pass places fixtures all live in `@sk/shared` (`utils/schedule.ts`), tested there, so the
 * Schedule tab warns about exactly what this scheduler avoids. This manager loads the inputs —
 * turning stored instants into venue clock minutes and back — and writes the result.
 *
 * Decisions: docs/tournaments-implementation-plan.md, Phase 7 ("schema and API", agreed 2026-10-12).
 */

/** A game's clock when its sport has no timing: two 40-minute halves, as the game clock assumes. */
const UNTIMED_GAME_MINUTES = 80;
const MAX_GAP_MINUTES = 240;

export interface ScheduleDivisionResult {
  divisionId: string;
  eventId: string;
  placed: number;
  /** Placed after the end of the division's last day, for want of room — a warning. */
  afterDayEnd: number;
  /** Could not be placed at all (a full last day). */
  unplaced: number;
  gameIds: string[];
}

interface Venue {
  eventId: string;
  timeZone: string;
}

export class SchedulingManager extends BaseManager {
  // ------------------------------------------------------------------------------------------
  // Playing days, gaps, shared ground
  // ------------------------------------------------------------------------------------------

  async getEventDays(eventId: string): Promise<EventDay[]> {
    const res = await this.query(
      `SELECT day::text AS day, to_char(day_starts, 'HH24:MI') AS "dayStarts", to_char(day_ends, 'HH24:MI') AS "dayEnds"
         FROM event_days WHERE event_id = $1 ORDER BY day`,
      [eventId]
    );
    return res.rows;
  }

  async getDivisionDays(divisionId: string): Promise<DivisionDay[]> {
    const res = await this.query(
      `SELECT day::text AS day, plays, to_char(first_game_start, 'HH24:MI') AS "firstGameStart",
              to_char(last_game_ends, 'HH24:MI') AS "lastGameEnds"
         FROM division_days WHERE division_id = $1 ORDER BY day`,
      [divisionId]
    );
    return res.rows;
  }

  /**
   * Replace a tournament's playing days. The event's `start_date` / `end_date` are rewritten from
   * them in the same transaction — the first and last day — so every reader of the range keeps
   * working. A day taken out takes the divisions' rows for it with it (the composite FK); its
   * fixtures stay where they are, and the Schedule tab shows them as outside the tournament's days.
   */
  async setEventDays(eventId: string, days: EventDay[]): Promise<EventDay[]> {
    const seen = new Set<string>();
    for (const d of days) {
      if (!isCalendarDate(d.day)) throw new Error(`'${d.day}' is not a date.`);
      if (seen.has(d.day)) throw new Error(`${d.day} is listed twice.`);
      seen.add(d.day);
      const starts = minuteOfDay(d.dayStarts), ends = minuteOfDay(d.dayEnds);
      if (starts == null || ends == null) throw new Error(`Give ${d.day} a start and an end, as HH:MM.`);
      if (ends <= starts) throw new Error(`On ${d.day} the day must end after it starts.`);
    }
    await this.transaction(async (tx) => {
      await tx(`DELETE FROM event_days WHERE event_id = $1 AND NOT (day = ANY($2::date[]))`, [eventId, [...seen]]);
      for (const d of days) {
        await tx(
          `INSERT INTO event_days (event_id, day, day_starts, day_ends) VALUES ($1, $2, $3, $4)
           ON CONFLICT (event_id, day) DO UPDATE SET day_starts = EXCLUDED.day_starts, day_ends = EXCLUDED.day_ends`,
          [eventId, d.day, d.dayStarts, d.dayEnds]
        );
      }
      if (days.length) {
        const sorted = [...seen].sort();
        const last = sorted[sorted.length - 1];
        await tx(`UPDATE events SET start_date = $2, end_date = $3 WHERE id = $1`, [eventId, sorted[0], last === sorted[0] ? null : last]);
      }
    });
    return this.getEventDays(eventId);
  }

  /**
   * Replace where a division differs from its tournament. Only differences are kept: a playing day
   * with neither its own start nor its own end is the tournament's day and needs no row.
   */
  async setDivisionDays(divisionId: string, days: DivisionDay[]): Promise<DivisionDay[]> {
    const eventId = await this.divisionEventId(divisionId);
    const eventDays = new Set((await this.getEventDays(eventId)).map(d => d.day));
    const rows = days.filter(d => !d.plays || d.firstGameStart || d.lastGameEnds);
    for (const d of rows) {
      if (!eventDays.has(d.day)) throw new Error(`${d.day} is not one of the tournament's days.`);
      const s = d.firstGameStart ? minuteOfDay(d.firstGameStart) : null;
      const e = d.lastGameEnds ? minuteOfDay(d.lastGameEnds) : null;
      if ((d.firstGameStart && s == null) || (d.lastGameEnds && e == null)) throw new Error(`Times on ${d.day} must be HH:MM.`);
      if (s != null && e != null && e <= s) throw new Error(`On ${d.day} the last game must end after the first starts.`);
    }
    await this.transaction(async (tx) => {
      await tx(`DELETE FROM division_days WHERE division_id = $1`, [divisionId]);
      for (const d of rows) {
        await tx(
          `INSERT INTO division_days (event_id, division_id, day, plays, first_game_start, last_game_ends) VALUES ($1, $2, $3, $4, $5, $6)`,
          [eventId, divisionId, d.day, !!d.plays, d.plays ? d.firstGameStart || null : null, d.plays ? d.lastGameEnds || null : null]
        );
      }
    });
    return this.getDivisionDays(divisionId);
  }

  /** The tournament's scheduling gaps, in minutes. */
  async setEventScheduling(eventId: string, gaps: { gapBetweenGamesMin?: number; minTeamBreakMin?: number }): Promise<void> {
    const sets: string[] = [], values: any[] = [eventId];
    for (const [key, column] of [['gapBetweenGamesMin', 'gap_between_games_min'], ['minTeamBreakMin', 'min_team_break_min']] as const) {
      const v = gaps[key];
      if (v === undefined) continue;
      if (!Number.isInteger(v) || v < 0 || v > MAX_GAP_MINUTES) throw new Error(`A gap is a whole number of minutes from 0 to ${MAX_GAP_MINUTES}.`);
      values.push(v);
      sets.push(`${column} = $${values.length}`);
    }
    if (sets.length) await this.query(`UPDATE events SET ${sets.join(', ')} WHERE id = $1`, values);
  }

  /** A division's own gaps; `null` follows the tournament again. */
  async setDivisionScheduling(divisionId: string, gaps: { gapBetweenGamesMin?: number | null; minTeamBreakMin?: number | null }): Promise<void> {
    const sets: string[] = [], values: any[] = [divisionId];
    for (const [key, column] of [['gapBetweenGamesMin', 'gap_between_games_min'], ['minTeamBreakMin', 'min_team_break_min']] as const) {
      const v = gaps[key];
      if (v === undefined) continue;
      if (v !== null && (!Number.isInteger(v) || v < 0 || v > MAX_GAP_MINUTES)) throw new Error(`A gap is a whole number of minutes from 0 to ${MAX_GAP_MINUTES}.`);
      values.push(v);
      sets.push(`${column} = $${values.length}`);
    }
    if (sets.length) await this.query(`UPDATE tournament_divisions SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, values);
  }

  async getSharedGround(facilityId: string): Promise<string[]> {
    const res = await this.query(
      `SELECT CASE WHEN facility_id = $1 THEN other_facility_id ELSE facility_id END AS id
         FROM facility_shared_ground WHERE facility_id = $1 OR other_facility_id = $1 ORDER BY 1`,
      [facilityId]
    );
    return res.rows.map((r: any) => r.id);
  }

  /**
   * Declare the facilities a facility shares ground with (D34), replacing what it had. Each pair is
   * stored once, smaller id first, so declaring A1–A from either side is the same row. Only
   * facilities at the same site: ground is shared by being the same ground.
   */
  async setSharedGround(facilityId: string, otherIds: string[], tx?: Tx): Promise<string[]> {
    const others = [...new Set(otherIds.filter(id => id && id !== facilityId))];
    const run = async (t: Tx) => {
      if (others.length) {
        const res = await t(
          `SELECT f.id FROM facilities f JOIN facilities me ON me.id = $1 WHERE f.id = ANY($2) AND f.site_id = me.site_id`,
          [facilityId, others]
        );
        if (res.rows.length !== others.length) throw new Error('A facility can only share ground with facilities at its own site.');
      }
      await t(`DELETE FROM facility_shared_ground WHERE facility_id = $1 OR other_facility_id = $1`, [facilityId]);
      for (const other of others) {
        const [a, b] = facilityId < other ? [facilityId, other] : [other, facilityId];
        await t(`INSERT INTO facility_shared_ground (facility_id, other_facility_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [a, b]);
      }
    };
    if (tx) await run(tx); else await this.transaction(run);
    return this.getSharedGround(facilityId);
  }

  // ------------------------------------------------------------------------------------------
  // Placing fixtures
  // ------------------------------------------------------------------------------------------

  /**
   * Place a division's fixtures by the greedy pass. **Only fixtures with no time are placed**
   * (agreed 2026-10-12) — anything already placed, by hand or by an earlier run, stays and is
   * scheduled around. `again` is *Schedule again*: the scheduler's own placings are cleared first,
   * and the hand placings too unless `keepPlacedByHand`. A fixture that has started or has a result
   * is never moved.
   *
   * Refuses, with a sentence the organiser can act on, when there is nothing to schedule into: no
   * playing days, no facilities for the sport, or a sport with no game length.
   */
  async scheduleDivision(divisionId: string, options: { again?: boolean; keepPlacedByHand?: boolean } = {}): Promise<ScheduleDivisionResult> {
    const ctx = await this.loadDivision(divisionId);
    const keepHand = options.keepPlacedByHand !== false;

    const movable = (g: DivisionGame) => !g.played && (options.again ? !(keepHand && g.placedBy === 'hand') : g.startTime == null);
    const toPlace = ctx.games.filter(movable);
    const staying = ctx.games.filter(g => !movable(g) && g.startTime && g.facilityId);

    const booked: Booking[] = [...ctx.otherBookings, ...staying.map(g => this.asBooking(g, ctx))].filter(Boolean) as Booking[];
    const placed: Array<{ id: string; day: CalendarDate; facilityId: string; start: number }> = [];
    const afterDayEnd: string[] = [];
    let unplaced: string[] = [];

    // Stage by stage, so a later stage is placed after its gate (D15) and around the earlier one.
    for (const stage of ctx.stages) {
      const fixtures: PlanFixture[] = toPlace.filter(g => g.stageId === stage.id).map(g => ({ id: g.id, competitors: g.competitors }));
      if (!fixtures.length) continue;
      const gate = stage.earliestStart ? instantToZonedInputs(stage.earliestStart, ctx.venue.timeZone) : null;
      const result = planDivision({
        fixtures,
        days: ctx.windows,
        facilityIds: ctx.facilityIds,
        minutes: ctx.minutes,
        gap: ctx.gap,
        teamBreak: ctx.teamBreak,
        booked,
        sharedGround: ctx.sharedGround,
        notBefore: gate ? { day: gate.date, minute: minuteOfDay(gate.time) ?? 0 } : null,
      });
      for (const p of result.placed) {
        const competitors = fixtures.find(f => f.id === p.id)!.competitors;
        booked.push({ id: p.id, day: p.day, facilityId: p.facilityId, start: p.start, minutes: ctx.minutes, competitors, gap: ctx.gap, teamBreak: ctx.teamBreak });
      }
      placed.push(...result.placed);
      afterDayEnd.push(...result.afterDayEnd);
      unplaced = unplaced.concat(result.unplaced);
    }

    const sites = await this.facilitySites(ctx.facilityIds);
    await this.transaction(async (tx) => {
      if (options.again) {
        const clear = ctx.games.filter(g => movable(g) && g.startTime).map(g => g.id);
        if (clear.length) await this.clearTimes(tx, clear);
      }
      for (const p of placed) {
        const at = zonedInputsToInstant(p.day, timeOfDay(p.start), ctx.venue.timeZone);
        await tx(
          `UPDATE games
              SET start_time = $1, scheduled_start_time = $1, facility_id = $2, site_id = $3, placed_by = 'scheduler',
                  custom_settings = jsonb_set(COALESCE(custom_settings, '{}'::jsonb), '{timeTbd}', 'false'::jsonb),
                  updated_at = NOW()
            WHERE id = $4`,
          [at, p.facilityId, sites.get(p.facilityId) ?? null, p.id]
        );
      }
    });

    return {
      divisionId, eventId: ctx.venue.eventId,
      placed: placed.length, afterDayEnd: afterDayEnd.length, unplaced: unplaced.length,
      gameIds: [...new Set([...placed.map(p => p.id), ...(options.again ? toPlace.map(g => g.id) : [])])],
    };
  }

  /**
   * Move a fixture by hand, or take its time away (`startAt` null). Never refused for a clash —
   * the clashes it causes come back, for the message that says what the move cost (U26).
   */
  async moveFixture(gameId: string, startAt: string | null, facilityId: string | null): Promise<{ gameId: string; eventId: string; divisionId: string | null; clashes: Clash[] }> {
    const res = await this.query(
      `SELECT g.event_id AS "eventId", g.status, g.final_score_data IS NOT NULL AS "hasResult",
              (SELECT ds.division_id FROM division_stages ds WHERE ds.id = g.stage_id) AS "divisionId"
         FROM games g WHERE g.id = $1`,
      [gameId]
    );
    const game = res.rows[0];
    if (!game) throw new Error('That fixture no longer exists.');
    if (game.hasResult || ['Live', 'Finished'].includes(game.status)) throw new Error('This fixture has started, so it can no longer be moved.');
    if ((startAt == null) !== (facilityId == null)) throw new Error('A fixture is placed with both a time and a facility, or neither.');
    if (startAt != null && Number.isNaN(new Date(startAt).getTime())) throw new Error(`'${startAt}' is not a time.`);

    await this.transaction(async (tx) => {
      if (startAt == null) {
        await this.clearTimes(tx, [gameId]);
      } else {
        const site = await tx(`SELECT site_id FROM facilities WHERE id = $1`, [facilityId]);
        if (!site.rows.length) throw new Error('That facility no longer exists.');
        await tx(
          `UPDATE games
              SET start_time = $1, scheduled_start_time = $1, facility_id = $2, site_id = $3, placed_by = 'hand',
                  custom_settings = jsonb_set(COALESCE(custom_settings, '{}'::jsonb), '{timeTbd}', 'false'::jsonb),
                  updated_at = NOW()
            WHERE id = $4`,
          [startAt, facilityId, site.rows[0].site_id, gameId]
        );
      }
    });
    const clashes = startAt == null ? [] : (await this.eventClashes(game.eventId)).filter(c => c.ids.includes(gameId));
    return { gameId, eventId: game.eventId, divisionId: game.divisionId, clashes };
  }

  /**
   * What a single match, or a game about to be added, would clash with (`FIX-23`, 2026-10-15): the
   * same check as the Schedule tab's (`findClashes`), looked up by facility rather than by tournament.
   * Against every event's games on that day at the facility and any sharing ground with it, and
   * every game either team plays that day. Warnings only — the caller saves anyway (U26).
   *
   * Different facilities of one site at the same time are not a clash (agreed 2026-10-15): festivals
   * run games side by side on purpose.
   */
  async proposedGameClashes(p: {
    gameId?: string | null; startAt: string; facilityId?: string | null; siteId?: string | null;
    teamIds?: string[]; sportId?: string | null;
  }): Promise<{ warnings: string[] }> {
    if (!p.startAt || Number.isNaN(new Date(p.startAt).getTime())) return { warnings: [] };
    const teamIds = (p.teamIds || []).filter(Boolean);
    const tzRes = await this.query(
      `SELECT COALESCE(s.timezone, o.timezone) AS tz
         FROM sites s LEFT JOIN organizations o ON o.id = s.org_id
        WHERE s.id = COALESCE((SELECT site_id FROM facilities WHERE id = $1), $2)`,
      [p.facilityId || null, p.siteId || null]
    );
    const timeZone = tzRes.rows[0]?.tz || DEFAULT_TIME_ZONE;
    const local = instantToZonedInputs(new Date(p.startAt).toISOString(), timeZone);
    if (!local) return { warnings: [] };
    const day = local.date as CalendarDate;

    const pairs = p.facilityId ? await this.sharedGroundPairs([p.facilityId]) : [];
    const reach = p.facilityId ? [...new Set([p.facilityId, ...pairs.flat()])] : [];
    if (!reach.length && !teamIds.length) return { warnings: [] };

    const sport = p.sportId ? await this.query(`SELECT default_settings FROM sports WHERE id = $1`, [p.sportId]) : null;
    const self: Booking = {
      id: 'proposed', day, facilityId: p.facilityId || 'none:proposed', start: minuteOfDay(local.time) ?? 0,
      minutes: fixtureMinutes(sport?.rows[0]?.default_settings, null) ?? UNTIMED_GAME_MINUTES,
      competitors: teamIds, gap: 0, teamBreak: 0,
    };

    const res = await this.query(
      `SELECT g.id, g.facility_id AS "facilityId", g.start_time AS "startTime", g.custom_settings AS "customSettings",
              sp.default_settings AS "sportSettings", f.name AS "facilityName",
              COALESCE((SELECT jsonb_agg(gp.team_id) FROM game_participants gp WHERE gp.game_id = g.id AND gp.team_id IS NOT NULL), '[]'::jsonb) AS competitors,
              (SELECT string_agg(COALESCE(o.short_name, o.name) || ' ' || t.name, ' v ' ORDER BY gp.sort_order)
                 FROM game_participants gp JOIN teams t ON t.id = gp.team_id LEFT JOIN organizations o ON o.id = t.org_id
                WHERE gp.game_id = g.id) AS label
         FROM games g LEFT JOIN sports sp ON sp.id = g.sport_id LEFT JOIN facilities f ON f.id = g.facility_id
        WHERE g.id <> COALESCE($1, '') AND COALESCE(g.status, '') <> 'Cancelled'
          AND g.start_time BETWEEN $2 AND $3
          AND COALESCE((g.custom_settings->>'timeTbd')::boolean, false) = false
          AND (g.facility_id = ANY($4) OR EXISTS (SELECT 1 FROM game_participants gp WHERE gp.game_id = g.id AND gp.team_id = ANY($5)))`,
      [p.gameId || null, zonedInputsToInstant(day, '00:00', timeZone), zonedInputsToInstant(day, '23:59', timeZone), reach, teamIds]
    );
    const others = new Map<string, { label: string; start: number; minutes: number; facilityName: string }>();
    const bookings: Booking[] = [self];
    for (const r of res.rows) {
      const at = instantToZonedInputs(new Date(r.startTime).toISOString(), timeZone);
      if (!at || at.date !== day) continue;
      const b: Booking = {
        id: r.id, day, facilityId: r.facilityId || `none:${r.id}`, start: minuteOfDay(at.time) ?? 0,
        minutes: fixtureMinutes(r.sportSettings, r.customSettings) ?? UNTIMED_GAME_MINUTES,
        competitors: r.competitors, gap: 0, teamBreak: 0,
      };
      bookings.push(b);
      others.set(r.id, { label: r.label || 'Another game', start: b.start, minutes: b.minutes, facilityName: r.facilityName || '' });
    }

    const names = await this.query(
      `SELECT 'f' AS kind, id, name FROM facilities WHERE id = ANY($1)
       UNION ALL
       SELECT 't', t.id, COALESCE(o.short_name, o.name) || ' ' || t.name FROM teams t LEFT JOIN organizations o ON o.id = t.org_id WHERE t.id = ANY($2)`,
      [reach, teamIds]
    );
    const nameOf = (kind: string, id?: string | null) => names.rows.find((n: any) => n.kind === kind && n.id === id)?.name || '';
    const span = (o: { start: number; minutes: number }) => `from ${timeOfDay(o.start)} to ${timeOfDay(o.start + o.minutes)}`;
    // One sentence per game it clashes with, saying everything about that game once: the field it
    // is on, and which of these teams are already in it.
    const byGame = new Map<string, { ground?: string; teams: string[] }>();
    for (const c of findClashes(bookings, sharedGroundMap(pairs))) {
      if (!c.ids.includes('proposed')) continue;
      const otherId = c.ids.find(id => id !== 'proposed') || '';
      const other = others.get(otherId);
      if (!other) continue;
      const entry = byGame.get(otherId) || { teams: [] };
      if (c.kind === 'facility') entry.ground = `${nameOf('f', p.facilityId)} has`;
      else if (c.kind === 'sharedGround') entry.ground = `${other.facilityName}, which shares ground with ${nameOf('f', p.facilityId)}, has`;
      else if (c.kind === 'teamAtOnce' && c.competitor) entry.teams.push(nameOf('t', c.competitor));
      byGame.set(otherId, entry);
    }
    const warnings: string[] = [];
    for (const [id, { ground, teams }] of byGame) {
      const other = others.get(id)!;
      const who = teams.length === 2 ? 'both teams' : teams[0];
      if (ground) warnings.push(`${ground} ${other.label} ${span(other)}${teams.length ? `, with ${who} in it too` : ''}`);
      else if (teams.length) warnings.push(`${who === 'both teams' ? 'Both teams already play' : `${who} already plays`} in ${other.label} ${span(other)}`);
    }
    return { warnings };
  }

  /**
   * Every clash in a tournament, against its own fixtures and other events' at its facilities —
   * the server's copy of what the Schedule tab shows, used to report what a move caused.
   */
  async eventClashes(eventId: string): Promise<Clash[]> {
    const venue = await this.venue(eventId);
    const games = await this.eventGames(eventId);
    const facilityIds = [...new Set(games.map(g => g.facilityId).filter(Boolean))] as string[];
    const pairs = await this.sharedGroundPairs(facilityIds);
    const ground = sharedGroundMap(pairs);
    const reach = [...new Set([...facilityIds, ...pairs.flat()])];
    const windowsByDivision = new Map<string, DayWindow[]>();
    const days = await this.getEventDays(eventId);
    const bookings: Booking[] = [];
    for (const g of games) {
      if (!g.startTime || !g.facilityId) continue;
      if (g.divisionId && !windowsByDivision.has(g.divisionId)) windowsByDivision.set(g.divisionId, dayWindows(days, await this.getDivisionDays(g.divisionId)));
      const b = this.asBooking(g, { venue, windows: g.divisionId ? windowsByDivision.get(g.divisionId)! : [] });
      if (b) bookings.push(b);
    }
    bookings.push(...(await this.otherEventBookings(eventId, reach, days.map(d => d.day), venue)));
    return findClashes(bookings, ground);
  }

  /**
   * Other events' games on a tournament's facilities, and on any sharing ground with them, on its
   * days — for the Schedule tab's clash check (agreed 2026-10-12). Only what a clash needs: which
   * facility, when, how long; the event's name only when it is the same host's.
   */
  async venueBookings(eventId: string): Promise<Array<Booking & { startAt: string }>> {
    const venue = await this.venue(eventId);
    const facilityIds = await this.eventFacilityIds(eventId);
    const pairs = await this.sharedGroundPairs(facilityIds);
    const reach = [...new Set([...facilityIds, ...pairs.flat()])];
    const days = (await this.getEventDays(eventId)).map(d => d.day);
    return this.otherEventBookings(eventId, reach, days, venue);
  }

  /** The timezone a tournament's clock times are read in. */
  async eventTimeZone(eventId: string): Promise<string> {
    return (await this.venue(eventId)).timeZone;
  }

  /** The shared-ground pairs touching any of these facilities, for the client's clash check. */
  async sharedGroundPairs(facilityIds: string[]): Promise<Array<[string, string]>> {
    if (!facilityIds.length) return [];
    const res = await this.query(
      `SELECT facility_id AS a, other_facility_id AS b FROM facility_shared_ground WHERE facility_id = ANY($1) OR other_facility_id = ANY($1)`,
      [facilityIds]
    );
    return res.rows.map((r: any) => [r.a, r.b]);
  }

  // ------------------------------------------------------------------------------------------
  // Loading
  // ------------------------------------------------------------------------------------------

  private async divisionEventId(divisionId: string): Promise<string> {
    const res = await this.query(`SELECT event_id FROM tournament_divisions WHERE id = $1`, [divisionId]);
    if (!res.rows[0]) throw new Error('That division no longer exists.');
    return res.rows[0].event_id;
  }

  /** The tournament and the timezone its clock times are read in: its site's, else its host's. */
  private async venue(eventId: string): Promise<Venue> {
    const res = await this.query(
      `SELECT e.id, COALESCE(s.timezone, o.timezone) AS tz
         FROM events e LEFT JOIN sites s ON s.id = e.site_id LEFT JOIN organizations o ON o.id = e.org_id
        WHERE e.id = $1`,
      [eventId]
    );
    if (!res.rows[0]) throw new Error('That tournament no longer exists.');
    return { eventId, timeZone: res.rows[0].tz || DEFAULT_TIME_ZONE };
  }

  private async eventFacilityIds(eventId: string): Promise<string[]> {
    const res = await this.query(`SELECT facility_id FROM event_facilities WHERE event_id = $1`, [eventId]);
    return res.rows.map((r: any) => r.facility_id);
  }

  private async facilitySites(ids: string[]): Promise<Map<string, string | null>> {
    if (!ids.length) return new Map();
    const res = await this.query(`SELECT id, site_id FROM facilities WHERE id = ANY($1)`, [ids]);
    return new Map(res.rows.map((r: any) => [r.id, r.site_id]));
  }

  private async clearTimes(tx: Tx, ids: string[]) {
    await tx(
      `UPDATE games
          SET start_time = NULL, scheduled_start_time = NULL, facility_id = NULL, site_id = NULL, placed_by = NULL,
              custom_settings = jsonb_set(COALESCE(custom_settings, '{}'::jsonb), '{timeTbd}', 'true'::jsonb),
              updated_at = NOW()
        WHERE id = ANY($1)`,
      [ids]
    );
  }

  /** Everything scheduling a division needs, in venue clock terms. */
  private async loadDivision(divisionId: string) {
    const dres = await this.query(
      `SELECT d.id, d.event_id AS "eventId", d.name, d.sport_id AS "sportId", sp.name AS "sportName",
              sp.default_settings AS "sportSettings",
              COALESCE(d.gap_between_games_min, e.gap_between_games_min) AS gap,
              COALESCE(d.min_team_break_min, e.min_team_break_min) AS "teamBreak"
         FROM tournament_divisions d JOIN events e ON e.id = d.event_id LEFT JOIN sports sp ON sp.id = d.sport_id
        WHERE d.id = $1`,
      [divisionId]
    );
    const division = dres.rows[0];
    if (!division) throw new Error('That division no longer exists.');

    const minutes = fixtureMinutes(division.sportSettings as SportSettings);
    if (minutes == null) {
      throw new Error(`${division.sportName || 'This sport'} has no game length yet. Set its period length and number of periods in the sport editor, then schedule again.`);
    }

    const venue = await this.venue(division.eventId);
    const windows = dayWindows(await this.getEventDays(division.eventId), await this.getDivisionDays(divisionId));
    if (!windows.length) throw new Error(`${division.name} has no playing days. Set the tournament's days and hours under When first.`);

    // The facility cascade (data model §3.5): the division's own, else the tournament's that
    // support its sport. The sport filter was missing before Phase 7.
    let facilityIds = (await this.query(`SELECT facility_id FROM division_facilities WHERE division_id = $1 ORDER BY facility_id`, [divisionId])).rows.map((r: any) => r.facility_id);
    if (!facilityIds.length) {
      facilityIds = (await this.query(
        `SELECT ef.facility_id FROM event_facilities ef JOIN facilities f ON f.id = ef.facility_id
          WHERE ef.event_id = $1 AND f.is_active IS NOT FALSE
            AND (f.primary_sport_id = $2 OR EXISTS (SELECT 1 FROM facility_sports fs WHERE fs.facility_id = f.id AND fs.sport_id = $2))
          ORDER BY f.name`,
        [division.eventId, division.sportId]
      )).rows.map((r: any) => r.facility_id);
    }
    if (!facilityIds.length) throw new Error(`${division.name} has nowhere to play. Give it facilities under Where, or add facilities for its sport to the tournament.`);

    const pairs = await this.sharedGroundPairs(facilityIds);
    const reach = [...new Set([...facilityIds, ...pairs.flat()])];
    const stages = (await this.query(
      `SELECT id, earliest_start AS "earliestStart" FROM division_stages WHERE division_id = $1 ORDER BY sequence, created_at`,
      [divisionId]
    )).rows as Array<{ id: string; earliestStart: string | null }>;

    const all = await this.eventGames(division.eventId);
    const games = all.filter(g => g.divisionId === divisionId);

    // Everything else that occupies a facility or a team: other divisions of this tournament, and
    // other events at the venue. Another division's fixtures carry their own gaps and windows.
    const days = await this.getEventDays(division.eventId);
    const otherBookings: Booking[] = [];
    const windowsByDivision = new Map<string, DayWindow[]>();
    for (const g of all) {
      if (g.divisionId === divisionId || !g.startTime || !g.facilityId) continue;
      if (g.divisionId && !windowsByDivision.has(g.divisionId)) windowsByDivision.set(g.divisionId, dayWindows(days, await this.getDivisionDays(g.divisionId)));
      const b = this.asBooking(g, { venue, windows: g.divisionId ? windowsByDivision.get(g.divisionId)! : [] });
      if (b) otherBookings.push(b);
    }
    otherBookings.push(...(await this.otherEventBookings(division.eventId, reach, windows.map(w => w.day), venue)));

    return {
      venue, windows, facilityIds, minutes, stages, games, otherBookings,
      gap: Number(division.gap) || 0,
      teamBreak: Number(division.teamBreak) || 0,
      sharedGround: sharedGroundMap(pairs) as SharedGround,
    };
  }

  /** A tournament's games, with what a booking needs: who plays, how long, where and when. */
  private async eventGames(eventId: string): Promise<DivisionGame[]> {
    const res = await this.query(
      `SELECT g.id, g.stage_id AS "stageId", ds.division_id AS "divisionId", g.start_time AS "startTime",
              g.facility_id AS "facilityId", g.placed_by AS "placedBy", g.status,
              (g.final_score_data IS NOT NULL OR g.status IN ('Live', 'Finished')) AS played,
              COALESCE(d.gap_between_games_min, e.gap_between_games_min) AS gap,
              COALESCE(d.min_team_break_min, e.min_team_break_min) AS "teamBreak",
              sp.default_settings AS "sportSettings", g.custom_settings AS "customSettings",
              COALESCE((SELECT jsonb_agg(COALESCE(gp.team_id, gp.org_profile_id, gp.entrant_id))
                          FROM game_participants gp
                         WHERE gp.game_id = g.id AND COALESCE(gp.team_id, gp.org_profile_id, gp.entrant_id) IS NOT NULL), '[]'::jsonb) AS competitors
         FROM games g
         JOIN events e ON e.id = g.event_id
         LEFT JOIN division_stages ds ON ds.id = g.stage_id
         LEFT JOIN tournament_divisions d ON d.id = ds.division_id
         LEFT JOIN sports sp ON sp.id = COALESCE(d.sport_id, g.sport_id)
        WHERE g.event_id = $1 AND COALESCE(g.status, '') <> 'Cancelled'
        ORDER BY ds.sequence NULLS LAST,
                 (g.custom_settings->'tournament'->>'round')::int NULLS LAST,
                 (g.custom_settings->'tournament'->>'matchIndex')::int NULLS LAST, g.id`,
      [eventId]
    );
    return res.rows.map((r: any) => ({
      ...r,
      startTime: r.startTime ? new Date(r.startTime).toISOString() : null,
      minutes: fixtureMinutes(r.sportSettings, r.customSettings) ?? UNTIMED_GAME_MINUTES,
    }));
  }

  /**
   * Other events' games on these facilities on these days. Their length comes from their sport, and
   * a sport with no timing counts as the game clock's two 40-minute halves — another event's game
   * cannot be refused, so it is assumed rather than ignored.
   */
  private async otherEventBookings(eventId: string, facilityIds: string[], days: CalendarDate[], venue: Venue): Promise<Array<Booking & { startAt: string }>> {
    if (!facilityIds.length || !days.length) return [];
    const sorted = [...days].sort();
    // A day either side, then filtered on the venue's own calendar date.
    const from = zonedInputsToInstant(sorted[0], '00:00', venue.timeZone);
    const to = zonedInputsToInstant(sorted[sorted.length - 1], '23:59', venue.timeZone);
    const res = await this.query(
      `SELECT g.id, g.facility_id AS "facilityId", g.start_time AS "startTime", g.custom_settings AS "customSettings",
              sp.default_settings AS "sportSettings",
              COALESCE((SELECT jsonb_agg(COALESCE(gp.team_id, gp.org_profile_id))
                          FROM game_participants gp
                         WHERE gp.game_id = g.id AND COALESCE(gp.team_id, gp.org_profile_id) IS NOT NULL), '[]'::jsonb) AS competitors
         FROM games g LEFT JOIN sports sp ON sp.id = g.sport_id
        WHERE g.facility_id = ANY($1) AND g.event_id <> $2 AND g.start_time BETWEEN $3 AND $4
          AND COALESCE(g.status, '') <> 'Cancelled'`,
      [facilityIds, eventId, from, to]
    );
    const daySet = new Set(days);
    const out: Array<Booking & { startAt: string }> = [];
    for (const r of res.rows) {
      const local = instantToZonedInputs(new Date(r.startTime).toISOString(), venue.timeZone);
      if (!local || !daySet.has(local.date)) continue;
      out.push({
        id: r.id, day: local.date, facilityId: r.facilityId, start: minuteOfDay(local.time) ?? 0,
        minutes: fixtureMinutes(r.sportSettings, r.customSettings) ?? UNTIMED_GAME_MINUTES,
        competitors: r.competitors, gap: 0, teamBreak: 0, label: 'Another event',
        startAt: new Date(r.startTime).toISOString(),
      });
    }
    return out;
  }

  private asBooking(g: DivisionGame, ctx: { venue: Venue; windows: DayWindow[] }): Booking | null {
    if (!g.startTime || !g.facilityId) return null;
    const local = instantToZonedInputs(g.startTime, ctx.venue.timeZone);
    if (!local) return null;
    const window = ctx.windows.find(w => w.day === local.date);
    return {
      id: g.id, day: local.date, facilityId: g.facilityId, start: minuteOfDay(local.time) ?? 0, minutes: g.minutes,
      competitors: g.competitors, gap: Number(g.gap) || 0, teamBreak: Number(g.teamBreak) || 0, dayEnds: window?.ends,
    };
  }
}

interface DivisionGame {
  id: string;
  stageId: string | null;
  divisionId: string | null;
  startTime: string | null;
  facilityId: string | null;
  placedBy: 'scheduler' | 'hand' | null;
  played: boolean;
  gap: number;
  teamBreak: number;
  competitors: string[];
  minutes: number;
}

export const schedulingManager = new SchedulingManager();
