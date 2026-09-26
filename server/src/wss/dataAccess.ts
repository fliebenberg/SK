import { canJoinRoom } from './roomAccess';
import { accessManager } from '../managers/AccessManager';
import { dataManager } from '../DataManager';

/**
 * Who may read a `get_data` result.
 *
 * `get_data` is the other half of the read boundary. Gating room subscriptions
 * while leaving queries open is a lock on one of two doors: before this, 42 of
 * the 43 request types were answered without ever looking at who was asking, so
 * an anonymous socket could fetch any org's member list — names, emails,
 * `cellphone`, `birthdate`, `nationalId` — by guessing an org id.
 *
 * Rather than invent a second rulebook, almost every request resolves to the
 * room that already owns that data and defers to `canJoinRoom`. A request that
 * no room covers gets an explicit `AccessRule` here instead, and **an unmapped
 * type is refused**, so a new `get_data` case cannot be born unauthenticated.
 */

/** A request that no room owns, classified on its own terms. */
export type StandaloneAccess =
  /** Reference data with no subject: sports, roles, system settings. */
  | 'public'
  /** Anything the org directory needs while logged out. */
  | 'public-directory'
  /** Requires a signed-in user, but no particular membership. */
  | 'authenticated'
  /**
   * May organise the tournament this request names (D33).
   *
   * The one level that is neither a room nor a membership: the organiser list and the picker's
   * search belong to whoever runs the event, which now includes people who belong to none of the
   * organisations in it. `organiserScope` says which event or division to ask about.
   */
  | 'tournament-organiser'
  /** The `id` in the request must be the caller. */
  | 'self'
  /** App admins only. */
  | 'app-admin';

export interface DataAccessRule {
  /** Room whose policy decides this, resolved from the request. */
  room?: (req: any) => string | null | Promise<string | null>;
  /** Used when no room owns the data. */
  standalone?: StandaloneAccess;
  /** The request field naming the subject, for `self`. */
  selfField?: string;
  /** The event or division to authorize against, for `tournament-organiser`. */
  organiserScope?: (req: any) => {
    eventId?: string | null;
    sportId?: string | null;
    divisionId?: string | null;
  };
}

const orgRoom = (suffix: string) => (req: any) =>
  req.orgId ? `org:${req.orgId}:${suffix}` : null;

/**
 * The division room that owns a stage's data.
 *
 * A stage is addressed by its own id, so the division has to be resolved before the request can be
 * authorized — the same shape as `game_roster`, which is addressed by participant id.
 */
async function stageRoom(stageId?: string, suffix?: string): Promise<string | null> {
  if (!stageId) return null;
  const { tournamentManager } = require('../managers/TournamentManager');
  const stage = await tournamentManager.getStage(stageId);
  if (!stage) return null;
  return suffix ? `division:${stage.divisionId}:${suffix}` : `division:${stage.divisionId}`;
}

/** The org that owns a season, via its league. */
async function seasonOrgRoom(seasonId?: string): Promise<string | null> {
  if (!seasonId) return null;
  const season = await dataManager.getSeason(seasonId);
  if (!season?.leagueId) return null;
  const league = await dataManager.getLeague(season.leagueId);
  return league?.orgId ? `org:${league.orgId}:leagues` : null;
}

