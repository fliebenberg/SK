import { ActionStep, ActionStepType, Outcome, ReasonOption, TriggerTeam } from '../models/sport/EventTemplate';

/**
 * Helpers for reading an event template's `steps`.
 *
 * `steps` is a tree: a step of type `GROUP` holds its own `steps` and renders as a single
 * screen in the scoring dialog. Almost no caller cares about that shape — they want to know
 * "what outcomes exist" or "does this template collect a player", which are questions about
 * the whole set of steps regardless of how they are grouped.
 *
 * So the tree is deliberately not exported in any form. Ask the questions below instead of
 * walking `template.steps` yourself, and grouping can never silently change an answer. The
 * one caller that genuinely needs the structure — the dialog, which draws the screens — uses
 * {@link getScreens}.
 */

/** A template, loosely typed so clients holding untyped sport specs can call these too. */
type TemplateLike = {
  steps?: ActionStep[];
  triggerEventId?: string;
  triggerTeam?: TriggerTeam;
} | null | undefined;

/** One screen in the scoring dialog: a single step, or all the children of a `GROUP`. */
export interface TemplateScreen {
  /** The group's name, or the step's own, when the spec supplies one. */
  name?: string;
  /** The controls to render together on this screen. Never empty. */
  steps: ActionStep[];
}

const isGroup = (step: ActionStep): boolean => step.type === ActionStepType.GROUP;

/**
 * Every step, with groups unwrapped. Private on purpose: a flat array handed around is a flat
 * array someone can pass where the grouped one belonged, which is the mistake these helpers
 * exist to prevent.
 */
function flattenSteps(steps: ActionStep[] | undefined): ActionStep[] {
  const flat: ActionStep[] = [];
  for (const step of steps || []) {
    if (isGroup(step)) {
      flat.push(...flattenSteps(step.steps));
    } else {
      flat.push(step);
    }
  }
  return flat;
}

/** The first step of the given type, ignoring grouping. */
export function findStep(template: TemplateLike, type: ActionStepType | string): ActionStep | undefined {
  return flattenSteps(template?.steps).find((step) => step.type === type);
}

/** Every step of the given type, ignoring grouping. */
export function findSteps(template: TemplateLike, type: ActionStepType | string): ActionStep[] {
  return flattenSteps(template?.steps).filter((step) => step.type === type);
}

/** Whether the template collects this kind of input at all. */
export function hasStep(template: TemplateLike, type: ActionStepType | string): boolean {
  return findStep(template, type) !== undefined;
}

/**
 * The outcomes the template offers, or an empty array if it has no outcome step.
 *
 * Options are normalised: a spec may store one as a bare string rather than an object, and no
 * caller should have to handle both.
 */
export function getOutcomes(template: TemplateLike): Outcome[] {
  const outcomes = (findStep(template, ActionStepType.OUTCOME_SELECTION)?.outcomes || []) as (Outcome | string)[];
  const normalised: Outcome[] = [];
  for (const outcome of outcomes) {
    if (typeof outcome === 'string') {
      normalised.push({ id: outcome, name: outcome });
    } else if (outcome) {
      normalised.push({ ...outcome, id: outcome.id || outcome.name });
    }
  }
  return normalised;
}

/** The definition of a chosen outcome, or undefined if the template does not define it. */
export function findOutcome(template: TemplateLike, outcomeId: string | null | undefined): Outcome | undefined {
  if (!outcomeId) return undefined;
  return getOutcomes(template).find((outcome) => outcome.id === outcomeId);
}

/** The reason options the template offers, flattened across reason groups and normalised. */
export function getReasonOptions(template: TemplateLike): ReasonOption[] {
  const groups = findStep(template, ActionStepType.REASON_SELECTION)?.reasons || [];
  const options: ReasonOption[] = [];
  for (const group of groups) {
    for (const option of (group.options || []) as (ReasonOption | string)[]) {
      if (typeof option === 'string') {
        options.push({ id: option, name: option });
      } else if (option) {
        options.push({ ...option, id: option.id || option.name });
      }
    }
  }
  return options;
}

/** The definition of a chosen reason, or undefined if the template does not define it. */
export function findReason(template: TemplateLike, reasonId: string | null | undefined): ReasonOption | undefined {
  if (!reasonId) return undefined;
  return getReasonOptions(template).find((option) => (option.id || option.name) === reasonId);
}

/**
 * The event a template spawns as a linked child once `outcomeId` is chosen, or undefined if
 * that selection spawns nothing.
 *
 * Templates declare this two ways: per outcome (a penalty triggers a penalty kick, a scrum or
 * nothing at all, depending on what was awarded) or at template level (a try always triggers a
 * conversion). Callers should not have to know which style a template uses.
 *
 * The child's side comes back with it, because knowing what to spawn without knowing whose it
 * is has caused real mis-scoring: a penalty's kick belongs to the non-offending team, and that
 * rule used to live in the client as a hardcoded list of template ids.
 */
export function getTriggerFor(
  template: TemplateLike,
  outcomeId: string | null | undefined
): { eventId: string; team: TriggerTeam } | undefined {
  const outcome = findOutcome(template, outcomeId);
  const source = outcome?.triggerEventId ? outcome : template?.triggerEventId ? template : undefined;
  if (!source?.triggerEventId) return undefined;
  return { eventId: source.triggerEventId, team: source.triggerTeam || 'same' };
}

/**
 * The template's steps as the screens a scoring dialog should render, in spec order: one
 * screen per top-level step, with a `GROUP` becoming a single screen holding its children.
 * Groups that contain nothing are dropped.
 */
export function getScreens(template: TemplateLike): TemplateScreen[] {
  const screens: TemplateScreen[] = [];
  for (const step of template?.steps || []) {
    const steps = isGroup(step) ? flattenSteps(step.steps) : [step];
    if (steps.length === 0) continue;
    screens.push({ name: step.name, steps });
  }
  return screens;
}
