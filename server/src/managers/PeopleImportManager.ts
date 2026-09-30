import { randomUUID } from 'crypto';
import {
  BatchItemError,
  GuardianRelationship,
  NormalizedPeopleImportRow,
  PEOPLE_IMPORT_MAX_ROWS,
  PeopleImportReport,
  PeopleImportRow,
  PeopleImportRowResult,
  cellphoneDigits,
  guardianLinkProblem,
  memberAccess,
  minorsSettingsOf,
  normalizeEmail,
  normalizePeopleImportRow,
} from '@sk/shared';
import { BaseManager, Tx } from './BaseManager';
import { organizationManager } from './OrganizationManager';

/**
 * Importing an organisation's people and their guardians (`IMPORT_ORG_PEOPLE`).
 *
 * Reading the sheet, and what a row may say, is `@sk/shared`'s `peopleImport.ts`. This is the half
 * only the server can do: matching rows to the people already on record, and writing the result.
 * The rules are in docs/identity_structure.md §8; the ones that protect access are repeated where
 * they are applied, because each is a way an import could hand somebody's access to somebody else.
 *
 * **One plan, used twice.** A preview and an apply run the same {@link PeopleImportManager.plan}, so
 * what the admin approved is what is written. An apply plans again inside its transaction, holding
 * the organisation's row, rather than trusting the preview: time has passed, and somebody else may
 * have added a person since.
 *
 * **Deliberately not done by an import**, whatever the sheet says:
 *  - **Nobody is removed** — a person missing from the sheet is left alone.
 *  - **Nobody is made an Admin, and no Admin's role is changed.** Those decide who runs the
 *    organisation, and are made one at a time on the person's profile.
 *  - **The email of a person who is on ScoreKeeper is not changed.** Access is matched by email, so
 *    changing it moves the person's access to whoever owns the new address.
 *  - **A guardian on record is linked, not edited.** Their details may have been kept up by the
 *    guardian themselves; a school's sheet is not the better source.
 *  - **A guardian link is never ended or re-ranked.** The first guardian a player gets is their
 *    primary one, exactly as `GuardianManager.addGuardian` decides it.
 */

const SYSTEM_ADMIN_ORG = 'org-system-admins';
const ROLE_ADMIN = 'role-org-admin';
const ROLE_MEMBER = 'role-org-member';

const ACTIVE = (alias: string) => `(${alias}.end_date IS NULL OR ${alias}.end_date > NOW())`;

/** A refusal of the whole import, as opposed to one row. */
export class PeopleImportError extends Error {}

interface ExistingProfile {
  id: string;
  name: string;
  email: string | null;
  cellphone: string | null;
  birthdate: string | null;
  nationalId: string | null;
  identifier: string | null;
  userId: string | null;
  ownAccountAllowed: boolean | null;
}

/** A person as they will be once the import is written: matched on record, or new. */
interface Person {
  id: string;
  rowIndex: number;
  name: string;
  email?: string;
  birthdate?: string | null;
  ownAccountAllowed: boolean | null;
  hasAccount: boolean;
  isSystemAdmin: boolean;
}

/** A guardian a row names: a person row in this sheet, a profile on record, or a new profile. */
interface GuardianTarget {
  id: string;
  name: string;
  email?: string;
  hasAccount: boolean;
  isSystemAdmin: boolean;
  /** A new guardian-only profile, and what to create it with. */
  create?: { name: string; email?: string; cellphone?: string };
  /** The row whose own person this is, when the guardian is also in the sheet. */
  personRowIndex?: number;
}

interface NewProfile {
  id: string;
  name: string;
  email?: string;
  cellphone?: string;
  birthdate?: string;
  nationalId?: string;
  identifier?: string;
}

interface RowWrites {
  newProfile?: NewProfile;
  profileUpdate?: { id: string; set: Record<string, string> };
  newMembership?: { id: string; profileId: string; roleId: string };
  roleChange?: { id: string; profileId: string; roleId: string };
  newLinks: { id: string; guardian: GuardianTarget; playerId: string; relationship: GuardianRelationship; isPrimary: boolean }[];
}

