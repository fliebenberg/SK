/**
 * Describes how a dispute for a specific event should be displayed in the UI.
 * Computed server-side from the target event and attached to each active dispute.
 */
export interface DisputeConfig {
  /** Heading shown in the dispute panel, e.g. "Remove Event" or "Change Conversion" */
  heading: string;
  /** Label for the APPROVE vote button */
  approveLabel: string;
  /** Label for the REJECT vote button */
  rejectLabel: string;
}

export interface GameEvent {
  id: string;
  gameId: string;
  sequence?: number;
  timestamp: string;
  gameParticipantId?: string;
  actorOrgProfileId?: string;
  initiatorOrgProfileId?: string;
  type: string;
  subType?: string;
  eventData?: any;
}
