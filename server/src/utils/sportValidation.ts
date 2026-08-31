import {
  ActionStepType,
  EventSection,
  EventTemplate,
  MatchTopology,
  SportParticipantType,
  TemplateDisputeType,
} from '@sk/shared';

/**
 * Validation for the admin sport create/update routes.
 *
 * It lives apart from the route handlers because it is the only thing standing between the sport
 * editor and live scoring: a sport's event templates decide what a scorer is asked and what the
 * server does with the answers, so a malformed one is not a display bug — it is a match that
 * cannot be recorded correctly. Keeping it here also means it can be exercised directly against
 * the seed specs.
 */

const isBlank = (value: any): boolean => typeof value !== 'string' || value.trim() === '';

/**
 * Validates a sport's event sections — the panels the scoring control room stacks.
 *
 * Sections are referenced by id from every template that files under one, so a duplicate id would
 * make "which panel does this event appear on" ambiguous, and a blank one would file events under
 * a panel that can never be drawn.
 */
function parseEventSections(sections: any): { error: string } | { sections: EventSection[] } {
  if (!Array.isArray(sections)) {
    return { error: "Event sections must be a list." };
  }

  const seen = new Set<string>();
  for (const section of sections) {
    if (!section || typeof section !== 'object') {
      return { error: "Every event section must be an object." };
    }
    if (isBlank(section.id)) return { error: "Every event section needs an id." };
    if (isBlank(section.name)) return { error: `Event section "${section.id}" needs a name.` };
    if (seen.has(section.id)) return { error: `Duplicate event section id "${section.id}".` };
    seen.add(section.id);
  }

  return { sections: sections as EventSection[] };
}

/**
 * Validates the event templates submitted by the sport editor.
 *
 * Templates drive live scoring, so a malformed one is not a cosmetic problem: an unknown step type
 * renders nothing, a dangling `triggerEventId` spawns a follow-up the client cannot resolve, and a
 * duplicate id makes `findOutcome` return whichever came first. Everything checked here is
 * something the scoring dialog or the mutation engine would otherwise trip over at match time.
 */
export function parseEventTemplates(
  templates: any,
  /**
   * The sections submitted alongside, when there are any. A template may only file under a
   * section the sport declares; with no list supplied — a caller updating templates alone — the
   * section is checked for shape only, since we cannot know what the sport declares.
   */
  sections?: EventSection[]
): { error: string } | { templates: EventTemplate[] } {
  if (!Array.isArray(templates)) {
    return { error: "Event templates must be a list." };
  }

  const sectionIds = sections ? new Set(sections.map((section) => section.id)) : null;

  const stepTypes = Object.values(ActionStepType) as string[];
  const disputeTypes = Object.values(TemplateDisputeType) as string[];
  const seenTemplateIds = new Set<string>();
  const templateIds = new Set<string>(templates.map((t: any) => t?.id).filter(Boolean));

  const validateSteps = (steps: any, label: string, depth = 0): string | null => {
    if (steps === undefined) return `${label} must declare at least one step.`;
    if (!Array.isArray(steps)) return `${label} steps must be a list.`;
    for (const step of steps) {
      if (!step || !stepTypes.includes(step.type)) {
        return `${label} has a step with an unknown type "${step?.type}".`;
      }
      if (step.type === ActionStepType.GROUP) {
        if (depth > 0) return `${label} nests groups more than one level deep.`;
        const nested = validateSteps(step.steps, label, depth + 1);
        if (nested) return nested;
      }
      if (step.type === ActionStepType.CUSTOM_WIDGET) {
        if (isBlank(step.widgetName)) return `${label} has a widget step with no widget name.`;
        if (isBlank(step.dataKey)) return `${label} has a widget step with no data key.`;
      }
    }
    return null;
  };

  for (const template of templates) {
    if (!template || typeof template !== 'object') {
      return { error: "Every event template must be an object." };
    }
    if (isBlank(template.id)) return { error: "Every event template needs an id." };
    if (isBlank(template.name)) return { error: `Event template "${template.id}" needs a name.` };
    if (seenTemplateIds.has(template.id)) {
      return { error: `Duplicate event template id "${template.id}".` };
    }
    seenTemplateIds.add(template.id);

    const label = `Event template "${template.id}"`;

    if (isBlank(template.section)) {
      return { error: `${label} needs a section.` };
    }
    if (sectionIds && !sectionIds.has(template.section)) {
      return { error: `${label} is filed under "${template.section}", which is not a section on this sport.` };
    }
    if (template.points !== undefined && template.points !== null && !Number.isFinite(Number(template.points))) {
      return { error: `${label} has non-numeric points.` };
    }

    const stepError = validateSteps(template.steps, label);
    if (stepError) return { error: stepError };

    // A trigger that names a template we are not saving would spawn an unresolvable follow-up.
    const triggers: Array<{ id?: string; team?: string; where: string }> = [
      { id: template.triggerEventId, team: template.triggerTeam, where: label }
    ];

    const seenOutcomeIds = new Set<string>();
    for (const outcome of template.outcomes || []) {
      if (!outcome || isBlank(outcome.id)) return { error: `${label} has an outcome with no id.` };
      if (isBlank(outcome.name)) return { error: `${label} outcome "${outcome.id}" needs a name.` };
      if (seenOutcomeIds.has(outcome.id)) {
        return { error: `${label} has duplicate outcome id "${outcome.id}".` };
      }
      seenOutcomeIds.add(outcome.id);
      if (outcome.points !== undefined && outcome.points !== null && !Number.isFinite(Number(outcome.points))) {
        return { error: `${label} outcome "${outcome.id}" has non-numeric points.` };
      }
      triggers.push({ id: outcome.triggerEventId, team: outcome.triggerTeam, where: `${label} outcome "${outcome.id}"` });
    }

    for (const trigger of triggers) {
      if (trigger.id !== undefined && trigger.id !== null && trigger.id !== '') {
        if (!templateIds.has(trigger.id)) {
          return { error: `${trigger.where} triggers "${trigger.id}", which is not an event on this sport.` };
        }
      }
      if (trigger.team !== undefined && trigger.team !== 'same' && trigger.team !== 'opponent') {
        return { error: `${trigger.where} has an invalid trigger team "${trigger.team}".` };
      }
    }

    const seenReasonIds = new Set<string>();
    for (const group of template.reasons || []) {
      if (!group || isBlank(group.name)) return { error: `${label} has a reason group with no name.` };
      if (!Array.isArray(group.options) || group.options.length === 0) {
        return { error: `${label} reason group "${group.name}" has no options.` };
      }
      for (const option of group.options) {
        if (!option || isBlank(option.id)) return { error: `${label} has a reason with no id.` };
        if (isBlank(option.name)) return { error: `${label} reason "${option.id}" needs a name.` };
        if (seenReasonIds.has(option.id)) {
          return { error: `${label} has duplicate reason id "${option.id}".` };
        }
        seenReasonIds.add(option.id);
      }
    }

    if (template.disputeConfig && !disputeTypes.includes(template.disputeConfig.type)) {
      return { error: `${label} has an unknown dispute type "${template.disputeConfig.type}".` };
    }
  }

  return { templates: templates as EventTemplate[] };
}

