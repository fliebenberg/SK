import { OrgPerson } from '@sk/shared';
import { useStaticRead } from './useStaticRead';

/**
 * One person on an organisation's books, with their guardians, for Admin and Staff. People are a
 * static list (okf/live_rooms.md), so there is no room.
 */
export function useOrgPerson(orgId?: string | null, membershipId?: string | null) {
  const { data, isLoading } = useStaticRead<OrgPerson>('org_person', orgId && membershipId ? { orgId, membershipId } : null);
  return { person: data?.id ? data : null, isLoading };
}
