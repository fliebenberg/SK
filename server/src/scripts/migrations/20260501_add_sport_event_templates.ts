import pool from '../../db';

const rugbyTemplates = [
  {
    id: "rugby_penalty_awarded",
    name: "Penalty",
    section: "Game Events",
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
              { name: "Hands in", specifyPlayer: true },
              { name: "Side Entry", specifyPlayer: true },
              { name: "Off Feet", specifyPlayer: true }
            ]
          },
          {
            name: "Set Piece",
            options: [
              { name: "Collapsing Scrum", specifyPlayer: false },
              { name: "Lineout Foul", specifyPlayer: false }
            ]
          },
          {
            name: "General",
            options: [
              { name: "Offside", specifyPlayer: true },
              { name: "Obstruction", specifyPlayer: true },
              { name: "Pro Foul", specifyPlayer: true },
              { name: "Other", specifyPlayer: false }
            ]
          }
        ]
      },
      {
        type: "OUTCOME_SELECTION",
        outcomes: [
          { name: "Penalty Kick", triggerEventId: "rugby_penalty_kick" },
          { name: "Line Kick", triggerEventId: "rugby_line_kick" },
          { name: "Scrum", triggerEventId: "rugby_scrum", eventData: { reason: "Penalty" } },
          { name: "Tap n Go", eventData: { type: "GAME_EVENT", subType: "Tap n Go" } }
        ]
      }
    ]
  },
  {
    id: "rugby_scrum",
    name: "Scrum",
    section: "Game Events",
    steps: [
      {
        type: "CUSTOM_WIDGET",
        widgetName: "ScrumResetsCounter",
        optional: true,
        groupWithNext: true
      },
      {
        type: "OUTCOME_SELECTION",
        outcomes: [
          { name: "Won", eventData: { winnerSide: "home" } },
          { name: "Lost", eventData: { winnerSide: "away" } }
        ]
      }
    ]
  },
  {
    id: "rugby_try",
    name: "Try",
    section: "Scoring",
    eventData: { type: "SCORE", subType: "Try" },
    steps: [
      {
        type: "OUTCOME_SELECTION",
        includePlayerSelection: true,
        outcomes: [
          { 
            name: "Confirm",
            points: 5,
            triggerEventId: "rugby_conversion"
          }
        ]
      }
    ]
  },
  {
    id: "rugby_conversion",
    name: "Conversion",
    section: "hidden",
    eventData: { type: "SCORE", subType: "Conversion" },
    steps: [
      {
        type: "OUTCOME_SELECTION",
        includePlayerSelection: true,
        outcomes: [
          { name: "Success", points: 2, eventData: { successful: true } },
          { name: "Missed", points: 0, eventData: { successful: false } }
        ]
      }
    ]
  },
  {
    id: "rugby_penalty_kick",
    name: "Penalty Kick",
    section: "hidden",
    eventData: { type: "SCORE", subType: "Penalty Kick" },
    steps: [
      {
        type: "OUTCOME_SELECTION",
        includePlayerSelection: true,
        outcomes: [
          { name: "Success", points: 3, eventData: { successful: true } },
          { name: "Missed", points: 0, eventData: { successful: false } }
        ]
      }
    ]
  },
  {
    id: "rugby_line_kick",
    name: "Line Kick",
    section: "hidden",
    eventData: { type: "GAME_EVENT", subType: "Line Kick" },
    steps: [
      {
        type: "OUTCOME_SELECTION",
        includePlayerSelection: true,
        outcomes: [
          { name: "Out", eventData: { successful: true } },
          { name: "Missed", eventData: { successful: false } }
        ]
      }
    ]
  }
];

async function migrate() {
    try {
        console.log('Running migration: Add event_templates to sports...');
        await pool.query('ALTER TABLE sports ADD COLUMN IF NOT EXISTS event_templates JSONB;');
        
        console.log('Updating Rugby sport with initial event templates...');
        // Find rugby sport (assuming name is 'Rugby')
        const res = await pool.query("UPDATE sports SET event_templates = $1 WHERE name = 'Rugby' RETURNING id", [JSON.stringify(rugbyTemplates)]);
        
        if (res.rowCount && res.rowCount > 0) {
            console.log(`Updated Rugby sport (${res.rows[0].id}) successfully.`);
        } else {
            console.warn("Could not find sport with name 'Rugby' to update.");
        }
        
        console.log('Migration successful.');
        process.exit(0);
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    }
}

migrate();
