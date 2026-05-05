import { EventTemplate } from "../../models/sport/EventTemplate";

export const RUGBY_EVENTS: EventTemplate[] = [
  {
    id: "try",
    name: "Try",
    section: "Scoring",
    icon: "Rugby",
    points: 5,
    displayPattern: "{outcome}",
    steps: [
      {
        type: "OUTCOME_SELECTION",
        includePlayerSelection: true,
        outcomes: [
          { "name": "Try", "points": 5, "variant": "success", "triggerEventId": "conversion" },
          { "name": "Penalty Try", "points": 7, "variant": "warning" }
        ]
      }
    ]
  },
  {
    id: "conversion",
    name: "Conversion",
    section: "Scoring",
    icon: "Target",
    points: 2,
    displayPattern: "{name} → {outcome}",
    disputeConfig: {
      type: "CHANGE_OUTCOME",
      heading: "Change Conversion Outcome",
      impactsPoints: true,
      allowUndo: false
    },
    steps: [
      {
        type: "OUTCOME_SELECTION",
        includePlayerSelection: true,
        outcomes: [
          { "name": "Successful", "displayOverride": "", "points": 2, "variant": "success", "eventData": { "successful": true } },
          { "name": "Missed", "displayOverride": "MISSED", "points": 0, "variant": "danger", "eventData": { "successful": false } }
        ]
      }
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
      type: "CHANGE_OUTCOME",
      heading: "Change Penalty Kick Outcome",
      impactsPoints: true
    },
    steps: [
      {
        type: "OUTCOME_SELECTION",
        includePlayerSelection: true,
        outcomes: [
          { "name": "Successful", "displayOverride": "OVER", "points": 3, "variant": "success", "eventData": { "successful": true } },
          { "name": "Missed", "displayOverride": "MISSED", "points": 0, "variant": "danger", "eventData": { "successful": false } }
        ]
      }
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
      type: "CHANGE_OUTCOME",
      heading: "Change Drop Goal Outcome",
      impactsPoints: true
    },
    steps: [
      {
        type: "OUTCOME_SELECTION",
        includePlayerSelection: true,
        outcomes: [
          { "name": "Successful", "displayOverride": "SUCCESS", "points": 3, "variant": "success", "eventData": { "successful": true } },
          { "name": "Missed", "displayOverride": "MISSED", "points": 0, "variant": "danger", "eventData": { "successful": false } }
        ]
      }
    ]
  },
  // --- Game Events ---
  {
    id: "kickoff",
    name: "Kick-off",
    section: "Game Events",
    icon: "Play",
    displayPattern: "{name} → {outcome}",
    steps: [
      {
        type: "OUTCOME_SELECTION",
        includePlayerSelection: true,
        outcomes: [
          { name: "Successful", displayOverride: "", variant: "success", eventData: { successful: true } },
          { name: "Directly Out", displayOverride: "OUT", variant: "danger", eventData: { successful: false } },
          { name: "Too Short", displayOverride: "SHORT", variant: "danger", eventData: { successful: false } },
          { name: "Long", variant: "danger", eventData: { successful: false } }
        ]
      }
    ]
  },
  {
    id: "dropout_22m",
    name: "22m Dropout",
    section: "Game Events",
    icon: "ArrowUpRight",
    displayPattern: "{name} → {outcome}",
    steps: [
      {
        type: "OUTCOME_SELECTION",
        includePlayerSelection: true,
        outcomes: [
          { name: "Successful", displayOverride: "", variant: "success", eventData: { successful: true } },
          { name: "Directly Out", displayOverride: "OUT", variant: "danger", eventData: { successful: false } },
          { name: "Too Short", displayOverride: "SHORT", variant: "danger", eventData: { successful: false } }
        ]
      }
    ]
  },
  {
    id: "dropout_goalline",
    name: "Goalline Dropout",
    section: "Game Events",
    icon: "ArrowUp",
    displayPattern: "{name} → {outcome}",
    steps: [
      {
        type: "OUTCOME_SELECTION",
        includePlayerSelection: true,
        outcomes: [
          { name: "Successful", displayOverride: "", variant: "success", eventData: { successful: true } },
          { name: "Directly Out", displayOverride: "OUT", variant: "danger", eventData: { successful: false } },
          { name: "Too Short", displayOverride: "SHORT", variant: "danger", eventData: { successful: false } }
        ]
      }
    ]
  },
  {
    id: "penalty_awarded",
    name: "Penalty Awarded",
    section: "Game Events",
    icon: "AlertTriangle",
    displayPattern: "PENALTY → {outcome}",
    steps: [
      {
        type: "REASON_SELECTION",
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
              { id: "collapsing_scrum", name: "Collapsing Scrum" },
              { id: "scrum_other", name: "Scrum Other" },
              { id: "lineout_foul", name: "Lineout Foul" }
            ]
          },
          {
            name: "General",
            options: [
              { id: "offside", name: "Offside", specifyPlayer: true },
              { id: "obstruction", name: "Obstruction", specifyPlayer: true },
              { id: "professional_foul", name: "Professional Foul", specifyPlayer: true },
              { id: "other", name: "Other" }
            ]
          }
        ]
      },
      {
        type: "PLAYER_SELECTION"
      },
      {
        type: "OUTCOME_SELECTION",
        outcomes: [
          { id: "penalty_kick", name: "Penalty Kick", variant: "primary", triggerEventId: "penalty_kick" },
          { id: "line_kick", name: "Line Kick", variant: "primary", triggerEventId: "line_kick" },
          { id: "scrum", name: "Scrum", variant: "warning", triggerEventId: "scrum", eventData: { reason: "Penalty" } },
          { id: "tap_go", name: "Tap n Go", variant: "success", eventData: { reason: "Penalty" } }
        ]
      }
    ]
  },
  {
    id: "free_kick",
    name: "Free Kick Awarded",
    section: "Game Events",
    icon: "Zap",
    displayPattern: "{name} → {reason}",
    steps: [
      {
        type: "REASON_SELECTION",
        reasons: [
          {
            name: "Scrum",
            options: [
              { id: "early_push", name: "Early Push" },
              { id: "delaying_feed", name: "Delaying the Feed" },
              { id: "pre_engagement", name: "Pre-engagement" },
              { id: "illegal_feed", name: "Illegal Feed" }
            ]
          },
          {
            name: "Lineout",
            options: [
              { id: "closing_gap", name: "Closing the Gap" },
              { id: "delaying_lineout", name: "Delaying the Lineout" },
              { id: "early_lift", name: "Early Lift" },
              { id: "too_many_players", name: "Too Many Players" },
              { id: "faking_throw", name: "Faking a Throw" }
            ]
          },
          {
            name: "General",
            options: [
              { id: "mark", name: "Mark" },
              { id: "wasting_time", name: "Wasting Time" },
              { id: "kicking_ball_away", name: "Kicking ball away" },
              { id: "other", name: "Other" }
            ]
          }
        ]
      },
      {
        type: "PLAYER_SELECTION"
      },
      {
        type: "OUTCOME_SELECTION",
        outcomes: [
          { id: "scrum", name: "Scrum", variant: "warning", triggerEventId: "scrum", eventData: { reason: "Free Kick" } },
          { id: "line_kick", name: "Line Kick", variant: "primary", triggerEventId: "line_kick" },
          { id: "tap_go", name: "Tap n Go", variant: "success", eventData: { reason: "Free Kick" } }
        ]
      }
    ]
  },
  {
    id: "scrum",
    name: "Scrum",
    section: "Game Events",
    icon: "Users",
    displayPattern: "{name} → {reason|{outcome}}",
    steps: [
      {
        type: "REASON_SELECTION",
        reasons: [
          {
            name: "Infringement",
            options: [
              { id: "knock_on", name: "Knock-on" },
              { id: "forward_pass", name: "Forward Pass" },
              { id: "held_up", name: "Held Up" },
              { id: "unplayable", name: "Unplayable" },
              { id: "accidental_offside", name: "Accidental Offside" },
              { id: "penalty_scrum", name: "Penalty" }
            ]
          }
        ]
      },
      {
        type: "CUSTOM_WIDGET",
        widgetName: "ScrumResetsCounter",
        groupWithNext: true
      },
      {
        type: "OUTCOME_SELECTION",
        outcomes: [
          { id: "successful", name: "Successful", variant: "success", eventData: { successful: true } },
          { id: "lost_against_head", name: "Lost Against Head", variant: "danger", eventData: { successful: false } },
          { id: "collapsed_reset", name: "Collapsed (Reset)", variant: "warning", triggerEventId: "scrum", eventData: { reset: true } }
        ]
      }
    ]
  },
  {
    id: "lineout",
    name: "Lineout",
    section: "Game Events",
    icon: "ArrowUp",
    displayPattern: "{name} → {outcome}",
    steps: [
      {
        type: "OUTCOME_SELECTION",
        outcomes: [
          { name: "Won", variant: "success", eventData: { winnerSide: "same" } },
          { name: "Lost", variant: "danger", eventData: { winnerSide: "other" } },
          { name: "Not Straight", variant: "warning" }
        ]
      }
    ]
  },
  {
    id: "yellow_card",
    name: "Yellow Card",
    section: "Game Events",
    icon: "AlertTriangle",
    displayPattern: "{name} → {reason}",
    steps: [
      {
        type: "REASON_SELECTION",
        includePlayerSelection: true,
        reasons: [
          {
            name: "Foul Play",
            options: [
              { name: "High Tackle" },
              { name: "Dangerous Play" },
              { name: "Professional Foul" },
              { name: "Cynical Foul" }
            ]
          },
          {
            name: "Technical",
            options: [
              { name: "Repeated Infringements" },
              { name: "Offside" },
              { name: "Other" }
            ]
          }
        ]
      }
    ]
  },
  {
    id: "red_card",
    name: "Red Card",
    section: "Game Events",
    icon: "XCircle",
    displayPattern: "{name} → {reason}",
    steps: [
      {
        type: "REASON_SELECTION",
        includePlayerSelection: true,
        reasons: [
          {
            name: "Serious Foul Play",
            options: [
              { name: "Punching/Striking" },
              { name: "Dangerous High Tackle" },
              { name: "Tip Tackle" },
              { name: "Stamp/Kick" },
              { name: "Second Yellow Card" }
            ]
          }
        ]
      }
    ]
  },
  // --- General Play ---
  {
    id: "knock_on",
    name: "Knock-on",
    section: "General Play",
    icon: "Hand",
    displayPattern: "{name}",
    steps: [{ type: "OUTCOME_SELECTION", includePlayerSelection: true, outcomes: [{ name: "Confirmed" }] }]
  },
  {
    id: "turnover",
    name: "Turnover Won",
    section: "General Play",
    icon: "RotateCw",
    displayPattern: "{name}",
    steps: [{ type: "OUTCOME_SELECTION", includePlayerSelection: true, outcomes: [{ name: "Confirmed" }] }]
  },
  {
    id: "tackle_made",
    name: "Tackle Made",
    section: "General Play",
    icon: "Zap",
    displayPattern: "{name}",
    steps: [{ type: "OUTCOME_SELECTION", includePlayerSelection: true, outcomes: [{ name: "Confirmed" }] }]
  },
  {
    id: "tackle_missed",
    name: "Tackle Missed",
    section: "General Play",
    icon: "X",
    displayPattern: "{name}",
    steps: [{ type: "OUTCOME_SELECTION", includePlayerSelection: true, outcomes: [{ name: "Confirmed" }] }]
  },
  {
    id: "line_kick",
    name: "Line Kick",
    section: "Game Events",
    icon: "ArrowUpRight",
    displayPattern: "{name} → {outcome}",
    steps: [
      {
        type: "PLAYER_SELECTION"
      },
      {
        type: "OUTCOME_SELECTION",
        outcomes: [
          { id: "out", name: "Out", variant: "success", eventData: { successful: true } },
          { id: "stayed_in", name: "Stayed In", variant: "danger", eventData: { successful: false } }
        ]
      }
    ]
  }
];
