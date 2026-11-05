import { OrgPerson } from '@sk/shared';
import { useStaticRead } from './useStaticRead';

/**
 * One person on an organisation's books, with their guardians, for Admin and Staff. People are a
 * static list (okf/live_rooms.md), so there is no room. `person` being `null` only means they are not
 * on the books when `error` is empty (`SYNC-9`); the page draws `error`.
 */
export function useOrgPerson(orgId?: string | null, membershipId?: string | null) {
  const { data, isLoading, error, retry } = useStaticRead<OrgPerson>('org_person', orgId && membershipId ? { orgId, membershipId } : null, { suppressToast: true });
  return { person: data?.id ? data : null, isLoading, error, retry };
}
