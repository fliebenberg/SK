import {
  GameEvent,
  Sport,
  GameParticipant,
  ActionStepType,
  hasOutcomes,
  hasReasons,
  hasStep,
  isScoringTemplate,
  reasonRequiresPlayer,
  resolveOutcomeLabel,
  resolveReasonLabel,
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

  // An event records the words it was captured with, so a row can be drawn from the event alone.
  // The template is still consulted for the pattern, for the pending label, and to resolve rows
  // recorded before the labels were stored.
  const capturedName = eventData.templateName;
  const hasCapturedLabels =
    capturedName !== undefined || eventData.outcomeName !== undefined || eventData.reasonName !== undefined;

  if (template || hasCapturedLabels) {
    const eventName = capturedName ?? template?.name ?? '';
    label =
      template?.displayPattern ||
      (eventData.outcome || eventData.outcomeName !== undefined || template?.pendingOutcomeLabel
        ? '{name} → {outcome}'
        : '{name}');

    // Resolve Outcome — what was captured wins, including a deliberate empty string.
    const isPending = eventData.outcome === undefined || eventData.outcome === null;
    let outcome =
      eventData.outcomeName !== undefined
        ? eventData.outcomeName
        : resolveOutcomeLabel(template, eventData.outcome) ?? eventData.outcome;

    if (isPending && isScoringTemplate(sport, template)) {
      outcome = template?.pendingOutcomeLabel || 'PENDING';
    }

    // Resolve Reason
    const reason =
      eventData.reasonName !== undefined
        ? eventData.reasonName
        : resolveReasonLabel(template, eventData.reason) ?? eventData.reason;

    // Fill the pattern
    label = label
      .replace(/{name}/g, eventName.toUpperCase())
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
    case 'SIDE_CHANGED':
      // Somebody else played in an entrant's place for this match (FIX-20).
      label = `${String(evt.eventData?.toName || 'ANOTHER TEAM').toUpperCase()} PLAYED FOR ${String(
        evt.eventData?.fromName || 'THE DRAWN TEAM'
      ).toUpperCase()}`;
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
    // The dialog hides the player screen when the chosen reason has no individual offender, so
    // flagging it would point at a screen the scorer was never shown.
    if (hasPlayers && reasonRequiresPlayer(template, eventData.reason)) {
      missing.push('player');
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
