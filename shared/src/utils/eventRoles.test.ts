import { describe, expect, it } from 'vitest';
import { deriveEventRoles } from './eventRoles';
import { EventGrants } from '../models/event/Tournament';

/**
 * The rule under test is U4: **a viewer's relationship to a tournament is a set, not a value.**
 *
 * That is a rule that has to hold forever rather than a fact about one release, which is what puts
 * it here rather than in a throwaway script. The failure it guards against is the tempting one —
 * collapsing three roles into the "most senior" — because it loses exactly the information the
 * chips exist to convey: a host who also coaches a team will use the screen for both.
 */

const NO_GRANTS: EventGrants = { eventIds: [], divisions: [] };

const event = {
  id: 'evt-1',
  orgId: 'org-host',
  participatingOrgIds: ['org-guest'],
};

const membership = (orgId: string, roleId: string) => ({ orgId, roleId }) as any;
const teamRole = (teamId: string, roleId: string) => ({ teamId, roleId }) as any;

describe('deriveEventRoles', () => {
  it('gives a stranger no roles at all', () => {
    expect(
      deriveEventRoles({
        event,
        grants: NO_GRANTS,
        orgMemberships: [membership('org-elsewhere', 'role-org-admin')],
        teamMemberships: [],
      })
    ).toEqual([]);
  });

  it('names an admin of the hosting org as hosting', () => {
    expect(
      deriveEventRoles({
        event,
        grants: NO_GRANTS,
        orgMemberships: [membership('org-host', 'role-org-admin')],
        teamMemberships: [],
      })
    ).toEqual(['Hosting']);
  });

  it('names an appointed organiser as hosting, with no membership anywhere', () => {
    // The case the whole grant model exists for (D33): the person who runs the sports day is often
    // a teacher, not whoever administers the app account.
    expect(
      deriveEventRoles({
        event,
        grants: { eventIds: ['evt-1'], divisions: [] },
        orgMemberships: [],
        teamMemberships: [],
      })
    ).toEqual(['Hosting']);
  });

  it('names a convenor of one of its divisions as convening', () => {
    expect(
      deriveEventRoles({
        event,
        grants: { eventIds: [], divisions: [{ divisionId: 'div-1', eventId: 'evt-1' }] },
        orgMemberships: [],
        teamMemberships: [],
      })
    ).toEqual(['Convening']);
  });

  it('does not leak a grant from one event onto another', () => {
    expect(
      deriveEventRoles({
        event,
        grants: {
          eventIds: ['evt-other'],
          divisions: [{ divisionId: 'div-9', eventId: 'evt-other' }],
        },
        orgMemberships: [],
        teamMemberships: [],
      })
    ).toEqual([]);
  });

  it('names a member of a participating org as attending', () => {
    expect(
      deriveEventRoles({
        event,
        grants: NO_GRANTS,
        orgMemberships: [membership('org-guest', 'role-org-player')],
        teamMemberships: [],
      })
    ).toEqual(['Attending']);
  });

  it('names a coach whose team is on a fixture as attending, without any org involvement', () => {
    expect(
      deriveEventRoles({
        event: { ...event, participatingOrgIds: [] },
        grants: NO_GRANTS,
        orgMemberships: [],
        teamMemberships: [teamRole('team-7', 'role-coach')],
        games: [{ participants: [{ teamId: 'team-7' }, { teamId: 'team-8' }] }],
      })
    ).toEqual(['Attending']);
  });

  it('does not name a manager of an uninvolved team as attending', () => {
    expect(
      deriveEventRoles({
        event: { ...event, participatingOrgIds: [] },
        grants: NO_GRANTS,
        orgMemberships: [],
        teamMemberships: [teamRole('team-99', 'role-coach')],
        games: [{ participants: [{ teamId: 'team-7' }, { teamId: 'team-8' }] }],
      })
    ).toEqual([]);
  });

  it('returns every role a person holds, not the most senior one', () => {
    // The exit criterion for Phase 5 in one assertion: an event you host and coach in shows two
    // chips. Three, when you also convene one of its divisions.
    expect(
      deriveEventRoles({
        event,
        grants: { eventIds: [], divisions: [{ divisionId: 'div-1', eventId: 'evt-1' }] },
        orgMemberships: [membership('org-host', 'role-org-admin')],
        teamMemberships: [teamRole('team-7', 'role-coach')],
        games: [{ participants: [{ teamId: 'team-7' }, { teamId: 'team-8' }] }],
      })
    ).toEqual(['Hosting', 'Convening', 'Attending']);
  });

  it('treats a plain membership of the hosting org as no role by itself', () => {
    // Being a player at the school that happens to be hosting is not hosting, and it is not
    // attending either until one of their teams is actually in it.
    expect(
      deriveEventRoles({
        event: { ...event, participatingOrgIds: [] },
        grants: NO_GRANTS,
        orgMemberships: [membership('org-host', 'role-org-player')],
        teamMemberships: [],
      })
    ).toEqual([]);
  });
});
