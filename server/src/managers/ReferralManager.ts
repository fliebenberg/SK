import { Pool, PoolClient } from 'pg';
import pool from '../db';
import { randomBytes } from 'crypto';
import { mailManager } from './MailManager';
import { userManager } from './UserManager';
import { organizationManager } from './OrganizationManager';
import { OrgClaimReferral, OrgClaimStatus, UserBadge } from '@sk/shared';

export class ReferralManager {
  private pool: Pool;

  constructor() {
    this.pool = pool;
  }

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /** `org_admin_invite_cooldown_hours` from `system_settings`; two weeks if unset. */
  private async getInviteCooldownHours(client: PoolClient): Promise<number> {
    const res = await client.query(
      "SELECT value FROM system_settings WHERE key = 'org_admin_invite_cooldown_hours'"
    );
    const hours = res.rows[0] ? parseInt(res.rows[0].value, 10) : NaN;
    return Number.isFinite(hours) ? hours : 336;
  }

  /**
   * Nominate one or more contacts to claim an org.
   *
   * One row per (org, email), whoever nominated it. A fresh address gets a row and an email. An
   * address already pending gets the caller added as a nominator — so their own screens show it
   * as referred — and is emailed again only once `org_admin_invite_cooldown_hours` has passed
   * since the last send, with a new token and the credit moved to the caller. An address whose
   * nominee has already claimed, declined or passed the invitation on is left alone. Every
   * address comes back with `emailSent` saying which of those happened; the claim token never
   * does, since it is the credential the email carries and the caller has no use for it.
   */
  async createReferrals(orgId: string, contactEmails: string[], referredByUserId: string): Promise<OrgClaimReferral[]> {
    const client = await this.pool.connect();
    const results: OrgClaimReferral[] = [];
    const toSend: Array<{ email: string; token: string }> = [];
    let orgName = 'Organization';

    const COLUMNS = `id, org_id as "orgId", referred_email as "referredEmail",
                     referred_by_user_id as "referredByUserId", status,
                     claimed_by_user_id as "claimedByUserId", created_at as "createdAt",
                     claimed_at as "claimedAt", last_sent_at as "lastSentAt"`;

    try {
      await client.query('BEGIN');

      const orgRes = await client.query('SELECT name FROM organizations WHERE id = $1', [orgId]);
      orgName = orgRes.rows[0]?.name || orgName;
      const cooldownHours = await this.getInviteCooldownHours(client);

      for (const email of contactEmails) {
        const normalizedEmail = email.toLowerCase().trim();
        if (!normalizedEmail) continue;

        const existingRes = await client.query(
          `SELECT ${COLUMNS} FROM org_claim_referrals
           WHERE org_id = $1 AND referred_email = $2
           ORDER BY created_at DESC LIMIT 1`,
          [orgId, normalizedEmail]
        );
        const existing = existingRes.rows[0];

        if (!existing) {
          const id = `ref-${randomBytes(8).toString('hex')}`;
          const token = this.generateToken();
          const insertRes = await client.query(
            `INSERT INTO org_claim_referrals
               (id, org_id, referred_email, referred_by_user_id, claim_token, status, last_sent_at)
             VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
             RETURNING ${COLUMNS}`,
            [id, orgId, normalizedEmail, referredByUserId, token]
          );
          await client.query(
            `INSERT INTO org_claim_referral_nominators (referral_id, user_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [id, referredByUserId]
          );
          results.push({ ...insertRes.rows[0], emailSent: true });
          toSend.push({ email: normalizedEmail, token });
          continue;
        }

        if (existing.status !== 'pending') {
          results.push({ ...existing, emailSent: false });
          continue;
        }

        await client.query(
          `INSERT INTO org_claim_referral_nominators (referral_id, user_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [existing.id, referredByUserId]
        );

        const lastSent = new Date(existing.lastSentAt || existing.createdAt).getTime();
        const hoursSince = (Date.now() - lastSent) / (1000 * 60 * 60);
        if (hoursSince < cooldownHours) {
          results.push({ ...existing, emailSent: false });
          continue;
        }

        const token = this.generateToken();
        const resendRes = await client.query(
          `UPDATE org_claim_referrals
           SET claim_token = $1, referred_by_user_id = $2, last_sent_at = NOW()
           WHERE id = $3
           RETURNING ${COLUMNS}`,
          [token, referredByUserId, existing.id]
        );
        results.push({ ...resendRes.rows[0], emailSent: true });
        toSend.push({ email: normalizedEmail, token });
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // Mail and in-app notification after the rows are committed, so a mail failure never undoes
    // the nomination it reports.
    for (const { email, token } of toSend) {
      try {
        const claimUrl = `${process.env.APP_URL}/claim?token=${token}`;
        await mailManager.sendClaimInvitation(email, orgName, claimUrl);

        const userRes = await this.pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userRes.rows.length > 0) {
          await this.pool.query(
            `INSERT INTO notifications (id, user_id, title, message, type, link)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              `notif-${randomBytes(8).toString('hex')}`,
              userRes.rows[0].id,
              'Organization Claim Invitation',
              `You have been invited to manage ${orgName}.`,
              'claim_invitation',
              `/claim?token=${token}`,
            ]
          );
        }
      } catch (mailError) {
        console.error(`ReferralManager: Error sending claim invitation to ${email}:`, mailError);
      }
    }

    return results;
  }

  /**
   * The claim state a nominator sees before being asked to nominate: strictly their own
   * nominations. Another user's pending invitation is not reported, so the org still asks this
   * caller — unless they enter the same address, which makes them a nominator of it too.
   */
  async getClaimStatus(orgId: string, userId: string): Promise<OrgClaimStatus | null> {
    const orgRes = await this.pool.query('SELECT is_claimed FROM organizations WHERE id = $1', [orgId]);
    if (orgRes.rows.length === 0) return null;
    const mineRes = await this.pool.query(
      `SELECT r.referred_email as "referredEmail"
       FROM org_claim_referrals r
       WHERE r.org_id = $1 AND r.status = 'pending'
         AND (r.referred_by_user_id = $2
              OR EXISTS (SELECT 1 FROM org_claim_referral_nominators n
                         WHERE n.referral_id = r.id AND n.user_id = $2))
       ORDER BY r.created_at`,
      [orgId, userId]
    );
    return {
      orgId,
      isClaimed: !!orgRes.rows[0].is_claimed,
      myPendingEmails: mineRes.rows.map((r: any) => r.referredEmail),
    };
  }

  async getReferralsForOrg(orgId: string): Promise<OrgClaimReferral[]> {
    const res = await this.pool.query(
      `SELECT id, org_id as "orgId", referred_email as "referredEmail", 
              referred_by_user_id as "referredByUserId", status, 
              claimed_by_user_id as "claimedByUserId", created_at as "createdAt", 
              claimed_at as "claimedAt"
       FROM org_claim_referrals 
       WHERE org_id = $1
       ORDER BY created_at DESC`,
      [orgId]
    );
    return res.rows;
  }

  async getReferralsByUser(userId: string): Promise<OrgClaimReferral[]> {
    const res = await this.pool.query(
      `SELECT id, org_id as "orgId", referred_email as "referredEmail", 
              referred_by_user_id as "referredByUserId", status, 
              claimed_by_user_id as "claimedByUserId", created_at as "createdAt", 
              claimed_at as "claimedAt"
       FROM org_claim_referrals 
       WHERE referred_by_user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows;
  }

  async getPendingClaimForUser(email: string): Promise<OrgClaimReferral[]> {
     const res = await this.pool.query(
      `SELECT id, org_id as "orgId", referred_email as "referredEmail", 
              referred_by_user_id as "referredByUserId", status, 
              created_at as "createdAt", claim_token as "claimToken"
       FROM org_claim_referrals 
       WHERE referred_email = $1 AND status = 'pending'`,
      [email.toLowerCase().trim()]
    );
    return res.rows;
  }

  async getPendingReferralsByEmails(emails: string[]): Promise<any[]> {
    if (emails.length === 0) return [];
    const res = await this.pool.query(
      `SELECT r.id, r.org_id as "orgId", r.referred_email as "referredEmail", 
              r.claim_token as "claimToken", o.name as "organizationName"
       FROM org_claim_referrals r
       JOIN organizations o ON r.org_id = o.id
       WHERE r.referred_email = ANY($1) AND r.status = 'pending'`,
      [emails.map(e => e.toLowerCase().trim())]
    );
    return res.rows;
  }

  async declineClaim(token: string): Promise<any> {
    const client = await this.pool.connect();
    try {
        await client.query('BEGIN');
        const refRes = await client.query(
            `SELECT id FROM org_claim_referrals WHERE claim_token = $1 AND status = 'pending'`,
            [token]
        );
        if (refRes.rows.length === 0) {
            throw new Error('Invalid or expired claim token');
        }
        
        await client.query(
            `UPDATE org_claim_referrals SET status = 'declined' WHERE claim_token = $1`,
            [token]
        );
        await client.query('COMMIT');
        return { success: true };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
  }

  async referOrgContactViaToken(token: string, contactEmails: string[]): Promise<any> {
    const client = await this.pool.connect();
    try {
        await client.query('BEGIN');
        
        // Find the ORIGINAL referral content
        const refRes = await client.query(
            `SELECT id, org_id, referred_by_user_id FROM org_claim_referrals WHERE claim_token = $1 AND status = 'pending'`,
            [token]
        );

        if (refRes.rows.length === 0) {
             throw new Error('Invalid or expired claim token');
        }

        const originalReferral = refRes.rows[0];

        // Mark original as 'referred' so we don't bother them again (but kept for record) -- Or should we keep it pending?
        // User requested: "Maybe we should add another status called refered"
        await client.query(
            `UPDATE org_claim_referrals SET status = 'referred' WHERE claim_token = $1`,
            [token]
        );

        // Create NEW referrals using the ORIGINAL referrer's ID to preserve credit
        // We reuse the existing logic but need to be careful about transaction nesting if we called createReferrals directly.
        // createReferrals uses its own connection/transaction. 
        // Let's reimplement lightweight insertion here to stay in same transaction OR commit this part and call createReferrals.
        // Calling createReferrals is cleaner but requires we commit first OR refactor createReferrals to take a client.
        // For safety and simplicity, let's commit the status update, then call createReferrals.
        
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }

    // Now create the new referrals (outside the previous transaction to avoid nesting issues with createReferrals)
    // We need to re-fetch the data as we released the client, but we have it in `originalReferral`.
    const refRes = await this.pool.query(
        `SELECT org_id, referred_by_user_id FROM org_claim_referrals WHERE claim_token = $1`, // Fetching by token again is safe
        [token]
    );
     if (refRes.rows.length === 0) return []; // Should not happen given above check

    const { org_id, referred_by_user_id } = refRes.rows[0];
    
    return this.createReferrals(org_id, contactEmails, referred_by_user_id);
  }

  async getClaimInfo(token: string): Promise<any> {
    const res = await this.pool.query(
      `SELECT r.id, r.org_id as "orgId", o.name as "organizationName", o.logo as "organizationLogo", r.status
       FROM org_claim_referrals r
       JOIN organizations o ON r.org_id = o.id
       WHERE r.claim_token = $1`,
      [token]
    );
    return res.rows[0];
  }

  async claimOrgViaToken(token: string, userId: string): Promise<any> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const refDataRes = await client.query(
        `SELECT org_id, referred_by_user_id FROM org_claim_referrals WHERE claim_token = $1 AND status = 'pending'`,
        [token]
      );
      if (refDataRes.rows.length === 0) throw new Error('Invalid or expired claim token');
      
      const { org_id: orgId, referred_by_user_id: referredByUserId } = refDataRes.rows[0];

      // Update referral status
      await client.query(
        `UPDATE org_claim_referrals SET status = 'claimed', claimed_by_user_id = $1, claimed_at = NOW() WHERE claim_token = $2`,
        [userId, token]
      );

      // Award badges based on successful referrals
      if (referredByUserId) {
          const referralCountRes = await client.query(
              `SELECT COUNT(*) FROM org_claim_referrals WHERE referred_by_user_id = $1 AND status = 'claimed'`,
              [referredByUserId]
          );
          const count = parseInt(referralCountRes.rows[0].count);

          // 1. Award "Community Builder" badge on the first claim
          if (count >= 1) {
              const badgeExists = await client.query(
                  `SELECT 1 FROM user_badges WHERE user_id = $1 AND badge_type = 'community_builder'`,
                  [referredByUserId]
              );
              if (badgeExists.rows.length === 0) {
                  const badgeId = `badge-${randomBytes(8).toString('hex')}`;
                  await client.query(
                      `INSERT INTO user_badges (id, user_id, badge_type) VALUES ($1, $2, $3)`,
                      [badgeId, referredByUserId, 'community_builder']
                  );
                  console.log(`ReferralManager: Awarded 'community_builder' badge to user ${referredByUserId}`);
              }
          }

          // 2. Award "Community Champion" badge on 5 or more claims
          if (count >= 5) {
              const badgeExists = await client.query(
                  `SELECT 1 FROM user_badges WHERE user_id = $1 AND badge_type = 'community_champion'`,
                  [referredByUserId]
              );
              if (badgeExists.rows.length === 0) {
                  const badgeId = `badge-${randomBytes(8).toString('hex')}`;
                  await client.query(
                      `INSERT INTO user_badges (id, user_id, badge_type) VALUES ($1, $2, $3)`,
                      [badgeId, referredByUserId, 'community_champion']
                  );
                  console.log(`ReferralManager: Awarded 'community_champion' badge to user ${referredByUserId}`);
              }
          }
      }

      // Update organization ownership
      await client.query(
        `UPDATE organizations SET is_claimed = true, creator_id = $1 WHERE id = $2`,
        [userId, orgId]
      );

      // Add user as Org Admin
      const profileId = await userManager.ensureProfileForUserInOrg(userId, orgId);

      const membershipId = `om-${randomBytes(8).toString('hex')}`;
      await client.query(
        `INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date)
         VALUES ($1, $2, $3, 'role-org-admin', NOW())`,
        [membershipId, profileId, orgId]
      );

      await client.query('COMMIT');
      
      // Invalidate the cache since we updated the organization manually via SQL
      organizationManager.invalidateCache();
      
      // Return the updated organization
      const orgRes = await client.query(`
        SELECT id, name, logo, primary_color as "primaryColor", secondary_color as "secondaryColor",
               is_claimed as "isClaimed", creator_id as "creatorId"
        FROM organizations WHERE id = $1`, [orgId]);
      return orgRes.rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getUserBadges(userId: string): Promise<UserBadge[]> {
    const res = await this.pool.query(`
        SELECT id, user_id as "userId", badge_type as "badgeType", earned_at as "earnedAt"
        FROM user_badges
        WHERE user_id = $1
        ORDER BY earned_at DESC
    `, [userId]);
    return res.rows;
  }
}

export const referralManager = new ReferralManager();
