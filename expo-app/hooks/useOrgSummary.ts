import { Organization } from '@sk/shared';
import { useLiveRoom } from './useLiveRoom';

/**
 * An organisation as its summary room holds it, kept live.
 *
 * Joins `org:{id}:summary` and nothing else: the room's join push *is* the initial load, and every
 * save anywhere republishes the whole organisation as `ORGANIZATION_UPDATED`, so a screen using this
 * never asks for the org and never refetches after a save. A screen that opens while another already
 * holds the room gets the last push replayed (`LIVE-9`), which is what the old duplicate
 * `get_data organization` was covering for (`LIVE-12`).
 *
 * Pass `null` to hold no room.
 */
export function useOrgSummary(orgId?: string | null) {
  const { items, isLoading, accessDenied } = useLiveRoom<Organization>(orgId ? `org:${orgId}:summary` : null, {
    reduce: (message) => {
      // The room answers a join for an org that does not exist with this instead of the org.
      if (message.type === 'ENTITY_NOT_FOUND' && message.data?.id === orgId) return { kind: 'replace', items: [] };
      if (message.type !== 'ORGANIZATION_UPDATED' || message.data?.id !== orgId) return { kind: 'ignore' };
      // A deleted org is published as `{ id, deleted: true }`: there is no organisation to show.
      if (message.data?.deleted) return { kind: 'replace', items: [] };
      return { kind: 'replace', items: [message.data] };
    },
  });
  // The room's state outlives an id change until the new room's push lands; never show the
  // previous organisation under the new one's id.
  const held = items[0] as Organization | undefined;
  return { org: orgId && held?.id === orgId ? held : null, isLoading, accessDenied };
}
