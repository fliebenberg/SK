import { Organization, OrganizationRole, levenshtein, Address, PaginationParams, PaginatedResponse, deriveOrgShortCode, normalizeOrgShortCode, OrgMinorsSettings, isValidMinorAge, minorsSettingsOf, isTimeZone, DEFAULT_TIME_ZONE } from "@sk/shared";
import { BaseManager } from "./BaseManager";
import { imageService } from "../services/ImageService";
import { addressManager } from "./AddressManager";

/**
 * Live-computed organization counts, exposed as `c.team_count` / `c.site_count` / `c.member_count`.
 *
 * These were previously denormalized columns on `organizations`, maintained by background jobs.
 * That could not be made reliable: `member_count` depends on the clock (a membership lapses when
 * `end_date` passes, with no accompanying write), so no trigger can maintain it and any cached
 * copy drifts. Deriving them makes them correct by construction.
 *
 * Append to a query whose `organizations` row is aliased `o`. Callers are paginated, so this is
 * evaluated per page rather than per table.
 */
const ORG_COUNTS_JOIN = `
      LEFT JOIN LATERAL (
        SELECT
          (SELECT COUNT(*)::int FROM teams t WHERE t.org_id = o.id AND t.is_active = true) as team_count,
          (SELECT COUNT(*)::int FROM sites s WHERE s.org_id = o.id) as site_count,
          (SELECT COUNT(*)::int FROM org_memberships om WHERE om.org_id = o.id AND (om.end_date IS NULL OR om.end_date > NOW())) as member_count
      ) c ON true`;

export class OrganizationManager extends BaseManager {
  private organizationCache: Map<string, Organization> = new Map();
  private cacheLoaded: boolean = false;

  organizationRoles: OrganizationRole[] = [
    { id: "role-org-admin", name: "Admin" },
    { id: "role-org-staff", name: "Staff" },
    { id: "role-org-member", name: "Member" },
  ];

