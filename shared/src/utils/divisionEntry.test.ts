import { describe, expect, it } from 'vitest';
import { CandidateTeam } from '../models/event/Tournament';
import { divisionsForTeam, teamQualifies } from './divisionEntry';

const team = (id: string, sportId: string, ageGroupId?: string): CandidateTeam =>
  ({ id, name: id, orgId: 'org-1', sportId, ageGroupId } as CandidateTeam);

const rugbyU14 = { sportId: 'rugby', ageGroupId: 'ag-u14' };

describe('which teams qualify for a division', () => {
  it('matches the sport and the age group by id', () => {
    expect(teamQualifies(team('a', 'rugby', 'ag-u14'), rugbyU14)).toBe(true);
    expect(teamQualifies(team('b', 'rugby', 'ag-u13'), rugbyU14)).toBe(false);
    expect(teamQualifies(team('c', 'hockey', 'ag-u14'), rugbyU14)).toBe(false);
  });

  it('does not let a team with no age group into a division that names one', () => {
    expect(teamQualifies(team('a', 'rugby'), rugbyU14)).toBe(false);
  });

  it('lets any age through when the division names none', () => {
    expect(teamQualifies(team('a', 'rugby', 'ag-u13'), { sportId: 'rugby' })).toBe(true);
  });
});

describe('which divisions a competitor may enter', () => {
  const divisions = [
    { id: 'r14', sportId: 'rugby', ageGroupId: 'ag-u14' },
    { id: 'r13', sportId: 'rugby', ageGroupId: 'ag-u13' },
    { id: 'rAny', sportId: 'rugby', ageGroupId: null },
    { id: 'h14', sportId: 'hockey', ageGroupId: 'ag-h-u14' },
  ];

  it('offers the matching age group and any division that names none', () => {
    const { qualifying } = divisionsForTeam(team('a', 'rugby', 'ag-u14'), divisions);
    expect(qualifying.map(d => d.id)).toEqual(['r14', 'rAny']);
  });

  it('keeps the other age groups of the same sport separate, as the override', () => {
    const { others } = divisionsForTeam(team('a', 'rugby', 'ag-u14'), divisions);
    expect(others.map(d => d.id)).toEqual(['r13']);
  });

  it('never offers another sport, in either group', () => {
    const { qualifying, others } = divisionsForTeam(team('a', 'rugby', 'ag-u14'), divisions);
    expect([...qualifying, ...others].map(d => d.id)).not.toContain('h14');
  });

  it('offers a placeholder every division, because it qualifies nowhere in particular', () => {
    const { qualifying, others } = divisionsForTeam(null, divisions);
    expect(qualifying.map(d => d.id)).toEqual(['r14', 'r13', 'rAny', 'h14']);
    expect(others).toEqual([]);
  });

  it('does not treat a team with an unset sport as a placeholder', () => {
    // It is offered nothing, where a placeholder is offered everything. A division that names a
    // sport rejects a competitor that names none, so the only division such a team could enter is
    // one with no sport either — and there is none here.
    const { qualifying, others } = divisionsForTeam({ sportId: undefined, ageGroupId: null }, divisions);
    expect([...qualifying, ...others]).toEqual([]);
  });
});
