import { OrgMinorsSettings, minorsSettingsOf } from '@sk/shared';
import { useOrgSummary } from './useOrgSummary';

/**
 * An organisation's minors settings (`MEMBER-3`), with every gap filled by its default — off, and a
 * minor age of 18 — from the public `org:{id}:summary` room, which carries `settings` and is
 * republished when they change.
 */
export function useOrgMinorsSettings(orgId?: string | null): { settings: OrgMinorsSettings; isLoading: boolean } {
  const { org, isLoading } = useOrgSummary(orgId);
  return { settings: minorsSettingsOf(org?.settings), isLoading };
}
