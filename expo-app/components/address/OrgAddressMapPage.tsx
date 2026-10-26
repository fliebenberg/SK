import React from 'react';
import { MapPage } from './MapPage';
import { useOrgSummary } from '../../hooks/useOrgSummary';

/**
 * An org's address on a full map, opened from the map preview on its workspace Profile
 * (`/admin/[orgId]/address`) or its public page (`/organizations/[orgId]/map`) — docs/org-profile.md §3.
 */
export function OrgAddressMapPage({ orgId, backLabel, onBack }: { orgId: string; backLabel: string; onBack: () => void }) {
  const { org, isLoading } = useOrgSummary(orgId);
  return (
    <MapPage
      backLabel={backLabel}
      onBack={onBack}
      isLoading={isLoading}
      emptyText={org?.address ? null : 'This organisation has no address yet.'}
      name={org?.name || ''}
      address={org?.address || null}
    />
  );
}
