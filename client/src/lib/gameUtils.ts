import { GameEvent, Sport, GameParticipant, ActionStepType } from "@sk/types";

/**
 * Resolves an event template from a sport configuration.
 * Sport neutral.
 */
export function resolveEventTemplate(evt: GameEvent, sport: Sport | undefined) {
    const eventData = evt.eventData || (evt as any).event_data || {};
    const templateId = eventData.templateId || evt.subType;
    
    // STRICT ID LOOKUP ONLY
    const template = sport?.eventTemplates?.find(t => t.id === templateId);

    let error = "";
    let warning = "";

    if (!template && templateId) {
        warning = `Template "${templateId}" not found.`;
    }

    return { template, sport, error, warning };
}

/**
 * Generates a display label for a game event based on its template and data.
 * Sport neutral.
 */
export function getEventLabel(evt: GameEvent, sport: Sport | undefined) {
    const eventData = evt.eventData || (evt as any).event_data || {};
    const { template } = resolveEventTemplate(evt, sport);
    
    let label = "";
    let warning = "";
    let error = "";

    if (template) {
        label = template.displayPattern || ((eventData.outcome || template.pendingOutcomeLabel) ? "{name} → {outcome}" : "{name}");
        
        // Resolve Outcome
        let outcome = eventData.outcome;
        const outcomeStep = template.steps
            .flatMap(s => s.type === ActionStepType.GROUP ? (s.steps || []) : [s])
            .find(s => s.type === ActionStepType.OUTCOME_SELECTION);
            
        const outcomeObj = outcomeStep?.outcomes?.find(o => o.id === outcome);
        
        if (outcomeObj && outcomeObj.displayOverride !== undefined) {
            outcome = outcomeObj.displayOverride;
        } else if (outcome && template.outcomeOverrides && template.outcomeOverrides[outcome]) {
            outcome = template.outcomeOverrides[outcome];
        } else if (outcomeObj) {
            outcome = outcomeObj.name;
        }

        if (!outcome && template.pendingOutcomeLabel) {
            outcome = template.pendingOutcomeLabel;
        }

        // Resolve Reason
        let reason = eventData.reason;
        const reasonStep = template.steps
            .flatMap(s => s.type === ActionStepType.GROUP ? (s.steps || []) : [s])
            .find(s => s.type === ActionStepType.REASON_SELECTION);
        
        const reasonOpt = reasonStep?.reasons?.flatMap(g => g.options).find(o => o.id === reason);
        if (reasonOpt) {
            reason = reasonOpt.name;
        }

        // Fill the pattern
        label = label
            .replace(/{name}/g, template.name.toUpperCase())
            .replace(/{outcome\|([^}]+)}/g, (match, fallback) => {
                return outcome !== undefined ? outcome.toUpperCase() : fallback.toUpperCase();
            })
            .replace(/{outcome}/g, (outcome !== undefined ? outcome : "").toUpperCase())
            .replace(/{reason\|([^}]+)}/g, (match, fallback) => {
                return reason !== undefined ? reason.toUpperCase() : fallback.toUpperCase();
            })
            .replace(/{reason}/g, (reason !== undefined ? reason : "").toUpperCase());

        return {
            label: label.trim().replace(/\s*→\s*$/, ""),
            template,
            error,
            warning
        };
    }

    // Fallback for events without templates
    const key = evt.subType || evt.type;
    switch (key) {
        case 'GAME_STARTED': label = 'MATCH STARTED'; break;
        case 'GAME_ENDED': label = 'MATCH FINISHED'; break;
        case 'GAME_CANCELLED': label = 'MATCH CANCELLED'; break;
        case 'GAME_UPDATED': label = 'MATCH UPDATED'; break;
        case 'PERIOD_STARTED': label = 'PERIOD STARTED'; break;
        case 'PERIOD_ENDED': label = 'PERIOD ENDED'; break;
        case 'CLOCK_PAUSED': label = 'CLOCK PAUSED'; break;
        case 'CLOCK_RESUMED': label = 'CLOCK RESUMED'; break;
        default: label = key.replace(/_/g, ' ').toUpperCase(); break;
    }

    return { label, template: null, error, warning };
}

/**
 * Returns the team color for an event based on which participant it belongs to.
 * Sport neutral.
 */
export function getTeamColor(event: GameEvent, participants: GameParticipant[] | undefined) {
    if (event.gameParticipantId && participants) {
        const participant = participants.find(p => p.id === event.gameParticipantId);
        if (participant?.teamId) {
            const index = participants.indexOf(participant);
            return index === 0 ? 'bg-blue-500' : 'bg-red-500';
        }
    }
    return 'bg-sunken-bg';
}
