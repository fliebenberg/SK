import { v4 as uuidv4 } from "uuid";
import { AgeGroup, AgeGroupAdminView, ageGroupNameKey, sortAgeGroups } from "@sk/shared";
import { BaseManager } from "./BaseManager";
import { STARTER_AGE_GROUPS, starterAgeGroupId } from "../scripts/setup/ageGroupSeed";

/**
 * Each sport's age-group list — official entries an admin curates, and custom ones users add.
 *
 * Teams, divisions and leagues hold an entry's id under a composite foreign key on
 * `(sport_id, age_group_id)`, so the database already refuses an age group of another sport and
 * refuses to delete one that is in use. What this class adds is the rules around names (one entry
 * per name per sport, ignoring case and spacing) and the admin operations: promote, reorder, merge.
 */

const MAX_NAME_LENGTH = 40;

/** A refusal meant for the user — the admin routes answer it with a 400 and its message. */
export class AgeGroupError extends Error {}

/** The three tables that hold an age group. */
const HOLDERS = ['teams', 'tournament_divisions', 'leagues'] as const;

const SELECT_COLUMNS = `id, sport_id as "sportId", name, sort_order as "sortOrder", is_official as "isOfficial"`;

function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!name) throw new AgeGroupError('An age group needs a name.');
  if (name.length > MAX_NAME_LENGTH) {
    throw new AgeGroupError(`Keep an age group's name to ${MAX_NAME_LENGTH} characters.`);
  }
  return name;
}

export class AgeGroupManager extends BaseManager {
  /** Every sport's list, keyed by sport id, official entries first. */
  async getBySport(sportIds?: string[]): Promise<Record<string, AgeGroup[]>> {
    const res = sportIds
      ? await this.query(`SELECT ${SELECT_COLUMNS} FROM sport_age_groups WHERE sport_id = ANY($1)`, [sportIds])
      : await this.query(`SELECT ${SELECT_COLUMNS} FROM sport_age_groups`);
    const bySport: Record<string, AgeGroup[]> = {};
    for (const row of res.rows as AgeGroup[]) (bySport[row.sportId] ||= []).push(row);
    for (const sportId of Object.keys(bySport)) bySport[sportId] = sortAgeGroups(bySport[sportId]);
    return bySport;
  }

  async getAgeGroup(id: string): Promise<AgeGroup | undefined> {
    const res = await this.query(`SELECT ${SELECT_COLUMNS} FROM sport_age_groups WHERE id = $1`, [id]);
    return res.rows[0];
  }

  /** The sport editor's view: every entry with who added it and how much holds it. */
  async getAdminList(sportId: string): Promise<AgeGroupAdminView[]> {
    const res = await this.query(
      `SELECT ag.id, ag.sport_id as "sportId", ag.name, ag.sort_order as "sortOrder",
              ag.is_official as "isOfficial", ag.created_org_id as "createdOrgId",
              o.name as "createdOrgName", ag.created_at as "createdAt",
              (SELECT count(*) FROM teams t WHERE t.age_group_id = ag.id)::int as "teamCount",
              (SELECT count(*) FROM tournament_divisions d WHERE d.age_group_id = ag.id)::int as "divisionCount",
              (SELECT count(*) FROM leagues l WHERE l.age_group_id = ag.id)::int as "leagueCount"
         FROM sport_age_groups ag
         LEFT JOIN organizations o ON o.id = ag.created_org_id
        WHERE ag.sport_id = $1`,
      [sportId]
    );
    return sortAgeGroups(res.rows);
  }

  private async findByName(sportId: string, name: string): Promise<AgeGroup | undefined> {
    const res = await this.query(
      `SELECT ${SELECT_COLUMNS} FROM sport_age_groups WHERE sport_id = $1 AND lower(name) = $2`,
      [sportId, ageGroupNameKey(name)]
    );
    return res.rows[0];
  }

  private async nextSortOrder(sportId: string): Promise<number> {
    const res = await this.query(
      `SELECT coalesce(max(sort_order) + 1, 0) as next FROM sport_age_groups WHERE sport_id = $1 AND is_official`,
      [sportId]
    );
    return Number(res.rows[0].next);
  }

  /**
   * "Other…" in the picker. Returns the entry already carrying that name, official or custom,
   * rather than a second one — so typing "u13" where "U13" exists simply picks "U13".
   */
  async addCustom(sportId: string, rawName: unknown, userId?: string, orgId?: string): Promise<AgeGroup> {
    const name = cleanName(rawName);
    const existing = await this.findByName(sportId, name);
    if (existing) return existing;

    const id = uuidv4();
    await this.query(
      `INSERT INTO sport_age_groups (id, sport_id, name, is_official, created_by, created_org_id)
       VALUES ($1, $2, $3, false, $4, $5)
       ON CONFLICT DO NOTHING`,
      [id, sportId, name, userId || null, orgId || null]
    );
    // A concurrent add of the same name wins the unique index; return whichever row exists.
    return (await this.getAgeGroup(id)) || (await this.findByName(sportId, name))!;
  }

