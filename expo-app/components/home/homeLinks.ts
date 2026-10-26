/**
 * Where each thing on Home opens (`HOME-1`): its public page, signed in or not. One place, so a
 * page that moves changes here and nowhere else.
 */
export const homeLinks = {
  organization: (orgId: string) => `/organizations/${orgId}`,
  team: (teamId: string) => `/teams/${teamId}`,
  site: (siteId: string) => `/sites/${siteId}`,
  event: (eventId: string) => `/events/${eventId}`,
  game: (eventId: string, gameId: string) => `/events/${eventId}/games/${gameId}`,
  /** What ScoreKeeper is. Today's signed-out page, until `HOME-2` gives it a page of its own. */
  about: () => '/landing',
};
