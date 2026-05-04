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
}