  /** Adds to the end of the official list. A custom entry of that name is promoted instead. */
  async addOfficial(sportId: string, rawName: unknown): Promise<AgeGroup> {
    const name = cleanName(rawName);
    const existing = await this.findByName(sportId, name);
    if (existing?.isOfficial) throw new AgeGroupError(`"${existing.name}" is already on the official list.`);
    if (existing) return (await this.update(existing.id, { isOfficial: true }))!;

    const id = uuidv4();
    await this.query(
      `INSERT INTO sport_age_groups (id, sport_id, name, sort_order, is_official) VALUES ($1, $2, $3, $4, true)`,
      [id, sportId, name, await this.nextSortOrder(sportId)]
    );
    return (await this.getAgeGroup(id))!;
  }

  /** New sports start from the same list the seed gives the built-in ones. */
  async addStarterList(sportId: string): Promise<void> {
    for (let i = 0; i < STARTER_AGE_GROUPS.length; i++) {
      await this.query(
        `INSERT INTO sport_age_groups (id, sport_id, name, sort_order, is_official)
         VALUES ($1, $2, $3, $4, true) ON CONFLICT DO NOTHING`,
        [starterAgeGroupId(sportId, STARTER_AGE_GROUPS[i]), sportId, STARTER_AGE_GROUPS[i], i]
      );
    }
  }

  /**
   * Rename, promote or demote. Renaming changes what every holder shows, since they hold the id —
   * which is the point, and why a rename cannot take a name another entry already has.
   */
  async update(id: string, data: { name?: unknown; isOfficial?: boolean }): Promise<AgeGroup | undefined> {
    const current = await this.getAgeGroup(id);
    if (!current) return undefined;

    if (data.name !== undefined) {
      const name = cleanName(data.name);
      const clash = await this.findByName(current.sportId, name);
      if (clash && clash.id !== id) {
        throw new AgeGroupError(`"${clash.name}" already exists. Merge into it instead of renaming.`);
      }
      await this.query(`UPDATE sport_age_groups SET name = $1 WHERE id = $2`, [name, id]);
    }

    if (data.isOfficial !== undefined && data.isOfficial !== current.isOfficial) {
      // A promoted entry joins the end of the official list; a demoted one's order stops mattering.
      const sortOrder = data.isOfficial ? await this.nextSortOrder(current.sportId) : 0;
      await this.query(
        `UPDATE sport_age_groups SET is_official = $1, sort_order = $2 WHERE id = $3`,
        [data.isOfficial, sortOrder, id]
      );
    }
    return this.getAgeGroup(id);
  }

  /** Sets the official list's order to the order of `orderedIds`. */
  async reorder(sportId: string, orderedIds: string[]): Promise<void> {
    await this.transaction(async (tx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx(
          `UPDATE sport_age_groups SET sort_order = $1 WHERE id = $2 AND sport_id = $3 AND is_official`,
          [i, orderedIds[i], sportId]
        );
      }
    });
  }

  /** Deletes an entry nothing holds. One in use has to be merged into another instead. */
  async delete(id: string): Promise<boolean> {
    const usage = await this.query(
      HOLDERS.map((table) => `SELECT count(*)::int as n FROM ${table} WHERE age_group_id = $1`).join(' UNION ALL '),
      [id]
    );
    if (usage.rows.some((row: { n: number }) => row.n > 0)) {
      throw new AgeGroupError('That age group is in use. Merge it into another instead of deleting it.');
    }
    const res = await this.query(`DELETE FROM sport_age_groups WHERE id = $1`, [id]);
    return (res.rowCount || 0) > 0;
  }

  /**
   * Moves every team, division and league holding `fromId` to `intoId`, then deletes `fromId`.
   * One transaction, so a merge never leaves the list half-tidied. Both entries must be of the
   * same sport — the foreign key would refuse the repoint otherwise, but with a worse message.
   */
  async merge(fromId: string, intoId: string): Promise<{ moved: number }> {
    if (fromId === intoId) throw new AgeGroupError('Choose a different age group to merge into.');
    const [from, into] = await Promise.all([this.getAgeGroup(fromId), this.getAgeGroup(intoId)]);
    if (!from || !into) throw new AgeGroupError('One of those age groups no longer exists.');
    if (from.sportId !== into.sportId) throw new AgeGroupError('Age groups of different sports cannot be merged.');

    return this.transaction(async (tx) => {
      let moved = 0;
      for (const table of HOLDERS) {
        const res = await tx(`UPDATE ${table} SET age_group_id = $1 WHERE age_group_id = $2`, [intoId, fromId]);
        moved += res.rowCount || 0;
      }
      await tx(`DELETE FROM sport_age_groups WHERE id = $1`, [fromId]);
      return { moved };
    });
  }
}

export const ageGroupManager = new AgeGroupManager();
