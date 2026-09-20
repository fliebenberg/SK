import { describe, expect, it } from 'vitest';
import { CandidateTeam } from '../models/event/Tournament';
import { divisionByTeamId, divisionTeamOptions, teamQualifies } from './divisionEntry';

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

describe('a team already entered in another division', () => {
  const teams = [
    team('u14', 'rugby', 'ag-u14'),
    team('u13', 'rugby', 'ag-u13'),
  ];
  const divisionA = { id: 'div-a', ...rugbyU14 };

  it('is listed, not hidden, and says which division holds it', () => {
    const { listed } = divisionTeamOptions(
      teams,
      divisionA,
      new Set(),
      divisionByTeamId([{ divisionId: 'div-b', teamId: 'u14' }])
    );
    expect(listed).toEqual([{ team: teams[0], otherAgeGroup: false, takenByDivisionId: 'div-b' }]);
  });

  it('is not "taken" by the division it is being offered for', () => {
    const { listed } = divisionTeamOptions(
      teams,
      divisionA,
      new Set(['u14']),
      divisionByTeamId([{ divisionId: 'div-a', teamId: 'u14' }])
    );
    expect(listed[0].takenByDivisionId).toBeUndefined();
  });

  it('surfaces an out-of-age-group team from behind the control when another division holds it', () => {
    const { listed, others } = divisionTeamOptions(
      teams,
      divisionA,
      new Set(),
      divisionByTeamId([{ divisionId: 'div-b', teamId: 'u13' }])
    );
    expect(listed.map(o => [o.team.id, o.otherAgeGroup, o.takenByDivisionId])).toEqual([
      ['u14', false, undefined],
      ['u13', true, 'div-b'],
    ]);
    expect(others).toEqual([]);
  });

  it('behaves exactly as before when no roster is passed', () => {
    const { listed, others } = divisionTeamOptions(teams, divisionA, new Set());
    expect(listed).toEqual([{ team: teams[0], otherAgeGroup: false, takenByDivisionId: undefined }]);
    expect(others).toEqual([teams[1]]);
  });
});

describe('divisionByTeamId', () => {
  it('ignores entrants with no team, so a placeholder takes nothing', () => {
    expect(divisionByTeamId([{ divisionId: 'div-a', label: 'TBC' } as any]).size).toBe(0);
  });

  it('keeps the first of a duplicate rather than throwing', () => {
    const map = divisionByTeamId([
      { divisionId: 'div-a', teamId: 't' },
      { divisionId: 'div-b', teamId: 't' },
    ]);
    expect(map.get('t')).toBe('div-a');
  });
});
