import { GameEvent, Sport, GameParticipant, ActionStepType } from '@sk/types';

/**
 * Resolves an event template from a sport configuration.
 */
export function resolveEventTemplate(evt: GameEvent, sport: Sport | undefined) {
  const eventData = evt.eventData || (evt as any).event_data || {};
  const templateId = eventData.templateId || evt.subType;

  // STRICT ID LOOKUP ONLY
  const template = sport?.eventTemplates?.find((t) => t.id === templateId);

  let error = '';
  let warning = '';

  if (!template && templateId) {
    warning = `Template "${templateId}" not found.`;
  }

  return { template, sport, error, warning };
}

/**
 * Generates a display label for a game event based on its template and data.
 */
export function getEventLabel(evt: GameEvent, sport: Sport | undefined) {
  const eventData = evt.eventData || (evt as any).event_data || {};
  const { template } = resolveEventTemplate(evt, sport);

  let label = '';
  let warning = '';
  let error = '';

  if (template) {
    label = template.displayPattern || (eventData.outcome || template.pendingOutcomeLabel ? '{name} → {outcome}' : '{name}');

    // Resolve Outcome
    let outcome = eventData.outcome;
    const isPending = outcome === undefined || outcome === null;
    const outcomeStep = template.steps
      .flatMap((s: any) => (s.type === ActionStepType.GROUP ? s.steps || [] : [s]))
      .find((s: any) => s.type === ActionStepType.OUTCOME_SELECTION);

    const outcomeObj = outcomeStep?.outcomes?.find((o: any) => o.id === outcome);

    if (outcomeObj && outcomeObj.displayOverride !== undefined) {
      outcome = outcomeObj.displayOverride;
    } else if (outcome && template.outcomeOverrides && template.outcomeOverrides[outcome]) {
      outcome = template.outcomeOverrides[outcome];
    } else if (outcomeObj) {
      outcome = outcomeObj.name;
    }

    const isScoringTemplate = template.section === 'Scoring' || (template.points && template.points > 0);
    if (isPending && isScoringTemplate) {
      outcome = template.pendingOutcomeLabel || 'PENDING';
    }

    // Resolve Reason
    let reason = eventData.reason;
    const reasonStep = template.steps
      .flatMap((s: any) => (s.type === ActionStepType.GROUP ? s.steps || [] : [s]))
      .find((s: any) => s.type === ActionStepType.REASON_SELECTION);

    const reasonOpt = reasonStep?.reasons?.flatMap((g: any) => g.options).find((o: any) => o.id === reason);
    if (reasonOpt) {
      reason = reasonOpt.name;
    }

    // Fill the pattern
    label = label
      .replace(/{name}/g, (template.name || '').toUpperCase())
      .replace(/{outcome\|([^}]+)}/g, (_match, fallback) => {
        return (outcome != null ? String(outcome) : fallback || '').toUpperCase();
      })
      .replace(/{outcome}/g, (outcome != null ? String(outcome) : '').toUpperCase())
      .replace(/{reason\|([^}]+)}/g, (_match, fallback) => {
        return (reason != null ? String(reason) : fallback || '').toUpperCase();
      })
      .replace(/{reason}/g, (reason != null ? String(reason) : '').toUpperCase());

    return {
      label: label.trim().replace(/\s*→\s*$/, ''),
      template,
      error,
      warning,
    };
  }

  // Fallback for events without templates
  const key = evt.subType || evt.type || '';
  switch (key) {
    case 'GAME_STARTED':
      label = 'MATCH STARTED';
      break;
    case 'GAME_ENDED':
      label = 'MATCH FINISHED';
      break;
    case 'GAME_CANCELLED':
      label = 'MATCH CANCELLED';
      break;
    case 'GAME_UPDATED':
      label = 'MATCH UPDATED';
      break;
    case 'PERIOD_STARTED':
      label = 'PERIOD STARTED';
      break;
    case 'PERIOD_ENDED':
      label = 'PERIOD ENDED';
      break;
    case 'CLOCK_PAUSED':
      label = 'CLOCK PAUSED';
      break;
    case 'CLOCK_RESUMED':
      label = 'CLOCK RESUMED';
      break;
    default:
      label = String(key).replace(/_/g, ' ').toUpperCase();
      break;
  }

  return { label, template: null, error, warning };
}

/**
 * Identifies missing required steps for an event (e.g. player, reason, outcome).
 */
export function getMissingDetails(evt: GameEvent, template: any, roster?: any[]) {
  if (!template || !template.steps) return [];

  const flatSteps = template.steps.flatMap((s: any) => (s.type === ActionStepType.GROUP || s.type === 'GROUP' ? s.steps || [] : [s]));
  const missing: ('player' | 'reason' | 'outcome')[] = [];
  const eventData = evt.eventData || {};

  // 1. Reason Selection
  const hasReasonStep = flatSteps.some((s: any) => s.type === ActionStepType.REASON_SELECTION || s.type === 'REASON_SELECTION');
  if (hasReasonStep && !eventData.reason) {
    missing.push('reason');
  }

  // 2. Outcome Selection
  const hasOutcomeStep = flatSteps.some((s: any) => s.type === ActionStepType.OUTCOME_SELECTION || s.type === 'OUTCOME_SELECTION');
  if (hasOutcomeStep && !eventData.outcome) {
    missing.push('outcome');
  }

  // 3. Player Selection
  const hasPlayerStep = flatSteps.some((s: any) => s.type === ActionStepType.PLAYER_SELECTION || s.type === 'PLAYER_SELECTION');
  if (hasPlayerStep && !evt.actorOrgProfileId) {
    const hasPlayers = roster && roster.length > 0;
    if (hasPlayers) {
      let skippedByReason = false;
      if (eventData.reason) {
        const reasonStep = flatSteps.find((s: any) => s.type === ActionStepType.REASON_SELECTION || s.type === 'REASON_SELECTION');
        const reasonOpt = reasonStep?.reasons?.flatMap((g: any) => g.options).find((o: any) => (typeof o === 'string' ? o === eventData.reason : o.id === eventData.reason));
        if (reasonOpt && typeof reasonOpt === 'object' && reasonOpt.specifyPlayer === false) {
          skippedByReason = true;
        }
      }

      let excludedByOutcome = false;
      if (eventData.outcome) {
        const outcomeStep = flatSteps.find((s: any) => s.type === ActionStepType.OUTCOME_SELECTION || s.type === 'OUTCOME_SELECTION');
        const outcomeOpt = outcomeStep?.outcomes?.find((o: any) => (typeof o === 'string' ? o === eventData.outcome : o.id === eventData.outcome));
        if (outcomeOpt && typeof outcomeOpt === 'object' && outcomeOpt.excludePlayer === true) {
          excludedByOutcome = true;
        }
      }

      if (!skippedByReason && !excludedByOutcome) {
        missing.push('player');
      }
    }
  }

  return missing;
}

/**
 * Returns team accent bar class based on participant index.
 */
export function getTeamColor(event: GameEvent, participants: GameParticipant[] | undefined) {
  if (event.gameParticipantId && participants) {
    const participant = participants.find((p) => p.id === event.gameParticipantId);
    if (participant?.teamId) {
      const index = participants.indexOf(participant);
      return index === 0 ? 'bg-blue-500' : 'bg-red-500';
    }
  }
  return 'bg-slate-400';
}