export const DATA_ACCESS: Record<string, DataAccessRule> = {
  // --- Organizations -------------------------------------------------------
  // The directory is browsable logged out; this is the same data the org list
  // screen shows to anonymous visitors.
  organizations:        { standalone: 'public-directory' },
  organization:         { standalone: 'public-directory' },
  org_summary:          { standalone: 'public-directory' },
  search_similar_orgs:  { standalone: 'public-directory' },

  // People. The reason this whole module exists.
  org_members:          { room: orgRoom('members') },
  org_referrals:        { room: orgRoom('referrals') },
  // The nominator's view of an org they do not belong to: "is an invitation already pending?"
  // Any signed-in user may add an org to an event, so any signed-in user may ask; what comes back
  // is a boolean plus the caller's own nominations, never another nominator's email.
  org_claim_status:     { standalone: 'authenticated' },
  // Returns [] today, but classify by what it is, not by what it currently does,
  // or filling it in later silently reopens the hole.
  org_profiles:         { room: orgRoom('members') },
  org_memberships:      { room: orgRoom('members') },
  // Who answers for a player (`MEMBER-3`) — people data, at the member list's level.
  profile_guardians:    { room: orgRoom('guardians') },
  // Cross-org by nature: it is how you find a person to invite. Narrowed from
  // "anyone" to "a signed-in user" rather than guessed at — see `DATA-1`.
  search_people:        { standalone: 'authenticated' },
  find_matching_user:   { standalone: 'authenticated' },

  // --- Teams ---------------------------------------------------------------
  teams:                { room: orgRoom('teams') },
  team:                 { room: async (req: any) => {
                            const orgId = req.id ? await accessManager.getTeamOrgId(req.id) : null;
                            return orgId ? `org:${orgId}:teams` : null;
                          } },
  // Rosters are personal data, often a minor's — the `team:{id}` room's level.
  //
  // A scoring screen is the exception, and it is why `gameId` is honoured: it shows both
  // sides' players while the scorer belongs to only one of the two orgs. Naming the game
  // moves the decision to `game:{id}`, which already admits every org with a stake in the
  // fixture — but only once the team is confirmed to be playing in it, so the parameter
  // cannot be used to reach a roster that has nothing to do with the caller's game.
  team_members:         { room: async (req: any) => {
                            const teamId = req.teamId || req.id;
                            if (!teamId) return null;
                            if (req.gameId && await accessManager.gameHasTeam(req.gameId, teamId)) {
                              return `game:${req.gameId}`;
                            }
                            return `team:${teamId}`;
                          } },
  team_memberships:     { room: (req: any) => (req.teamId || req.id) ? `team:${req.teamId || req.id}` : null },
  team_games:           { room: async (req: any) => {
                            const teamId = req.teamId || req.id;
                            const orgId = teamId ? await accessManager.getTeamOrgId(teamId) : null;
                            return orgId ? `org:${orgId}:events` : null;
                          } },

  // --- Venues --------------------------------------------------------------
  sites:                { room: orgRoom('sites') },
  // Named subject or nothing: without the guard a request carrying neither builds the
  // room `site:undefined`, which classifies as a public site room and is let through.
  facilities:           { room: (req: any) => {
                            if (req.orgId) return `org:${req.orgId}:facilities`;
                            const siteId = req.id || req.siteId;
                            return siteId ? `site:${siteId}` : null;
                          } },
  site:                 { room: (req: any) => (req.id ? `site:${req.id}` : null) },
  facility:             { room: (req: any) => (req.id ? `facility:${req.id}` : null) },

  // --- Fixtures ------------------------------------------------------------
  events:               { room: orgRoom('events') },
  event:                { room: (req: any) => (req.id ? `event:${req.id}` : null) },
  games:                { room: orgRoom('events') },
  // A single game's full record is the internal tier, not the summary.
  game:                 { room: (req: any) => (req.id ? `game:${req.id}` : null) },
  game_events:          { room: (req: any) => (req.id ? `game:${req.id}:events` : null) },
  active_disputes:      { room: (req: any) => (req.id ? `game:${req.id}:events` : null) },
  // A roster is addressed by participant id, so resolve its game first.
  game_roster:          { room: async (req: any) => {
                            const gameId = req.id ? await dataManager.getGameIdForParticipant(req.id) : null;
                            return gameId ? `game:${gameId}` : null;
                          } },
  roster:               { room: async (req: any) => {
                            const gameId = req.id ? await dataManager.getGameIdForParticipant(req.id) : null;
                            return gameId ? `game:${gameId}` : null;
                          } },

  // --- Competitions --------------------------------------------------------
  leagues:              { room: orgRoom('leagues') },
  league:               { room: (req: any) => (req.id ? `league:${req.id}:seasons` : null) },
  seasons:              { room: (req: any) => (req.leagueId ? `league:${req.leagueId}:seasons` : null) },
  season:               { room: (req: any) => (req.id ? `season:${req.id}:standings` : null) },
  season_standings:     { room: (req: any) => (req.id ? `season:${req.id}:standings` : null) },
  season_teams:         { room: (req: any) => seasonOrgRoom(req.seasonId || req.id) },
  season_games:         { room: (req: any) => seasonOrgRoom(req.seasonId || req.id) },

  // --- Tournaments ---------------------------------------------------------
  // Each resolves to the division room that owns the data, so there is one rulebook rather than
  // two — and the split between them is the same one `roomAccess` makes: the draw and the table
  // are public, the roster and the manual adjustments are not.
  //
  // `division` itself resolves to the *fixtures* room rather than the base one: a division's name,
  // sport and age group are what a public fixture list prints above the draw, so gating them at
  // `member` would blank the heading of a page whose contents are public.
  divisions:            { room: (req: any) => (req.eventId ? `event:${req.eventId}` : null) },
  event_facilities:     { room: (req: any) => (req.eventId ? `event:${req.eventId}` : null) },
  event_standings:      { room: (req: any) => (req.eventId ? `event:${req.eventId}` : null) },
  division:             { room: (req: any) => (req.divisionId ? `division:${req.divisionId}:fixtures` : null) },
  division_stages:      { room: (req: any) => (req.divisionId ? `division:${req.divisionId}:fixtures` : null) },
  division_games:       { room: (req: any) => (req.divisionId ? `division:${req.divisionId}:fixtures` : null) },
  division_facilities:  { room: (req: any) => (req.divisionId ? `division:${req.divisionId}:fixtures` : null) },
  division_standings:   { room: (req: any) => (req.divisionId ? `division:${req.divisionId}:standings` : null) },
  // The roster and the adjustments are the organiser's tier.
  division_entrants:    { room: (req: any) => (req.divisionId ? `division:${req.divisionId}` : null) },
  division_adjustments: { room: (req: any) => (req.divisionId ? `division:${req.divisionId}` : null) },
  // Addressed by stage, so resolve its division first — the same shape as `game_roster`, which is
  // addressed by participant.
  stage:                { room: (req: any) => stageRoom(req.stageId, 'fixtures') },
  // --- Permissions (Phase 4) ----------------------------------------------
  // `event_capabilities` answers about the caller and nobody else: the identity comes from the
  // handshake and the request carries no user field, so "authenticated" is the whole rule — there
  // is no way to ask it about somebody else.
  event_capabilities:   { standalone: 'authenticated' },
  my_event_grants:      { standalone: 'authenticated' },
  // Who runs this tournament is not spectator information: it is a list of named people, and
  // `event:{id}` is a public room, so it cannot defer to one.
  event_organizers:     { standalone: 'tournament-organiser', organiserScope: (req: any) => ({ eventId: req.eventId }) },
  // Asked per sport, not per event (2026-09-20): the read is then gated by exactly the grant that
  // would let the caller change it, so a sport's organiser reads their own sport's list without
  // being handed the people running every other sport.
  sport_organizers:     {
    standalone: 'tournament-organiser',
    organiserScope: (req: any) => ({ eventId: req.eventId, sportId: req.sportId }),
  },
  division_organizers:  { standalone: 'tournament-organiser', organiserScope: (req: any) => ({ divisionId: req.divisionId }) },
  // Who runs each division of one sport — the Sports & Divisions list. Gated as `sport_organizers`
  // is, and for the same reason: the sport grant is exactly what covers every division in it.
  sport_division_organizers: {
    standalone: 'tournament-organiser',
    organiserScope: (req: any) => ({ eventId: req.eventId, sportId: req.sportId }),
  },
  // The picker. Gated at the same level as the appointment it feeds, so browsing people is never
  // easier than the action it exists for — which, since convenors may appoint co-convenors and a
  // sport's organiser may appoint within their sport, means a `divisionId` or a `sportId` is
  // accepted as the narrower scope, as `event_candidate_teams` already does.
  organizer_candidates: {
    standalone: 'tournament-organiser',
    organiserScope: (req: any) => ({
      eventId: req.eventId,
      sportId: req.sportId,
      divisionId: req.divisionId,
    }),
  },
  stage_games:          { room: (req: any) => stageRoom(req.stageId, 'fixtures') },
  // Pool membership is roster data: it names which competitors are in the division at all.
  stage_entrants:       { room: (req: any) => stageRoom(req.stageId) },

  // --- Entry (Phase 6) -----------------------------------------------------
  // The whole tournament's roster defers to the room that owns it, which is the ordinary case: one
  // rulebook rather than two. It exists as a `get_data` at all only for a caller that wants the
  // rows without holding the room — the entry screens themselves take the join push.
  event_entrants:       { room: (req: any) => (req.eventId ? `event:${req.eventId}:entrants` : null) },
  // "Teams that could be entered" is a set no room owns — the same shape as the invite picker
  // (`FIX-2`), and gated like the appointment screens: browsing an org's teams through this must
  // never be easier than the entry it exists to feed.
  // Either scope answers it: the event-level entry screen asks with an `eventId`, and a convenor
  // reaching the same editor through their division's screen asks with a `divisionId` — which is
  // the narrower check, and the one that runs when both are present.
  event_candidate_teams:{
    standalone: 'tournament-organiser',
    organiserScope: (req: any) => ({ eventId: req.eventId, divisionId: req.divisionId }),
  },

  // --- Reference data, no subject -----------------------------------------
  sports:               { standalone: 'public' },
  sport:                { standalone: 'public' },
  roles:                { standalone: 'public' },
  system_settings:      { standalone: 'public' },

  // --- Personal ------------------------------------------------------------
  user_memberships:     { standalone: 'self', selfField: 'id' },
  notifications:        { standalone: 'self', selfField: 'id' },
  // Both are reached from an emailed link before the recipient has an account,
  // so neither can require a session. Each is guarded by an unguessable token
  // or by the email already being known to the sender.
  claim_info:           { standalone: 'public' },
  pending_claims:       { standalone: 'public' },

  // --- Admin ---------------------------------------------------------------
  // Already checked inside the handler; declared here so the table is complete.
  reports:              { standalone: 'app-admin' },
};

