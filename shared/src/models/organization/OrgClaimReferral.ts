export interface OrgClaimReferral {
  id: string;
  orgId: string;
  referredEmail: string;
  referredByUserId: string;
  claimToken?: string;
  status: 'pending' | 'claimed' | 'expired' | 'declined';
  claimedByUserId?: string;
  createdAt: Date;
  claimedAt?: Date;
}
