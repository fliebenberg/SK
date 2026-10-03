import { Organization } from '@sk/shared';
import { useLiveRoom } from './useLiveRoom';

/**
 * An organisation as its summary room holds it, kept live (`LIVE-12`).
 *
 * Joins `org:{id}:summary` and nothing else: the room's join push *is* the initial load, and every
 * save anywhere republishes the whole organisation as `ORGANIZATION_UPDATED`, so a screen using this
 * never asks for the org and never refetches after a save. A screen that opens while another already
 * holds the room gets the last push replayed (`LIVE-9`), which is what the old duplicate
 * `get_data organization` was covering for.
 *
 * Used by the org Profile, Settings and Nominate admin pages. `LIVE-12` tracks moving the four older
 * screens that still query and subscribe separately onto it.
 */
export function useOrgSummary(orgId?: string | null) {
  const { items, isLoading, accessDenied } = useLiveRoom<Organization>(orgId ? `org:${orgId}:summary` : null, {
    reduce: (message) => {
      if (message.type !== 'ORGANIZATION_UPDATED' || message.data?.id !== orgId) return { kind: 'ignore' };
      // A deleted org is published as `{ id, deleted: true }`: there is no organisation to show.
      if (message.data?.deleted) return { kind: 'replace', items: [] };
      return { kind: 'replace', items: [message.data] };
    },
  });
  return { org: (items[0] as Organization | undefined) ?? null, isLoading, accessDenied };
}