export interface DataAccessDecision {
  allowed: boolean;
  /** Why, for the log-only pass and for the refusal message. */
  reason: string;
}

/**
 * `userId` is the identity proven by the socket handshake — never anything in
 * the request. Returns a decision rather than throwing so the caller can run
 * this in log-only mode while the rules are being shaken out.
 */
export async function canReadData(userId: string, request: any): Promise<DataAccessDecision> {
  const type = request?.type;
  if (!type) return { allowed: false, reason: 'no type' };

  const rule = DATA_ACCESS[type];
  if (!rule) return { allowed: false, reason: `unmapped type '${type}'` };

  const isAuthenticated = !!userId && userId !== 'anonymous' && userId !== 'invalid-token';

  if (rule.standalone) {
    switch (rule.standalone) {
      case 'public':
      case 'public-directory':
        return { allowed: true, reason: rule.standalone };
      case 'authenticated':
        return isAuthenticated
          ? { allowed: true, reason: 'authenticated' }
          : { allowed: false, reason: 'requires a signed-in user' };
      case 'self': {
        const subject = request[rule.selfField || 'id'];
        return subject && subject === userId
          ? { allowed: true, reason: 'self' }
          : { allowed: false, reason: `only the subject may read this (asked for ${subject})` };
      }
      case 'app-admin':
        return isAuthenticated && (await accessManager.isAppAdmin(userId))
          ? { allowed: true, reason: 'app admin' }
          : { allowed: false, reason: 'app admins only' };
      case 'tournament-organiser': {
        if (!isAuthenticated) return { allowed: false, reason: 'requires a signed-in user' };
        const scope = rule.organiserScope ? rule.organiserScope(request) : null;
        if (scope?.divisionId) {
          return (await accessManager.canOrganizeDivision(userId, scope.divisionId))
            ? { allowed: true, reason: `organises division ${scope.divisionId}` }
            : { allowed: false, reason: 'not an organiser of that division' };
        }
        // Narrowest first, so the check that runs is the one the caller's own grant can satisfy.
        // A sport scope needs both halves: a grant is over one sport of one tournament.
        if (scope?.sportId && scope?.eventId) {
          return (await accessManager.canOrganizeSport(userId, scope.eventId, scope.sportId))
            ? { allowed: true, reason: `organises sport ${scope.sportId} of event ${scope.eventId}` }
            : { allowed: false, reason: 'not an organiser of that sport' };
        }
        if (scope?.eventId) {
          return (await accessManager.canOrganizeEvent(userId, scope.eventId))
            ? { allowed: true, reason: `organises event ${scope.eventId}` }
            : { allowed: false, reason: 'not an organiser of that tournament' };
        }
        return { allowed: false, reason: 'request names no tournament to authorize against' };
      }
    }
  }

  const room = rule.room ? await rule.room(request) : null;
  if (!room) return { allowed: false, reason: 'request names no subject to authorize against' };

  return (await canJoinRoom(userId, room))
    ? { allowed: true, reason: `via ${room}` }
    : { allowed: false, reason: `not permitted on ${room}` };
}