  async getOrganizations(params?: PaginationParams): Promise<PaginatedResponse<Organization>> {
    const page = params?.page || 1;
    const limit = Math.min(params?.limit || 100, 100);
    const offset = (page - 1) * limit;
    const search = params?.search?.trim() || '';

    let countQuery = 'SELECT COUNT(*) FROM organizations o';
    let dataQuery = `
      SELECT 
        o.id, 
        o.name, 
        o.logo, 
        o.primary_color as "primaryColor", 
        o.secondary_color as "secondaryColor", 
        ARRAY(SELECT sport_id FROM organization_sports WHERE org_id = o.id) as "supportedSportIds", 
        o.short_name as "shortName", 
        ARRAY(SELECT role_id FROM organization_roles WHERE org_id = o.id) as "supportedRoleIds",
        o.is_claimed as "isClaimed",
        o.creator_id as "creatorId", 
        o.is_active as "isActive",
        o.settings,
        o.type,
        o.custom_type as "customType",
        o.timezone,
        o.address_id as "addressId",
        a.full_address as "fullAddress",
        a.city,
        a.province,
        a.postal_code as "postalCode",
        a.country,
        a.latitude,
        a.longitude,
        c.team_count as "teamCount",
        c.site_count as "siteCount",
        (SELECT COUNT(*)::int FROM events e WHERE (e.org_id = o.id OR EXISTS (SELECT 1 FROM event_organizations eo WHERE eo.event_id = e.id AND eo.org_id = o.id) OR EXISTS (SELECT 1 FROM games g JOIN game_participants gp ON gp.game_id = g.id JOIN teams t ON gp.team_id = t.id WHERE g.event_id = e.id AND t.org_id = o.id)) AND (e.start_date IS NULL OR COALESCE(e.end_date, e.start_date) >= CURRENT_DATE)) as "eventCount",
        c.member_count as "memberCount"
      FROM organizations o
      LEFT JOIN addresses a ON o.address_id = a.id${ORG_COUNTS_JOIN}
    `;

    const queryParams: any[] = [];
    const whereClauses: string[] = [];

    if (search) {
        whereClauses.push(`(o.name ILIKE $${queryParams.length + 1} OR o.short_name ILIKE $${queryParams.length + 1})`);
        queryParams.push(`%${search}%`);
    }

    if (params?.orgId) {
        whereClauses.push(`o.id = $${queryParams.length + 1}`);
        queryParams.push(params.orgId);
    }

    if (params?.isClaimed !== undefined) {
        whereClauses.push(`o.is_claimed = $${queryParams.length + 1}`);
        queryParams.push(params.isClaimed);
    }

    const whereString = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';
    countQuery += whereString;
    dataQuery += whereString;

    dataQuery += ` ORDER BY o.name ASC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    
    try {
        const [countRes, dataRes] = await Promise.all([
            this.query(countQuery, queryParams),
            this.query(dataQuery, [...queryParams, limit, offset])
        ]);

        const items = dataRes.rows.map(row => this.mapOrg(row));
        const total = parseInt(countRes.rows[0].count);

        return {
            items,
            total,
            page,
            limit
        };
    } catch (error) {
        console.error('OrganizationManager.getOrganizations error:', error);
        console.error('Count Query:', countQuery);
        console.error('Data Query:', dataQuery);
        console.error('Params:', queryParams);
        throw error;
    }
  }

  private mapOrg(row: any): Organization {
    const { 
      fullAddress, city, province, postalCode, country, latitude, longitude, addressId,
      ...orgData 
    } = row;
    
    const org: Organization = { ...orgData, addressId };
    
    if (addressId) {
      org.address = {
        id: addressId,
        fullAddress,
        city,
        province,
        postalCode,
        country,
        latitude,
        longitude
      };
    }
    
    return org;
  }

  async getOrganization(id?: string): Promise<Organization | undefined> {
    if (!id) return undefined;
    
    // Check cache first
    if (this.organizationCache.has(id)) {
        return this.organizationCache.get(id);
    }

    const res = await this.query(`
      SELECT 
        o.id, 
        o.name, 
        o.logo, 
        o.primary_color as "primaryColor", 
        o.secondary_color as "secondaryColor", 
        ARRAY(SELECT sport_id FROM organization_sports WHERE org_id = o.id) as "supportedSportIds", 
        o.short_name as "shortName", 
        ARRAY(SELECT role_id FROM organization_roles WHERE org_id = o.id) as "supportedRoleIds",
        o.is_claimed as "isClaimed",
        o.creator_id as "creatorId",
        o.is_active as "isActive",
        o.settings,
        o.type,
        o.custom_type as "customType",
        o.timezone,
        o.address_id as "addressId",
        a.full_address as "fullAddress",
        a.city,
        a.province,
        a.postal_code as "postalCode",
        a.country,
        a.latitude,
        a.longitude,
        c.team_count as "teamCount",
        c.site_count as "siteCount",
        (SELECT COUNT(*)::int FROM events e WHERE (e.org_id = o.id OR EXISTS (SELECT 1 FROM event_organizations eo WHERE eo.event_id = e.id AND eo.org_id = o.id) OR EXISTS (SELECT 1 FROM games g JOIN game_participants gp ON gp.game_id = g.id JOIN teams t ON gp.team_id = t.id WHERE g.event_id = e.id AND t.org_id = o.id)) AND (e.start_date IS NULL OR COALESCE(e.end_date, e.start_date) >= CURRENT_DATE)) as "eventCount",
        c.member_count as "memberCount"
      FROM organizations o
      LEFT JOIN addresses a ON o.address_id = a.id${ORG_COUNTS_JOIN}
      WHERE o.id = $1
    `, [id]);

    const org = res.rows[0] ? this.mapOrg(res.rows[0]) : undefined;
    if (org) {
        this.organizationCache.set(org.id, org);
    }
    return org;
  }

  /**
   * Re-reads a single organization, bypassing the in-memory cache, and refreshes that cache entry.
   *
   * Counts are computed live by the query (see {@link ORG_COUNTS_JOIN}), so this is a pure read —
   * it exists to pick up changes made by a mutation and to feed the `org:{id}:summary` broadcast.
   */
  async getOrgSummary(id: string): Promise<Organization | undefined> {
    this.organizationCache.delete(id);
    return this.getOrganization(id);
  }

  invalidateCache() {
    this.organizationCache.clear();
    this.cacheLoaded = false;
  }

  /**
   * A short code, required since 2026-09-20 — derived from the name rather than refused.
   *
   * Every create screen pre-fills the field, so a caller arriving here without one is a script, an
   * older client or a path nobody remembered. Deriving is the right answer for all three: the code
   * is structural on the entrants screen, and an organisation that reaches the database without
   * one breaks a column there rather than at the point of creation where somebody could fix it.
   * The refusal is kept for the case deriving cannot help — no name either.
   */
  private requireShortCode(shortName: string | undefined | null, name: string | undefined): string {
    const code = normalizeOrgShortCode(shortName) || deriveOrgShortCode(name);
    if (!code) throw new Error('An organisation needs a short code.');
    return code;
  }

  /** A timezone the app can convert kick-offs with, or a refusal a person can read. */
  private requireTimeZone(value: unknown): string {
    if (!isTimeZone(value)) throw new Error('Choose a timezone from the list.');
    return value;
  }

  async addOrganization(org: Omit<Organization, "id"> & { id?: string }): Promise<Organization> {
    const id = org.id || `org-${Date.now()}`;
    const supportedSportIds = org.supportedSportIds || [];
    const supportedRoleIds = org.supportedRoleIds || [];
    const shortName = this.requireShortCode(org.shortName, org.name);
    // The creator's device timezone, sent by the create screens (`DATE-2`). An older client or a
    // script sends none, and gets the one every organisation had before timezones existed.
    const timezone = org.timezone === undefined ? DEFAULT_TIME_ZONE : this.requireTimeZone(org.timezone);
    
    let addressId = org.addressId;
    if (org.address && !addressId) {
      const newAddr = await addressManager.addAddress(org.address);
      addressId = newAddr.id;
    }

    const image = await imageService.stage('logos', org.logo, id);
    const logo = image.value ?? null;

    try {
        await this.transaction(async (tx) => {
            await tx(
              `INSERT INTO organizations (id, name, logo, primary_color, secondary_color, short_name, is_claimed, creator_id, is_active, settings, address_id, type, custom_type, timezone) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
              [id, org.name, logo, org.primaryColor, org.secondaryColor, shortName, org.isClaimed || false, org.creatorId, org.isActive !== undefined ? org.isActive : true, org.settings || { allowUserImageUpdates: false }, addressId, org.type || 'OTHER', org.customType || null, timezone]
            );

