import { v4 as uuidv4 } from "uuid";
import {
  DEFAULT_SCORING_SYSTEM,
  DEFAULT_TIEBREAKERS,
  EntrantSourceRule,
  GameSummary,
  MatchTopology,
  ParticipantSourceRule,
  ScoringSubject,
  ScoringSystem,
  StageEntrant,
  StandingsSubject,
  TiebreakFactor,
  TournamentAdjustment,
  TournamentDivision,
  TournamentEntrant,
  TournamentStage,
  TournamentStandingRow,
  calculateStandings,
  rollUpByOrganisation,
} from "@sk/shared";
import { BaseManager, Tx } from "./BaseManager";
import { eventManager } from "./EventManager";

/**
 * Divisions, stages, entrants — and the choke point.
 *
 * Everything a tournament is made of lives here, and so does the one function that rewrites a
 * standings table: {@link TournamentManager.recalculateForGame}. That is deliberate. A cache is
 * only as good as the paths that invalidate it, and there are more of those than is obvious
 * (data model §7), so there is exactly one place that recalculates and every writer calls it.
 */

/** Disciplinary weight per card, for the `fewestCards` tiebreak factor. */
const CARD_POINTS: Record<string, number> = { yellow_card: 1, red_card: 2 };

/** The empty state a new fixture's `live_state` starts in, matching `EventManager.addGame`. */
const EMPTY_LIVE_STATE =
  '{"scores": {}, "sinBins": [], "periodLabel": "1st Period", ' +
  '"clock": {"isRunning": false, "elapsedMS": 0, "isPeriodActive": false, "periodIndex": 0}}';

/** What a knockout round is called, from how many entrants are still in it. */
function roundName(slotsRemaining: number): string {
  switch (slotsRemaining) {
    case 2: return 'Final';
    case 4: return 'Semi-Final';
    case 8: return 'Quarter-Final';
    default: return `Round of ${slotsRemaining}`;
  }
}

/** Short fixture labels — "QF1", "SF2", "F" — so "Winner QF1" can be written out. */
function roundAbbreviation(slotsRemaining: number): string {
  switch (slotsRemaining) {
    case 2: return 'F';
    case 4: return 'SF';
    case 8: return 'QF';
    default: return `R${slotsRemaining}`;
  }
}

/**
 * Which seed plays which, so that seeds 1 and 2 can only meet in the final.
 *
 * `[1,2]` doubles to `[1,4,2,3]` to `[1,8,4,5,2,7,3,6]`; consecutive pairs are the first round's
 * fixtures. The standard construction, written out because getting it subtly wrong produces a
 * bracket that looks right and puts the two best entrants in the same half.
 */
function bracketSeedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const complement = order.length * 2 + 1;
    const next: number[] = [];
    for (const seed of order) {
      next.push(seed);
      next.push(complement - seed);
    }
    order = next;
  }
  return order;
}

