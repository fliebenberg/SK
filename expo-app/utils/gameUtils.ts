import {
  GameEvent,
  Sport,
  GameParticipant,
  ActionStepType,
  findOutcome,
  findReason,
  hasOutcomes,
  hasReasons,
  hasStep,
  reasonRequiresPlayer,
} from '@sk/shared';

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
    const outcomeObj = findOutcome(template, outcome);

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
    const reasonOpt = findReason(template, reason);
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

  const missing: ('player' | 'reason' | 'outcome')[] = [];
  const eventData = evt.eventData || {};

  // A detail counts as missing when the template both asks for it (a step) and defines answers
  // for it (template-level `reasons` / `outcomes`) — a picker with nothing to pick is not a gap.
  // Steps are optional by default, so this drives the feed's chips only; `required` is what
  // actually blocks a save, and that is the dialog's business.

  // 1. Reason Selection
  if (hasStep(template, ActionStepType.REASON_SELECTION) && hasReasons(template) && !eventData.reason) {
    missing.push('reason');
  }

  // 2. Outcome Selection
  if (hasStep(template, ActionStepType.OUTCOME_SELECTION) && hasOutcomes(template) && !eventData.outcome) {
    missing.push('outcome');
  }

  // 3. Player Selection
  if (hasStep(template, ActionStepType.PLAYER_SELECTION) && !evt.actorOrgProfileId) {
    const hasPlayers = roster && roster.length > 0;
    if (hasPlayers) {
      // The dialog hides the player screen for these, so flagging it would point at a screen
      // the scorer was never shown.
      const skippedByReason = !reasonRequiresPlayer(template, eventData.reason);
      const excludedByOutcome = findOutcome(template, eventData.outcome)?.excludePlayer === true;

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
