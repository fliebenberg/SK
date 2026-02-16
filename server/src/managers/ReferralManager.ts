import { Pool } from 'pg';
import pool from '../db';
import { randomBytes } from 'crypto';
import { mailManager } from './MailManager';
import { userManager } from './UserManager';
import { OrgClaimReferral, UserBadge } from '@sk/types';

export class ReferralManager {
  private pool: Pool;

  constructor() {
    this.pool = pool;
  }

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  async createReferrals(organizationId: string, contactEmails: string[], referredByUserId: string): Promise<OrgClaimReferral[]> {
    const client = await this.pool.connect();
    const createdReferrals: OrgClaimReferral[] = [];

    try {
      await client.query('BEGIN');

      const orgRes = await client.query('SELECT name FROM organizations WHERE id = $1', [organizationId]);
      const orgName = orgRes.rows[0]?.name || 'Organization';

      for (const email of contactEmails) {
        // lower case email
        const normalizedEmail = email.toLowerCase().trim();

        // Check if referral already exists for this org and email
        const existingRes = await client.query(
          `SELECT id FROM org_claim_referrals WHERE organization_id = $1 AND referred_email = $2`,
          [organizationId, normalizedEmail]
        );

        if (existingRes.rows.length === 0) {
          const id = `ref-${randomBytes(8).toString('hex')}`; // Simple ID generation
          const token = this.generateToken();

          const insertRes = await client.query(
            `INSERT INTO org_claim_referrals 
            (id, organization_id, referred_email, referred_by_user_id, claim_token, status)
            VALUES ($1, $2, $3, $4, $5, 'pending')
            RETURNING id, organization_id as "organizationId", referred_email as "referredEmail", 
                      referred_by_user_id as "referredByUserId", claim_token as "claimToken", 
                      status, created_at as "createdAt"`,
            [id, organizationId, normalizedEmail, referredByUserId, token]
          );

          const referral = insertRes.rows[0];
          createdReferrals.push(referral);

          // Send Invitation Email
          try {
            const claimUrl = `${process.env.APP_URL}/claim?token=${token}`;
            await mailManager.sendClaimInvitation(normalizedEmail, orgName, claimUrl);
            
            // Notification logic
            const userRes = await client.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
            if (userRes.rows.length > 0) {
                const userId = userRes.rows[0].id;
                const notifId = `notif-${randomBytes(8).toString('hex')}`;
                await client.query(
                    `INSERT INTO notifications (id, user_id, title, message, type, link)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        notifId, 
                        userId, 
                        'Organization Claim Invitation', 
                        `You have been invited to manage ${orgName}.`, 
                        'claim_invitation', 
                        `/claim?token=${token}`
                    ]
                );
            }
          } catch (mailError) {
             console.error(`ReferralManager: Error in post-insertion logic for ${normalizedEmail}:`, mailError);
          }
        }
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return createdReferrals;
  }

  async getReferralsForOrg(organizationId: string): Promise<OrgClaimReferral[]> {
    const res = await this.pool.query(
      `SELECT id, organization_id as "organizationId", referred_email as "referredEmail", 
              referred_by_user_id as "referredByUserId", status, 
              claimed_by_user_id as "claimedByUserId", created_at as "createdAt", 
              claimed_at as "claimedAt"
       FROM org_claim_referrals 
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [organizationId]
    );
    return res.rows;
  }

  async getReferralsByUser(userId: string): Promise<OrgClaimReferral[]> {
    const res = await this.pool.query(
      `SELECT id, organization_id as "organizationId", referred_email as "referredEmail", 
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
      `SELECT id, organization_id as "organizationId", referred_email as "referredEmail", 
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
      `SELECT r.id, r.organization_id as "organizationId", r.referred_email as "referredEmail", 
              r.claim_token as "claimToken", o.name as "organizationName"
       FROM org_claim_referrals r
       JOIN organizations o ON r.organization_id = o.id
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
            `SELECT id, organization_id, referred_by_user_id FROM org_claim_referrals WHERE claim_token = $1 AND status = 'pending'`,
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
        `SELECT organization_id, referred_by_user_id FROM org_claim_referrals WHERE claim_token = $1`, // Fetching by token again is safe
        [token]
    );
     if (refRes.rows.length === 0) return []; // Should not happen given above check

    const { organization_id, referred_by_user_id } = refRes.rows[0];
    
    return this.createReferrals(organization_id, contactEmails, referred_by_user_id);
  }

  async getClaimInfo(token: string): Promise<any> {
    const res = await this.pool.query(
      `SELECT r.id, r.organization_id as "organizationId", o.name as "organizationName", o.logo as "organizationLogo", r.status
       FROM org_claim_referrals r
       JOIN organizations o ON r.organization_id = o.id
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
        `SELECT organization_id, referred_by_user_id FROM org_claim_referrals WHERE claim_token = $1 AND status = 'pending'`,
        [token]
      );
      if (refDataRes.rows.length === 0) throw new Error('Invalid or expired claim token');
      
      const { organization_id: organizationId, referred_by_user_id: referredByUserId } = refDataRes.rows[0];

      // Update referral status
      await client.query(
        `UPDATE org_claim_referrals SET status = 'claimed', claimed_by_user_id = $1, claimed_at = NOW() WHERE claim_token = $2`,
        [userId, token]
      );

      // Award "Community Builder" badge if threshold reached
      if (referredByUserId) {
          const referralCountRes = await client.query(
              `SELECT COUNT(*) FROM org_claim_referrals WHERE referred_by_user_id = $1 AND status = 'claimed'`,
              [referredByUserId]
          );
          const count = parseInt(referralCountRes.rows[0].count);
          if (count >= 3) {
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
      }

      // Update organization ownership
      await client.query(
        `UPDATE organizations SET is_claimed = true, creator_id = $1 WHERE id = $2`,
        [userId, organizationId]
      );

      // Add user as Org Admin
      const personId = await userManager.ensurePersonForUserInOrg(userId, organizationId);

      const membershipId = `om-${randomBytes(8).toString('hex')}`;
      await client.query(
        `INSERT INTO organization_memberships (id, person_id, organization_id, role_id, start_date)
         VALUES ($1, $2, $3, 'role-org-admin', NOW())`,
        [membershipId, personId, organizationId]
      );

      await client.query('COMMIT');
      
      // Return the updated organization
      const orgRes = await client.query(`
        SELECT id, name, logo, primary_color as "primaryColor", secondary_color as "secondaryColor",
               is_claimed as "isClaimed", creator_id as "creatorId"
        FROM organizations WHERE id = $1`, [organizationId]);
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
