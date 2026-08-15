import { ActionStepType, TemplateDisputeType } from "@sk/shared";

export const RUGBY_SEED_SPEC = {
  id: "rugby",
  name: "Rugby",
  categoryId: "rugby",
  participantType: "TEAM",
  matchTopology: "HEAD_TO_HEAD",
  facilityTerm: "Field",
  periodTerm: "Half",
  timerShowHours: false,
  defaultSettings: {
    periodLengthMS: 40 * 60 * 1000,
    periods: 2,
    maxReserves: 8,
    positions: [
      { id: "1", name: "Loosehead Prop" },
      { id: "2", name: "Hooker" },
      { id: "3", name: "Tighthead Prop" },
      { id: "4", name: "Lock" },
      { id: "5", name: "Lock" },
      { id: "6", name: "Blindside Flanker" },
      { id: "7", name: "Openside Flanker" },
      { id: "8", name: "Number 8" },
      { id: "9", name: "Scrum-half" },
      { id: "10", name: "Fly-half" },
      { id: "11", name: "Left Wing" },
      { id: "12", name: "Inside Center" },
      { id: "13", name: "Outside Center" },
      { id: "14", name: "Right Wing" },
      { id: "15", name: "Full-back" }
    ],
    yellowCardDurationMS: 600000,
    redCardDurationMS: 1200000,
    allowTimedRedCard: false
  },
  eventTemplates: [
    {
      id: "try",
      name: "Try",
      section: "Scoring",
      icon: "Rugby",
      points: 5,
      displayPattern: "{name}",
      triggerEventId: "conversion",
      disputeConfig: {
        type: TemplateDisputeType.REMOVE,
        heading: "Remove Try"
      },
      steps: [
        { type: ActionStepType.PLAYER_SELECTION }
      ]
    },
    {
      id: "penalty_try",
      name: "Penalty Try",
      section: "Scoring",
      icon: "Zap",
      points: 7,
      displayPattern: "{name}",
      disputeConfig: {
        type: TemplateDisputeType.REMOVE,
        heading: "Remove Penalty Try"
      },
      steps: []
    },
    {
      id: "conversion",
      name: "Conversion",
      section: "Scoring",
      icon: "Target",
      points: 2,
      displayPattern: "{name} → {outcome}",
      pendingOutcomeLabel: "Pending",
      disputeConfig: {
        type: TemplateDisputeType.CHANGE_OUTCOME,
        heading: "Change Conversion Outcome",
        impactsPoints: true
      },
      outcomes: [
        { id: "successful", name: "Successful", displayOverride: "", points: 2, variant: "success", eventData: { "successful": true } },
        { id: "missed", name: "Missed", displayOverride: "MISSED", points: 0, variant: "danger", eventData: { "successful": false } }
      ],
      steps: [
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    },
    {
      id: "penalty_kick",
      name: "Penalty Kick",
      section: "Scoring",
      icon: "Footprints",
      points: 3,
      displayPattern: "{name} → {outcome}",
      disputeConfig: {
        type: TemplateDisputeType.CHANGE_OUTCOME,
        heading: "Change Penalty Kick Outcome",
        impactsPoints: true
      },
      outcomes: [
        { id: "successful", name: "Successful", displayOverride: "OVER", points: 3, variant: "success", eventData: { "successful": true } },
        { id: "missed", name: "Missed", displayOverride: "MISSED", points: 0, variant: "danger", eventData: { "successful": false } }
      ],
      steps: [
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    },
    {
      id: "drop_goal",
      name: "Drop Goal",
      section: "Scoring",
      icon: "Zap",
      points: 3,
      displayPattern: "{name} → {outcome}",
      disputeConfig: {
        type: TemplateDisputeType.CHANGE_OUTCOME,
        heading: "Change Drop Goal Outcome",
        impactsPoints: true
      },
      outcomes: [
        { id: "successful", name: "Successful", displayOverride: "SUCCESS", points: 3, variant: "success", eventData: { "successful": true } },
        { id: "missed", name: "Missed", displayOverride: "MISSED", points: 0, variant: "danger", eventData: { "successful": false } }
      ],
      steps: [
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    },
    {
      id: "kickoff",
      name: "Kick-off",
      section: "Game Events",
      icon: "Play",
      displayPattern: "{name} → {outcome}",
      outcomes: [
        { id: "successful", name: "Successful", displayOverride: "", variant: "success", eventData: { successful: true } },
        { id: "directly_out", name: "Directly Out", displayOverride: "OUT", variant: "danger", eventData: { successful: false } },
        { id: "too_short", name: "Too Short", displayOverride: "SHORT", variant: "danger", eventData: { successful: false } },
        { id: "long", name: "Long", variant: "danger", eventData: { successful: false } }
      ],
      steps: [
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    },
    {
      id: "dropout_22m",
      name: "22m Dropout",
      section: "Game Events",
      icon: "ArrowUpRight",
      displayPattern: "{name} → {outcome}",
      outcomes: [
        { id: "successful", name: "Successful", displayOverride: "", variant: "success", eventData: { successful: true } },
        { id: "directly_out", name: "Directly Out", displayOverride: "OUT", variant: "danger", eventData: { successful: false } },
        { id: "too_short", name: "Too Short", displayOverride: "SHORT", variant: "danger", eventData: { successful: false } }
      ],
      steps: [
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    },
    {
      id: "dropout_goalline",
      name: "Goalline Dropout",
      section: "Game Events",
      icon: "ArrowUp",
      displayPattern: "{name} → {outcome}",
      outcomes: [
        { id: "successful", name: "Successful", displayOverride: "", variant: "success", eventData: { successful: true } },
        { id: "directly_out", name: "Directly Out", displayOverride: "OUT", variant: "danger", eventData: { successful: false } },
        { id: "too_short", name: "Too Short", displayOverride: "SHORT", variant: "danger", eventData: { successful: false } }
      ],
      steps: [
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    },
    {
      id: "penalty_awarded",
      name: "Penalty Against",
      mobileLabel: "Penalty Against",
      section: "Game Events",
      icon: "AlertTriangle",
      displayPattern: "PENALTY → {outcome}",
      // `specifyPlayer: false` marks the infringements committed by a unit rather than a person —
      // a collapsed scrum has no individual offender — and drops the player prompt for them.
      reasons: [
        {
          name: "Tackle",
          options: [
            { id: "dangerous_tackle", name: "Dangerous Tackle", specifyPlayer: true },
            { id: "late_tackle", name: "Late Tackle", specifyPlayer: true }
          ]
        },
        {
          name: "Ruck",
          options: [
            { id: "not_releasing", name: "Not Releasing", specifyPlayer: true },
            { id: "not_rolling", name: "Not Rolling", specifyPlayer: true },
            { id: "hands_in_ruck", name: "Hands in Ruck", specifyPlayer: true },
            { id: "side_entry", name: "Side Entry", specifyPlayer: true },
            { id: "off_feet", name: "Off Feet", specifyPlayer: true }
          ]
        },
        {
          name: "Set Piece",
          options: [
            { id: "collapsing_scrum", name: "Collapsing Scrum", specifyPlayer: false },
            { id: "scrum_other", name: "Scrum Other", specifyPlayer: false },
            { id: "lineout_foul", name: "Lineout Foul", specifyPlayer: false }
          ]
        },
        {
          name: "General",
          options: [
            { id: "offside", name: "Offside", specifyPlayer: true },
            { id: "obstruction", name: "Obstruction", specifyPlayer: true },
            { id: "professional_foul", name: "Professional Foul", specifyPlayer: true },
            { id: "other", name: "Other", specifyPlayer: false }
          ]
        }
      ],
      outcomes: [
        // A penalty is recorded against the offending team, so everything it awards belongs
        // to their opponents. `triggerEventData` is the follow-up's own data, not this event's:
        // the scrum's reason is that a penalty awarded it, while this event's reason stays the
        // infringement the scorer picked.
        { id: "penalty_kick", name: "Penalty Kick", variant: "primary", triggerEventId: "penalty_kick", triggerTeam: "opponent" },
        { id: "line_kick", name: "Line Kick", variant: "primary", triggerEventId: "line_kick", triggerTeam: "opponent" },
        { id: "scrum", name: "Scrum", variant: "warning", triggerEventId: "scrum", triggerTeam: "opponent", triggerEventData: { reason: "penalty_scrum" } },
        { id: "tap_go", name: "Tap n Go", variant: "success" }
      ],
      steps: [
        { type: ActionStepType.REASON_SELECTION },
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    },
    {
      id: "free_kick",
      name: "Free Kick Against",
      mobileLabel: "Free Kick Against",
      section: "Game Events",
      icon: "Zap",
      displayPattern: "{name} → {reason}",
      // Nearly every free kick is against the scrum or lineout as a unit; only Mark and Kicking
      // ball away name an individual, so the player prompt appears for those two alone.
      reasons: [
        {
          name: "Scrum",
          options: [
            { id: "early_push", name: "Early Push", specifyPlayer: false },
            { id: "delaying_feed", name: "Delaying the Feed", specifyPlayer: false },
            { id: "pre_engagement", name: "Pre-engagement", specifyPlayer: false },
            { id: "illegal_feed", name: "Illegal Feed", specifyPlayer: false }
          ]
        },
        {
          name: "Lineout",
          options: [
            { id: "closing_gap", name: "Closing the Gap", specifyPlayer: false },
            { id: "delaying_lineout", name: "Delaying the Lineout", specifyPlayer: false },
            { id: "early_lift", name: "Early Lift", specifyPlayer: false },
            { id: "too_many_players", name: "Too Many Players", specifyPlayer: false },
            { id: "faking_throw", name: "Faking a Throw", specifyPlayer: false }
          ]
        },
        {
          name: "General",
          options: [
            { id: "mark", name: "Mark", specifyPlayer: true },
            { id: "wasting_time", name: "Wasting Time", specifyPlayer: false },
            { id: "kicking_ball_away", name: "Kicking ball away", specifyPlayer: true },
            { id: "other", name: "Other", specifyPlayer: false }
          ]
        }
      ],
      outcomes: [
        // As with a penalty, a free kick is recorded against the offending team.
        { id: "scrum", name: "Scrum", variant: "warning", triggerEventId: "scrum", triggerTeam: "opponent", triggerEventData: { reason: "free_kick" } },
        { id: "line_kick", name: "Line Kick", variant: "primary", triggerEventId: "line_kick", triggerTeam: "opponent" },
        { id: "tap_go", name: "Tap n Go", variant: "success" }
      ],
      steps: [
        { type: ActionStepType.REASON_SELECTION },
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    },
    {
      id: "scrum",
      name: "Scrum",
      section: "General Play",
      icon: "Users",
      displayPattern: "{name} → {outcome}",
      // A scrum is awarded for something, and that something is often the event that chained into
      // it — `penalty_awarded` and `free_kick` name the matching id in their `triggerEventData`,
      // so the reason arrives already chosen. Ids here are the contract for that: renaming one
      // silently breaks the prefill, which `check_rugby_templates.ts` warns about.
      reasons: [
        {
          name: "Infringement",
          options: [
            { id: "knock_on", name: "Knock-on" },
            { id: "forward_pass", name: "Forward Pass" },
            { id: "held_up", name: "Held Up" },
            { id: "unplayable", name: "Unplayable" },
            { id: "accidental_offside", name: "Accidental Offside" },
            { id: "penalty_scrum", name: "Penalty" },
            { id: "free_kick", name: "Free Kick" }
          ]
        }
      ],
      outcomes: [
        { id: "won", name: "Won", variant: "success", eventData: { successful: true } },
        { id: "lost", name: "Lost", variant: "danger", eventData: { successful: false } },
      ],
      steps: [
        { type: ActionStepType.REASON_SELECTION },
        {
          // Resets and won/lost are one judgement, so they share a screen.
          type: ActionStepType.GROUP,
          name: "Outcome",
          steps: [
            {
              type: ActionStepType.CUSTOM_WIDGET,
              name: "Scrum Resets",
              widgetName: "ScrumResetsCounter",
              dataKey: "scrumResets",
            },
            { type: ActionStepType.OUTCOME_SELECTION }
          ]
        }
      ]
    },
    {
      id: "lineout",
      name: "Lineout",
      section: "General Play",
      icon: "ArrowUp",
      displayPattern: "{name} → {outcome}",
      outcomes: [
        { id: "won", name: "Won", variant: "success", eventData: { winnerSide: "same" } },
        { id: "lost", name: "Lost", variant: "danger", eventData: { winnerSide: "other" } },
        { id: "not_straight", name: "Not Straight", variant: "warning" }
      ],
      steps: [
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    },
    {
      id: "yellow_card",
      name: "Yellow Card",
      section: "Game Events",
      icon: "AlertTriangle",
      displayPattern: "{name}",
      reasons: [
        {
          name: "Foul Play",
          options: [
            { id: "high_tackle", name: "High Tackle" },
            { id: "dangerous_play", name: "Dangerous Play" },
            { id: "professional_foul", name: "Professional Foul" },
            { id: "cynical_foul", name: "Cynical Foul" }
          ]
        },
        {
          name: "Technical",
          options: [
            { id: "repeated_infringements", name: "Repeated Infringements" },
            { id: "offside", name: "Offside" },
            { id: "other", name: "Other" }
          ]
        }
      ],
      steps: [
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.REASON_SELECTION }
      ]
    },
    {
      id: "red_card",
      name: "Red Card",
      section: "Game Events",
      icon: "XCircle",
      displayPattern: "{name}",
      reasons: [
        {
          name: "Serious Foul Play",
          options: [
            { id: "punching_striking", name: "Punching/Striking" },
            { id: "dangerous_high_tackle", name: "Dangerous High Tackle" },
            { id: "tip_tackle", name: "Tip Tackle" },
            { id: "stamp_kick", name: "Stamp/Kick" },
            { id: "second_yellow", name: "Second Yellow Card" }
          ]
        }
      ],
      steps: [
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.REASON_SELECTION }
      ]
    },
    {
      id: "timed_red_card",
      name: "Timed Red Card",
      section: "Game Events",
      icon: "Clock",
      displayPattern: "{name}",
      reasons: [
        {
          name: "Serious Foul Play (Timed)",
          options: [
            { id: "dangerous_high_tackle", name: "Dangerous High Tackle" },
            { id: "tip_tackle", name: "Tip Tackle" },
            { id: "other", name: "Other" }
          ]
        }
      ],
      steps: [
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.REASON_SELECTION }
      ]
    },
    {
      id: "knock_on",
      name: "Knock-on",
      section: "General Play",
      icon: "Hand",
      displayPattern: "{name}",
      outcomes: [{ id: "confirmed", name: "Confirmed" }],
      steps: [
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    },
    {
      id: "turnover",
      name: "Turnover Won",
      mobileLabel: "Turnover",
      section: "General Play",
      icon: "RotateCw",
      displayPattern: "{name}",
      outcomes: [{ id: "confirmed", name: "Confirmed" }],
      steps: [
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    },
    {
      id: "tackle_made",
      name: "Tackle Made",
      mobileLabel: "Tackle",
      section: "General Play",
      icon: "Zap",
      displayPattern: "{name}",
      outcomes: [{ id: "confirmed", name: "Confirmed" }],
      steps: [
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    },
    {
      id: "tackle_missed",
      name: "Tackle Missed",
      mobileLabel: "Missed Tackle",
      section: "General Play",
      icon: "X",
      displayPattern: "{name}",
      outcomes: [{ id: "confirmed", name: "Confirmed" }],
      steps: [
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    },
    {
      id: "line_kick",
      name: "Line Kick",
      section: "Game Events",
      icon: "ArrowUpRight",
      displayPattern: "{name} → {outcome}",
      outcomes: [
        { id: "out", name: "Out", variant: "success", eventData: { successful: true } },
        { id: "stayed_in", name: "Stayed In", variant: "danger", eventData: { successful: false } }
      ],
      steps: [
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    }
  ]
};