/** What changed, for publishing once the import is committed. */
export interface PeopleImportEffects {
  orgId: string;
  /** Given a membership by this import, with the role — their accounts are told they were added. */
  newMemberships: { profileId: string; roleId: string }[];
  /** Whose existing membership changed role. */
  roleChangedProfileIds: string[];
  /** People on record whose details changed. */
  updatedProfileIds: string[];
  /** Players given a guardian. */
  playersWithNewGuardians: string[];
}

interface Plan {
  report: PeopleImportReport;
  errors: BatchItemError[];
  writes: RowWrites[];
  effects: PeopleImportEffects;
}

/** Column names for changes, as the admin knows them from the template. */
const FIELD_LABELS: Record<string, string> = {
  name: 'Full name',
  email: 'Email',
  cellphone: 'Cellphone',
  birthdate: 'Birthdate',
  national_id: 'National ID',
  identifier: 'Member ID',
};

const lower = (text: string | null | undefined) => (text || '').trim().toLowerCase();

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function roleName(roleId: string): string {
  return organizationManager.getOrganizationRole(roleId)?.name || roleId;
}

export class PeopleImportManager extends BaseManager {
  /** What an import would do, row by row. Writes nothing. */
  async preview(orgId: string, rows: PeopleImportRow[]): Promise<PeopleImportReport> {
    const plan = await this.plan((text, params) => this.query(text, params), orgId, rows, 'preview');
    return plan.report;
  }

  /**
   * Write an import: every row, in one transaction — or, if any row is refused, nothing, with the
   * refusals in `errors`. Planned again here rather than trusted from the preview.
   */
  async apply(
    orgId: string,
    rows: PeopleImportRow[],
    actorProfileId: string | null
  ): Promise<{ report: PeopleImportReport; errors: BatchItemError[]; effects?: PeopleImportEffects }> {
    return this.transaction(async (tx) => {
      // One import into an organisation at a time. A second waits here, then plans against what the
      // first wrote — so the same new person in both is added once, not twice.
      await tx('SELECT id FROM organizations WHERE id = $1 FOR UPDATE', [orgId]);
      const plan = await this.plan(tx, orgId, rows, 'apply');
      if (plan.errors.length) return { report: plan.report, errors: plan.errors };
      await this.write(tx, orgId, plan.writes, actorProfileId);
      return { report: plan.report, errors: [], effects: plan.effects };
    });
  }

  /**
   * For publishing after an import: the teams whose rosters show these profiles, the players whose
   * guardian lists show them, and the accounts linked to them (by `user_id` or email, as
   * `AccessManager.getUserIdsForOrgProfile` matches, for many profiles at once).
   */
  async publishTargets(profileIds: string[]): Promise<{
    teamIds: string[];
    guardianListPlayerIds: string[];
    accounts: { profileId: string; userId: string }[];
  }> {
    if (!profileIds.length) return { teamIds: [], guardianListPlayerIds: [], accounts: [] };
    const teams = await this.query(
      `SELECT DISTINCT tm.team_id AS "teamId" FROM team_memberships tm
        WHERE tm.org_profile_id = ANY($1) AND ${ACTIVE('tm')}`,
      [profileIds]
    );
    const players = await this.query(
      `SELECT DISTINCT pg.player_profile_id AS "playerId" FROM profile_guardians pg
        WHERE pg.guardian_profile_id = ANY($1) AND ${ACTIVE('pg')}`,
      [profileIds]
    );
    const accounts = await this.query(
      `SELECT DISTINCT op.id AS "profileId", u.id AS "userId"
         FROM org_profiles op
         JOIN users u ON u.id = op.user_id
              OR EXISTS (SELECT 1 FROM user_emails ue
                          WHERE ue.user_id = u.id AND ue.email = op.email AND ue.verified_at IS NOT NULL)
              OR u.email = op.email
        WHERE op.id = ANY($1)`,
      [profileIds]
    );
    return {
      teamIds: teams.rows.map((r: any) => r.teamId),
      guardianListPlayerIds: players.rows.map((r: any) => r.playerId),
      accounts: accounts.rows,
    };
  }

