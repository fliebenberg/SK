import { randomBytes } from 'crypto';
import {
  ApplicationPossibleMatch,
  cellphoneKey,
  GUARDIAN_RELATIONSHIPS,
  guardianLinkProblem,
  isCalendarDate,
  isUnderAge,
  minorsSettingsOf,
  MembershipApplication,
  ApplyToOrgPayload,
  parseCellphone,
} from '@sk/shared';
import { BaseManager, Tx } from './BaseManager';
import { rethrowEmailClash } from './UserManager';
import { personNameMatchScore } from '../utils/orgNameMatch';

/**
 * Asking to join an organisation (`MEMBER-1`, docs/people.md §7). An organisation is `invite` (the
 * default: only its admins and staff add people) or `apply`: anyone signed in may apply, for themselves
 * or for their child, and **applying joins nobody**. The application waits until an admin or staff member
 * approves it, and only then is the membership written, always as a plain Member.
 *
 * For a child, approving writes the child's membership and records the applicant as their guardian,
 * who holds no membership (docs/identity_structure.md §5.1).
 *
 * Nothing here checks who is asking beyond the applicant's own: `orgGate` has done that.
 */

/** How long after a decline the same person may be applied for again. */
const REAPPLY_DAYS = 30;

const COLUMNS = `
  a.id, a.org_id as "orgId", a.applicant_user_id as "applicantUserId", a.applicant_name as "applicantName",
  u.email as "applicantEmail", a.applicant_cellphone as "applicantCellphone",
  a.name, to_char(a.birthdate, 'YYYY-MM-DD') as "birthdate", a.relationship, a.note, a.status,
  a.org_profile_id as "orgProfileId", a.created_at as "createdAt", a.decided_at as "decidedAt"`;
const FROM = 'FROM org_membership_applications a JOIN users u ON u.id = a.applicant_user_id';

export class ApplicationError extends Error {}

export class MembershipApplicationManager extends BaseManager {
  /** Whether this organisation takes applications at all, and the reason it does not if not. */
  private refusalToApply(org: any): string | null {
    if (!org) return 'That organisation does not exist.';
    if (org.is_private) return 'That organisation is private.';
    if (!org.is_claimed) return 'Nobody runs that organisation yet, so there is nobody to approve an application.';
    if (org.membership_mode !== 'apply') return "That organisation doesn't take applications. Its admins and staff add people.";
    return null;
  }

  /** The profiles in this organisation that are this user's: by account, or by an address of theirs. */
  private async ownProfileIds(run: Tx, userId: string, orgId: string): Promise<string[]> {
    const res = await run(
      `SELECT op.id FROM org_profiles op
        WHERE op.org_id = $2 AND (op.user_id = $1 OR LOWER(TRIM(op.email)) IN (
          SELECT LOWER(email) FROM users WHERE id = $1
          UNION SELECT LOWER(email) FROM user_emails WHERE user_id = $1 AND verified_at IS NOT NULL
        ))`,
      [userId, orgId]
    );
    return res.rows.map((r: any) => r.id);
  }

