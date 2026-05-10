import { GameEvent } from "@sk/types";

export interface TeamStats {
    tries: number;
    conversionAttempts: number;
    conversionSuccess: number;
    penaltyKickAttempts: number;
    penaltyKickSuccess: number;
    dropGoalAttempts: number;
    dropGoalSuccess: number;
    penaltyTries: number;
    penaltiesAwarded: number;
    freeKicksAwarded: number;
    yellowCards: number;
    redCards: number;
    scrumsWon: number;
    scrumsTotal: number;
    lineoutsWon: number;
    lineoutsTotal: number;
    knockOns: number;
    turnovers: number;
    tacklesMade: number;
    tacklesMissed: number;
    scrumResets: number;
}

/**
 * Calculates rugby-specific statistics from a list of game events.
 * This function is sport-specific for Rugby.
 */
export function calculateRugbyStats(events: GameEvent[], homeParticipantId?: string, awayParticipantId?: string) {
    const initialStats: TeamStats = {
        tries: 0,
        conversionAttempts: 0,
        conversionSuccess: 0,
        penaltyKickAttempts: 0,
        penaltyKickSuccess: 0,
        dropGoalAttempts: 0,
        dropGoalSuccess: 0,
        penaltyTries: 0,
        penaltiesAwarded: 0,
        freeKicksAwarded: 0,
        yellowCards: 0,
        redCards: 0,
        scrumsWon: 0,
        scrumsTotal: 0,
        lineoutsWon: 0,
        lineoutsTotal: 0,
        knockOns: 0,
        turnovers: 0,
        tacklesMade: 0,
        tacklesMissed: 0,
        scrumResets: 0,
    };

    const home: TeamStats = { ...initialStats };
    const away: TeamStats = { ...initialStats };

    events.filter(e => e.eventData?.status !== 'REMOVED').forEach(evt => {
        const isHome = evt.gameParticipantId === homeParticipantId;
        const isAway = evt.gameParticipantId === awayParticipantId;
        const side = isHome ? home : (isAway ? away : null);
        
        // Use ID for matching, not Name
        const templateId = evt.eventData?.templateId || evt.subType;
        const data = evt.eventData || {};

        if (evt.type === 'SCORE') {
            if (!side) return;
            switch (templateId) {
                case 'try':
                    if (data.outcome === 'penalty_try') {
                        side.penaltyTries++;
                    } else {
                        side.tries++;
                    }
                    break;
                case 'conversion':
                    side.conversionAttempts++;
                    if (data.successful) side.conversionSuccess++;
                    break;
                case 'penalty_kick':
                    side.penaltyKickAttempts++;
                    if (data.successful) side.penaltyKickSuccess++;
                    break;
                case 'drop_goal':
                    side.dropGoalAttempts++;
                    if (data.successful) side.dropGoalSuccess++;
                    break;
                case 'penalty_try':
                    side.penaltyTries++;
                    break;
            }
        } else if (evt.type === 'GAME_EVENT') {
            switch (templateId) {
                case 'penalty_awarded':
                    if (side) side.penaltiesAwarded++;
                    break;
                case 'free_kick':
                    if (side) side.freeKicksAwarded++;
                    break;
                case 'yellow_card':
                    if (side) side.yellowCards++;
                    break;
                case 'red_card':
                    if (side) side.redCards++;
                    break;
                case 'knock_on':
                    if (side) side.knockOns++;
                    break;
                case 'turnover':
                case 'turnover_won':
                    if (side) side.turnovers++;
                    break;
                case 'tackle_made':
                    if (side) side.tacklesMade++;
                    break;
                case 'tackle_missed':
                    if (side) side.tacklesMissed++;
                    break;
                case 'scrum':
                    if (side) {
                        side.scrumsTotal++;
                        if (data.scrumResets) {
                            side.scrumResets += data.scrumResets;
                        }
                        if (data.successful !== undefined) {
                            if (data.successful) {
                                side.scrumsWon++;
                            }
                        }
                    }
                    break;
                case 'lineout':
                    if (side) {
                        side.lineoutsTotal++;
                        if (data.winnerSide) {
                            // winnerSide: 'same' | 'other'
                            if (data.winnerSide === 'same') {
                                side.lineoutsWon++;
                            }
                        }
                    }
                    break;
            }
        }
    });

    return { home, away };
}
