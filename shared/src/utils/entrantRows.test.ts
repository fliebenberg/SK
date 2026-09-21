import { describe, expect, it } from 'vitest';
import { CandidateTeam, TournamentEntrant } from '../models/event/Tournament';
import { OrgBadge } from '../models/organization/Organization';
import { buildEntrantRows } from './entrantRows';

const orgs: OrgBadge[] = [
  { id: 'org-n', name: 'Northcliff', shortName: 'NHS' },
  { id: 'org-a', name: 'Athlone', shortName: 'AHS' },
];

const team = (id: string, name: string, orgId: string): CandidateTeam =>
  ({ id, name, orgId, orgName: orgId, orgShortName: orgId, sportId: 'rugby' } as CandidateTeam);

const entrant = (over: Partial<TournamentEntrant>): TournamentEntrant =>
  ({ id: 'e', divisionId: 'div-1', status: 'active', ...over } as TournamentEntrant);

describe('the rows of the entry table', () => {
  it('lists every candidate team, entered or not, because the table is where you enter them', () => {
    const rows = buildEntrantRows([team('t1', 'First XV', 'org-n')], [], orgs);
    expect(rows.map(r => [r.key, r.kind, !!r.entrant])).toEqual([['t1', 'team', false]]);
  });

  it('attaches the entrant to its team, which is how the division column knows where it is', () => {
    const rows = buildEntrantRows(
      [team('t1', 'First XV', 'org-n')],
      [entrant({ id: 'e1', teamId: 't1', divisionId: 'div-9' })],
      orgs
    );
    expect(rows[0].entrant?.divisionId).toBe('div-9');
  });

  it('gives a placeholder a row of its own, since no candidate produces one', () => {
    const rows = buildEntrantRows([], [entrant({ id: 'e1', label: 'Winner of the qualifier' })], orgs);
    expect(rows.map(r => [r.kind, r.name, r.team])).toEqual([
      ['placeholder', 'Winner of the qualifier', null],
    ]);
  });

  it('gives a person entrant a row, so an individual sport has exactly what was added', () => {
    const rows = buildEntrantRows(
      [],
      [entrant({ id: 'e1', orgProfileId: 'p1', name: 'A Runner', orgId: 'org-n' })],
      orgs
    );
    expect(rows.map(r => [r.kind, r.name])).toEqual([['person', 'A Runner']]);
  });

  it('prepopulates nothing for an individual sport, which is the point of the second half', () => {
    expect(buildEntrantRows([], [], orgs)).toEqual([]);
  });

  it('keeps a team that is entered but no longer a candidate, rather than hiding a real competitor', () => {
    const rows = buildEntrantRows(
      [team('t1', 'First XV', 'org-n')],
      [
        entrant({ id: 'e1', teamId: 't1' }),
        entrant({ id: 'e2', teamId: 't-gone', name: 'Departed XI', orgId: 'org-a' }),
      ],
      orgs
    );
    expect(rows.map(r => r.name)).toContain('Departed XI');
    // Its sport was never read, so no division can be ruled out for it.
    expect(rows.find(r => r.name === 'Departed XI')?.team).toBeNull();
  });

  it('does not duplicate a candidate that is also an entrant', () => {
    const rows = buildEntrantRows(
      [team('t1', 'First XV', 'org-n')],
      [entrant({ id: 'e1', teamId: 't1' })],
      orgs
    );
    expect(rows.length).toBe(1);
  });

  it('sorts by organisation, then by name', () => {
    const rows = buildEntrantRows(
      [
        team('t2', 'Second XV', 'org-n'),
        team('t1', 'First XV', 'org-n'),
        team('t3', 'First XI', 'org-a'),
      ],
      [],
      orgs
    );
    // Athlone before Northcliff, and First before Second within Northcliff.
    expect(rows.map(r => r.name)).toEqual(['First XI', 'First XV', 'Second XV']);
  });
});
