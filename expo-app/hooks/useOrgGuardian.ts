import { OrgGuardianPerson } from '@sk/shared';
import { useStaticRead } from './useStaticRead';

/**
 * A guardian's page, by their org profile as they may hold no membership (`PEOPLE-9`), for Admin and
 * Staff. People are a static list (okf/live_rooms.md), so there is no room.
 */
export function useOrgGuardian(orgId?: string | null, profileId?: string | null) {
  const { data, isLoading } = useStaticRead<OrgGuardianPerson>('org_guardian', orgId && profileId ? { orgId, profileId } : null);
  return { guardian: data?.id ? data : null, isLoading };
}
