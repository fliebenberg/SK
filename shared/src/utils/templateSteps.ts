import { ActionStep, ActionStepType, Outcome, ReasonGroup, ReasonOption, TriggerTeam } from '../models/sport/EventTemplate';

/**
 * Helpers for reading an event template.
 *
 * A template separates *what an event means* from *how it is captured*. The meaning —
 * `outcomes` and `reasons` — sits on the template itself, and the server reads only that.
 * The capture flow is `steps`, a tree in which a `GROUP` holds its own `steps` and renders as
 * a single screen, and it concerns the scoring dialog alone.
 *
 * The tree is deliberately not exported in any form. Ask the questions below instead of
 * walking `template.steps` yourself, and grouping can never silently change an answer. The one
 * caller that genuinely needs the structure — the dialog, which draws the screens — uses
 * {@link getScreens}.
 */

/** A template, loosely typed so clients holding untyped sport specs can call these too. */
type TemplateLike = {
  steps?: ActionStep[];
  outcomes?: Outcome[];
  reasons?: ReasonGroup[];
  triggerEventId?: string;
  triggerTeam?: TriggerTeam;
  triggerEventData?: Record<string, any>;
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
 * The outcomes the template offers, or an empty array if it defines none.
 *
 * Options are normalised: a spec may store one as a bare string rather than an object, and no
 * caller should have to handle both.
 */
export function getOutcomes(template: TemplateLike): Outcome[] {
  const outcomes = (template?.outcomes || []) as (Outcome | string)[];
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

/** Whether the template ends in a chosen outcome at all. */
export function hasOutcomes(template: TemplateLike): boolean {
  return getOutcomes(template).length > 0;
}

/** The definition of a chosen outcome, or undefined if the template does not define it. */
export function findOutcome(template: TemplateLike, outcomeId: string | null | undefined): Outcome | undefined {
  if (!outcomeId) return undefined;
  return getOutcomes(template).find((outcome) => outcome.id === outcomeId);
}

/**
 * The reason groups the template offers, normalised, keeping the grouping the spec declared —
 * the dialog renders reasons under their group headings. Use {@link getReasonOptions} when the
 * grouping does not matter.
 */
export function getReasonGroups(template: TemplateLike): ReasonGroup[] {
  const groups = (template?.reasons || []) as ReasonGroup[];
  const normalised: ReasonGroup[] = [];
  for (const group of groups) {
    if (!group) continue;
    const options: ReasonOption[] = [];
    for (const option of (group.options || []) as (ReasonOption | string)[]) {
      if (typeof option === 'string') {
        options.push({ id: option, name: option });
      } else if (option) {
        options.push({ ...option, id: option.id || option.name, name: option.name || option.id });
      }
    }
    normalised.push({ name: group.name || 'General', options });
  }
  return normalised;
}

/** The reason options the template offers, flattened across reason groups and normalised. */
export function getReasonOptions(template: TemplateLike): ReasonOption[] {
  const options: ReasonOption[] = [];
  for (const group of getReasonGroups(template)) {
    options.push(...group.options);
  }
  return options;
}

/** Whether the template attributes its events to a reason at all. */
export function hasReasons(template: TemplateLike): boolean {
  return getReasonOptions(template).length > 0;
}

/** The definition of a chosen reason, or undefined if the template does not define it. */
export function findReason(template: TemplateLike, reasonId: string | null | undefined): ReasonOption | undefined {
  if (!reasonId) return undefined;
  return getReasonOptions(template).find((option) => (option.id || option.name) === reasonId);
}

/**
 * Whether an individual player should be recorded, given the reason chosen so far.
 *
 * True unless the reason explicitly says otherwise, and true while no reason has been chosen —
 * an unanswered reason must not suppress the player prompt that follows it.
 *
 * Three layers have to agree on this or the data goes wrong: the dialog skips the player screen,
 * the event feed does not flag a missing player, and the mutation engine clears any actor that
 * was set anyway. Each used to spell out its own `=== false` check; the default lives here now.
 */
export function reasonRequiresPlayer(template: TemplateLike, reasonId: string | null | undefined): boolean {
  return findReason(template, reasonId)?.specifyPlayer !== false;
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
 *
 * So does `eventData`, the answers the child starts with — a scrum awarded from a free kick opens
 * with its reason already set. Same argument: the trigger, its side and what it carries are one
 * decision the spec makes, and a caller that resolves one without the others gets it wrong.
 */
export function getTriggerFor(
  template: TemplateLike,
  outcomeId: string | null | undefined
): { eventId: string; team: TriggerTeam; eventData: Record<string, any> } | undefined {
  const outcome = findOutcome(template, outcomeId);
  const source = outcome?.triggerEventId ? outcome : template?.triggerEventId ? template : undefined;
  if (!source?.triggerEventId) return undefined;
  return {
    eventId: source.triggerEventId,
    team: source.triggerTeam || 'same',
    eventData: { ...(source.triggerEventData || {}) },
  };
}

/** What has been answered so far, for deciding which steps still apply. */
export interface ScreenContext {
  /** The chosen reason, if the flow has reached and answered its reason step. */
  reason?: string | null;
}

/**
 * Whether a step no longer applies given what has been answered.
 *
 * Only one rule so far: a reason with `specifyPlayer: false` has no individual offender, so the
 * player prompt is dropped rather than collecting an attribution the server would discard.
 */
function isStepSkipped(template: TemplateLike, step: ActionStep, context: ScreenContext): boolean {
  if (step.type === ActionStepType.PLAYER_SELECTION) {
    return !reasonRequiresPlayer(template, context.reason);
  }
  return false;
}

/**
 * The template's steps as the screens a scoring dialog should render, in spec order: one
 * screen per top-level step, with a `GROUP` becoming a single screen holding its children.
 *
 * Screens with nothing left on them are dropped — an empty group, or one whose every step has
 * been skipped by `context`. Pass the answers collected so far to get the live flow; call it
 * bare for the template's full shape.
 */
export function getScreens(template: TemplateLike, context: ScreenContext = {}): TemplateScreen[] {
  const screens: TemplateScreen[] = [];
  for (const step of template?.steps || []) {
    const steps = (isGroup(step) ? flattenSteps(step.steps) : [step]).filter(
      (candidate) => !isStepSkipped(template, candidate, context)
    );
    if (steps.length === 0) continue;
    screens.push({ name: step.name, steps });
  }
  return screens;
}
