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
  /** The head coach's name — the longest-serving current Coach — joined in on read. Ignored on write. */
  coachName?: string | null;
  creatorId?: string;
  /** `null` on an update clears it. */
  shortName?: string | null;
}

/**
 * One team on the public Teams list (`get_data` `team_directory`, `UI-33`): what tells it from the
 * others, its organisation's name, logo and colours, and how the viewer is connected to it.
 */
export interface TeamDirectoryEntry {
  id: string;
  name: string;
  shortName?: string | null;
  ageGroup?: string | null;
  sportId: string;
  sportName?: string | null;
  isActive: boolean;
  orgId: string;
  orgName: string;
  orgLogo?: string | null;
  orgPrimaryColor?: string | null;
  orgSecondaryColor?: string | null;
  orgIsPrivate: boolean;
  /** The viewer's own role on the team, the most senior if they hold several. */
  myRoleId?: string | null;
  /** Children the viewer is a guardian of who are on the team. */
  childNames: string[];
}
