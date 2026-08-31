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
    scheduledPeriods: 2,
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
    // On from 2026-08-19 so the 20-minute red is exercisable: a yellow upgraded to
    // `upgraded_timed_red`, or a direct red with outcome `timed`, puts the player off for
    // `redCardDurationMS` and lets the team replace them. With this false the server degrades both
    // to a permanent red, which is the community-rugby behaviour a competition can still opt into.
    allowTimedRedCard: true
  },
  // The panels the control room stacks, in order. `Scoring` is the section that moves the
  // scoreboard; the rest are recorded for the log and the stats screens.
  eventSections: [
    { id: "Scoring", name: "Scoring Events", affectsScore: true },
    { id: "Game Events", name: "Game Events" },
    { id: "Infringements", name: "Infringement Events" },
    { id: "Stats", name: "Stats Events" }
  ],
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
      // The three restart templates share one outcome list: the laws treat a kick-off and a
      // drop-out the same way, and a scorer should not have to learn two.
      outcomes: [
        { id: "successful", name: "Successful", displayOverride: "", variant: "success", eventData: { successful: true } },
        { id: "directly_out", name: "Directly Out", displayOverride: "OUT", variant: "danger", eventData: { successful: false } },
        { id: "too_short", name: "Too Short", displayOverride: "SHORT", variant: "danger", eventData: { successful: false } },
        { id: "too_long", name: "Too Long", displayOverride: "LONG", variant: "danger", eventData: { successful: false } },
        { id: "not_a_drop", name: "Not a Drop", variant: "danger", eventData: { successful: false } },
        { id: "wrong_place", name: "Wrong Place", variant: "danger", eventData: { successful: false } },
        { id: "in_front_of_ball", name: "In Front of Ball", variant: "danger", eventData: { successful: false } },
        { id: "other", name: "Other", variant: "warning", eventData: { successful: false } }
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
      // The three restart templates share one outcome list: the laws treat a kick-off and a
      // drop-out the same way, and a scorer should not have to learn two.
      outcomes: [
        { id: "successful", name: "Successful", displayOverride: "", variant: "success", eventData: { successful: true } },
        { id: "directly_out", name: "Directly Out", displayOverride: "OUT", variant: "danger", eventData: { successful: false } },
        { id: "too_short", name: "Too Short", displayOverride: "SHORT", variant: "danger", eventData: { successful: false } },
        { id: "too_long", name: "Too Long", displayOverride: "LONG", variant: "danger", eventData: { successful: false } },
        { id: "not_a_drop", name: "Not a Drop", variant: "danger", eventData: { successful: false } },
        { id: "wrong_place", name: "Wrong Place", variant: "danger", eventData: { successful: false } },
        { id: "in_front_of_ball", name: "In Front of Ball", variant: "danger", eventData: { successful: false } },
        { id: "other", name: "Other", variant: "warning", eventData: { successful: false } }
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
      // The three restart templates share one outcome list: the laws treat a kick-off and a
      // drop-out the same way, and a scorer should not have to learn two.
      outcomes: [
        { id: "successful", name: "Successful", displayOverride: "", variant: "success", eventData: { successful: true } },
        { id: "directly_out", name: "Directly Out", displayOverride: "OUT", variant: "danger", eventData: { successful: false } },
        { id: "too_short", name: "Too Short", displayOverride: "SHORT", variant: "danger", eventData: { successful: false } },
        { id: "too_long", name: "Too Long", displayOverride: "LONG", variant: "danger", eventData: { successful: false } },
        { id: "not_a_drop", name: "Not a Drop", variant: "danger", eventData: { successful: false } },
        { id: "wrong_place", name: "Wrong Place", variant: "danger", eventData: { successful: false } },
        { id: "in_front_of_ball", name: "In Front of Ball", variant: "danger", eventData: { successful: false } },
        { id: "other", name: "Other", variant: "warning", eventData: { successful: false } }
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
      section: "Infringements",
      icon: "AlertTriangle",
      displayPattern: "PENALTY → {outcome}",
      // `specifyPlayer: false` marks the infringements committed by a unit rather than a person —
      // a collapsed scrum has no individual offender — and drops the player prompt for them.
      // Grouped by phase (D3), and every id is prefixed with its phase (D6): reason ids must be
      // unique within a template and "offside" happens in five of them, so `tackle_offside` and
      // `scrum_offside` are different offences rather than one shared id that loses the phase.
      // Group order is how often the phase occurs, not the alphabet — it is the picker's order.
      // `specifyPlayer` is true throughout for now (D7); the cleanup pass narrows it later.
      reasons: [
        {
          name: "Tackle",
          options: [
            { id: "tackle_dangerous", name: "Dangerous Tackle", specifyPlayer: true },
            { id: "tackle_no_ball", name: "Tackle Without Ball", specifyPlayer: true },
            { id: "tackle_in_air", name: "Tackle in the Air", specifyPlayer: true },
            { id: "tackle_tip", name: "Tip Tackle", specifyPlayer: true },
            { id: "tackle_tackler_not_releasing", name: "Tackler Not Releasing", specifyPlayer: true },
            { id: "tackle_tackler_not_rolling", name: "Tackler Not Rolling Away", specifyPlayer: true },
            { id: "tackle_not_releasing", name: "Not Releasing the Ball", specifyPlayer: true },
            { id: "tackle_on_ground", name: "Playing on the Ground", specifyPlayer: true },
            { id: "tackle_offside", name: "Offside", specifyPlayer: true },
            { id: "tackle_other", name: "Other", specifyPlayer: true }
          ]
        },
        {
          name: "Ruck",
          options: [
            { id: "ruck_illegal_entry", name: "Illegal Entry", specifyPlayer: true },
            { id: "ruck_offside", name: "Offside", specifyPlayer: true },
            { id: "ruck_hands_in", name: "Hands in Ruck", specifyPlayer: true },
            { id: "ruck_off_feet", name: "Off Feet", specifyPlayer: true },
            { id: "ruck_collapsing", name: "Collapsing", specifyPlayer: true },
            { id: "ruck_dangerous_play", name: "Dangerous Play", specifyPlayer: true },
            { id: "ruck_other", name: "Other", specifyPlayer: true }
          ]
        },
        {
          name: "Scrum",
          options: [
            { id: "scrum_illegal_binding", name: "Illegal Binding", specifyPlayer: true },
            { id: "scrum_illegal_scrumming", name: "Illegal Scrumming", specifyPlayer: true },
            { id: "scrum_collapsing", name: "Collapsing Scrum", specifyPlayer: true },
            { id: "scrum_offside", name: "Offside", specifyPlayer: true },
            { id: "scrum_other", name: "Other", specifyPlayer: true }
          ]
        },
        {
          name: "Lineout",
          options: [
            { id: "lineout_contact", name: "Contact", specifyPlayer: true },
            { id: "lineout_infringing_jumper", name: "Infringing Jumper", specifyPlayer: true },
            { id: "lineout_leaving_early", name: "Leaving Early", specifyPlayer: true },
            { id: "lineout_other", name: "Other", specifyPlayer: true }
          ]
        },
        {
          name: "Maul",
          options: [
            { id: "maul_offside", name: "Offside", specifyPlayer: true },
            { id: "maul_illegal_entry", name: "Illegal Entry", specifyPlayer: true },
            { id: "maul_collapsing", name: "Collapsing", specifyPlayer: true },
            { id: "maul_obstruction", name: "Obstruction", specifyPlayer: true },
            { id: "maul_other", name: "Other", specifyPlayer: true }
          ]
        },
        {
          name: "Open Play",
          options: [
            { id: "open_knock_down", name: "Knock Down", specifyPlayer: true },
            { id: "open_offside", name: "Offside", specifyPlayer: true },
            { id: "open_obstruction", name: "Obstruction", specifyPlayer: true },
            { id: "open_professional_foul", name: "Professional Foul", specifyPlayer: true },
            { id: "open_other", name: "Other", specifyPlayer: true }
          ]
        },
        {
          name: "Restart",
          options: [
            { id: "restart_wasting_time", name: "Wasting Time", specifyPlayer: true }
          ]
        },
        {
          name: "In-goal",
          options: [
            { id: "ingoal_double_movement", name: "Double Movement", specifyPlayer: true },
            { id: "ingoal_other", name: "Other", specifyPlayer: true }
          ]
        },
        {
          name: "Technical",
          options: [
            { id: "tech_not_10m_back", name: "Not 10m Back", specifyPlayer: true }
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
        { id: "scrum", name: "Scrum", variant: "warning", triggerEventId: "scrum", triggerTeam: "opponent", triggerEventData: { reason: "penalty" } },
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
      section: "Infringements",
      icon: "Zap",
      displayPattern: "{name} → {reason}",
      // Nearly every free kick is against the scrum or lineout as a unit; only Mark and Kicking
      // ball away name an individual, so the player prompt appears for those two alone.
      // Same phase vocabulary and the same prefixes as `penalty_awarded` (D3): an offence has one
      // id whichever sanction it drew, and the template says which sanction that was.
      reasons: [
        {
          name: "Scrum",
          options: [
            { id: "scrum_illegal_scrumming", name: "Illegal Scrumming", specifyPlayer: true },
            { id: "scrum_illegal_feed", name: "Illegal Feed", specifyPlayer: true },
            { id: "scrum_foot_up", name: "Foot Up", specifyPlayer: true },
            { id: "scrum_wasting_time", name: "Wasting Time", specifyPlayer: true },
            { id: "scrum_other", name: "Other", specifyPlayer: true }
          ]
        },
        {
          name: "Lineout",
          options: [
            { id: "lineout_not_5m", name: "Not 5m", specifyPlayer: true },
            { id: "lineout_closing_gap", name: "Closing the Gap", specifyPlayer: true },
            { id: "lineout_player_numbers", name: "Player Numbers", specifyPlayer: true },
            { id: "lineout_early_jump", name: "Early Jump", specifyPlayer: true },
            { id: "lineout_short_throw", name: "Short Throw", specifyPlayer: true },
            { id: "lineout_faking_throw", name: "Faking Throw", specifyPlayer: true },
            { id: "lineout_dangerous_jump", name: "Dangerous Jump", specifyPlayer: true },
            { id: "lineout_wasting_time", name: "Wasting Time", specifyPlayer: true },
            { id: "lineout_other", name: "Other", specifyPlayer: true }
          ]
        },
        {
          name: "Ruck",
          options: [
            { id: "ruck_other", name: "Other", specifyPlayer: true }
          ]
        },
        {
          name: "Maul",
          options: [
            { id: "maul_illegal_entry", name: "Illegal Entry", specifyPlayer: true },
            { id: "maul_other", name: "Other", specifyPlayer: true }
          ]
        },
        {
          name: "Open Play",
          options: [
            { id: "open_mark", name: "Mark", specifyPlayer: true },
            { id: "open_wasting_time", name: "Wasting Time", specifyPlayer: true },
            { id: "open_other", name: "Other", specifyPlayer: true }
          ]
        },
        {
          name: "Restart",
          options: [
            { id: "restart_wasting_time", name: "Wasting Time", specifyPlayer: true }
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
      section: "Game Events",
      icon: "Users",
      displayPattern: "{name} → {outcome}",
      // A scrum is awarded for something, and that something is often the event that chained into
      // it — `penalty_awarded` and `free_kick` name the matching id in their `triggerEventData`,
      // so the reason arrives already chosen. Ids here are the contract for that: renaming one
      // silently breaks the prefill, which `check_rugby_templates.ts` warns about.
      reasons: [
        {
          name: "Open Play",
          options: [
            { id: "knock_on", name: "Knock-on" },
            { id: "forward_pass", name: "Forward Pass" },
            { id: "accidental_offside", name: "Accidental Offside" }
          ]
        },
        {
          name: "Breakdown",
          options: [
            { id: "ruck_unplayable", name: "Ruck Unplayable" },
            { id: "maul_unplayable", name: "Maul Unplayable" }
          ]
        },
        {
          name: "Lineout",
          options: [
            { id: "lineout_not_straight", name: "Not Straight" },
            { id: "lineout_short_throw", name: "Short Throw" },
            { id: "lineout_quick_throw", name: "Quick Throw" }
          ]
        },
        {
          name: "In-goal",
          options: [
            { id: "held_up", name: "Held Up" },
            { id: "carried_back", name: "Carried Back" },
            { id: "dead_ball", name: "Dead Ball" }
          ]
        },
        {
          name: "Sanction",
          options: [
            // `penalty` and `free_kick` are the prefilled ones: `penalty_awarded` and `free_kick`
            // name them in `triggerEventData`, so renaming either breaks the prefill silently —
            // `check_rugby_templates.ts` is the guard.
            { id: "penalty", name: "Penalty" },
            { id: "free_kick", name: "Free Kick" },
            { id: "restart_offence", name: "Restart Offence" },
            { id: "tech_offside", name: "Offside at the Kick" },
            { id: "tech_other", name: "Other" }
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
      section: "Game Events",
      icon: "ArrowUp",
      displayPattern: "{name} → {outcome}",
      // Nothing prefills these: `line_kick` deliberately chains into nothing (D4), so a lineout is
      // recorded by hand and its reason is the only record of what put it on the field.
      reasons: [
        {
          name: "Open Play",
          options: [
            { id: "out", name: "Out" }
          ]
        },
        {
          name: "Sanction",
          options: [
            { id: "penalty", name: "Penalty" },
            { id: "free_kick", name: "Free Kick" },
            { id: "restart_offence", name: "Restart Offence" }
          ]
        },
        {
          name: "Lineout",
          options: [
            { id: "not_straight", name: "Not Straight" },
            { id: "short_throw", name: "Short Throw" },
            { id: "quick_throw", name: "Quick Throw" }
          ]
        }
      ],
      // Every outcome but `won` carries `winnerSide: "other"`: anything that hands the next throw
      // to the opposition is a loss, which is what `lineoutsWon` counts. An outcome with no
      // `winnerSide` would land in the total and in neither column.
      outcomes: [
        { id: "won", name: "Won", variant: "success", eventData: { winnerSide: "same" } },
        { id: "lost", name: "Lost", variant: "danger", eventData: { winnerSide: "other" } },
        { id: "not_straight", name: "Not Straight", variant: "warning", eventData: { winnerSide: "other" } },
        { id: "short_throw", name: "Short Throw", variant: "warning", eventData: { winnerSide: "other" } }
      ],
      steps: [
        { type: ActionStepType.REASON_SELECTION },
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    },
    {
      id: "yellow_card",
      name: "Yellow Card",
      section: "Infringements",
      icon: "AlertTriangle",
      displayPattern: "{name} → {outcome}",
      // How a 20-minute red actually happens: the referee shows a yellow and signals it for review,
      // and the TMO either confirms it or upgrades it. So the review is this card's *outcome*
      // rather than a separate template — a third card button would have made the upgrade
      // unrecordable, since the scorer would have had to delete the yellow and create something
      // else, losing the fact that a review happened at all.
      //
      // `under_review` is a real outcome, not an unset one: "the TMO is looking at it" and "the
      // scorer has not filled this in" must not read the same in the feed.
      outcomes: [
        { id: "stands", name: "Yellow", displayOverride: "", variant: "warning" },
        { id: "under_review", name: "Under Review", displayOverride: "REVIEW", variant: "primary" },
        { id: "upgraded_timed_red", name: "Upgraded — 20-min Red", displayOverride: "20-MIN RED", variant: "danger" },
        { id: "upgraded_red", name: "Upgraded — Red", displayOverride: "RED", variant: "danger" }
      ],
      disputeConfig: {
        type: TemplateDisputeType.CHANGE_OUTCOME,
        heading: "Change Card Outcome"
      },
      // One group: nine reasons do not need dividing, and a card is always given to a person, so
      // every option specifies a player — including `repeated_offence`, where the offence is the
      // team's but the card still goes to somebody.
      reasons: [
        {
          name: "Foul Play",
          options: [
            { id: "dangerous_tackle", name: "Dangerous Tackle", specifyPlayer: true },
            { id: "tip_tackle", name: "Tip Tackle", specifyPlayer: true },
            { id: "tackle_in_air", name: "Tackle in the Air", specifyPlayer: true },
            { id: "croc_roll", name: "Croc Roll", specifyPlayer: true },
            { id: "dangerous_play", name: "Dangerous Play", specifyPlayer: true },
            { id: "professional_foul", name: "Professional Foul", specifyPlayer: true },
            { id: "repeated_offence", name: "Repeated Offence", specifyPlayer: true },
            { id: "offside", name: "Offside", specifyPlayer: true },
            { id: "other", name: "Other", specifyPlayer: true }
          ]
        }
      ],
      steps: [
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.REASON_SELECTION },
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    },
    {
      id: "red_card",
      name: "Red Card",
      section: "Infringements",
      icon: "XCircle",
      displayPattern: "{name} → {outcome}",
      // A red shown on the field without a yellow first. The 20-minute variant is an outcome here
      // too, so the old `timed_red_card` template is gone: the server reads the outcome, and
      // degrades `timed` to permanent when the competition has not enabled `allowTimedRedCard`.
      outcomes: [
        { id: "permanent", name: "Red", displayOverride: "", variant: "danger" },
        { id: "timed", name: "20-min Red", displayOverride: "20-MIN", variant: "danger" }
      ],
      disputeConfig: {
        type: TemplateDisputeType.CHANGE_OUTCOME,
        heading: "Change Card Outcome"
      },
      reasons: [
        {
          name: "Serious Foul Play",
          options: [
            { id: "punching_striking", name: "Punching/Striking", specifyPlayer: true },
            { id: "stamping_kicking", name: "Stamping/Kicking", specifyPlayer: true },
            { id: "biting_eye_contact", name: "Biting/Eye Contact", specifyPlayer: true },
            { id: "retaliation", name: "Retaliation", specifyPlayer: true },
            { id: "dangerous_tackle", name: "Dangerous Tackle", specifyPlayer: true },
            { id: "tip_tackle", name: "Tip Tackle", specifyPlayer: true },
            { id: "dangerous_play", name: "Dangerous Play", specifyPlayer: true },
            // A second yellow is never a 20-minute red — it is the one reason that fixes the
            // outcome to `permanent`.
            { id: "second_yellow", name: "Second Yellow Card", specifyPlayer: true },
            { id: "other", name: "Other", specifyPlayer: true }
          ]
        }
      ],
      steps: [
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.REASON_SELECTION },
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    },
    {
      id: "knock_on",
      name: "Knock-on",
      section: "Stats",
      icon: "Hand",
      displayPattern: "{name}",
      steps: [{ type: ActionStepType.PLAYER_SELECTION }]
    },
    {
      id: "turnover",
      name: "Turnover Won",
      mobileLabel: "Turnover",
      section: "Stats",
      icon: "RotateCw",
      displayPattern: "{name}",
      steps: [{ type: ActionStepType.PLAYER_SELECTION }]
    },
    {
      id: "tackle_made",
      name: "Tackle Made",
      mobileLabel: "Tackle",
      section: "Stats",
      icon: "Zap",
      displayPattern: "{name}",
      steps: [{ type: ActionStepType.PLAYER_SELECTION }]
    },
    {
      id: "tackle_missed",
      name: "Tackle Missed",
      mobileLabel: "Missed Tackle",
      section: "Stats",
      icon: "X",
      displayPattern: "{name}",
      steps: [{ type: ActionStepType.PLAYER_SELECTION }]
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