  // -----------------------------------------------------------------------------------------------
  // Planning
  // -----------------------------------------------------------------------------------------------

  private async plan(q: Tx, orgId: string, input: PeopleImportRow[], mode: 'preview' | 'apply'): Promise<Plan> {
    if (orgId === SYSTEM_ADMIN_ORG) {
      throw new PeopleImportError("People cannot be imported into the system administrators' organisation.");
    }
    if (!Array.isArray(input) || input.length === 0) throw new PeopleImportError('There are no people to import.');
    if (input.length > PEOPLE_IMPORT_MAX_ROWS) {
      throw new PeopleImportError(`One import can take at most ${PEOPLE_IMPORT_MAX_ROWS} people; this one has ${input.length}. Split it into smaller files.`);
    }

    const org = (await q('SELECT id, name, settings FROM organizations WHERE id = $1', [orgId])).rows[0];
    if (!org) throw new PeopleImportError('That organisation does not exist.');
    const minors = minorsSettingsOf(org.settings);

    const normalized = input.map((raw, index) => {
      const checked = normalizePeopleImportRow({ ...(raw || {}), rowNumber: Number(raw?.rowNumber) || index + 1 });
      return { ...checked, errors: [...checked.errors] };
    });

    // --- What is on record -----------------------------------------------------------------------

    const profiles: ExistingProfile[] = (await q(
      `SELECT id, name, email, cellphone, birthdate, national_id AS "nationalId", identifier,
              user_id AS "userId", own_account_allowed AS "ownAccountAllowed"
         FROM org_profiles WHERE org_id = $1`,
      [orgId]
    )).rows;
    // Admin first, so a person holding more than one active role is seen as the Admin they are.
    const memberships: { id: string; profileId: string; roleId: string }[] = (await q(
      `SELECT om.id, om.org_profile_id AS "profileId", om.role_id AS "roleId"
         FROM org_memberships om
        WHERE om.org_id = $1 AND ${ACTIVE('om')}
        ORDER BY CASE WHEN om.role_id = '${ROLE_ADMIN}' THEN 0 ELSE 1 END`,
      [orgId]
    )).rows;
    const links: { guardianId: string; playerId: string }[] = (await q(
      `SELECT pg.guardian_profile_id AS "guardianId", pg.player_profile_id AS "playerId"
         FROM profile_guardians pg WHERE pg.org_id = $1 AND ${ACTIVE('pg')}`,
      [orgId]
    )).rows;

    const emails = new Set<string>();
    for (const p of profiles) if (p.email) emails.add(lower(p.email));
    for (const n of normalized) {
      if (n.row.email) emails.add(n.row.email);
      for (const g of n.row.guardians) if (g.email) emails.add(g.email);
    }
    const accountEmails = new Set<string>((await q(
      `SELECT LOWER(email) AS email FROM users WHERE LOWER(email) = ANY($1)
       UNION
       SELECT LOWER(email) FROM user_emails WHERE LOWER(email) = ANY($1) AND verified_at IS NOT NULL`,
      [[...emails]]
    )).rows.map((r: any) => r.email));

    // System administrators use dedicated accounts that may belong to no other organisation — the
    // same rule `ADD_ORG_MEMBER` applies, by account and by address.
    const sysUsers = (await q(
      `SELECT DISTINCT user_id AS id FROM org_profiles WHERE org_id = $1 AND user_id IS NOT NULL`,
      [SYSTEM_ADMIN_ORG]
    )).rows.map((r: any) => r.id);
    const systemAdminUserIds = new Set<string>(sysUsers);
    const systemAdminEmails = new Set<string>((await q(
      `SELECT LOWER(email) AS email FROM org_profiles WHERE org_id = $1 AND email IS NOT NULL
       UNION SELECT LOWER(email) FROM users WHERE id = ANY($2) AND email IS NOT NULL
       UNION SELECT LOWER(email) FROM user_emails WHERE user_id = ANY($2)`,
      [SYSTEM_ADMIN_ORG, sysUsers]
    )).rows.map((r: any) => r.email));

    const byIdentifier = new Map<string, ExistingProfile>();
    const byEmail = new Map<string, ExistingProfile[]>();
    const byName = new Map<string, ExistingProfile[]>();
    for (const p of profiles) {
      if (p.identifier) byIdentifier.set(p.identifier, p);
      if (p.email) pushTo(byEmail, lower(p.email), p);
      pushTo(byName, lower(p.name), p);
    }
    const membershipOf = new Map<string, { id: string; roleId: string }>();
    for (const m of memberships) if (!membershipOf.has(m.profileId)) membershipOf.set(m.profileId, m);
    const linked = new Set(links.map(l => `${l.guardianId}|${l.playerId}`));
    const linkCount = new Map<string, number>();
    for (const l of links) linkCount.set(l.playerId, (linkCount.get(l.playerId) || 0) + 1);
    // Emails a person may not take, because a guardian or child of theirs has it (`MEMBER-3`).
    const linkedEmails = new Map<string, string[]>();
    const emailOf = new Map(profiles.map(p => [p.id, lower(p.email)]));
    for (const l of links) {
      pushTo(linkedEmails, l.playerId, emailOf.get(l.guardianId) || '');
      pushTo(linkedEmails, l.guardianId, emailOf.get(l.playerId) || '');
    }

    const hasAccount = (p: ExistingProfile) => !!p.userId || (!!p.email && accountEmails.has(lower(p.email)));
    const isSystemAdmin = (p: ExistingProfile) =>
      (!!p.userId && systemAdminUserIds.has(p.userId)) || (!!p.email && systemAdminEmails.has(lower(p.email)));

    // --- The same person twice in one sheet --------------------------------------------------------

    const rowsWith = (key: (row: NormalizedPeopleImportRow) => string | undefined) => {
      const seen = new Map<string, number[]>();
      normalized.forEach((n, i) => {
        const value = key(n.row);
        if (value) pushTo(seen, value, i);
      });
      return seen;
    };
    const rowList = (indexes: number[]) => indexes.map(i => normalized[i].row.rowNumber).join(', ');
    for (const [identifier, indexes] of rowsWith(r => r.identifier)) {
      if (indexes.length < 2) continue;
      for (const i of indexes) normalized[i].errors.push(`Member ID ${identifier} is on more than one row (rows ${rowList(indexes)}). Each person may appear once.`);
    }
    for (const [email, indexes] of rowsWith(r => r.email)) {
      if (indexes.length < 2) continue;
      for (const i of indexes) normalized[i].errors.push(`${email} is on more than one row (rows ${rowList(indexes)}). Two people cannot share an email.`);
    }

    // --- Pass 1: each row's person ---------------------------------------------------------------

    const results: PeopleImportRowResult[] = [];
    const writes: RowWrites[] = [];
    const persons: (Person | undefined)[] = [];
    const personByEmail = new Map<string, Person>();
    const claimedBy = new Map<string, number>();

    normalized.forEach(({ row, errors }, index) => {
      const warnings: string[] = [];
      const result: PeopleImportRowResult = {
        index, rowNumber: row.rowNumber, name: row.name, outcome: 'unchanged',
        changes: [], guardians: [], errors, warnings,
      };
      results.push(result);
      const w: RowWrites = { newLinks: [] };
      writes.push(w);
      if (errors.length) return;

      // Matched by Member ID, then by email. Never by name: two children called the same thing is
      // ordinary, and updating the wrong one is not something a preview makes obvious.
      let existing = row.identifier ? byIdentifier.get(row.identifier) : undefined;
      if (row.email) {
        const sameEmail = byEmail.get(row.email) || [];
        if (existing) {
          const other = sameEmail.find(p => p.id !== existing!.id);
          if (other) errors.push(`${row.email} is already ${other.name}'s email${other.identifier ? ` (Member ID ${other.identifier})` : ''}. Two people cannot share one.`);
        } else if (sameEmail.length > 1) {
          errors.push(`${row.email} is the email of more than one person on record (${sameEmail.map(p => p.name).join(', ')}). Add their Member ID to say which.`);
        } else if (sameEmail.length === 1) {
          const match = sameEmail[0];
          if (row.identifier && match.identifier && match.identifier !== row.identifier) {
            errors.push(`${row.email} belongs to ${match.name}, whose Member ID is ${match.identifier}, not ${row.identifier}.`);
          } else {
            existing = match;
          }
        }
      }
      if (existing && claimedBy.has(existing.id)) {
        errors.push(`This is ${existing.name}, who is also on row ${normalized[claimedBy.get(existing.id)!].row.rowNumber}. Each person may appear once.`);
      }
      if ((row.email && systemAdminEmails.has(row.email)) || (existing && isSystemAdmin(existing))) {
        errors.push(`${row.email || existing!.name} is a system administrator's account, which cannot belong to an organisation.`);
      }
      if (errors.length) return;

      if (!existing) {
        const id = `op-${randomUUID()}`;
        const roleId = row.roleId || ROLE_MEMBER;
        w.newProfile = {
          id, name: row.name, email: row.email, cellphone: row.cellphone,
          birthdate: row.birthdate, nationalId: row.nationalId, identifier: row.identifier,
        };
        w.newMembership = { id: `org-mem-${randomUUID()}`, profileId: id, roleId };
        result.outcome = 'new';
        result.profileId = id;
        const accountHere = !!row.email && accountEmails.has(row.email);
        if (accountHere) warnings.push(`${row.email} is already on ScoreKeeper, so that account gets access as ${roleName(roleId)} straight away.`);
        const namesake = byName.get(lower(row.name));
        if (namesake?.length) {
          const who = namesake.map(p => p.identifier ? `Member ID ${p.identifier}` : p.email || 'no Member ID or email').join('; ');
          warnings.push(`There is already a ${row.name} on record (${who}). If this is them, add their Member ID or email to this row so it updates them rather than adding someone new.`);
        }
        const person: Person = {
          id, rowIndex: index, name: row.name, email: row.email, birthdate: row.birthdate,
          ownAccountAllowed: null, hasAccount: accountHere, isSystemAdmin: false,
        };
        persons[index] = person;
        if (row.email) personByEmail.set(row.email, person);
        return;
      }

      claimedBy.set(existing.id, index);
      result.profileId = existing.id;
      const set: Record<string, string> = {};
      const change = (column: string, from: string | null, to: string) => {
        set[column] = to;
        result.changes.push({ field: FIELD_LABELS[column], from, to });
      };

      if (row.name !== existing.name) change('name', existing.name, row.name);

      const existingEmail = lower(existing.email);
      let email = existingEmail || undefined;
      const accountBefore = hasAccount(existing);
      if (row.email && row.email !== existingEmail) {
        if (accountBefore) {
          warnings.push(`Email not changed: ${existing.name} is on ScoreKeeper${existingEmail ? ` as ${existingEmail}` : ''}, and changing it would move their access. Change it on their profile if it is right.`);
        } else if ((linkedEmails.get(existing.id) || []).indexOf(row.email) >= 0) {
          errors.push(`${row.email} is the email of ${existing.name}'s guardian or child. A guardian and the player they are recorded for cannot share one.`);
          return;
        } else {
          change('email', existing.email, row.email);
          email = row.email;
          if (accountEmails.has(row.email)) {
            warnings.push(`${row.email} is already on ScoreKeeper, so that account gets ${existing.name}'s access straight away.`);
          }
        }
      }
      if (row.cellphone && row.cellphone !== (existing.cellphone || '')) change('cellphone', existing.cellphone, row.cellphone);
      if (row.birthdate && row.birthdate !== (existing.birthdate || '')) change('birthdate', existing.birthdate, row.birthdate);
      if (row.nationalId && row.nationalId !== (existing.nationalId || '')) change('national_id', existing.nationalId, row.nationalId);
      if (row.identifier && !existing.identifier) change('identifier', null, row.identifier);
      if (Object.keys(set).length) w.profileUpdate = { id: existing.id, set };

      const membership = membershipOf.get(existing.id);
      if (membership?.roleId === ROLE_ADMIN) {
        if (row.roleId) warnings.push(`${existing.name} is an Admin, and an import does not change an Admin's role.`);
      } else if (membership) {
        if (row.roleId && row.roleId !== membership.roleId) {
          w.roleChange = { id: membership.id, profileId: existing.id, roleId: row.roleId };
          result.changes.push({ field: 'Role', from: roleName(membership.roleId), to: roleName(row.roleId) });
        }
      } else {
        // On record without a membership — a guardian, or someone from outside helping out. A row
        // in this sheet makes them a member.
        const roleId = row.roleId || ROLE_MEMBER;
        w.newMembership = { id: `org-mem-${randomUUID()}`, profileId: existing.id, roleId };
        result.changes.push({ field: 'Role', from: null, to: roleName(roleId) });
        if (accountBefore || (!!email && accountEmails.has(email))) {
          warnings.push(`${existing.name} is on ScoreKeeper, so their account gets access as ${roleName(roleId)} straight away.`);
        }
      }
      if (result.changes.length) result.outcome = 'update';

      const person: Person = {
        id: existing.id, rowIndex: index, name: row.name, email,
        birthdate: row.birthdate || existing.birthdate,
        ownAccountAllowed: existing.ownAccountAllowed,
        hasAccount: accountBefore || (!!email && accountEmails.has(email)),
        isSystemAdmin: false,
      };
      persons[index] = person;
      if (email) personByEmail.set(email, person);
    });

    // --- Pass 2: each row's guardians ------------------------------------------------------------

    const guardianTargets = new Map<string, GuardianTarget>();
    const newLinkFor = new Set<string>();
    const primaryPlannedFor = new Set<string>();

    const targetOf = (profile: ExistingProfile): GuardianTarget => ({
      id: profile.id, name: profile.name, email: lower(profile.email) || undefined,
      hasAccount: hasAccount(profile), isSystemAdmin: isSystemAdmin(profile),
    });

    normalized.forEach(({ row, errors }, index) => {
      const person = persons[index];
      if (!person || errors.length) return;
      const result = results[index];
      const w = writes[index];

      for (const g of row.guardians) {
        const label = `Guardian ${g.position}`;
        const key = g.email ? `e:${g.email}` : `p:${lower(g.name)}|${cellphoneDigits(g.cellphone)}`;
        let target = guardianTargets.get(key);

        if (!target && g.email && personByEmail.has(g.email)) {
          const p = personByEmail.get(g.email)!;
          target = { id: p.id, name: p.name, email: p.email, hasAccount: p.hasAccount, isSystemAdmin: false, personRowIndex: p.rowIndex };
        }
        if (!target && g.email) {
          const same = byEmail.get(g.email) || [];
          if (same.length > 1) {
            errors.push(`${label}'s email ${g.email} belongs to more than one person on record (${same.map(p => p.name).join(', ')}). Link the right one on the player's profile instead.`);
            continue;
          }
          if (same.length === 1) target = targetOf(same[0]);
        }
        if (!target && !g.email) {
          // No email: the same name *and* cellphone number, and only if exactly one person has both.
          const digits = cellphoneDigits(g.cellphone);
          const same = (byName.get(lower(g.name)) || []).filter(p => cellphoneDigits(p.cellphone) === digits);
          if (same.length > 1) {
            errors.push(`${label}, ${g.name}, matches more than one person on record with that cellphone number. Add their email to say which.`);
            continue;
          }
          if (same.length === 1) target = targetOf(same[0]);
        }
        if (!target) {
          target = {
            id: `op-${randomUUID()}`, name: g.name, email: g.email,
            hasAccount: !!g.email && accountEmails.has(g.email),
            isSystemAdmin: !!g.email && systemAdminEmails.has(g.email),
            create: { name: g.name, email: g.email, cellphone: g.cellphone },
          };
        }
        guardianTargets.set(key, target);

        if (target.isSystemAdmin) {
          errors.push(`${label}, ${g.email || target.name}, is a system administrator's account, which cannot belong to an organisation.`);
          continue;
        }
        if (target.id === person.id) {
          errors.push(`${label} is ${person.name} themselves.`);
          continue;
        }
        const problem = guardianLinkProblem(
          { id: target.id, orgId, email: target.email },
          { id: person.id, orgId, email: person.email },
          orgId
        );
        if (problem) {
          errors.push(`${label}: ${problem}`);
          continue;
        }
        if (!target.create && lower(target.name) !== lower(g.name)) {
          result.warnings.push(`${label} is on record as ${target.name}, matched by ${g.email ? 'email' : 'cellphone number'}; that record is used as it is.`);
        }

        const pair = `${target.id}|${person.id}`;
        const alreadyLinked = linked.has(pair) || newLinkFor.has(pair);
        result.guardians.push({ position: g.position, name: target.name, profile: target.create ? 'new' : 'existing', link: alreadyLinked ? 'existing' : 'new' });
        if (alreadyLinked) continue;

        // The first guardian a player gets is their primary one, as `GuardianManager.addGuardian`.
        const isPrimary = !linkCount.get(person.id) && !primaryPlannedFor.has(person.id);
        if (isPrimary) primaryPlannedFor.add(person.id);
        newLinkFor.add(pair);
        w.newLinks.push({ id: `pg-${randomUUID()}`, guardian: target, playerId: person.id, relationship: g.relationship, isPrimary });
        if (target.hasAccount) {
          result.warnings.push(`${label}, ${target.name}, is on ScoreKeeper, and will see ${person.name} in My Family straight away.`);
        }
      }
    });

    // A guardian who is also a person in the sheet can only be linked if their own row goes in. A
    // row refused for that can in turn be someone else's guardian, so repeat until nothing changes.
    let changed = true;
    while (changed) {
      changed = false;
      normalized.forEach(({ errors }, index) => {
        if (errors.length) return;
        for (const link of writes[index].newLinks) {
          const other = link.guardian.personRowIndex;
          if (other !== undefined && normalized[other].errors.length) {
            errors.push(`${link.guardian.name} is this person's guardian, but their own row (row ${normalized[other].row.rowNumber}) has a problem. Fix that row first.`);
            changed = true;
            return;
          }
        }
      });
    }

    // --- The report, and what to write ------------------------------------------------------------

    const counts = { new: 0, update: 0, unchanged: 0, error: 0, newGuardians: 0, newGuardianLinks: 0 };
    const effects: PeopleImportEffects = {
      orgId, newMemberships: [], roleChangedProfileIds: [], updatedProfileIds: [], playersWithNewGuardians: [],
    };
    const created = new Set<string>();
    const errorsOut: BatchItemError[] = [];

    results.forEach((result, index) => {
      if (result.errors.length) {
        result.outcome = 'error';
        counts.error++;
        errorsOut.push({ index, message: `Row ${result.rowNumber}: ${result.errors.join(' ')}` });
        writes[index] = { newLinks: [] };
        return;
      }
      const w = writes[index];
      if (w.newLinks.length) {
        if (result.outcome === 'unchanged') result.outcome = 'update';
        counts.newGuardianLinks += w.newLinks.length;
        effects.playersWithNewGuardians.push(persons[index]!.id);
        for (const link of w.newLinks) {
          if (link.guardian.create && !created.has(link.guardian.id)) {
            created.add(link.guardian.id);
            counts.newGuardians++;
          }
        }
      }
      counts[result.outcome as 'new' | 'update' | 'unchanged']++;
      if (w.newMembership) effects.newMemberships.push({ profileId: w.newMembership.profileId, roleId: w.newMembership.roleId });
      if (w.roleChange) effects.roleChangedProfileIds.push(w.roleChange.profileId);
      if (w.profileUpdate) effects.updatedProfileIds.push(w.profileUpdate.id);

      // A minor's account, once linked, has no member's access until the organisation (and they)
      // allow it. Said only for rows this import changes, so a re-import is not a wall of it.
      const person = persons[index]!;
      if (result.outcome !== 'unchanged' && (person.email || person.hasAccount)) {
        const hasGuardian = !!linkCount.get(person.id) || w.newLinks.length > 0;
        const access = memberAccess({ birthdate: person.birthdate, ownAccountAllowed: person.ownAccountAllowed }, minors, hasGuardian);
        if (access.access === 'restricted') {
          result.warnings.push(access.reason === 'org-off'
            ? `${person.name} counts as a minor here, so their account will not have a member's access until your organisation allows minors their own accounts.`
            : `${person.name} counts as a minor here and their own-account setting is off, so their account will not have a member's access.`);
        }
      }
    });

    return {
      report: { mode, rows: results, counts },
      errors: errorsOut,
      writes,
      effects,
    };
  }