function nextPowerOfTwo(n: number): number {
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

/** One side of a planned fixture, before it is written. */
interface PlannedSide {
  kind: 'entrant' | 'rule' | 'bye';
  entrantId?: string;
  rule?: ParticipantSourceRule;
  sourceGameId?: string;
  sourceStageId?: string;
}

/** Presentation metadata, stored in `custom_settings.tournament`. */
interface FixtureMeta {
  round: number;
  roundName?: string;
  /** "QF1", "SF2", "Round 3" — what a client prints, and what "Winner QF1" is built from. */
  label?: string;
  matchIndex: number;
  poolKey?: string;
  leg?: number;
}

/** A fixture the generator decided on, before it is written. */
interface PlannedGame {
  id: string;
  sides: PlannedSide[];
  meta: FixtureMeta;
}

export class TournamentManager extends BaseManager {
  private DIVISION_COLUMNS = `
      d.id, d.event_id as "eventId", d.name, d.sport_id as "sportId", d.age_group as "ageGroup",
      d.scoring_subject as "scoringSubject", d.weighting::float8 as "weighting", d.settings,
      d.sort_order as "sortOrder"`;

  private STAGE_COLUMNS = `
      s.id, s.division_id as "divisionId", s.name, s.format, s.sequence, s.status,
      s.earliest_start as "earliestStart", s.settings, s.cached_standings as "cachedStandings"`;

  /**
   * An entrant with its name already resolved.
   *
   * `name` and `orgShortName` are derived here rather than on the client for the reason `FIX-7`
   * settled for fixtures: a list that resolves names itself pays a lookup per row and shows a
   * stale one after a rename.
   */
  private ENTRANT_COLUMNS = `
      e.id, e.division_id as "divisionId", e.team_id as "teamId",
      e.org_profile_id as "orgProfileId", e.org_id as "orgId", e.label, e.seed, e.status,
      COALESCE(t.name, op.name, e.label) as "name", o.short_name as "orgShortName"`;

  private ENTRANT_JOINS = `
      FROM division_entrants e
      LEFT JOIN teams t ON t.id = e.team_id
      LEFT JOIN org_profiles op ON op.id = e.org_profile_id
      LEFT JOIN organizations o ON o.id = e.org_id`;

  // ============================================================================================
  // Divisions
  // ============================================================================================

  async getDivisions(eventId: string): Promise<TournamentDivision[]> {
    const res = await this.query(
      `SELECT ${this.DIVISION_COLUMNS} FROM tournament_divisions d
        WHERE d.event_id = $1 ORDER BY d.sort_order, d.created_at`,
      [eventId]
    );
    return res.rows;
  }

  async getDivision(id: string): Promise<TournamentDivision | null> {
    const res = await this.query(
      `SELECT ${this.DIVISION_COLUMNS} FROM tournament_divisions d WHERE d.id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  /** The division with its stages and roster attached — what a division screen joins a room for. */
  async getDivisionDetail(
    id: string
  ): Promise<(TournamentDivision & { stages: TournamentStage[]; entrants: TournamentEntrant[] }) | null> {
    const division = await this.getDivision(id);
    if (!division) return null;
    const [stages, entrants] = await Promise.all([this.getStages(id), this.getEntrants(id)]);
    return { ...division, stages, entrants };
  }

  /** The event a division belongs to. Every tournament write is authorized against this. */
  async getDivisionEventId(divisionId: string): Promise<string | null> {
    const res = await this.query(`SELECT event_id FROM tournament_divisions WHERE id = $1`, [divisionId]);
    return res.rows[0]?.event_id || null;
  }

  async addDivision(data: {
    eventId: string;
    name: string;
    sportId?: string;
    ageGroup?: string;
    scoringSubject?: ScoringSubject;
    weighting?: number;
    settings?: TournamentDivision['settings'];
    sortOrder?: number;
  }): Promise<TournamentDivision> {
    const id = `div-${uuidv4()}`;
    // Appended to the end of the event's list unless the caller places it, so two divisions
    // created in a row do not both claim position 0 and then fall back to ordering by id.
    const sortOrder =
      data.sortOrder ??
      (await this.scalar(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM tournament_divisions WHERE event_id = $1`,
        [data.eventId]
      ));

    await this.query(
      `INSERT INTO tournament_divisions
         (id, event_id, name, sport_id, age_group, scoring_subject, weighting, settings, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        data.eventId,
        data.name,
        data.sportId || null,
        data.ageGroup || null,
        data.scoringSubject || null,
        data.weighting ?? 1.0,
        JSON.stringify(data.settings || {}),
        sortOrder,
      ]
    );
    return (await this.getDivision(id))!;
  }

  async updateDivision(id: string, data: Partial<TournamentDivision>): Promise<TournamentDivision | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const set = (column: string, value: any) => {
      fields.push(`${column} = $${idx++}`);
      values.push(value);
    };

    if (data.name !== undefined) set('name', data.name);
    if (data.sportId !== undefined) set('sport_id', data.sportId || null);
    if (data.ageGroup !== undefined) set('age_group', data.ageGroup || null);
    if (data.scoringSubject !== undefined) set('scoring_subject', data.scoringSubject || null);
    if (data.weighting !== undefined) set('weighting', data.weighting);
    if (data.settings !== undefined) set('settings', JSON.stringify(data.settings));
    if (data.sortOrder !== undefined) set('sort_order', data.sortOrder);

    if (!fields.length) return this.getDivision(id);
    values.push(id);
    await this.query(
      `UPDATE tournament_divisions SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
      values
    );
    return this.getDivision(id);
  }

  /**
   * Delete a division and everything under it.
   *
   * Its fixtures are **not** deleted — `games.stage_id` is `ON DELETE SET NULL`, so a played
   * fixture survives its stage being removed. Deleting the record of a match that happened,
   * because the organisational grouping around it was tidied away, would be a data-loss bug
   * rather than a cascade.
   */
  async deleteDivision(id: string): Promise<boolean> {
    const res = await this.query(`DELETE FROM tournament_divisions WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  // ============================================================================================
  // Stages
  // ============================================================================================

  async getStages(divisionId: string): Promise<TournamentStage[]> {
    const res = await this.query(
      `SELECT ${this.STAGE_COLUMNS} FROM division_stages s
        WHERE s.division_id = $1 ORDER BY s.sequence`,
      [divisionId]
    );
    return res.rows;
  }

  async getStage(id: string): Promise<TournamentStage | null> {
    const res = await this.query(`SELECT ${this.STAGE_COLUMNS} FROM division_stages s WHERE s.id = $1`, [id]);
    return res.rows[0] || null;
  }

  /** The event a stage belongs to, for authorization. */
  async getStageEventId(stageId: string): Promise<string | null> {
    const res = await this.query(
      `SELECT d.event_id FROM division_stages s
         JOIN tournament_divisions d ON d.id = s.division_id
        WHERE s.id = $1`,
      [stageId]
    );
    return res.rows[0]?.event_id || null;
  }

  async addStage(data: {
    divisionId: string;
    name: string;
    format: TournamentStage['format'];
    sequence?: number;
    status?: TournamentStage['status'];
    earliestStart?: string;
    settings?: TournamentStage['settings'];
  }): Promise<TournamentStage> {
    const id = `stg-${uuidv4()}`;
    const sequence =
      data.sequence ??
      (await this.scalar(
        `SELECT COALESCE(MAX(sequence), 0) + 1 AS n FROM division_stages WHERE division_id = $1`,
        [data.divisionId]
      ));

    await this.query(
      `INSERT INTO division_stages
         (id, division_id, name, format, sequence, status, earliest_start, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        data.divisionId,
        data.name,
        data.format,
        sequence,
        data.status || 'Pending',
        data.earliestStart || null,
        JSON.stringify(data.settings || {}),
      ]
    );
    return (await this.getStage(id))!;
  }

  async updateStage(id: string, data: Partial<TournamentStage>): Promise<TournamentStage | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const set = (column: string, value: any) => {
      fields.push(`${column} = $${idx++}`);
      values.push(value);
    };

    if (data.name !== undefined) set('name', data.name);
    if (data.format !== undefined) set('format', data.format);
    if (data.sequence !== undefined) set('sequence', data.sequence);
    if (data.status !== undefined) set('status', data.status);
    if (data.earliestStart !== undefined) set('earliest_start', data.earliestStart || null);
    if (data.settings !== undefined) set('settings', JSON.stringify(data.settings));

    if (!fields.length) return this.getStage(id);
    values.push(id);
    await this.query(`UPDATE division_stages SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, values);
    return this.getStage(id);
  }

  async deleteStage(id: string): Promise<boolean> {
    const res = await this.query(`DELETE FROM division_stages WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  // ============================================================================================
  // Entrants
  // ============================================================================================

  async getEntrants(divisionId: string): Promise<TournamentEntrant[]> {
    const res = await this.query(
      `SELECT ${this.ENTRANT_COLUMNS} ${this.ENTRANT_JOINS}
        WHERE e.division_id = $1
        ORDER BY e.seed NULLS LAST, e.created_at`,
      [divisionId]
    );
    return res.rows;
  }

  /**
   * Replace a division's whole roster, in one transaction (D13).
   *
   * A roster arrives at once because that is how an organiser thinks about it, and because the
   * alternative — an add, an update and a remove per competitor — is where a half-applied roster
   * comes from. Entrants the caller sent with an `id` are **updated in place**, so an entrant
   * keeps the fixtures already generated against it; entrants it omitted are removed, which
   * cascades their `stage_entrants` and nulls their `game_participants.entrant_id`.
   *
   * `org_id` is denormalised from the team or the person at write time (data model §3.3) — the
   * organisation roll-up groups by it — so it is rewritten here whenever the identity changes,
   * which is the whole of its maintenance contract.
   */
  async setDivisionEntrants(
    divisionId: string,
    entrants: Array<{
      id?: string;
      teamId?: string;
      orgProfileId?: string;
      label?: string;
      seed?: number;
      status?: 'active' | 'withdrawn';
    }>
  ): Promise<{ entrants: TournamentEntrant[]; removedIds: string[]; changedIdentityIds: string[] }> {
    const result = await this.transaction(async (tx) => {
      const existing = await tx(
        `SELECT id, team_id, org_profile_id FROM division_entrants WHERE division_id = $1`,
        [divisionId]
      );
      const existingById = new Map<string, { team_id: string | null; org_profile_id: string | null }>(
        existing.rows.map((r: any) => [r.id, r])
      );

      const keptIds: string[] = [];
      const changedIdentityIds: string[] = [];

      for (const entrant of entrants) {
        const id = entrant.id && existingById.has(entrant.id) ? entrant.id : `ent-${uuidv4()}`;
        const teamId = entrant.teamId || null;
        const orgProfileId = entrant.orgProfileId || null;
        const orgId = await this.deriveEntrantOrgId(tx, teamId, orgProfileId);

        const previous = existingById.get(id);
        if (previous && (previous.team_id !== teamId || previous.org_profile_id !== orgProfileId)) {
          // D10: a substitution. Every fixture already pointing at this entrant now names somebody
          // else, so the tables that counted those fixtures have to be rebuilt.
          changedIdentityIds.push(id);
        }

        await tx(
          `INSERT INTO division_entrants (id, division_id, team_id, org_profile_id, org_id, label, seed, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             team_id = EXCLUDED.team_id,
             org_profile_id = EXCLUDED.org_profile_id,
             org_id = EXCLUDED.org_id,
             label = EXCLUDED.label,
             seed = EXCLUDED.seed,
             status = EXCLUDED.status,
             updated_at = NOW()`,
          [
            id,
            divisionId,
            teamId,
            orgProfileId,
            orgId,
            entrant.label || null,
            entrant.seed ?? null,
            entrant.status || 'active',
          ]
        );
        keptIds.push(id);

        // A resolved entrant fills in every fixture already generated against it, which is the
        // point of the placeholder model (data model §2.0): the fixtures all point at this one
        // row, so confirming who it is updates all of them at once rather than one by one.
        await tx(
          `UPDATE game_participants SET team_id = $2, org_profile_id = $3 WHERE entrant_id = $1`,
          [id, teamId, orgProfileId]
        );
      }

      const removed = keptIds.length
        ? await tx(
            `DELETE FROM division_entrants WHERE division_id = $1 AND id <> ALL($2::text[]) RETURNING id`,
            [divisionId, keptIds]
          )
        : await tx(`DELETE FROM division_entrants WHERE division_id = $1 RETURNING id`, [divisionId]);

      return { removedIds: removed.rows.map((r: any) => r.id), changedIdentityIds };
    });

    return { entrants: await this.getEntrants(divisionId), ...result };
  }

  /**
   * The organisation an entrant competes for, denormalised at write time.
   *
   * A team's org directly; a person's through their profile. Null for an unresolved entrant — it
   * simply does not appear in the roll-up until somebody says who it is.
   */
  private async deriveEntrantOrgId(tx: Tx, teamId: string | null, orgProfileId: string | null): Promise<string | null> {
    if (teamId) {
      const res = await tx(`SELECT org_id FROM teams WHERE id = $1`, [teamId]);
      return res.rows[0]?.org_id || null;
    }
    if (orgProfileId) {
      const res = await tx(`SELECT org_id FROM org_profiles WHERE id = $1`, [orgProfileId]);
      return res.rows[0]?.org_id || null;
    }
    return null;
  }

  // ============================================================================================
  // Stage entrants
  // ============================================================================================

  async getStageEntrants(stageId: string): Promise<StageEntrant[]> {
    const res = await this.query(
      `SELECT stage_id as "stageId", entrant_id as "entrantId", pool_key as "poolKey",
              seed, sort_order as "sortOrder"
         FROM stage_entrants WHERE stage_id = $1 ORDER BY sort_order, entrant_id`,
      [stageId]
    );
    return res.rows;
  }

  /** Stage entrants with the names and org ids the standings engine needs as subjects. */
  private async getStageSubjects(stageId: string): Promise<Array<StandingsSubject & { poolKey?: string }>> {
    const res = await this.query(
      `SELECT se.entrant_id as "id", se.pool_key as "poolKey", e.org_id as "orgId",
              COALESCE(t.name, op.name, e.label, 'TBC') as "name"
         FROM stage_entrants se
         JOIN division_entrants e ON e.id = se.entrant_id
         LEFT JOIN teams t ON t.id = e.team_id
         LEFT JOIN org_profiles op ON op.id = e.org_profile_id
        WHERE se.stage_id = $1 AND e.status = 'active'
        ORDER BY se.sort_order, se.entrant_id`,
      [stageId]
    );
    return res.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      entrantId: r.id,
      orgId: r.orgId || undefined,
      poolKey: r.poolKey || undefined,
    }));
  }

  /**
   * Replace who takes part in a stage. Batch, and for the same reason the roster is.
   *
   * Written by the organiser for the first stage, and by {@link resolveDownstreamStages} for the
   * ones that source from it — one code path, so a knockout filled by progression and one filled
   * by hand are the same rows.
   */
  async setStageEntrants(
    stageId: string,
    entrants: Array<{ entrantId: string; poolKey?: string; seed?: number; sortOrder?: number }>
  ): Promise<StageEntrant[]> {
    await this.transaction(async (tx) => {
      await tx(`DELETE FROM stage_entrants WHERE stage_id = $1`, [stageId]);
      let order = 0;
      for (const entrant of entrants) {
        await tx(
          `INSERT INTO stage_entrants (stage_id, entrant_id, pool_key, seed, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [stageId, entrant.entrantId, entrant.poolKey || null, entrant.seed ?? null, entrant.sortOrder ?? order++]
        );
      }
    });
    await this.refreshStageStatus(stageId);
    return this.getStageEntrants(stageId);
  }

  // ============================================================================================
  // Facilities and adjustments
  // ============================================================================================

  async getEventFacilities(eventId: string): Promise<string[]> {
    const res = await this.query(`SELECT facility_id FROM event_facilities WHERE event_id = $1`, [eventId]);
    return res.rows.map((r: any) => r.facility_id);
  }

  async setEventFacilities(eventId: string, facilityIds: string[]): Promise<string[]> {
    await this.transaction(async (tx) => {
      await tx(`DELETE FROM event_facilities WHERE event_id = $1`, [eventId]);
      for (const facilityId of facilityIds) {
        await tx(`INSERT INTO event_facilities (event_id, facility_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
          eventId,
          facilityId,
        ]);
      }
    });
    return this.getEventFacilities(eventId);
  }

  async getDivisionFacilities(divisionId: string): Promise<string[]> {
    const res = await this.query(`SELECT facility_id FROM division_facilities WHERE division_id = $1`, [divisionId]);
    return res.rows.map((r: any) => r.facility_id);
  }

  async setDivisionFacilities(divisionId: string, facilityIds: string[]): Promise<string[]> {
    await this.transaction(async (tx) => {
      await tx(`DELETE FROM division_facilities WHERE division_id = $1`, [divisionId]);
      for (const facilityId of facilityIds) {
        await tx(
          `INSERT INTO division_facilities (division_id, facility_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [divisionId, facilityId]
        );
      }
    });
    return this.getDivisionFacilities(divisionId);
  }

  async getAdjustments(divisionId: string): Promise<TournamentAdjustment[]> {
    const res = await this.query(
      `SELECT id, division_id as "divisionId", entrant_id as "entrantId",
              points_delta::float8 as "pointsDelta", reason,
              created_by_user_id as "createdByUserId", created_at as "createdAt"
         FROM division_adjustments WHERE division_id = $1 ORDER BY created_at`,
      [divisionId]
    );
    return res.rows;
  }

  async addAdjustment(data: {
    divisionId: string;
    entrantId: string;
    pointsDelta: number;
    reason: string;
    createdByUserId?: string;
  }): Promise<TournamentAdjustment> {
    const id = `adj-${uuidv4()}`;
    await this.query(
      `INSERT INTO division_adjustments (id, division_id, entrant_id, points_delta, reason, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, data.divisionId, data.entrantId, data.pointsDelta, data.reason, data.createdByUserId || null]
    );
    const res = await this.query(
      `SELECT id, division_id as "divisionId", entrant_id as "entrantId",
              points_delta::float8 as "pointsDelta", reason,
              created_by_user_id as "createdByUserId", created_at as "createdAt"
         FROM division_adjustments WHERE id = $1`,
      [id]
    );
    return res.rows[0];
  }

  async deleteAdjustment(id: string): Promise<{ id: string; divisionId: string } | null> {
    const res = await this.query(
      `DELETE FROM division_adjustments WHERE id = $1 RETURNING id, division_id as "divisionId"`,
      [id]
    );
    return res.rows[0] || null;
  }

  // ============================================================================================
  // Reading fixtures
  // ============================================================================================

  async getStageGames(stageId: string): Promise<GameSummary[]> {
    return eventManager.getGameSummariesByStage(stageId);
  }

  async getDivisionGames(divisionId: string): Promise<GameSummary[]> {
    return eventManager.getGameSummariesByDivision(divisionId);
  }

  private async scalar(sql: string, params: any[]): Promise<number> {
    const res = await this.query(sql, params);
    return res.rows[0]?.n ?? 0;
  }

  // ============================================================================================
  // Batch fixture writes (D13)
  // ============================================================================================

  /**
   * Create several fixtures in **one** transaction.
   *
   * Deliberately not a loop over `EventManager.addGame`: that method opens its transaction with
   * `this.query('BEGIN')` on a pooled connection, so its statements can land on different backends
   * and the block is not atomic at all (`TX-1` in TODO.md). Ninety fixtures either all exist or
   * none do, which is rule 1 of the batch contract, and a loop over a non-transaction would have
   * made the contract's headline promise false in the very action it exists for.
   *
   * Every item is validated *before* anything is written, so a bad item produces a report and no
   * partial roster rather than eighty-nine fixtures and an error.
   */
  async addGamesBatch(
    games: Array<{
      id?: string;
      eventId: string;
      sportId: string;
      stageId?: string;
      startTime?: string;
      scheduledStartTime?: string;
      siteId?: string;
      facilityId?: string;
      customSettings?: any;
      participants?: Array<{
        teamId?: string;
        orgProfileId?: string;
        entrantId?: string;
        sourceGameId?: string;
        sourceStageId?: string;
        sourceRule?: any;
        sortOrder?: number;
      }>;
    }>
  ): Promise<{ ids: string[]; errors: Array<{ index: number; id?: string; message: string }> }> {
    const errors: Array<{ index: number; id?: string; message: string }> = [];
    games.forEach((game, index) => {
      if (!game?.eventId) errors.push({ index, id: game?.id, message: 'A fixture needs an event.' });
      else if (!game.sportId) errors.push({ index, id: game.id, message: 'A fixture needs a sport.' });
    });
    if (errors.length) return { ids: [], errors };

    const ids = games.map(game => game.id || `game-${uuidv4()}`);

    await this.transaction(async (tx) => {
      for (let i = 0; i < games.length; i++) {
        const game = games[i];
        await tx(
          `INSERT INTO games
             (id, event_id, sport_id, stage_id, start_time, scheduled_start_time, status,
              site_id, facility_id, custom_settings, live_state)
           VALUES ($1, $2, $3, $4, $5, $6, 'Scheduled', $7, $8, $9, $10::jsonb)`,
          [
            ids[i],
            game.eventId,
            game.sportId,
            game.stageId || null,
            game.startTime || null,
            game.scheduledStartTime || game.startTime || null,
            game.siteId || null,
            game.facilityId || null,
            JSON.stringify(game.customSettings || {}),
            EMPTY_LIVE_STATE,
          ]
        );

        let sortOrder = 0;
        for (const side of game.participants || []) {
          await tx(
            `INSERT INTO game_participants
               (id, game_id, team_id, org_profile_id, status, sort_order,
                entrant_id, source_game_id, source_stage_id, source_rule)
             VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9)`,
            [
              `gp-${uuidv4()}`,
              ids[i],
              side.teamId || null,
              side.orgProfileId || null,
              side.sortOrder ?? sortOrder++,
              side.entrantId || null,
              side.sourceGameId || null,
              side.sourceStageId || null,
              side.sourceRule ? JSON.stringify(side.sourceRule) : null,
            ]
          );
        }
      }
    });

    return { ids, errors: [] };
  }

  /**
   * Update several fixtures at once — rescheduling a day moves many together.
   *
   * The updatable set is deliberately narrow: **when and where**, plus status and stage. Scores
   * are not in it. A score is a result, and results go through the scoring path so that the choke
   * point runs and the undo window and dispute rules apply; letting a bulk reschedule carry a
   * `finalScoreData` would be a second, unguarded way to change a match's outcome.
   */
  async updateGamesBatch(
    updates: Array<{ id: string; data: Record<string, any> }>
  ): Promise<{ ids: string[]; errors: Array<{ index: number; id?: string; message: string }> }> {
    const COLUMNS: Record<string, string> = {
      startTime: 'start_time',
      scheduledStartTime: 'scheduled_start_time',
      siteId: 'site_id',
      facilityId: 'facility_id',
      status: 'status',
      stageId: 'stage_id',
      customSettings: 'custom_settings',
    };

    const errors: Array<{ index: number; id?: string; message: string }> = [];
    updates.forEach((update, index) => {
      if (!update?.id) {
        errors.push({ index, message: 'An update needs the id of the fixture it changes.' });
        return;
      }
      const keys = Object.keys(update.data || {}).filter(key => key !== 'id');
      if (!keys.length) {
        errors.push({ index, id: update.id, message: 'Nothing to change.' });
        return;
      }
      const rejected = keys.filter(key => !COLUMNS[key]);
      if (rejected.length) {
        errors.push({
          index,
          id: update.id,
          message:
            `'${rejected.join("', '")}' cannot be set in bulk. This action moves fixtures in time ` +
            `and place; a result goes through the scoring path so the standings are rebuilt with it.`,
        });
      }
    });
    if (errors.length) return { ids: [], errors };

    await this.transaction(async (tx) => {
      for (const update of updates) {
        const setClauses: string[] = [];
        const values: any[] = [];
        let idx = 1;
        for (const [key, value] of Object.entries(update.data)) {
          if (key === 'id' || !COLUMNS[key]) continue;
          setClauses.push(`${COLUMNS[key]} = $${idx++}`);
          values.push(key === 'customSettings' ? JSON.stringify(value) : value ?? null);
        }
        values.push(update.id);
        await tx(`UPDATE games SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, values);
      }
    });

    return { ids: updates.map(u => u.id), errors: [] };
  }

  /**
   * Fill an unresolved fixture side by hand (D26, D29).
   *
   * **Clearing `source_rule` is the whole of the override**, and it is why this is one code path
   * rather than two: filling a "TBC — awaiting confirmation" slot and promoting a beaten
   * semi-finalist over the rule that named somebody else are the same edit. Without the rule, the
   * choke point will not touch the slot again, so the organiser's decision survives the source
   * fixture being re-scored.
   *
   * `source_game_id` and `source_stage_id` stay as provenance — they record where the slot *would*
   * have come from, which is worth keeping and cannot cause a refill on its own.
   */
  async resolveParticipant(
    gameParticipantId: string,
    identity: { teamId?: string; orgProfileId?: string; entrantId?: string }
  ): Promise<string | null> {
    const res = await this.query(
      `UPDATE game_participants
          SET team_id = $2, org_profile_id = $3, entrant_id = $4, source_rule = NULL
        WHERE id = $1
        RETURNING game_id as "gameId"`,
      [gameParticipantId, identity.teamId || null, identity.orgProfileId || null, identity.entrantId || null]
    );
    return res.rows[0]?.gameId || null;
  }

  /**
   * Rebuild every table under a division, and then the event roll-up.
   *
   * For the changes that are not about one fixture: a roster edit, a new adjustment, a weighting
   * change. Those move every stage at once, so recalculating per game would be both wrong (there
   * may be no game) and slower.
   */
  async recalculateDivision(divisionId: string): Promise<void> {
    const stages = await this.getStages(divisionId);
    for (const stage of stages) {
      await this.refreshStageStatus(stage.id);
      await this.recalculateStageStandings(stage.id);
    }
    const eventId = await this.getDivisionEventId(divisionId);
    if (eventId) await this.recalculateEventStandings(eventId);
  }

  // ============================================================================================
  // Generation
  // ============================================================================================

  /**
   * Generate a stage's fixtures from its entrants.
   *
   * D9 gives exactly two paths and no third: `create` refuses a stage that already has fixtures,
   * and `regenerate` deletes what is there first. **No silent top-up** — adding four fixtures to
   * an existing six because the roster grew is the behaviour that quietly reshuffles a draw an
   * organiser has already published.
   *
   * A regeneration that would destroy a recorded result needs `deleteResults`, and the refusal
   * names the count so the client can state the concrete cost ("this deletes 14 fixtures, 3 of
   * which have results") rather than warning in the abstract.
   */
  async generateStageFixtures(
    stageId: string,
    mode: 'create' | 'regenerate',
    deleteResults = false
  ): Promise<{ stageId: string; divisionId: string; eventId: string; created: number; deleted: number }> {
    const stage = await this.getStage(stageId);
    if (!stage) throw new Error(`Stage ${stageId} not found.`);
    const division = await this.getDivision(stage.divisionId);
    if (!division) throw new Error(`Division ${stage.divisionId} not found.`);

    const existing = await this.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (
                WHERE status = 'Finished' OR final_score_data IS NOT NULL
              )::int AS played
         FROM games WHERE stage_id = $1`,
      [stageId]
    );
    const { total, played } = existing.rows[0];

    if (mode === 'create' && total > 0) {
      throw new Error(
        `${stage.name} already has ${total} fixture(s). Regenerate to replace them, or add ` +
          `fixtures by hand — generation never tops up an existing draw.`
      );
    }
    if (mode === 'regenerate' && played > 0 && !deleteResults) {
      throw new Error(
        `Regenerating ${stage.name} deletes ${total} fixture(s), ${played} of which have results. ` +
          `Confirm that those results should go.`
      );
    }

    const planned = await this.planFixtures(stage, division);
    if (!planned.length) {
      throw new Error(
        `${stage.name} has nothing to generate from: it needs at least two entrants, or an ` +
          `entrant source naming the stage it draws from.`
      );
    }

    const sportId = division.sportId;
    if (!sportId) {
      throw new Error(`${division.name} has no sport, so its fixtures have no rules to be played under.`);
    }

    // Regeneration deletes fixtures, and a tournament fixture can also count toward a league
    // season (D21). `game_seasons` cascades with the game, so the seasons have to be captured
    // *before* the delete — afterwards there is nothing left to resolve them from, which is the
    // same trap `deleteEvent` was in and the reason the audit of every `DELETE FROM games` was
    // worth running.
    const affectedSeasons = await this.query(
      `SELECT DISTINCT gs.season_id AS "seasonId"
         FROM game_seasons gs JOIN games g ON g.id = gs.game_id
        WHERE g.stage_id = $1`,
      [stageId]
    );

    // One transaction (D13). Ninety fixtures and their hundred and eighty participant rows either
    // all exist or none do; a half-written draw is not a state the organiser asked for.
    await this.transaction(async (tx) => {
      if (mode === 'regenerate' && total > 0) {
        await tx(`DELETE FROM games WHERE stage_id = $1`, [stageId]);
      }

      for (const game of planned) {
        await tx(
          `INSERT INTO games
             (id, event_id, sport_id, stage_id, start_time, scheduled_start_time, status, custom_settings, live_state)
           VALUES ($1, $2, $3, $4, NULL, NULL, 'Scheduled', $5, $6::jsonb)`,
          [
            game.id,
            division.eventId,
            sportId,
            stageId,
            // `timeTbd` is the existing "kick-off deliberately not set yet" flag `GameSummary`
            // already reads, as opposed to a time that is merely absent. Scheduling (Phase 7)
            // clears it.
            JSON.stringify({ timeTbd: true, tournament: game.meta }),
            EMPTY_LIVE_STATE,
          ]
        );

        let sortOrder = 0;
        for (const side of game.sides) {
          const identity = side.entrantId
            ? await tx(`SELECT team_id, org_profile_id FROM division_entrants WHERE id = $1`, [side.entrantId])
            : { rows: [] as any[] };
          await tx(
            `INSERT INTO game_participants
               (id, game_id, team_id, org_profile_id, status, sort_order,
                entrant_id, source_game_id, source_stage_id, source_rule)
             VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9)`,
            [
              `gp-${uuidv4()}`,
              game.id,
              identity.rows[0]?.team_id || null,
              identity.rows[0]?.org_profile_id || null,
              sortOrder++,
              side.entrantId || null,
              side.sourceGameId || null,
              side.sourceStageId || null,
              side.rule ? JSON.stringify(side.rule) : null,
            ]
          );
        }
      }
    });

    await this.refreshStageStatus(stageId);
    await this.recalculateStageStandings(stageId);
    // The roll-up counts this division's fixtures, so replacing them moves it — and any league
    // season the old fixtures belonged to has to be rebuilt from the ids captured above.
    await this.recalculateEventStandings(division.eventId);
    await eventManager.recalculateSeasons(affectedSeasons.rows.map((r: any) => r.seasonId));

    return {
      stageId,
      divisionId: division.id,
      eventId: division.eventId,
      created: planned.length,
      deleted: mode === 'regenerate' ? total : 0,
    };
  }

  /** Dispatch on format. Every branch returns fixtures that are ready to write. */
  private async planFixtures(stage: TournamentStage, division: TournamentDivision): Promise<PlannedGame[]> {
    const stageEntrants = await this.getStageEntrants(stage.id);

    switch (stage.format) {
      // A festival generates the same round robin, offered as a starting point and then got out
      // of the way (D8) — delete, add and reorder freely afterwards, and a hand-built division is
      // indistinguishable from a generated one.
      case 'Festival':
      case 'RoundRobin':
        return this.planRoundRobin(stage, stageEntrants);
      case 'Knockout':
      case 'Plate':
        return this.planBracket(stage, stageEntrants);
      case 'Swiss':
        throw new Error(
          `Swiss pairing is not built. The stage status model already supports it — a Swiss stage ` +
            `is generated one round at a time — but the pairing itself is deliberately carried forward.`
        );
      default:
        throw new Error(`Unknown stage format '${stage.format}'.`);
    }
  }

  /**
   * Round robin by the circle method, per pool, `legs` times.
   *
   * The circle method is used rather than every-pair-in-order because it distributes byes evenly
   * on an odd roster and because each round is a set of simultaneous fixtures, which is what a
   * schedule wants. Alternate rounds swap the sides so that home and away balance out.
   */
  private planRoundRobin(stage: TournamentStage, stageEntrants: StageEntrant[]): PlannedGame[] {
    const legs = Math.max(1, stage.settings?.legs ?? 1);
    const byPool = new Map<string, string[]>();
    for (const entrant of stageEntrants) {
      const key = entrant.poolKey || '';
      if (!byPool.has(key)) byPool.set(key, []);
      byPool.get(key)!.push(entrant.entrantId);
    }

    const planned: PlannedGame[] = [];
    for (const [poolKey, entrantIds] of byPool) {
      if (entrantIds.length < 2) continue;
      for (let leg = 1; leg <= legs; leg++) {
        const rounds = this.circleMethod(entrantIds);
        rounds.forEach((pairs, roundIndex) => {
          pairs.forEach(([a, b], matchIndex) => {
            // The second leg is the reverse fixture, so the sides swap.
            const [first, second] = leg % 2 === 1 ? [a, b] : [b, a];
            const round = (leg - 1) * rounds.length + roundIndex + 1;
            planned.push({
              id: `game-${uuidv4()}`,
              sides: [
                { kind: 'entrant', entrantId: first },
                { kind: 'entrant', entrantId: second },
              ],
              meta: {
                round,
                roundName: `Round ${round}`,
                label: `R${round}.${matchIndex + 1}`,
                matchIndex: matchIndex + 1,
                poolKey: poolKey || undefined,
                leg: legs > 1 ? leg : undefined,
              },
            });
          });
        });
      }
    }
    return planned;
  }

  /**
   * The circle method: fix the first entrant, rotate the rest, pair across.
   *
   * An odd roster gets a bye placeholder, and the pairs it appears in are dropped — which is what
   * distributes the byes evenly instead of always resting whoever sorts last.
   */
  private circleMethod(entrantIds: string[]): Array<Array<[string, string]>> {
    const BYE = '__bye__';
    const list = [...entrantIds];
    if (list.length % 2 === 1) list.push(BYE);

    const size = list.length;
    const rounds: Array<Array<[string, string]>> = [];

    for (let round = 0; round < size - 1; round++) {
      const pairs: Array<[string, string]> = [];
      for (let i = 0; i < size / 2; i++) {
        const a = list[i];
        const b = list[size - 1 - i];
        if (a === BYE || b === BYE) continue;
        pairs.push(round % 2 === 0 ? [a, b] : [b, a]);
      }
      rounds.push(pairs);
      list.splice(1, 0, list.pop()!);
    }
    return rounds;
  }

  /**
   * A single-elimination bracket, sized to the next power of two, byes to the top seeds.
   *
   * The first round's slots come from whichever the stage has: its own entrants (seeded), or —
   * when it draws from an earlier stage that has not finished — **rule placeholders**. The second
   * case is the normal one for pools-and-knockout and is the whole point of generating the bracket
   * early: the draw is publishable, printable and schedulable while its slots still read
   * "1st in Pool A".
   *
   * Later rounds are always rules (`winnerOf` the feeding fixture), which is what the choke point
   * fills in when that fixture finishes.
   */
  private planBracket(stage: TournamentStage, stageEntrants: StageEntrant[]): PlannedGame[] {
    const seededEntrants = [...stageEntrants].sort(
      (a, b) => (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER) || a.sortOrder - b.sortOrder
    );

    let seeds: PlannedSide[];
    if (seededEntrants.length >= 2) {
      seeds = seededEntrants.map(e => ({ kind: 'entrant' as const, entrantId: e.entrantId }));
    } else {
      const rules = stage.settings?.entrantSource || [];
      seeds = this.expandEntrantSourceToSlots(rules).map(slot => ({
        kind: 'rule' as const,
        rule: slot.rule,
        sourceStageId: slot.sourceStageId,
      }));
    }
    if (seeds.length < 2) return [];

    const size = stage.settings?.bracketSize ?? nextPowerOfTwo(seeds.length);
    const order = bracketSeedOrder(size);

    let slots: PlannedSide[] = order.map(seed => seeds[seed - 1] ?? { kind: 'bye' as const });

    const planned: PlannedGame[] = [];
    let round = 1;
    let semiFinals: PlannedGame[] = [];

    while (slots.length > 1) {
      const remaining = slots.length;
      const next: PlannedSide[] = [];
      const thisRound: PlannedGame[] = [];

      for (let i = 0; i < slots.length; i += 2) {
        const a = slots[i];
        const b = slots[i + 1];

        // A bye is not a fixture. The present side simply advances, rather than being credited
        // with a walkover nobody played — D7's rule about unresolved sides, one level up.
        if (a.kind === 'bye' && b.kind === 'bye') { next.push({ kind: 'bye' }); continue; }
        if (a.kind === 'bye') { next.push(b); continue; }
        if (b.kind === 'bye') { next.push(a); continue; }

        const id = `game-${uuidv4()}`;
        const matchIndex = thisRound.length + 1;
        const abbreviation = roundAbbreviation(remaining);
        const game: PlannedGame = {
          id,
          sides: [a, b],
          meta: {
            round,
            roundName: roundName(remaining),
            label: remaining === 2 ? abbreviation : `${abbreviation}${matchIndex}`,
            matchIndex,
          },
        };
        thisRound.push(game);
        next.push({ kind: 'rule', rule: { type: 'winnerOf' }, sourceGameId: id });
      }

      planned.push(...thisRound);
      if (remaining === 4) semiFinals = thisRound;
      slots = next;
      round++;
    }

    // The two beaten semi-finalists, if the organiser wants a third-place playoff. Expressed with
    // the same `loserOf` primitive a plate bracket uses, so Phase 8 extends rather than replaces.
    if (stage.settings?.thirdPlacePlayoff && semiFinals.length === 2) {
      planned.push({
        id: `game-${uuidv4()}`,
        sides: semiFinals.map(semi => ({
          kind: 'rule' as const,
          rule: { type: 'loserOf' as const },
          sourceGameId: semi.id,
        })),
        meta: { round: round - 1, roundName: 'Third-Place Playoff', label: '3rd', matchIndex: 1 },
      });
    }

    return planned;
  }

  // ============================================================================================
  // Scheduling — the server half. Phase 7 owns the rest.
  // ============================================================================================

  /**
   * Allocate a stage's fixtures to times and facilities.
   *
   * Two hard constraints, and only two (D14): **an entrant plays once at a time**, and **a
   * facility hosts once at a time**. Fixtures are placed greedily in generated order, which for a
   * round robin is round order — so the rounds stay recognisable rather than being interleaved by
   * a cleverer packing.
   *
   * **This is the server half of Phase 7, not the whole of it.** Day windows (a last start time
   * per day), turnaround by sport, the schedule grid, moving a fixture, and conflicts that warn
   * rather than block all belong there, on top of this. Two known limits, stated rather than
   * discovered: an entrant is only checked against *this stage*, so a school playing in two
   * divisions at once is not detected yet; and slots run continuously from `startAt` with no
   * notion of a day ending.
   */
  async scheduleStage(payload: {
    stageId: string;
    startAt: string;
    slotMinutes: number;
    facilityIds?: string[];
    keepScheduled?: boolean;
  }): Promise<{ stageId: string; divisionId: string; eventId: string; scheduled: number }> {
    const stage = await this.getStage(payload.stageId);
    if (!stage) throw new Error(`Stage ${payload.stageId} not found.`);
    const division = await this.getDivision(stage.divisionId);
    if (!division) throw new Error(`Division ${stage.divisionId} not found.`);

    if (!(payload.slotMinutes > 0)) throw new Error('A slot needs a positive length in minutes.');

    // The facility cascade (data model §3.5): what the caller named, else the division's
    // allocation, else the event's. A stage with none available is refused rather than scheduled
    // nowhere, because "scheduled at no venue" is not a state anybody asked for.
    let facilityIds = payload.facilityIds?.length ? payload.facilityIds : await this.getDivisionFacilities(division.id);
    if (!facilityIds.length) facilityIds = await this.getEventFacilities(division.eventId);
    if (!facilityIds.length) {
      throw new Error(
        `${division.name} has no facilities to schedule into. Give the event its venues first, or ` +
          `name the facilities in this request.`
      );
    }

    const facilities = await this.query(
      `SELECT id, site_id as "siteId" FROM facilities WHERE id = ANY($1::text[])`,
      [facilityIds]
    );
    const sitesByFacility = new Map<string, string | null>(facilities.rows.map((f: any) => [f.id, f.siteId]));
    const usableFacilities = facilityIds.filter(id => sitesByFacility.has(id));
    if (!usableFacilities.length) throw new Error('None of the named facilities exist.');

    // D15: a stage may not start before its own gate, whatever the caller asked for. A greedy
    // scheduler with no gate will happily start a semi-final before its pool has finished.
    let start = new Date(payload.startAt);
    if (stage.earliestStart) {
      const gate = new Date(stage.earliestStart);
      if (gate > start) start = gate;
    }
    if (Number.isNaN(start.getTime())) throw new Error(`'${payload.startAt}' is not a time.`);

    const games = await this.query(
      `SELECT g.id, g.start_time as "startTime", g.facility_id as "facilityId",
              g.custom_settings as "customSettings",
              COALESCE((
                SELECT jsonb_agg(COALESCE(gp.entrant_id, gp.team_id, gp.org_profile_id))
                FROM game_participants gp
                WHERE gp.game_id = g.id AND COALESCE(gp.entrant_id, gp.team_id, gp.org_profile_id) IS NOT NULL
              ), '[]'::jsonb) AS competitors
         FROM games g
        WHERE g.stage_id = $1
        ORDER BY (g.custom_settings->'tournament'->>'round')::int NULLS LAST,
                 (g.custom_settings->'tournament'->>'matchIndex')::int NULLS LAST,
                 g.id`,
      [payload.stageId]
    );

    const pending: Array<{ id: string; competitors: string[] }> = [];
    /** slot index -> facilities and competitors already taken in it. */
    const taken = new Map<number, { facilities: Set<string>; competitors: Set<string> }>();
    const slotOf = (time: Date) => Math.round((time.getTime() - start.getTime()) / (payload.slotMinutes * 60_000));
    const reserve = (slot: number) => {
      if (!taken.has(slot)) taken.set(slot, { facilities: new Set(), competitors: new Set() });
      return taken.get(slot)!;
    };

    for (const game of games.rows) {
      const competitors: string[] = (game.competitors || []).filter(Boolean);
      if (payload.keepScheduled && game.startTime) {
        // Already placed by hand, so it holds its slot rather than being moved around it.
        const slot = slotOf(new Date(game.startTime));
        const held = reserve(slot);
        if (game.facilityId) held.facilities.add(game.facilityId);
        competitors.forEach(c => held.competitors.add(c));
        continue;
      }
      pending.push({ id: game.id, competitors });
    }

    const assignments: Array<{ id: string; startAt: Date; facilityId: string }> = [];
    let slot = 0;
    while (pending.length) {
      const held = reserve(slot);
      let placedInThisSlot = false;

      for (const facilityId of usableFacilities) {
        if (held.facilities.has(facilityId)) continue;
        const index = pending.findIndex(game => game.competitors.every(c => !held.competitors.has(c)));
        if (index === -1) break;

        const [game] = pending.splice(index, 1);
        held.facilities.add(facilityId);
        game.competitors.forEach(c => held.competitors.add(c));
        assignments.push({
          id: game.id,
          startAt: new Date(start.getTime() + slot * payload.slotMinutes * 60_000),
          facilityId,
        });
        placedInThisSlot = true;
        if (!pending.length) break;
      }

      // Every remaining fixture conflicted with something already in this slot, and an empty slot
      // cannot become non-empty by waiting — so stop rather than loop forever.
      if (!placedInThisSlot && pending.length) {
        if (held.facilities.size === 0 && held.competitors.size === 0) {
          throw new Error(
            `Could not place ${pending.length} fixture(s): no facility is free and no entrant is ` +
              `available in any remaining slot. This is a bug in the scheduler, not in the data.`
          );
        }
      }
      slot++;
    }

    await this.transaction(async (tx) => {
      for (const assignment of assignments) {
        await tx(
          `UPDATE games
              SET start_time = $1, scheduled_start_time = $1, facility_id = $2, site_id = $3,
                  custom_settings = jsonb_set(COALESCE(custom_settings, '{}'::jsonb), '{timeTbd}', 'false'::jsonb),
                  updated_at = NOW()
            WHERE id = $4`,
          [assignment.startAt.toISOString(), assignment.facilityId, sitesByFacility.get(assignment.facilityId) || null, assignment.id]
        );
      }
    });

    return { stageId: stage.id, divisionId: division.id, eventId: division.eventId, scheduled: assignments.length };
  }

  // ============================================================================================
  // Scoring configuration (data model §6): division overrides event overrides 3/1/0
  // ============================================================================================

  private async resolveScoringConfig(divisionId: string): Promise<{
    division: TournamentDivision;
    eventId: string;
    scoring: ScoringSystem;
    tiebreakers: TiebreakFactor[];
    scoringSubject: ScoringSubject;
    matchTopology: MatchTopology;
  }> {
    const division = await this.getDivision(divisionId);
    if (!division) throw new Error(`Division ${divisionId} not found.`);

    const eventRes = await this.query(`SELECT settings FROM events WHERE id = $1`, [division.eventId]);
    const eventSettings = eventRes.rows[0]?.settings || {};

    // `SPORT-10`, one notch further closed: a division supplies its sport's real topology to the
    // engine, where before both callers took the `HEAD_TO_HEAD` default. It decides one thing —
    // whether the legacy two-sided `finalScoreData.home` / `.away` shape may be read at all.
    let matchTopology = MatchTopology.HEAD_TO_HEAD;
    if (division.sportId) {
      const sportRes = await this.query(`SELECT match_topology FROM sports WHERE id = $1`, [division.sportId]);
      if (sportRes.rows[0]?.match_topology) matchTopology = sportRes.rows[0].match_topology as MatchTopology;
    }

    return {
      division,
      eventId: division.eventId,
      scoring: division.settings?.scoring || eventSettings.scoring || DEFAULT_SCORING_SYSTEM,
      tiebreakers: division.settings?.tiebreakers || eventSettings.tiebreakers || DEFAULT_TIEBREAKERS,
      scoringSubject: division.scoringSubject || eventSettings.scoringSubject || 'Team',
      matchTopology,
    };
  }

  /**
   * The games of a stage or division, in the shape `calculateStandings` reads.
   *
   * `status` and `live_state` are in the projection deliberately: leaving them out is what
   * `SCORE-14` was in `LeagueManager`, where every season's table came out zeros because the
   * engine's "only finished fixtures count" guard saw `status` undefined on every row.
   */
  private async getGamesForStandings(where: string, params: any[]): Promise<any[]> {
    const res = await this.query(
      `SELECT g.id, g.status, g.final_score_data as "finalScoreData", g.live_state as "liveState",
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'id', gp.id,
                  'teamId', gp.team_id,
                  'orgProfileId', gp.org_profile_id,
                  'entrantId', gp.entrant_id,
                  'sortOrder', gp.sort_order
                ) ORDER BY gp.sort_order, gp.id)
                FROM game_participants gp WHERE gp.game_id = g.id
              ), '[]'::jsonb) as participants
         FROM games g
        WHERE ${where}`,
      params
    );
    return res.rows;
  }

  /**
   * Disciplinary points by entrant, for the `fewestCards` factor.
   *
   * A yellow counts 1 and a red 2 — the shipped convention, not yet configurable, and stated here
   * because a tiebreak that silently weighted them equally would be a wrong answer rather than a
   * missing feature. Cards are `game_events.sub_type`, which is what the sin-bin engine reads too.
   */
  private async getDisciplinaryPoints(where: string, params: any[]): Promise<Record<string, number>> {
    const res = await this.query(
      `SELECT gp.entrant_id as "entrantId", ge.sub_type as "subType", count(*)::int AS n
         FROM game_events ge
         JOIN game_participants gp ON gp.id = ge.game_participant_id
         JOIN games g ON g.id = ge.game_id
        WHERE ${where} AND ge.sub_type IN ('yellow_card', 'red_card') AND gp.entrant_id IS NOT NULL
        GROUP BY gp.entrant_id, ge.sub_type`,
      params
    );
    const points: Record<string, number> = {};
    for (const row of res.rows) {
      points[row.entrantId] = (points[row.entrantId] || 0) + (CARD_POINTS[row.subType] || 0) * row.n;
    }
    return points;
  }

  // ============================================================================================
  // The choke point (D30)
  // ============================================================================================

  /**
   * Rewrite one stage's table.
   *
   * Pool tables are not stored separately — `poolKey` on the row distinguishes them (data model
   * §7) — so a pooled stage is ranked **per pool**, because one table across pools that never
   * play each other ranks nothing, and `{ standing, poolKey: 'A', position: 1 }` has to resolve
   * against the pool's own order.
   */
  async recalculateStageStandings(stageId: string): Promise<TournamentStandingRow[]> {
    const stage = await this.getStage(stageId);
    if (!stage) return [];

    const config = await this.resolveScoringConfig(stage.divisionId);
    const subjects = await this.getStageSubjects(stageId);
    const games = await this.getGamesForStandings(`g.stage_id = $1`, [stageId]);
    const adjustments = await this.getAdjustments(stage.divisionId);
    const disciplinaryPoints = await this.getDisciplinaryPoints(`g.stage_id = $1`, [stageId]);

    const pools: string[] = [];
    for (const subject of subjects) {
      const key = subject.poolKey ?? '';
      if (!pools.includes(key)) pools.push(key);
    }

    const rows: TournamentStandingRow[] = [];
    for (const pool of pools) {
      const poolSubjects = subjects.filter(s => (s.poolKey ?? '') === pool);
      const ranked = calculateStandings(games, poolSubjects, {
        scoring: config.scoring,
        tiebreakers: config.tiebreakers,
        adjustments,
        disciplinaryPoints,
        matchTopology: config.matchTopology,
      });
      // The engine carries `poolKey` through from the subject; restate it so a row is never
      // ambiguous about which table it belongs to.
      if (pool) ranked.forEach(row => { row.poolKey = pool; });
      rows.push(...ranked);
    }

    await this.query(
      `UPDATE division_stages SET cached_standings = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(rows), stageId]
    );
    return rows;
  }

  /**
   * Rewrite the event's organisation roll-up (D6, D18).
   *
   * Each division contributes **one** set of points, computed over all of its fixtures at once
   * rather than by adding its stages together. §7 is right that a combined pools-and-knockout
   * *table* is not a meaningful object to show anybody — but the roll-up is not showing one, it is
   * asking "how many competition points did this division award this school", and that is a
   * question about the division's fixtures, which is exactly what this computes.
   */
  async recalculateEventStandings(eventId: string): Promise<TournamentStandingRow[]> {
    const divisions = await this.getDivisions(eventId);

    const orgRes = await this.query(
      `SELECT DISTINCT o.id, COALESCE(o.short_name, o.name) AS name
         FROM division_entrants e
         JOIN tournament_divisions d ON d.id = e.division_id
         JOIN organizations o ON o.id = e.org_id
        WHERE d.event_id = $1`,
      [eventId]
    );

    const divisionGames = `g.stage_id IN (SELECT id FROM division_stages WHERE division_id = $1)`;
    const weighted = [];

    for (const division of divisions) {
      const subjects = await this.getDivisionSubjects(division.id);
      if (!subjects.length) continue;
      const config = await this.resolveScoringConfig(division.id);
      const rows = calculateStandings(await this.getGamesForStandings(divisionGames, [division.id]), subjects, {
        scoring: config.scoring,
        tiebreakers: config.tiebreakers,
        adjustments: await this.getAdjustments(division.id),
        disciplinaryPoints: await this.getDisciplinaryPoints(divisionGames, [division.id]),
        matchTopology: config.matchTopology,
      });
      weighted.push({ divisionId: division.id, weighting: division.weighting ?? 1, rows });
    }

    const rollUp = rollUpByOrganisation(weighted, orgRes.rows);
    await this.query(`UPDATE events SET cached_standings = $1 WHERE id = $2`, [JSON.stringify(rollUp), eventId]);
    return rollUp;
  }

  /** Every active entrant of a division, as standings subjects. No pools: this is the whole division. */
  private async getDivisionSubjects(divisionId: string): Promise<StandingsSubject[]> {
    const res = await this.query(
      `SELECT e.id, e.org_id as "orgId", COALESCE(t.name, op.name, e.label, 'TBC') as "name"
         FROM division_entrants e
         LEFT JOIN teams t ON t.id = e.team_id
         LEFT JOIN org_profiles op ON op.id = e.org_profile_id
        WHERE e.division_id = $1 AND e.status = 'active'`,
      [divisionId]
    );
    return res.rows.map((r: any) => ({ id: r.id, name: r.name, entrantId: r.id, orgId: r.orgId || undefined }));
  }

  /**
   * **The choke point.** One function rewrites a standings table, and every path that changes a
   * result calls it (data model §7):
   *
   * ```
   * recalculateForGame(gameId)
   *   -> the stage that owns the game    -> rewrite division_stages.cached_standings
   *   -> the event that owns the stage   -> rewrite events.cached_standings
   *   -> every season in game_seasons    -> existing recalculateSeasonStandings   (D21)
   *   -> the fixtures this game fills    -> winnerOf / loserOf                    (D26)
   *   -> if the stage just completed     -> resolve the next stage's entrants     (D23)
   * ```
   *
   * The last two arrows are where progression actually happens, and they are the same code path as
   * recalculating the table because **the table is what they read**.
   *
   * Returns the ids of every fixture whose participants it changed, because the caller has to
   * publish those summaries — the newly resolved names are what a fixture list is waiting for.
   */
  async recalculateForGame(
    gameId: string,
    context?: { stageId?: string | null; eventId?: string | null }
  ): Promise<{
    stageId: string | null;
    divisionId: string | null;
    eventId: string | null;
    stageStatus?: TournamentStage['status'];
    changedGameIds: string[];
  }> {
    // A deleted game cannot be looked up, so the caller that deleted it passes what it captured
    // beforehand. Same reasoning as `captureFixtureRooms`.
    let stageId = context?.stageId ?? null;
    let eventId = context?.eventId ?? null;
    if (!context) {
      const res = await this.query(
        `SELECT stage_id as "stageId", event_id as "eventId" FROM games WHERE id = $1`,
        [gameId]
      );
      stageId = res.rows[0]?.stageId ?? null;
      eventId = res.rows[0]?.eventId ?? null;
    }

    const changedGameIds: string[] = [];
    let divisionId: string | null = null;
    let stageStatus: TournamentStage['status'] | undefined;

    if (stageId) {
      const stage = await this.getStage(stageId);
      if (stage) {
        divisionId = stage.divisionId;
        stageStatus = await this.refreshStageStatus(stageId);
        await this.recalculateStageStandings(stageId);
      }
    }

    if (eventId) {
      const isTournament = await this.query(
        `SELECT 1 FROM tournament_divisions WHERE event_id = $1 LIMIT 1`,
        [eventId]
      );
      if (isTournament.rows.length) await this.recalculateEventStandings(eventId);
    }

    // D21. Unchanged behaviour, moved behind the one door rather than left as a second entry
    // point — a tournament fixture counting toward a league season is an ordinary `game_seasons`
    // row, and this is now the only place that has to remember it exists.
    const seasons = await this.query(`SELECT season_id FROM game_seasons WHERE game_id = $1`, [gameId]);
    if (seasons.rows.length) {
      const { LeagueManager } = require('./LeagueManager');
      const leagueManager = new LeagueManager();
      for (const row of seasons.rows) {
        try {
          await leagueManager.recalculateSeasonStandings(row.season_id);
        } catch (err) {
          console.error(`[Tournament] Season recalculation failed for ${row.season_id}:`, err);
        }
      }
    }

    // Progression, in the order the arrows run: this fixture's own dependants first, then — only
    // if the whole stage is now decided — the stage that draws from it.
    changedGameIds.push(...(await this.fillFromGame(gameId)));
    if (stageId && stageStatus === 'Complete') {
      changedGameIds.push(...(await this.resolveDownstreamStages(stageId)));
    }

    return { stageId, divisionId, eventId, stageStatus, changedGameIds };
  }

  /**
   * A stage's status is derived, never asserted.
   *
   * Storing it and updating it from each writer is how it drifts; deriving it from the fixtures
   * and the roster means a stage that "should" be complete always is. `Ready` is the one state
   * that is about entrants rather than fixtures — it is what generation acts on.
   */
  async refreshStageStatus(stageId: string): Promise<TournamentStage['status']> {
    const res = await this.query(
      `SELECT
         (SELECT count(*)::int FROM games WHERE stage_id = $1) AS fixtures,
         (SELECT count(*)::int FROM games WHERE stage_id = $1 AND status = 'Finished') AS finished,
         (SELECT count(*)::int FROM stage_entrants WHERE stage_id = $1) AS entrants`,
      [stageId]
    );
    const { fixtures, finished, entrants } = res.rows[0];

    let status: TournamentStage['status'];
    if (fixtures > 0 && finished === fixtures) status = 'Complete';
    else if (fixtures > 0) status = 'InProgress';
    else if (entrants > 0) status = 'Ready';
    else status = 'Pending';

    await this.query(`UPDATE division_stages SET status = $1, updated_at = NOW() WHERE id = $2`, [status, stageId]);
    return status;
  }

  /**
   * Fill every slot this fixture decides — "Winner QF1" becomes a team (D26).
   *
   * Only slots that still carry a `source_rule` are touched, which is what makes D29's manual
   * override stick: filling a slot by hand clears the rule, so a later result cannot overwrite the
   * organiser. A slot that is still ruled is recomputed every time, so a dispute that reverses a
   * result moves the right team into the next round rather than leaving the loser there.
   */
  private async fillFromGame(gameId: string): Promise<string[]> {
    const dependants = await this.query(
      `SELECT gp.id, gp.game_id as "gameId", gp.source_rule as "sourceRule"
         FROM game_participants gp
        WHERE gp.source_game_id = $1 AND gp.source_rule IS NOT NULL`,
      [gameId]
    );
    if (!dependants.rows.length) return [];

    const outcome = await this.getGameOutcome(gameId);
    const changed = new Set<string>();

    for (const dependant of dependants.rows) {
      const type = dependant.sourceRule?.type;
      if (type !== 'winnerOf' && type !== 'loserOf') continue;
      const side = type === 'winnerOf' ? outcome?.winner : outcome?.loser;
      // No result yet, or a draw with no tiebreak recorded: leave the placeholder where it is
      // rather than filling it with a guess. "Winner QF1" is the honest rendering until QF1 is
      // actually decided.
      if (!side) continue;
      await this.query(
        `UPDATE game_participants SET entrant_id = $1, team_id = $2, org_profile_id = $3 WHERE id = $4`,
        [side.entrantId, side.teamId, side.orgProfileId, dependant.id]
      );
      changed.add(dependant.gameId);
    }
    return [...changed];
  }

  /** Who won and who lost a finished fixture, or null while it is undecided. */
  private async getGameOutcome(gameId: string): Promise<{
    winner?: { entrantId: string | null; teamId: string | null; orgProfileId: string | null };
    loser?: { entrantId: string | null; teamId: string | null; orgProfileId: string | null };
  } | null> {
    const res = await this.query(
      `SELECT g.status, g.final_score_data as "finalScoreData", g.live_state as "liveState",
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'id', gp.id, 'entrantId', gp.entrant_id, 'teamId', gp.team_id,
                  'orgProfileId', gp.org_profile_id, 'sortOrder', gp.sort_order
                ) ORDER BY gp.sort_order, gp.id)
                FROM game_participants gp WHERE gp.game_id = g.id
              ), '[]'::jsonb) as participants
         FROM games g WHERE g.id = $1`,
      [gameId]
    );
    const game = res.rows[0];
    if (!game || game.status !== 'Finished') return null;

    const participants: any[] = game.participants || [];
    if (participants.length < 2) return null;

    // The same three score shapes the standings engine reads, in the same order of finality — see
    // `sideScores` in shared/src/utils/standings.ts. Reading them in a different order here is
    // exactly how a bracket and a table come to disagree.
    const scoreFor = (participant: any, index: number): number | undefined => {
      const final = game.finalScoreData;
      if (final && typeof final === 'object') {
        if (final.scores && typeof final.scores === 'object' && final.scores[participant.id] !== undefined) {
          return Number(final.scores[participant.id]);
        }
        if (final.placings && typeof final.placings === 'object' && final.placings[participant.id] !== undefined) {
          // A placing is better when it is lower, so invert it into something comparable.
          return -Number(final.placings[participant.id]);
        }
        if (participants.length === 2 && (typeof final.home === 'number' || typeof final.away === 'number')) {
          return index === 0 ? Number(final.home ?? 0) : Number(final.away ?? 0);
        }
      }
      const live = game.liveState?.scores;
      if (live && typeof live === 'object' && live[participant.id] !== undefined) return Number(live[participant.id]);
      return undefined;
    };

    const scored = participants.map((p, i) => ({ p, score: scoreFor(p, i) }));
    if (scored.some(s => s.score === undefined)) return null;

    const sorted = [...scored].sort((a, b) => (b.score as number) - (a.score as number));
    // A draw does not decide a knockout, and inventing a winner from sort order would put the
    // wrong team in the semi-final silently. The organiser fills it in by hand (D29).
    if ((sorted[0].score as number) === (sorted[1].score as number)) return null;

    const asSide = (p: any) => ({
      entrantId: p.entrantId || null,
      teamId: p.teamId || null,
      orgProfileId: p.orgProfileId || null,
    });
    return { winner: asSide(sorted[0].p), loser: asSide(sorted[sorted.length - 1].p) };
  }

  /**
   * A stage has finished, so fill in the stages that draw from it (D23).
   *
   * Two things happen, in this order and in one function because they are one act: the target
   * stage's `stage_entrants` are written from the source stage's table, and then any fixture
   * already generated against `{ type: 'standing', … }` has that slot filled. Generating the
   * bracket before the pool finishes is the normal case — the placeholders are the point — so the
   * fixtures usually exist by the time this runs.
   */
  private async resolveDownstreamStages(sourceStageId: string): Promise<string[]> {
    const sourceStage = await this.getStage(sourceStageId);
    if (!sourceStage) return [];

    const targets = await this.query(
      `SELECT ${this.STAGE_COLUMNS} FROM division_stages s
        WHERE s.division_id = $1 AND s.settings -> 'entrantSource' @> $2::jsonb`,
      [sourceStage.divisionId, JSON.stringify([{ fromStage: sourceStageId }])]
    );
    if (!targets.rows.length) return [];

    const changed = new Set<string>();

    for (const target of targets.rows as TournamentStage[]) {
      const rules: EntrantSourceRule[] = target.settings?.entrantSource || [];

      // Every source stage must be decided before the target's roster means anything: a knockout
      // fed by two pools cannot be half seeded.
      const sourceIds: string[] = [];
      for (const rule of rules) if (!sourceIds.includes(rule.fromStage)) sourceIds.push(rule.fromStage);

      const sources = await this.query(
        `SELECT id, status, cached_standings as "cachedStandings" FROM division_stages WHERE id = ANY($1::text[])`,
        [sourceIds]
      );
      if (sources.rows.length !== sourceIds.length) continue;
      if (sources.rows.some((s: any) => s.status !== 'Complete')) continue;

      const standingsByStage = new Map<string, TournamentStandingRow[]>(
        sources.rows.map((s: any) => [s.id, (s.cachedStandings || []) as TournamentStandingRow[]])
      );

      const slots = this.expandEntrantSourceToSlots(rules).map(slot => ({
        ...slot,
        entrantId: this.entrantAtStanding(
          standingsByStage.get(slot.sourceStageId) || [],
          (slot.rule as any).poolKey,
          (slot.rule as any).position
        ),
      }));

      const resolved = slots.filter(slot => !!slot.entrantId);
      if (resolved.length !== slots.length) {
        console.warn(
          `[Tournament] Stage ${target.id}: ${slots.length - resolved.length} of ${slots.length} source ` +
            `slot(s) could not be resolved. Either the source table has fewer ranked entrants than the ` +
            `rules ask for, or a rank is shared — which is the engine saying a human has to decide (D29). ` +
            `Those slots keep their placeholders.`
        );
      }

      await this.setStageEntrants(
        target.id,
        resolved.map((slot, index) => ({ entrantId: slot.entrantId!, seed: index + 1, sortOrder: index }))
      );

      // Fill the fixtures already generated against these positions.
      const placeholders = await this.query(
        `SELECT gp.id, gp.game_id as "gameId", gp.source_rule as "sourceRule",
                gp.source_stage_id as "sourceStageId"
           FROM game_participants gp
           JOIN games g ON g.id = gp.game_id
          WHERE g.stage_id = $1 AND gp.source_rule IS NOT NULL AND gp.source_stage_id IS NOT NULL`,
        [target.id]
      );

      for (const placeholder of placeholders.rows) {
        const rule = placeholder.sourceRule;
        if (rule?.type !== 'standing') continue;
        const entrantId = this.entrantAtStanding(
          standingsByStage.get(placeholder.sourceStageId) || [],
          rule.poolKey,
          rule.position
        );
        if (!entrantId) continue;
        const identity = await this.query(`SELECT team_id, org_profile_id FROM division_entrants WHERE id = $1`, [
          entrantId,
        ]);
        await this.query(
          `UPDATE game_participants SET entrant_id = $1, team_id = $2, org_profile_id = $3 WHERE id = $4`,
          [entrantId, identity.rows[0]?.team_id || null, identity.rows[0]?.org_profile_id || null, placeholder.id]
        );
        changed.add(placeholder.gameId);
      }

      await this.refreshStageStatus(target.id);
    }

    return [...changed];
  }

  /**
   * Expand `entrantSource` rules into an ordered list of bracket slots.
   *
   * **Position-major**, which is what produces the crossover a knockout wants: A1, B1, A2, B2 —
   * so in a four-slot bracket seeds 1 and 4 (A1 and B2) meet in the first round. Pool-major
   * expansion (A1, A2, B1, B2) would make seeds 1 and 4 be A1 and B2 as well by accident at size
   * four, but at size eight it puts both of a pool's qualifiers in the same half, which is the
   * pairing that running pools was meant to avoid.
   */
  private expandEntrantSourceToSlots(
    rules: EntrantSourceRule[]
  ): Array<{ rule: ParticipantSourceRule; sourceStageId: string }> {
    const expanded: Array<{ position: number; ruleIndex: number; rule: EntrantSourceRule }> = [];
    rules.forEach((rule, ruleIndex) => {
      for (const position of rule.positions || []) expanded.push({ position, ruleIndex, rule });
    });
    expanded.sort((a, b) => a.position - b.position || a.ruleIndex - b.ruleIndex);

    return expanded.map(({ position, rule }) => ({
      rule: { type: 'standing', poolKey: rule.poolKey, position } as ParticipantSourceRule,
      sourceStageId: rule.fromStage,
    }));
  }

  /**
   * Who finished `position` in a table, or in one pool of it.
   *
   * `rank` is what is read, not array order — the engine's whole contract is that `rank` is the
   * definite answer and that entrants it could not separate **share** one. A shared rank therefore
   * resolves to nobody rather than to whichever of them sorted first: an arbitrary pick would look
   * decisive and put the wrong team in a semi-final, and D29's manual override is the mechanism
   * for a human to break the tie.
   */
  private entrantAtStanding(
    rows: TournamentStandingRow[],
    poolKey: string | undefined,
    position: number
  ): string | undefined {
    const pool = poolKey ? rows.filter(r => r.poolKey === poolKey) : rows;
    const matches = pool.filter(r => r.rank === position);
    if (matches.length !== 1) return undefined;
    return matches[0].entrantId;
  }
}

export const tournamentManager = new TournamentManager();
