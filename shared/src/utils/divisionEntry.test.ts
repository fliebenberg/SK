import { describe, expect, it } from 'vitest';
import { CandidateTeam } from '../models/event/Tournament';
import { divisionTeamOptions, teamQualifies } from './divisionEntry';

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

describe('the age-group override', () => {
  const teams = [
    team('u14', 'rugby', 'ag-u14'),
    team('u13', 'rugby', 'ag-u13'),
    team('u15', 'rugby', 'ag-u15'),
    team('hockey', 'hockey', 'ag-hockey-u14'),
  ];

  it('lists the qualifying teams, and keeps the other age groups of the sport behind the control', () => {
    const { listed, others } = divisionTeamOptions(teams, rugbyU14, new Set());
    expect(listed.map(o => o.team.id)).toEqual(['u14']);
    expect(others.map(t => t.id)).toEqual(['u13', 'u15']);
  });

  it('keeps an other-age-group team in the list once it is entered, marked as an override', () => {
    const { listed, others } = divisionTeamOptions(teams, rugbyU14, new Set(['u13']));
    expect(listed).toEqual([
      { team: teams[0], otherAgeGroup: false },
      { team: teams[1], otherAgeGroup: true },
    ]);
    expect(others.map(t => t.id)).toEqual(['u15']);
  });

  it('never offers a team of another sport, entered or not', () => {
    const { listed, others } = divisionTeamOptions(teams, rugbyU14, new Set(['hockey']));
    expect([...listed.map(o => o.team.id), ...others.map(t => t.id)]).not.toContain('hockey');
  });

  it('has nothing to override when the division names no age group', () => {
    const { listed, others } = divisionTeamOptions(teams, { sportId: 'rugby' }, new Set());
    expect(listed.map(o => o.team.id)).toEqual(['u14', 'u13', 'u15']);
    expect(others).toEqual([]);
  });
});
