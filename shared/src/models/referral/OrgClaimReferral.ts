export interface OrgClaimReferral {
    id: string;
    organizationId: string;
    referredEmail: string;
    referredByUserId: string;
    claimToken?: string; // Private to server usually, but might be needed for debug or specific flows? referManager returns it.
    status: 'pending' | 'claimed' | 'expired' | 'declined' | 'referred';
    claimedByUserId?: string;
    createdAt: Date;
    claimedAt?: Date;
}
