/**
 * The official age-group list every sport starts with. An admin edits it per sport in the sport
 * editor; this is only a starting point, shared by the seed, `init-db` and the migration that
 * introduced the table.
 */
export const STARTER_AGE_GROUPS = [
  'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'U19', 'Open',
];

/** Stable ids for starter entries, so seeds can point a team at "rugby's U19" by name. */
export function starterAgeGroupId(sportId: string, name: string): string {
  return `${sportId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}
