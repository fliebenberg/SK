import { ActionStepType, TemplateDisputeType } from "@sk/shared";

/**
 * Netball, modelled on the rugby seed and the World Netball rules. A first draft (2026-09-24),
 * written to be checked in the sport editor. Where a rule is a matter of competition choice the
 * value is the international default, noted beside it.
 *
 * The two card templates keep rugby's ids on purpose: `yellow_card` and `red_card` are what the
 * server's suspension timer (`GameEventManager.deriveCardSuspension`) and the tournament
 * discipline tiebreak read. In netball they are a two-minute suspension and a sending-off.
 */
export const NETBALL_SEED_SPEC = {
  id: "netball",
  name: "Netball",
  categoryId: "netball",
  participantType: "TEAM",
  matchTopology: "HEAD_TO_HEAD",
  facilityTerm: "Court",
  periodTerm: "Quarter",
  timerShowHours: false,
  defaultSettings: {
    // Four 15-minute quarters is the international format; school fixtures often play shorter
    // quarters, which a competition or fixture overrides.
    periodLengthMS: 15 * 60 * 1000,
    scheduledPeriods: 4,
    // Seven on court and up to five on the bench.
    maxReserves: 5,
    positions: [
      { id: "GS", name: "Goal Shooter" },
      { id: "GA", name: "Goal Attack" },
      { id: "WA", name: "Wing Attack" },
      { id: "C", name: "Centre" },
      { id: "WD", name: "Wing Defence" },
      { id: "GD", name: "Goal Defence" },
      { id: "GK", name: "Goal Keeper" }
    ],
    // A suspended player sits out two minutes of playing time. A player sent off does not
    // return, so there is no timed sending-off and no `redCardDurationMS`.
    yellowCardDurationMS: 2 * 60 * 1000,
    allowTimedRedCard: false
  },
  eventSections: [
    { id: "Scoring", name: "Scoring Events", affectsScore: true },
    { id: "Game Events", name: "Game Events" },
    { id: "Infringements", name: "Infringement Events" },
    { id: "Stats", name: "Stats Events" }
  ],
  eventTemplates: [
    {
      id: "goal",
      name: "Goal",
      section: "Scoring",
      icon: "Target",
      points: 1,
      displayPattern: "{name}",
      // Only the GS and GA may score; the roster does not enforce that, so the scorer picks.
      // No `triggerEventId: "centre_pass"`, unlike rugby's try → conversion: goals come about once
      // a minute, and centre passes alternate rather than going to the team that conceded, so a
      // chained prompt would be both slow and often for the wrong team.
      disputeConfig: {
        type: TemplateDisputeType.REMOVE,
        heading: "Remove Goal"
      },
      steps: [
        { type: ActionStepType.PLAYER_SELECTION }
      ]
    },
    {
      id: "centre_pass",
      name: "Centre Pass",
      section: "Game Events",
      icon: "Play",
      displayPattern: "{name} → {outcome}",
      // Optional, recorded by hand: it restarts play after every goal and at each quarter.
      outcomes: [
        { id: "received", name: "Received", displayOverride: "", variant: "success", eventData: { successful: true } },
        { id: "intercepted", name: "Intercepted", displayOverride: "LOST", variant: "danger", eventData: { successful: false } },
        { id: "infringed", name: "Infringed", displayOverride: "FREE PASS", variant: "warning", eventData: { successful: false } }
      ],
      steps: [
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    },
    {
      id: "throw_in",
      name: "Throw-in",
      section: "Game Events",
      icon: "ArrowUpRight",
      displayPattern: "{name}",
      steps: [
        { type: ActionStepType.PLAYER_SELECTION }
      ]
    },
    {
      id: "toss_up",
      name: "Toss-up",
      section: "Game Events",
      icon: "ArrowUp",
      displayPattern: "{name} → {outcome}",
      // Two opponents gain possession or infringe at the same moment; the umpire tosses the ball
      // up between them.
      outcomes: [
        { id: "won", name: "Won", variant: "success", eventData: { successful: true } },
        { id: "lost", name: "Lost", variant: "danger", eventData: { successful: false } }
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
      displayPattern: "PENALTY → {reason}",
      // Contact and obstruction. The offending player stands out of play beside the thrower until
      // the pass is taken; inside the goal circle the attacking team may shoot instead.
      reasons: [
        {
          name: "Contact",
          options: [
            { id: "contact_ball", name: "Contact on the Ball", specifyPlayer: true },
            { id: "contact_player", name: "Contact with Player", specifyPlayer: true },
            { id: "contact_other", name: "Other", specifyPlayer: true }
          ]
        },
        {
          name: "Obstruction",
          options: [
            { id: "obstruction_distance", name: "Short Distance (Under 0.9m)", specifyPlayer: true },
            { id: "obstruction_intimidation", name: "Intimidation", specifyPlayer: true },
            { id: "obstruction_out_of_court", name: "Obstruction from Out of Court", specifyPlayer: true },
            { id: "obstruction_other", name: "Other", specifyPlayer: true }
          ]
        }
      ],
      outcomes: [
        // Recorded against the offending team; the pass or shot belongs to their opponents.
        { id: "penalty_pass", name: "Penalty Pass", variant: "primary" },
        { id: "penalty_pass_or_shot", name: "Penalty Pass or Shot", variant: "warning" }
      ],
      steps: [
        { type: ActionStepType.REASON_SELECTION },
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.OUTCOME_SELECTION }
      ]
    },
    {
      id: "free_pass",
      name: "Free Pass Against",
      mobileLabel: "Free Pass Against",
      section: "Infringements",
      icon: "Zap",
      displayPattern: "{name} → {reason}",
      // The minor infringements: handling the ball or moving illegally rather than interfering
      // with an opponent. Same id-prefix convention as rugby's reasons.
      reasons: [
        {
          name: "Ball Handling",
          options: [
            { id: "handling_footwork", name: "Footwork (Stepping)", specifyPlayer: true },
            { id: "handling_held_ball", name: "Held Ball (Over 3 Seconds)", specifyPlayer: true },
            { id: "handling_replayed_ball", name: "Replayed Ball", specifyPlayer: true },
            { id: "handling_over_a_third", name: "Over a Third", specifyPlayer: true },
            { id: "handling_short_pass", name: "Short Pass", specifyPlayer: true }
          ]
        },
        {
          name: "Position",
          options: [
            { id: "position_offside", name: "Offside", specifyPlayer: true },
            { id: "position_breaking", name: "Breaking (Centre Pass)", specifyPlayer: true }
          ]
        },
        {
          name: "Other",
          options: [
            { id: "other", name: "Other", specifyPlayer: true }
          ]
        }
      ],
      steps: [
        { type: ActionStepType.REASON_SELECTION },
        { type: ActionStepType.PLAYER_SELECTION }
      ]
    },
    {
      id: "warning",
      name: "Warning",
      section: "Infringements",
      icon: "AlertTriangle",
      displayPattern: "{name}",
      // The umpire's step before a suspension. Keeps no one off the court.
      steps: [
        { type: ActionStepType.PLAYER_SELECTION }
      ]
    },
    {
      id: "yellow_card",
      name: "Suspension",
      section: "Infringements",
      icon: "AlertTriangle",
      displayPattern: "{name}",
      disputeConfig: {
        type: TemplateDisputeType.REMOVE,
        heading: "Remove Suspension"
      },
      reasons: [
        {
          name: "Reason",
          options: [
            { id: "dangerous_play", name: "Dangerous Play", specifyPlayer: true },
            { id: "persistent_infringement", name: "Persistent Infringement", specifyPlayer: true },
            { id: "unsporting_behaviour", name: "Unsporting Behaviour", specifyPlayer: true },
            { id: "other", name: "Other", specifyPlayer: true }
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
      name: "Sent Off",
      section: "Infringements",
      icon: "XCircle",
      displayPattern: "{name}",
      disputeConfig: {
        type: TemplateDisputeType.REMOVE,
        heading: "Remove Sending Off"
      },
      reasons: [
        {
          name: "Reason",
          options: [
            { id: "violent_conduct", name: "Violent Conduct", specifyPlayer: true },
            { id: "dangerous_play", name: "Dangerous Play", specifyPlayer: true },
            { id: "second_suspension", name: "Second Suspension", specifyPlayer: true },
            { id: "other", name: "Other", specifyPlayer: true }
          ]
        }
      ],
      steps: [
        { type: ActionStepType.PLAYER_SELECTION },
        { type: ActionStepType.REASON_SELECTION }
      ]
    },
    {
      id: "missed_shot",
      name: "Missed Shot",
      mobileLabel: "Miss",
      section: "Stats",
      icon: "X",
      displayPattern: "{name}",
      steps: [{ type: ActionStepType.PLAYER_SELECTION }]
    },
    {
      id: "intercept",
      name: "Intercept",
      section: "Stats",
      icon: "Hand",
      displayPattern: "{name}",
      steps: [{ type: ActionStepType.PLAYER_SELECTION }]
    },
    {
      id: "deflection",
      name: "Deflection",
      section: "Stats",
      icon: "Zap",
      displayPattern: "{name}",
      steps: [{ type: ActionStepType.PLAYER_SELECTION }]
    },
    {
      id: "rebound",
      name: "Rebound",
      section: "Stats",
      icon: "RotateCw",
      displayPattern: "{name}",
      steps: [{ type: ActionStepType.PLAYER_SELECTION }]
    },
    {
      id: "feed",
      name: "Feed into Circle",
      mobileLabel: "Feed",
      section: "Stats",
      icon: "ArrowUpRight",
      displayPattern: "{name}",
      steps: [{ type: ActionStepType.PLAYER_SELECTION }]
    },
    {
      id: "turnover",
      name: "Turnover Conceded",
      mobileLabel: "Turnover",
      section: "Stats",
      icon: "RotateCw",
      displayPattern: "{name}",
      steps: [{ type: ActionStepType.PLAYER_SELECTION }]
    }
  ]
};