  async apply(userId: string, payload: ApplyToOrgPayload): Promise<MembershipApplication> {
    const name = payload.name?.trim();
    const applicantName = (payload.applicantName ?? payload.name)?.trim();
    const note = payload.note?.trim() || null;
    const relationship = payload.relationship ?? null;
    if (!name) throw new ApplicationError('Enter the full name of the person joining.');
    if (!applicantName) throw new ApplicationError('Enter your name.');
    if (!isCalendarDate(payload.birthdate)) throw new ApplicationError('Enter the date of birth as YYYY-MM-DD.');
    if (payload.birthdate > new Date().toISOString().slice(0, 10)) throw new ApplicationError('That date of birth is in the future.');
    if (relationship && !GUARDIAN_RELATIONSHIPS.includes(relationship)) throw new ApplicationError(`"${relationship}" is not a guardian relationship.`);
    if (note && note.length > 500) throw new ApplicationError('Keep the note to 500 characters.');
    const cell = parseCellphone(payload.applicantCellphone);
    if (!cell) throw new ApplicationError('Enter a cellphone number.');
    if (!cell.ok) throw new ApplicationError(cell.problem);

    const org = (await this.query(
      'SELECT id, name, is_private, is_claimed, membership_mode, settings FROM organizations WHERE id = $1',
      [payload.orgId]
    )).rows[0];
    const refusal = this.refusalToApply(org);
    if (refusal) throw new ApplicationError(refusal);

    if (!relationship) {
      const minors = minorsSettingsOf(org.settings);
      if (!minors.accountsAllowed && isUnderAge(payload.birthdate, minors.minorAge)) {
        throw new ApplicationError(`At ${org.name}, a parent or guardian applies for anyone under ${minors.minorAge}. Ask yours to apply for you with their own account.`);
      }
      const own = await this.ownProfileIds((t, p) => this.query(t, p), userId, org.id);
      const member = own.length
        ? await this.query('SELECT 1 FROM org_memberships WHERE org_profile_id = ANY($1) AND (end_date IS NULL OR end_date > NOW()) LIMIT 1', [own])
        : { rows: [] };
      if (member.rows.length) throw new ApplicationError(`You already belong to ${org.name}.`);
    }

    const earlier = (await this.query(
      `SELECT status, decided_at FROM org_membership_applications
        WHERE org_id = $1 AND applicant_user_id = $2 AND LOWER(name) = LOWER($3)
          AND (status = 'pending' OR (status = 'declined' AND decided_at > NOW() - make_interval(days => ${REAPPLY_DAYS})))
        ORDER BY created_at DESC LIMIT 1`,
      [org.id, userId, name]
    )).rows[0];
    if (earlier?.status === 'pending') throw new ApplicationError(`There is already an application waiting for ${name}.`);
    if (earlier) {
      const from = new Date(new Date(earlier.decided_at).getTime() + REAPPLY_DAYS * 86400000).toISOString().slice(0, 10);
      throw new ApplicationError(`${org.name} did not accept the application for ${name}. You can apply again from ${from}.`);
    }

    const id = `app-${randomBytes(8).toString('hex')}`;
    await this.query(
      `INSERT INTO org_membership_applications
         (id, org_id, applicant_user_id, applicant_name, applicant_cellphone, name, birthdate, relationship, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, org.id, userId, applicantName, cell.value, name, payload.birthdate, relationship, note]
    );
    return (await this.getApplication(id))!;
  }

  async getApplication(id: string): Promise<MembershipApplication | null> {
    const res = await this.query(`SELECT ${COLUMNS} ${FROM} WHERE a.id = $1`, [id]);
    return res.rows[0] ?? null;
  }

  async getOrgIdOf(id: string): Promise<string | null> {
    const res = await this.query('SELECT org_id FROM org_membership_applications WHERE id = $1', [id]);
    return res.rows[0]?.org_id ?? null;
  }

  async withdraw(id: string, userId: string): Promise<MembershipApplication> {
    const res = await this.query(
      `UPDATE org_membership_applications SET status = 'withdrawn', decided_at = NOW()
        WHERE id = $1 AND applicant_user_id = $2 AND status = 'pending' RETURNING id`,
      [id, userId]
    );
    if (!res.rows[0]) throw new ApplicationError('That application is not waiting any more.');
    return (await this.getApplication(id))!;
  }

  /**
   * Who on the records this might be: a similar name or the same number, always for the decider to say.
   * Nothing verifies the number, so it never links anyone by itself (`MEMBER-7`). The same number comes
   * first and the same birthday next, though a birthday alone never lists anyone.
   */
  private possibleMatches(people: any[], given: { name: string; birthdate?: string; cellphone?: string }): ApplicationPossibleMatch[] {
    const number = given.cellphone ? cellphoneKey(given.cellphone) : null;
    return people
      .map(person => ({
        person,
        nameScore: personNameMatchScore(given.name, person.name),
        sameCellphone: !!number && !!person.cellphone && cellphoneKey(person.cellphone) === number,
      }))
      .filter(m => m.nameScore > 0 || m.sameCellphone)
      .map(m => ({ ...m, rank: m.nameScore + (m.person.birthdate === given.birthdate ? 100 : 0) + (m.sameCellphone ? 200 : 0) }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 5)
      .map(({ person, sameCellphone }) => ({
        id: person.id, name: person.name, birthdate: person.birthdate ?? undefined, personOrgId: person.personOrgId ?? undefined,
        ...(sameCellphone ? { sameCellphone } : {}),
      }));
  }

  /** The queue: everything waiting, oldest first, each with who it might already be on the organisation's records. */
  async getPending(orgId: string): Promise<MembershipApplication[]> {
    const rows: MembershipApplication[] = (await this.query(
      `SELECT ${COLUMNS} ${FROM} WHERE a.org_id = $1 AND a.status = 'pending' ORDER BY a.created_at`,
      [orgId]
    )).rows;
    if (!rows.length) return rows;

    const people = (await this.query(
      `SELECT id, name, cellphone, to_char(birthdate, 'YYYY-MM-DD') as "birthdate", identifier as "personOrgId", user_id as "userId"
         FROM org_profiles WHERE org_id = $1`,
      [orgId]
    )).rows;
    for (const row of rows) {
      const own = await this.ownProfileIds((t, p) => this.query(t, p), row.applicantUserId, orgId);
      // Someone's own record needs no asking, and nor can they take on another account's.
      const notOwn = people.filter(p => !own.includes(p.id));
      const unclaimed = notOwn.filter(p => !p.userId || p.userId === row.applicantUserId);
      if (row.relationship) {
        // The number on a child's application is the parent's, so it says nothing about the child.
        row.possibleMatches = this.possibleMatches(notOwn, { name: row.name, birthdate: row.birthdate });
        row.possibleGuardianMatches = own.length ? [] : this.possibleMatches(unclaimed, { name: row.applicantName, cellphone: row.applicantCellphone });
      } else {
        row.possibleMatches = this.possibleMatches(unclaimed, { name: row.name, birthdate: row.birthdate, cellphone: row.applicantCellphone });
      }
    }
    return rows;
  }

  /** The applicant's own: waiting, or declined and not yet open to applying again. */
  async getMine(userId: string, orgId: string): Promise<MembershipApplication[]> {
    const res = await this.query(
      `SELECT ${COLUMNS},
              CASE WHEN a.status = 'declined' THEN to_char(a.decided_at + make_interval(days => ${REAPPLY_DAYS}), 'YYYY-MM-DD') END as "reapplyFrom"
         ${FROM}
        WHERE a.org_id = $1 AND a.applicant_user_id = $2
          AND (a.status = 'pending' OR (a.status = 'declined' AND a.decided_at > NOW() - make_interval(days => ${REAPPLY_DAYS})))
        ORDER BY a.created_at DESC`,
      [orgId, userId]
    );
    return res.rows;
  }

  async decline(id: string, deciderUserId: string): Promise<MembershipApplication> {
    const res = await this.query(
      `UPDATE org_membership_applications SET status = 'declined', decided_at = NOW(), decided_by_user_id = $2
        WHERE id = $1 AND status = 'pending' RETURNING id`,
      [id, deciderUserId]
    );
    if (!res.rows[0]) throw new ApplicationError('That application has already been decided.');
    return (await this.getApplication(id))!;
  }

  /**
   * Approve: the person's record, their membership, and for a child the applicant as guardian, all or
   * none. `existingProfileId` is the record the decider said this is, and `existingGuardianProfileId`
   * the one they said the parent applying is (`MEMBER-7`); without one a record is made, unless the
   * applicant's own account already has one here, which always wins.
   */
  async approve(id: string, deciderUserId: string, existingProfileId?: string | null, existingGuardianProfileId?: string | null): Promise<MembershipApplication> {
    await this.transaction(async (tx) => {
      const app = (await tx(
        `SELECT a.*, to_char(a.birthdate, 'YYYY-MM-DD') as birth, u.email as applicant_email
           FROM org_membership_applications a JOIN users u ON u.id = a.applicant_user_id
          WHERE a.id = $1 FOR UPDATE OF a`,
        [id]
      )).rows[0];
      if (!app || app.status !== 'pending') throw new ApplicationError('That application has already been decided.');
      const isChild = !!app.relationship;
      const own = await this.ownProfileIds(tx, app.applicant_user_id, app.org_id);

      const insertProfile = async (name: string, fields: { email?: string; cellphone?: string; birthdate?: string; userId?: string }) => {
        const profileId = `profile-${randomBytes(8).toString('hex')}`;
        await tx(
          `INSERT INTO org_profiles (id, org_id, name, email, cellphone, birthdate, user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [profileId, app.org_id, name, fields.email ?? null, fields.cellphone ?? null, fields.birthdate ?? null, fields.userId ?? null]
        );
        return profileId;
      };

      /** The record the decider named, if it can be who they said. */
      const lockExisting = async (profileId: string, isApplicant: boolean) => {
        const existing = (await tx('SELECT id, org_id, user_id FROM org_profiles WHERE id = $1 FOR UPDATE', [profileId])).rows[0];
        if (!existing || existing.org_id !== app.org_id) throw new ApplicationError('That person is not on this organisation’s records.');
        if (isApplicant && existing.user_id && existing.user_id !== app.applicant_user_id) {
          throw new ApplicationError('That record belongs to another account, so it cannot be this applicant.');
        }
      };
      /**
       * The applicant's details and account onto a record of theirs. What it already says stands; the
       * application only fills what it lacks. Not the address while another record of theirs has it,
       * as no two people's may match (`MEMBER-7`).
       */
      const fillFromApplicant = (profileId: string) => tx(
        `UPDATE org_profiles SET cellphone = COALESCE(cellphone, $2),
                email = CASE WHEN $3 THEN COALESCE(email, $4) ELSE email END,
                user_id = COALESCE(user_id, $5)
          WHERE id = $1`,
        [profileId, app.applicant_cellphone, !own.length, app.applicant_email, app.applicant_user_id]
      );

      let personId: string;
      if (existingProfileId) {
        await lockExisting(existingProfileId, !isChild);
        await tx('UPDATE org_profiles SET birthdate = COALESCE(birthdate, $2) WHERE id = $1', [existingProfileId, app.birth]);
        if (!isChild) await fillFromApplicant(existingProfileId);
        personId = existingProfileId;
      } else if (!isChild && own[0]) {
        personId = own[0];
      } else {
        personId = await insertProfile(app.name, isChild
          ? { birthdate: app.birth }
          : { birthdate: app.birth, email: app.applicant_email, cellphone: app.applicant_cellphone, userId: app.applicant_user_id });
      }

      const member = await tx(
        'SELECT 1 FROM org_memberships WHERE org_profile_id = $1 AND org_id = $2 AND (end_date IS NULL OR end_date > NOW())',
        [personId, app.org_id]
      );
      if (!member.rows.length) {
        await tx(
          `INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date) VALUES ($1, $2, $3, 'role-org-member', NOW())`,
          [`org-mem-${randomBytes(8).toString('hex')}`, personId, app.org_id]
        );
      }

      if (isChild) {
        let guardianId: string = own[0];
        if (!guardianId && existingGuardianProfileId) {
          await lockExisting(existingGuardianProfileId, true);
          // Before filling it, so the child's record is never given the parent's account.
          if (existingGuardianProfileId === personId) throw new ApplicationError('A person cannot be their own guardian.');
          await fillFromApplicant(existingGuardianProfileId);
          guardianId = existingGuardianProfileId;
        } else if (!guardianId) {
          guardianId = await insertProfile(app.applicant_name, {
            email: app.applicant_email, cellphone: app.applicant_cellphone, userId: app.applicant_user_id,
          });
        }
        const people = (await tx('SELECT id, org_id as "orgId", email FROM org_profiles WHERE id = ANY($1)', [[guardianId, personId]])).rows;
        const problem = guardianLinkProblem(people.find((p: any) => p.id === guardianId), people.find((p: any) => p.id === personId), app.org_id);
        if (problem) throw new ApplicationError(problem);
        const linked = await tx(
          'SELECT 1 FROM profile_guardians WHERE guardian_profile_id = $1 AND player_profile_id = $2 AND (end_date IS NULL OR end_date > NOW())',
          [guardianId, personId]
        );
        if (!linked.rows.length) {
          const others = await tx('SELECT 1 FROM profile_guardians WHERE player_profile_id = $1 AND (end_date IS NULL OR end_date > NOW()) LIMIT 1', [personId]);
          await tx(
            `INSERT INTO profile_guardians (id, org_id, guardian_profile_id, player_profile_id, relationship, is_primary)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [`pg-${randomBytes(8).toString('hex')}`, app.org_id, guardianId, personId, app.relationship, !others.rows.length]
          );
        }
      }

      await tx(
        `UPDATE org_membership_applications SET status = 'approved', decided_at = NOW(), decided_by_user_id = $2, org_profile_id = $3 WHERE id = $1`,
        [id, deciderUserId, personId]
      );
    }).catch(rethrowEmailClash);
    return (await this.getApplication(id))!;
  }

  /** Where to tell an organisation that someone has applied: its admins' and staff's addresses. */
  async getDeciderEmails(orgId: string): Promise<string[]> {
    const res = await this.query(
      `SELECT DISTINCT COALESCE(u.email, op.email) AS email
         FROM org_memberships om
         JOIN org_profiles op ON op.id = om.org_profile_id
         LEFT JOIN users u ON u.id = op.user_id
        WHERE om.org_id = $1 AND om.role_id IN ('role-org-admin', 'role-org-staff')
          AND (om.end_date IS NULL OR om.end_date > NOW())`,
      [orgId]
    );
    return res.rows.map((r: any) => r.email).filter(Boolean);
  }
}

export const membershipApplicationManager = new MembershipApplicationManager();
