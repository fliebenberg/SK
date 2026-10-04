import { Facility, Site } from '@sk/shared';
import { useLiveRoom } from './useLiveRoom';

/**
 * An organisation's sites and their facilities, kept live from `org:{id}:sites` and
 * `org:{id}:facilities` (docs/sites.md).
 *
 * Each room's join push is the initial load, and every add, edit and delete arrives after it, so
 * the Sites list and the site page read from here and neither fetches.
 */
export function useOrgSites(orgId?: string | null) {
  const { items: sites, isLoading: isSitesLoading, accessDenied } = useLiveRoom<Site>(orgId ? `org:${orgId}:sites` : null, {
    reduce: (message) => {
      switch (message.type) {
        case 'SITES_SYNC':
          return { kind: 'replace', items: Array.isArray(message.data) ? message.data : [] };
        case 'SITE_ADDED':
        case 'SITE_UPDATED':
          return message.data?.id ? { kind: 'upsert', item: message.data } : { kind: 'ignore' };
        case 'SITE_DELETED':
          return message.data?.id ? { kind: 'remove', id: message.data.id } : { kind: 'ignore' };
        default:
          return { kind: 'ignore' };
      }
    },
  });
  const { items: facilities, isLoading: isFacilitiesLoading } = useLiveRoom<Facility>(orgId ? `org:${orgId}:facilities` : null, {
    reduce: (message) => {
      switch (message.type) {
        case 'FACILITIES_SYNC':
          return { kind: 'replace', items: Array.isArray(message.data) ? message.data : [] };
        case 'FACILITY_ADDED':
        case 'FACILITY_UPDATED':
          return message.data?.id ? { kind: 'upsert', item: message.data } : { kind: 'ignore' };
        case 'FACILITY_DELETED':
          return message.data?.id ? { kind: 'remove', id: message.data.id } : { kind: 'ignore' };
        default:
          return { kind: 'ignore' };
      }
    },
  });
  return { sites, facilities, isLoading: isSitesLoading || isFacilitiesLoading, accessDenied };
}
