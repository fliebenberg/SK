export interface GameDispute {
  id: string;
  gameId: string;
  gameEventId: string;
  type: 'UNDO' | 'UPDATE';
  initiatorOrgProfileId: string;
  status: 'OPEN' | 'RESOLVED_APPROVED' | 'RESOLVED_REJECTED';
  expiresAt: string;
  createdAt: string;
  resolvedAt?: string;
  updateData?: any;
  
  // Computed fields (Tally)
  votes: { vote: 'APPROVE' | 'REJECT', voterName: string, voterId?: string }[];
  adminVotes: { approve: number, reject: number };
  totalEligibleVoters: number;
  approveCount: number;
  rejectCount: number;
  disputeConfig: {
    heading: string;
    approveLabel: string;
    rejectLabel: string;
  };
}
