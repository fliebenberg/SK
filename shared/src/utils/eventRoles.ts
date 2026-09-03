import { Event } from '../models/event/Event';
import { EventGrants } from '../models/event/Tournament';
import { OrgMembership } from '../models/organization/OrgMembership';
import { TeamMembership } from '../models/team/TeamMembership';

/**
 * A viewer's relationship to a tournament, which is a **set** and not a value (U4).
 *
 * A person can be hosting a sports day, convening its netball and coaching a team in it, all at
 * once — and they will use the screen for all three. Collapsing that to the "most senior" role
 * loses exactly the information the label exists to convey.
 *
 * `Following` is deliberately absent rather than forgotten: §1 of the UI doc reserves it in the
 * vocabulary so that adding it later is one more flag rather than a new concept. Following is not
 * built.
 */
export type EventRole = 'Hosting' | 'Convening' | 'Attending';

export const EVENT_ROLES: EventRole[] = ['Hosting', 'Convening', 'Attending'];

/** What each chip means, for the filter row's accessibility label and any explanatory copy. */
export const EVENT_ROLE_DESCRIPTIONS: Record<EventRole, string> = {
  Hosting: 'You run this tournament',
  Convening: 'You run a division of it',
  Attending: 'Your organisation is taking part',
};

const ADMIN_ROLES = ['role-org-admin', 'role-org-staff'];
const COACH_ROLES = ['role-coach', 'role-assistant-coach'];

/** Only the sides matter here, so this takes the shape rather than a concrete `Game`. */
export interface RoleGame {
  participants?: Array<{ teamId?: string; orgId?: string }>;
}

/**
 * Every role this viewer holds in this event.
 *
 * **Hosting and attending are derived here; convening is not and cannot be.** UI doc §4 is explicit
 * about the split: the client already holds the user's memberships, the event's own org and its
 * participating orgs, so it can answer the first two without asking. Division-organiser assignments
 * appear on no payload the client holds, so `grants` carries them — one read for a whole list.
 *
 * An app admin is not "hosting" everything. These chips describe a relationship, not a permission;
 * what an admin may *do* is answered by `event_capabilities`, which is a different question asked
 * in a different place.
 */
export function deriveEventRoles(params: {
  event: Pick<Event, 'id' | 'orgId' | 'participatingOrgIds'>;
  grants: EventGrants;
  orgMemberships: OrgMembership[];
  teamMemberships: TeamMembership[];
  /** The event's fixtures, for "my team is playing in it". Omit where the screen has none. */
  games?: RoleGame[];
}): EventRole[] {
  const { event, grants, orgMemberships, teamMemberships, games = [] } = params;
  const roles: EventRole[] = [];

  const myOrgIds = new Set((orgMemberships || []).map(m => m.orgId));
  const myAdminOrgIds = new Set(
    (orgMemberships || []).filter(m => ADMIN_ROLES.indexOf(m.roleId) !== -1).map(m => m.orgId)
  );
  const myCoachedTeamIds = new Set(
    (teamMemberships || []).filter(m => COACH_ROLES.indexOf(m.roleId) !== -1).map(m => m.teamId)
  );

  // Hosting is either of the two sources of full rights over a tournament, and they are genuinely
  // different: an admin of the hosting org holds it by *being an admin*, an appointed organiser
  // holds it by assignment (D33). Both run the tournament, so both wear the chip.
  if (myAdminOrgIds.has(event.orgId) || grants.eventIds.indexOf(event.id) !== -1) {
    roles.push('Hosting');
  }

  if (grants.divisions.some(d => d.eventId === event.id)) {
    roles.push('Convening');
  }

  // Attending is "my organisation is in this", either because it was invited or because one of its
  // teams is on a fixture — and "I coach a side in it", which is the case that makes this a set
  // rather than a value for most people using it.
  const isParticipatingOrg = (event.participatingOrgIds || []).some(id => myOrgIds.has(id));
  const isPlaying = games.some(game =>
    (game.participants || []).some(
      p => (p.orgId && myOrgIds.has(p.orgId)) || (p.teamId && myCoachedTeamIds.has(p.teamId))
    )
  );
  if (isParticipatingOrg || isPlaying) {
    roles.push('Attending');
  }

  return roles;
}
