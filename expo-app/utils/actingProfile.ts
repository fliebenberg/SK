import { useAuthStore } from '../store/authStore';

/** What a game says about who is in it — a full `Game` and a `GameSummary` both satisfy it. */
type GameLike = {
  orgId?: string | null;
  participants?: { teamId?: string | null; orgId?: string | null }[];
  officials?: { orgProfileId?: string }[];
} | null | undefined;

/**
 * The caller's own org profile that a scoring entry, a vote or a fixture change at this game is
 * credited to (`PERM-12`). The server accepts any of the caller's own profiles, so the choice is
 * about *which hat*: for someone in several organisations the first membership could be the wrong
 * one, recording a score as made by their other school.
 *
 * In order: the system profile for an app admin; their appointment to the game; their place on one
 * of its teams; their membership of one of its organisations; then any profile they have.
 */
export function actingProfileId(game?: GameLike): string | undefined {
  const { user, orgMemberships = [], teamMemberships = [] } = useAuthStore.getState() as any;
  if (!user) return undefined;
  if (user.globalRole === 'admin') {
    const system = orgMemberships.find((m: any) => m.orgId === 'org-system-admins')?.orgProfileId;
    if (system) return system;
  }
  const mine = new Set<string>([
    ...orgMemberships.map((m: any) => m.orgProfileId),
    ...teamMemberships.map((m: any) => m.orgProfileId),
  ].filter(Boolean));
  const official = game?.officials?.find(o => o.orgProfileId && mine.has(o.orgProfileId))?.orgProfileId;
  if (official) return official;

  const teamIds = new Set((game?.participants || []).map(p => p.teamId).filter(Boolean));
  const onTeam = teamMemberships.find((m: any) => teamIds.has(m.teamId) && m.orgProfileId)?.orgProfileId;
  if (onTeam) return onTeam;

  const orgIds = new Set([game?.orgId, ...(game?.participants || []).map(p => p.orgId)].filter(Boolean));
  const inOrg = orgMemberships.find((m: any) => orgIds.has(m.orgId) && m.orgProfileId)?.orgProfileId;
  return inOrg || orgMemberships[0]?.orgProfileId || undefined;
}
