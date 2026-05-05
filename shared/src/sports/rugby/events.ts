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
              { name: "Dangerous", specifyPlayer: true },
              { name: "Late", specifyPlayer: true }
            ]
          },
          {
            name: "Ruck",
            options: [
              { name: "Not Releasing", specifyPlayer: true },
              { name: "Not Rolling", specifyPlayer: true },
              { name: "Hands in Ruck", specifyPlayer: true },
              { name: "Side Entry", specifyPlayer: true },
              { name: "Off Feet", specifyPlayer: true }
            ]
          },
          {
            name: "Set Piece",
            options: [
              { name: "Collapsing Scrum" },
              { name: "Scrum Other" },
              { name: "Lineout Foul" }
            ]
          },
          {
            name: "General",
            options: [
              { name: "Offside", specifyPlayer: true },
              { name: "Obstruction", specifyPlayer: true },
              { name: "Professional Foul", specifyPlayer: true },
              { name: "Other" }
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
          { name: "Penalty Kick", variant: "primary", triggerEventId: "penalty_kick" },
          { name: "Line Kick", variant: "success", triggerEventId: "line_kick" },
          { name: "Scrum", variant: "warning", triggerEventId: "scrum", eventData: { reason: "Penalty" } },
          { name: "Tap n Go", variant: "purple", eventData: { type: "GAME_EVENT", subType: "Tap n Go" } }
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
              { name: "Early Push" },
              { name: "Delaying the Feed" },
              { name: "Pre-engagement" },
              { name: "Illegal Feed" }
            ]
          },
          {
            name: "Lineout",
            options: [
              { name: "Closing the Gap" },
              { name: "Delaying the Lineout" },
              { name: "Early Lift" },
              { name: "Too Many Players" },
              { name: "Faking a Throw" }
            ]
          },
          {
            name: "General",
            options: [
              { name: "Mark" },
              { name: "Wasting Time" },
              { name: "Kicking ball away" },
              { name: "Other" }
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
          { name: "Scrum", variant: "warning", triggerEventId: "scrum", eventData: { reason: "Free Kick" } },
          { name: "Line Kick", variant: "success", triggerEventId: "line_kick" },
          { name: "Tap n Go", variant: "purple", eventData: { type: "GAME_EVENT", subType: "Tap n Go" } }
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
              { name: "Knock-on" },
              { name: "Forward Pass" },
              { name: "Accidental Offside" },
              { name: "Unplayable Ruck" },
              { name: "Unsuccessful Maul" },
              { name: "Penalty" },
              { name: "Other" }
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
          { name: "Won", variant: "success", eventData: { winnerSide: "same" } },
          { name: "Lost", variant: "danger", eventData: { winnerSide: "other" } },
          { name: "Reset", variant: "warning", eventData: { resets: 1 } }
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
          { name: "Out", variant: "success", eventData: { successful: true } },
          { name: "Stayed In", variant: "danger", eventData: { successful: false } }
        ]
      }
    ]
  }
];
