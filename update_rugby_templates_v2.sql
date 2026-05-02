UPDATE sports SET event_templates = '[
  {
    "id": "try",
    "name": "Try",
    "section": "Scoring",
    "displayPattern": "{outcome}",
    "steps": [
      {
        "type": "OUTCOME_SELECTION",
        "includePlayerSelection": true,
        "outcomes": [
          { "name": "Try", "points": 5 },
          { "name": "Penalty Try", "points": 7 }
        ]
      }
    ]
  },
  {
    "id": "penalty",
    "name": "Penalty",
    "section": "Game Events",
    "displayPattern": "{name} → {outcome|AWARDED}",
    "outcomeOverrides": { "Penalty Kick": "KICK" },
    "steps": [
      {
        "type": "REASON_SELECTION",
        "reasons": [
          {
            "name": "Offside",
            "options": [
              { "name": "Offside at Ruck" },
              { "name": "Offside at Scrum" },
              { "name": "Offside at Lineout" },
              { "name": "General Offside" }
            ]
          },
          {
            "name": "Foul Play",
            "options": [
              { "name": "High Tackle" },
              { "name": "Dangerous Play" },
              { "name": "Intentional Knock-on" },
              { "name": "Dissent" }
            ]
          },
          {
            "name": "Other",
            "options": [
              { "name": "Collapsing Ruck" },
              { "name": "Hands in Ruck" },
              { "name": "Not Releasing" },
              { "name": "No Arms Tackle" }
            ]
          }
        ]
      },
      {
        "type": "OUTCOME_SELECTION",
        "outcomes": [
          { "name": "Penalty Kick", "variant": "primary" },
          { "name": "Line Kick", "variant": "success" },
          { "name": "Scrum", "variant": "warning" },
          { "name": "Tap n Go", "variant": "purple" }
        ]
      }
    ]
  },
  {
    "id": "scrum",
    "name": "Scrum",
    "section": "Game Events",
    "displayPattern": "{name} → {outcome}",
    "steps": [
      {
        "type": "REASON_SELECTION",
        "reasons": [
          {
            "name": "Infringement",
            "options": [
              { "name": "Knock-on" },
              { "name": "Forward Pass" },
              { "name": "Accidental Offside" },
              { "name": "Held up in Goal" }
            ]
          }
        ]
      },
      {
        "type": "CUSTOM_WIDGET",
        "widgetName": "ScrumResetsCounter",
        "groupWithNext": true
      },
      {
        "type": "OUTCOME_SELECTION",
        "outcomes": [
          { "name": "Won", "eventData": { "winnerSide": "current" } },
          { "name": "Lost", "eventData": { "winnerSide": "other" } }
        ]
      }
    ]
  }
]' WHERE name = 'Rugby';
