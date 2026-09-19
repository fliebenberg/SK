export interface Team {
  id: string;
  name: string;
  /** The team's age group — an entry in its sport's list (see `AgeGroup`). What is written. */
  ageGroupId?: string | null;
  /** The age group's name, joined in on read for display. Ignored on write. */
  ageGroup?: string;
  sportId: string;
  orgId: string;
  isActive?: boolean;
  playerCount?: number;
  staffCount?: number;
  creatorId?: string;
  shortName?: string;
}
