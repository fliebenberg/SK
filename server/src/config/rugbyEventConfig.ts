import { DisputeConfig, GameEvent } from "@sk/types";

/**
 * Returns a DisputeConfig for a given game event.
 * This is the single place where sport-specific dispute display logic lives.
 * To support a new event type, add a new case here — the client panel needs no changes.
 */
export function getDisputeConfig(event: GameEvent): DisputeConfig {
    if (event.subType === 'Conversion') {
        const wasSuccessful = event.eventData?.successful === true || event.eventData?.successful === 'true';
        return {
            heading: 'Change Conversion',
            // APPROVE = toggle the outcome
            approveLabel: wasSuccessful ? 'Missed' : 'Converted',
            rejectLabel: wasSuccessful ? 'Converted' : 'Missed',
        };
    }

    // Default: standard remove-event dispute
    return {
        heading: 'Remove Event',
        approveLabel: 'Approve',
        rejectLabel: 'Reject',
    };
}
