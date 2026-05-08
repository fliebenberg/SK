export interface DisputeConfig {
    heading: string;
    approveLabel: string;
    rejectLabel: string;
    approveSublabel?: string;
    rejectSublabel?: string;
}

export interface DisputeResolutionHandler {
    /** Return an optional custom dispute config based on the event */
    getDisputeConfig?(eventData: any, subType: string): DisputeConfig | undefined;
    
    /** Handle the dispute resolution DB operations and broadcasts. Return true if handled. */
    handleApprovedDispute(
        dispute: any, 
        gameEvent: any, 
        manager: any
    ): Promise<boolean>;
}
