/**
 * What a signed-in user may know about an organisation's claim state before nominating someone.
 *
 * Deliberately lean and strictly the caller's own view: another user's nomination is not
 * reported at all, so an org someone else has already invited still asks this caller. Entering
 * the same address counts the caller as a nominator of it (see `org_claim_referral_nominators`)
 * without sending a second email inside the cooldown. Nominations never expire (see
 * docs/nomination-process.md), so "pending" is "current".
 */
export interface OrgClaimStatus {
    orgId: string;
    isClaimed: boolean;
    /** Pending nominations for this org that the caller made or joined. */
    myPendingEmails: string[];
}

export interface OrgClaimReferral {
    id: string;
    orgId: string;
    referredEmail: string;
    referredByUserId: string;
    claimToken?: string; // Private to server usually, but might be needed for debug or specific flows? referManager returns it.
    status: 'pending' | 'claimed' | 'expired' | 'declined' | 'referred';
    claimedByUserId?: string;
    createdAt: string; // ISO UTC
    claimedAt?: string; // ISO UTC
    /** When the invitation email last went out; resends are gated on this, not `createdAt`. */
    lastSentAt?: string; // ISO UTC
    /**
     * On the result of `REFER_ORG_CONTACT` only: whether this call sent an email. `false` when the
     * address was already invited inside the cooldown (the caller is still recorded as a nominator)
     * or the nominee has already claimed or declined.
     */
    emailSent?: boolean;
}
