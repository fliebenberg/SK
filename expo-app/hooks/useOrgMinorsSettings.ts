import { Organization, OrgMinorsSettings, minorsSettingsOf } from '@sk/shared';
import { useLiveRoom } from './useLiveRoom';

/**
 * An organisation's minors settings (`MEMBER-3`), with every gap filled by its default — off, and a
 * minor age of 18 — from the public `org:{id}:summary` room, which carries `settings` and is
 * republished when they change.
 */
export function useOrgMinorsSettings(orgId?: string | null): { settings: OrgMinorsSettings; isLoading: boolean } {
  const { items, isLoading } = useLiveRoom<Organization>(orgId ? `org:${orgId}:summary` : null, {
    reduce: (message) =>
      message.type === 'ORGANIZATION_UPDATED' && message.data?.id === orgId
        ? { kind: 'replace', items: [message.data] }
        : { kind: 'ignore' },
  });
  return { settings: minorsSettingsOf(items[0]?.settings), isLoading };
}