// Validates the enum-backed and numeric fields shared by the admin sport create/update routes.
// Returns an error message when something is off, or the sanitised values to persist.
export function parseSportWriteFields(body: any): { error: string } | {
  participantType?: SportParticipantType;
  matchTopology?: MatchTopology;
  defaultSettings: any;
  eventSections?: EventSection[];
  eventTemplates?: EventTemplate[];
} {
  const { participantType, matchTopology, defaultSettings, eventSections, eventTemplates } = body;

  if (participantType !== undefined && !Object.values(SportParticipantType).includes(participantType)) {
    return { error: `Invalid participant type "${participantType}".` };
  }
  if (matchTopology !== undefined && !Object.values(MatchTopology).includes(matchTopology)) {
    return { error: `Invalid match topology "${matchTopology}".` };
  }

  const settings = { ...(defaultSettings || {}) };

  // Numeric settings arrive from a text input, so reject anything that is not a non-negative number
  // rather than storing NaN in the JSONB column.
  for (const key of ['maxReserves', 'yellowCardDurationMS', 'redCardDurationMS', 'periodLengthMS', 'scheduledPeriods']) {
    const value = settings[key];
    if (value === undefined || value === null || value === '') {
      delete settings[key];
      continue;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { error: `"${key}" must be a non-negative number.` };
    }
    settings[key] = parsed;
  }

  if (settings.positions !== undefined && !Array.isArray(settings.positions)) {
    return { error: "Positions must be a list." };
  }

  // Omitted rather than empty means "leave the stored value alone" — the manager only overwrites
  // these columns when a value is supplied.
  let sections: EventSection[] | undefined;
  if (eventSections !== undefined) {
    const parsed = parseEventSections(eventSections);
    if ('error' in parsed) return { error: parsed.error };
    sections = parsed.sections;
  }

  let templates: EventTemplate[] | undefined;
  if (eventTemplates !== undefined) {
    const parsed = parseEventTemplates(eventTemplates, sections);
    if ('error' in parsed) return { error: parsed.error };
    templates = parsed.templates;
  }

  // A section nothing files under is fine; a section that disappears from under live templates
  // is not, and would leave those events on a panel that is never drawn.
  if (sections && templates) {
    const sectionIds = new Set(sections.map((section) => section.id));
    const orphaned = templates.filter((template) => !sectionIds.has(template.section));
    if (orphaned.length > 0) {
      return {
        error: `${orphaned.length} event(s) are filed under a section that no longer exists: ${orphaned
          .map((template) => template.id)
          .join(', ')}.`,
      };
    }
  }

  return {
    participantType,
    matchTopology,
    defaultSettings: settings,
    eventSections: sections,
    eventTemplates: templates,
  };
}