            for (const sportId of supportedSportIds) {
                await tx('INSERT INTO organization_sports (org_id, sport_id) VALUES ($1, $2)', [id, sportId]);
            }

            for (const roleId of supportedRoleIds) {
                await tx('INSERT INTO organization_roles (org_id, role_id) VALUES ($1, $2)', [id, roleId]);
            }
        });
    } catch (error) {
        await image.discard();
        throw error;
    }

    // Don't fully invalidate, just add the new one or refresh if it exists
    return this.getOrgSummary(id) as Promise<Organization>;
  }

  /**
   * The organisation's minors settings (`MEMBER-3`): whether minors may have their own account, and
   * the age below which a player is a minor. The only writer of `settings.minors`.
   */
  async setMinorsSettings(orgId: string, input: { accountsAllowed: boolean; minorAge: number }): Promise<OrgMinorsSettings> {
    if (typeof input.accountsAllowed !== 'boolean') {
      throw new Error('Say whether minors may have their own account.');
    }
    if (!isValidMinorAge(input.minorAge)) {
      throw new Error('The minor age must be a whole number from 1 to 21.');
    }
    const minors: OrgMinorsSettings = { accountsAllowed: input.accountsAllowed, minorAge: input.minorAge };
    const res = await this.query(
      `UPDATE organizations
          SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{minors}', $2::jsonb, true)
        WHERE id = $1
        RETURNING settings`,
      [orgId, JSON.stringify(minors)]
    );
    if (!res.rowCount) throw new Error('That organisation does not exist.');
    this.invalidateCache();
    return minorsSettingsOf(res.rows[0].settings);
  }

  async updateOrganization(id: string, data: Partial<Organization>): Promise<Organization | null> {
    // An update that *names* the short code may not blank it. Deriving a replacement would be
    // wrong here in a way it is not on create: the organisation already has a code people have
    // seen, and silently swapping it for initials is worse than telling the editor to type one.
    // An update that does not mention `shortName` at all leaves the existing code alone.
    if ('shortName' in data) {
      const code = normalizeOrgShortCode(data.shortName);
      if (!code) throw new Error('An organisation needs a short code.');
      data.shortName = code;
    }

    if ('timezone' in data) data.timezone = this.requireTimeZone(data.timezone);

    // `settings` arrives whole — the settings screen carries the object across — so a screen opened
    // before a minors change would silently undo it on save. The minors settings are written by
    // `setMinorsSettings` alone, behind their own action and gate (`MEMBER-3`); here they are kept.
    if (data.settings !== undefined) {
      const stored = await this.query('SELECT settings FROM organizations WHERE id = $1', [id]);
      const { minors: _ignored, ...rest } = (data.settings || {}) as Record<string, any>;
      const storedMinors = stored.rows[0]?.settings?.minors;
      data.settings = storedMinors !== undefined ? { ...rest, minors: storedMinors } : rest;
    }

    // Handle Address update
    if (data.address) {
      const currentOrg = await this.getOrganization(id);
      if (currentOrg?.addressId) {
        await addressManager.updateAddress(currentOrg.addressId, data.address);
      } else {
        const newAddr = await addressManager.addAddress(data.address);
        data.addressId = newAddr.id;
      }
      delete data.address; // Don't try to update the column directly
    }

    // Staged last before the write, so nothing above can fail with an upload already on disk.
    // The previous value is read from the table, not the org cache, which may be stale.
    const previousLogo = data.logo !== undefined
      ? (await this.query('SELECT logo FROM organizations WHERE id = $1', [id])).rows[0]?.logo
      : undefined;
    const image = await imageService.stage('logos', data.logo, id);
    if (image.value !== undefined) data.logo = image.value ?? '';

    try {
        await this.transaction(async (tx) => {
            const supportedSportIds = data.supportedSportIds;
            const supportedRoleIds = data.supportedRoleIds;
            delete data.supportedSportIds;
            delete data.supportedRoleIds;

            const keys = Object.keys(data).filter(k => k !== 'id');
            if (keys.length > 0) {
                const setClauses: string[] = [];
                const values: any[] = [];
                let idx = 1;

                const map: Record<string, string> = {
                    name: 'name', logo: 'logo', primaryColor: 'primary_color', secondaryColor: 'secondary_color',
                    shortName: 'short_name', isClaimed: 'is_claimed', creatorId: 'creator_id', 
                    isActive: 'is_active', settings: 'settings', addressId: 'address_id',
                    type: 'type', customType: 'custom_type', timezone: 'timezone'
                };

                keys.forEach(key => {
                    if (map[key]) {
                        setClauses.push(`${map[key]} = $${idx}`);
                        values.push((data as any)[key]);
                        idx++;
                    }
                });

                if (setClauses.length > 0) {
                    values.push(id);
                    await tx(
                        `UPDATE organizations SET ${setClauses.join(', ')} WHERE id = $${idx}`,
                        values
                    );
                }
            }

            if (supportedSportIds !== undefined) {
                await tx('DELETE FROM organization_sports WHERE org_id = $1', [id]);
                for (const sportId of supportedSportIds) {
                    await tx('INSERT INTO organization_sports (org_id, sport_id) VALUES ($1, $2)', [id, sportId]);
                }
                // Deactivate teams for sports that are no longer supported
                await tx(
                    'UPDATE teams SET is_active = false WHERE org_id = $1 AND NOT (sport_id = ANY($2))',
                    [id, supportedSportIds]
                );
            }

            if (supportedRoleIds !== undefined) {
                await tx('DELETE FROM organization_roles WHERE org_id = $1', [id]);
                for (const roleId of supportedRoleIds) {
                    await tx('INSERT INTO organization_roles (org_id, role_id) VALUES ($1, $2)', [id, roleId]);
                }
            }
        });
    } catch (error) {
        await image.discard();
        throw error;
    }
    await image.commit(previousLogo);

    // Only refresh this specific org's summary/cache
    return this.getOrgSummary(id).then(r => r || null);
  }

  async getOrganizationRoles(): Promise<OrganizationRole[]> {
    return this.organizationRoles;
  }

  getOrganizationRole(id: string) {
    return this.organizationRoles.find(r => r.id === id);
  }

  async searchSimilarOrganizations(name: string): Promise<Organization[]> {
    const query = name.trim().toLowerCase();
    if (!query) return [];

    const queryParts = query.split(/\s+/).filter(p => p.length > 0);
    const paginated = await this.getOrganizations({ page: 1, limit: 1000, search: name });
    const allOrgs: Organization[] = paginated.items;

    const scored = allOrgs.map((org: Organization) => {
        const orgName = org.name.toLowerCase();
        const shortName = (org.shortName || "").toLowerCase();
        const orgParts = orgName.split(/\s+/).concat(shortName ? [shortName] : []);

        let score = 0;
        
        // 1. Exact / StartsWith Bonus
        if (orgName === query) score += 100;
        else if (orgName.startsWith(query)) score += 20;
        
        if (shortName === query) score += 50;

        // 2. Word Matching with Fuzzy Logic
        queryParts.forEach(qPart => {
            let bestWordScore = 0;
            
            for (const oPart of orgParts) {
                // Exact word match
                if (oPart === qPart) {
                    bestWordScore = 10;
                    break; 
                }
                
                // Starts with match (for partial typing "Sch" -> "School")
                if (oPart.startsWith(qPart)) {
                    bestWordScore = Math.max(bestWordScore, 5);
                }

                // Fuzzy match (Levenshtein)
                // Only if word is at least 3 chars to avoid "a" matching "b" too easily with edit dist 1
                if (qPart.length > 2 && oPart.length > 2) {
                     const dist = levenshtein(qPart, oPart);
                     // Allow 1 error for words up to 5 chars, 2 errors for longer
                     const maxErrors = qPart.length > 5 ? 2 : 1;
                     if (dist <= maxErrors) {
                         bestWordScore = Math.max(bestWordScore, 3);
                     }
                }
            }
            score += bestWordScore;
        });

        return { org, score };
    });

    const results = scored
        .filter((item: { org: Organization; score: number }) => item.score > 0)
        .sort((a: { org: Organization; score: number }, b: { org: Organization; score: number }) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.org.name.length - b.org.name.length; // shorter name first
        })
        .map((item: { org: Organization; score: number }) => item.org)
        .slice(0, 5);

    return results;
  }

  async syncClaimedStatus(orgId: string): Promise<void> {
    const res = await this.query(`
      SELECT COUNT(*)::int as count 
      FROM org_memberships 
      WHERE org_id = $1 AND role_id = 'role-org-admin' AND (end_date IS NULL OR end_date > NOW())
    `, [orgId]);
    
    const isClaimed = res.rows[0].count > 0;
    await this.query('UPDATE organizations SET is_claimed = $1 WHERE id = $2', [isClaimed, orgId]);
    await this.getOrgSummary(orgId);
  }

  async deleteOrganization(id: string): Promise<void> {
    // Dependency checks
    const countsRes = await this.query(`
      SELECT 
        (SELECT COUNT(*)::int FROM teams WHERE org_id = $1) as teams,
        (SELECT COUNT(*)::int FROM sites WHERE org_id = $1) as sites,
        (SELECT COUNT(*)::int FROM events WHERE org_id = $1 OR EXISTS (SELECT 1 FROM event_organizations eo WHERE eo.event_id = events.id AND eo.org_id = $1) OR EXISTS (SELECT 1 FROM games g JOIN game_participants gp ON gp.game_id = g.id JOIN teams t ON gp.team_id = t.id WHERE g.event_id = events.id AND t.org_id = $1)) as events,
        (SELECT COUNT(*)::int FROM org_memberships WHERE org_id = $1 AND (end_date IS NULL OR end_date > NOW())) as active_people
    `, [id]);

    const { teams, sites, events, active_people } = countsRes.rows[0];

    if (teams > 0 || sites > 0 || events > 0 || active_people > 0) {
      let reason = "it has ";
      const parts = [];
      if (teams > 0) parts.push(`${teams} teams`);
      if (sites > 0) parts.push(`${sites} sites`);
      if (events > 0) parts.push(`${events} events`);
      if (active_people > 0) parts.push(`${active_people} linked people`);
      
      throw new Error(`Cannot delete organization: ${reason}${parts.join(', ')}.`);
    }

    const logo = (await this.query('SELECT logo FROM organizations WHERE id = $1', [id])).rows[0]?.logo;

    await this.transaction(async (tx) => {
        await tx('DELETE FROM org_memberships WHERE org_id = $1', [id]);
        await tx('DELETE FROM organization_sports WHERE org_id = $1', [id]);
        await tx('DELETE FROM organization_roles WHERE org_id = $1', [id]);
        await tx('DELETE FROM organizations WHERE id = $1', [id]);
    });
    // Only once the row is gone, so a failed delete leaves the logo it still shows.
    await imageService.release('logos', logo);
    
    this.organizationCache.delete(id);
  }
}

export const organizationManager = new OrganizationManager();
