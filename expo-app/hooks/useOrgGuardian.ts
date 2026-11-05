import { OrgGuardianPerson } from '@sk/shared';
import { useStaticRead } from './useStaticRead';

/**
 * A guardian's page, by their org profile as they may hold no membership (`PEOPLE-9`), for Admin and
 * Staff. People are a static list (okf/live_rooms.md), so there is no room. `guardian` being `null`
 * only means they are not one here when `error` is empty (`SYNC-9`); the page draws `error`.
 */
export function useOrgGuardian(orgId?: string | null, profileId?: string | null) {
  const { data, isLoading, error, retry } = useStaticRead<OrgGuardianPerson>('org_guardian', orgId && profileId ? { orgId, profileId } : null, { suppressToast: true });
  return { guardian: data?.id ? data : null, isLoading, error, retry };
}
