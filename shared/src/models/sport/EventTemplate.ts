export interface ReasonOption {
  id: string;
  name: string;
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
  eventData?: any;
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

export interface ActionStep {
  type: ActionStepType;
  name?: string;
  /**
   * Sub-steps, for `type: 'GROUP'` — they render together on one screen.
   *
   * Do not walk this yourself: a question like "what outcomes does this template offer" is
   * about all steps regardless of grouping, and missing the nesting gives a silently wrong
   * answer. Use the helpers in `utils/templateSteps` (`getOutcomes`, `findStep`, `hasStep`,
   * `getTriggerFor`), or `getScreens` when you actually need the screen layout.
   */
  steps?: ActionStep[];
  optional?: boolean;
  groupWithNext?: boolean;
  dependsOnReason?: boolean;
  reasons?: ReasonGroup[];
  outcomes?: Outcome[];
  widgetName?: string;
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
  steps: ActionStep[];
  triggerEventId?: string;
  /** The side `triggerEventId` is recorded for. Defaults to `same`. */
  triggerTeam?: TriggerTeam;
  eventData?: any;
  disputeConfig?: TemplateDisputeConfig;
}