  // -----------------------------------------------------------------------------------------------
  // Writing
  // -----------------------------------------------------------------------------------------------

  /** Every statement on `tx`. Rows go in as arrays (`unnest`), so 2,000 people is a handful of statements. */
  private async write(tx: Tx, orgId: string, rowWrites: RowWrites[], actorProfileId: string | null): Promise<void> {
    const newProfiles: NewProfile[] = [];
    const seenGuardians = new Set<string>();
    const memberships: { id: string; profileId: string; roleId: string }[] = [];
    const roleChanges: { id: string; roleId: string }[] = [];
    const links: RowWrites['newLinks'] = [];

    for (const w of rowWrites) {
      if (w.newProfile) newProfiles.push(w.newProfile);
      if (w.newMembership) memberships.push(w.newMembership);
      if (w.roleChange) roleChanges.push(w.roleChange);
      for (const link of w.newLinks) {
        links.push(link);
        if (link.guardian.create && !seenGuardians.has(link.guardian.id)) {
          seenGuardians.add(link.guardian.id);
          newProfiles.push({ id: link.guardian.id, ...link.guardian.create });
        }
      }
    }

    if (newProfiles.length) {
      const col = <K extends keyof NewProfile>(key: K) => newProfiles.map(p => p[key] ?? null);
      await tx(
        `INSERT INTO org_profiles (id, org_id, name, email, cellphone, birthdate, national_id, identifier)
         SELECT u.id, $1, u.name, u.email, u.cellphone, u.birthdate, u.national_id, u.identifier
           FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::date[], $7::text[], $8::text[])
             AS u(id, name, email, cellphone, birthdate, national_id, identifier)`,
        [orgId, col('id'), col('name'), col('email'), col('cellphone'), col('birthdate'), col('nationalId'), col('identifier')]
      );
    }

    for (const w of rowWrites) {
      if (!w.profileUpdate) continue;
      const columns = Object.keys(w.profileUpdate.set);
      await tx(
        `UPDATE org_profiles SET ${columns.map((c, i) => `${c} = $${i + 3}`).join(', ')} WHERE id = $1 AND org_id = $2`,
        [w.profileUpdate.id, orgId, ...columns.map(c => w.profileUpdate!.set[c])]
      );
    }

    if (memberships.length) {
      await tx(
        `INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date)
         SELECT u.id, u.profile_id, $1, u.role_id, NOW()
           FROM unnest($2::text[], $3::text[], $4::text[]) AS u(id, profile_id, role_id)`,
        [orgId, memberships.map(m => m.id), memberships.map(m => m.profileId), memberships.map(m => m.roleId)]
      );
    }

    if (roleChanges.length) {
      await tx(
        `UPDATE org_memberships AS m SET role_id = u.role_id
           FROM unnest($1::text[], $2::text[]) AS u(id, role_id)
          WHERE m.id = u.id AND m.org_id = $3 AND m.role_id <> '${ROLE_ADMIN}'`,
        [roleChanges.map(r => r.id), roleChanges.map(r => r.roleId), orgId]
      );
    }

    if (links.length) {
      await tx(
        `INSERT INTO profile_guardians
           (id, org_id, guardian_profile_id, player_profile_id, relationship, is_primary, start_date, created_by_profile_id)
         SELECT u.id, $1, u.guardian_id, u.player_id, u.relationship, u.is_primary, NOW(), $7
           FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::boolean[])
             AS u(id, guardian_id, player_id, relationship, is_primary)`,
        [
          orgId,
          links.map(l => l.id),
          links.map(l => l.guardian.id),
          links.map(l => l.playerId),
          links.map(l => l.relationship),
          links.map(l => l.isPrimary),
          actorProfileId,
        ]
      );
    }
  }
}

export const peopleImportManager = new PeopleImportManager();
