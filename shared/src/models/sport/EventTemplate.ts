export interface ReasonOption {
  id?: string;
  name: string;
  specifyPlayer?: boolean;
  variant?: string;
}

export interface ReasonGroup {
  name: string;
  options: ReasonOption[];
}

export interface Outcome {
  id?: string;
  name: string;
  displayOverride?: string;
  points?: number;
  triggerEventId?: string;
  variant?: string;
  eventData?: any;
}

export interface ActionStep {
  type: 'REASON_SELECTION' | 'OUTCOME_SELECTION' | 'PLAYER_SELECTION' | 'CUSTOM_WIDGET' | 'FORM_INPUT';
  optional?: boolean;
  groupWithNext?: boolean;
  includePlayerSelection?: boolean;
  reasons?: ReasonGroup[];
  outcomes?: Outcome[];
  widgetName?: string;
  fields?: any[]; // For FORM_INPUT, e.g. { name: string, type: string, label: string }
}

export interface TemplateDisputeConfig {
  type: 'REMOVE' | 'CHANGE_OUTCOME';
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
  outcomeOverrides?: Record<string, string>; // e.g. { "Penalty Kick": "KICK" }
  steps: ActionStep[];
  triggerEventId?: string;
  eventData?: any;
  disputeConfig?: TemplateDisputeConfig;
}
