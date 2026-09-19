/**
 * An age group a sport is played in — "U13", "Open", "Veterans".
 *
 * Each sport has one list, in two parts. **Official** entries are curated by an admin in the sport
 * editor and are offered first, in `sortOrder`. **Custom** entries are the ones users typed in
 * under "Other…" when nothing official fitted; they are shared with everybody who plays the sport,
 * so the second school to need "U13 Girls" picks the first school's rather than typing it again.
 * An admin reviews the custom entries from time to time and either promotes one to official or
 * merges it into the official entry it duplicates.
 *
 * Teams, divisions and leagues reference an entry by id, and the database requires it to belong to
 * their own sport — so two teams are in the same age group exactly when they hold the same id.
 */
export interface AgeGroup {
  id: string;
  sportId: string;
  name: string;
  /** Position in the official list. Custom entries sort by name after every official one. */
  sortOrder: number;
  isOfficial: boolean;
}

/**
 * A custom or official entry as the sport editor sees it: with who added it and how much uses it,
 * which is what deciding between promote, merge and delete turns on.
 */
export interface AgeGroupAdminView extends AgeGroup {
  createdOrgId?: string;
  createdOrgName?: string;
  createdAt?: string;
  teamCount: number;
  divisionCount: number;
  leagueCount: number;
}

/** Official entries first in their curated order, then custom ones alphabetically. */
export function sortAgeGroups<T extends AgeGroup>(groups: T[]): T[] {
  return [...groups].sort((a, b) => {
    if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
    if (a.isOfficial && a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

/** The key two names collide on: "u13 " and "U13" are the same age group. */
export function ageGroupNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}
