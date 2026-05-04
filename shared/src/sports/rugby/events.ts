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
    displayPattern: "{name} → {reason}",
    steps: [
      {
        type: "REASON_SELECTION",
        includePlayerSelection: true,
        reasons: [
          {
            name: "Infringement",
            options: [
              { name: "Offside" },
              { name: "High Tackle" },
              { name: "Hands in Ruck" },
              { name: "Collapsing Scrum" },
              { name: "Not Releasing" }
            ]
          }
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
        includePlayerSelection: true,
        reasons: [
          {
            name: "Reason",
            options: [
              { name: "Early Engagement" },
              { name: "Time Wasting" },
              { name: "Technical Infringement" }
            ]
          }
        ]
      }
    ]
  },
  {
    id: "scrum",
    name: "Scrum",
    section: "Game Events",
    icon: "Users",
    displayPattern: "{name} → {outcome}",
    steps: [
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
              { name: "Professional Foul" }
            ]
          },
          {
            name: "Technical",
            options: [
              { name: "Repeated Infringements" },
              { name: "Offside" },
              { name: "Cynical Foul" }
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
              { name: "Stamp/Kick" }
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
  }
];
