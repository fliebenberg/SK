export interface ReasonOption {
  id: string;
  name: string;
  /**
   * Whether an individual player is at fault for this reason. Defaults to true.
   *
   * This is per *reason*, not per template, because within one template it varies: a penalty
   * for a dangerous tackle has an individual offender, one for a collapsed scrum does not. A
   * `PLAYER_SELECTION` step cannot express that on its own, so every layer that cares about
   * player attribution reads this — the scoring dialog skips the player screen, the event feed
   * does not flag the player as missing, and the mutation engine clears any actor that was set.
   */
  specifyPlayer?: boolean;
  variant?: string;
}

export interface ReasonGroup {
  name: string;
  options: ReasonOption[];
}

/**
 * Which side a triggered follow-up event belongs to, relative to the event that triggered it.
 *
 * A try's conversion is taken by the team that scored (`same`), while a penalty is recorded
 * against the offending team and the resulting kick belongs to their opponents (`opponent`).
 * Stated relative to the parent so a template never has to know how its own side was chosen.
 */
export type TriggerTeam = 'same' | 'opponent';

export interface Outcome {
  id: string;
  name: string;
  displayOverride?: string;
  points?: number;
  triggerEventId?: string;
  /** The side `triggerEventId` is recorded for. Defaults to `same`. */
  triggerTeam?: TriggerTeam;
  variant?: string;
  /** `eventData` merged onto **this** event when the outcome is chosen, e.g. `successful: true`. */
  eventData?: any;
  /**
   * `eventData` the follow-up named by `triggerEventId` **starts with**, e.g. a free kick's scrum
   * opens with its reason already set to "Free Kick".
   *
   * Deliberately separate from `eventData`: the two describe different events, and conflating them
   * corrupts the parent. A free kick's own reason is the infringement the scorer picked ("Early
   * Push"); the scrum's reason is *why the scrum was awarded*, which is the free kick itself.
   *
   * Prefilled values are answers, not decisions — the follow-up's dialog shows them selected and
   * the scorer can change any of them before saving.
   */
  triggerEventData?: Record<string, any>;
  excludePlayer?: boolean;
}

export enum ActionStepType {
  /** User selects a reason or sub-category for the event */
  REASON_SELECTION = 'REASON_SELECTION',
  /** User selects the final outcome of the action */
  OUTCOME_SELECTION = 'OUTCOME_SELECTION',
  /** User selects a specific player from the team roster */
  PLAYER_SELECTION = 'PLAYER_SELECTION',
  /** Renders a custom UI component for specialized interactions */
  CUSTOM_WIDGET = 'CUSTOM_WIDGET',
  /** Renders a form with multiple input fields */
  FORM_INPUT = 'FORM_INPUT',
  /** Groups multiple steps into a single logical block or UI section */
  GROUP = 'GROUP',
}

/**
 * One prompt in a template's scoring flow.
 *
 * A step says *where in the flow* something is asked and how it is labelled — never what the
 * answers are. The answer sets live on the template (`outcomes`, `reasons`) so that a step's
 * position, and the grouping around it, cannot change what the event means.
 */
export interface ActionStep {
  type: ActionStepType;
  name?: string;
  /**
   * Sub-steps, for `type: 'GROUP'` — they render together on one screen.
   *
   * Grouping is a layout concern and nothing else reads it: use `getScreens` if you are drawing
   * the dialog, and `findStep` / `hasStep` from `utils/templateSteps` if you only want to know
   * whether a template asks for something at all.
   */
  steps?: ActionStep[];
  /**
   * Whether the event cannot be saved until this step has an answer. Defaults to false, so a
   * step is optional unless it says otherwise, and the event feed flags unanswered steps as
   * missing detail either way.
   *
   * Meaningful on the three selection steps only. A `CUSTOM_WIDGET` always holds a value, and a
   * step skipped because the chosen reason has `specifyPlayer: false` never blocks the save.
   */
  required?: boolean;
  /**
   * Which widget to render, for `type: 'CUSTOM_WIDGET'`. Resolved through the client's widget
   * registry; an unregistered name renders as an explicit error rather than silently falling
   * back to some other control.
   */
  widgetName?: string;
  /**
   * The `eventData` key a `CUSTOM_WIDGET` writes its value to, e.g. `scrumResets`.
   *
   * Keyed per step rather than per widget type so one template can carry two widgets without
   * them sharing state, and so the stored field name survives a widget being swapped out.
   */
  dataKey?: string;
  fields?: any[]; // For FORM_INPUT, e.g. { name: string, type: string, label: string }
}

export enum TemplateDisputeType {
  /** The event can be undone or removed via the dispute system */
  REMOVE = 'REMOVE',
  /** The outcome of the event can be modified via the dispute system */
  CHANGE_OUTCOME = 'CHANGE_OUTCOME',
}

export interface TemplateDisputeConfig {
  type: TemplateDisputeType;
  heading?: string;
  approveLabel?: string;
  rejectLabel?: string;
  /**
  /**
   * If true, changing the outcome will recalculate pointsDelta and game score
   * based on the points defined in the template outcomes.
   */
  impactsPoints?: boolean;
  /**
   * If false, the event cannot be removed (Undo) via the dispute system.
   * Defaults to true.
   */
  allowUndo?: boolean;
  /**
   * If false, the event data/outcome cannot be modified via the dispute system.
   * Defaults to true.
   */
  allowUpdate?: boolean;
}

export interface EventTemplate {
  id: string;
  name: string;
  section: string;
  icon?: string;
  mobileLabel?: string;
  points?: number;
  displayPattern?: string; // e.g. "{name} -> {outcome|AWARDED}"
  pendingOutcomeLabel?: string;
  outcomeOverrides?: Record<string, string>; // e.g. { "Penalty Kick": "KICK" }
  /**
   * The outcomes this event can end in, and what each one is worth: `points`, the `eventData` it
   * merges, and any `triggerEventId` follow-up it spawns.
   *
   * Declared once per template rather than on the `OUTCOME_SELECTION` step, because this is what
   * the event *means* — the server resolves points and triggers from it and never looks at steps
   * at all. The step only says where in the flow the picker appears.
   */
  outcomes?: Outcome[];
  /**
   * The reasons this event can be attributed to, grouped for display. As with `outcomes`, this
   * is the template's data and the `REASON_SELECTION` step merely positions the picker.
   */
  reasons?: ReasonGroup[];
  steps: ActionStep[];
  triggerEventId?: string;
  /** The side `triggerEventId` is recorded for. Defaults to `same`. */
  triggerTeam?: TriggerTeam;
  /** `eventData` the follow-up starts with. See {@link Outcome.triggerEventData}. */
  triggerEventData?: Record<string, any>;
  eventData?: any;
  disputeConfig?: TemplateDisputeConfig;
}
