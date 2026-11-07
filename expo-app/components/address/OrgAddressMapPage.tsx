import React from 'react';
import { MapPage } from './MapPage';
import { useOrgSummary } from '../../hooks/useOrgSummary';

/**
 * An org's address on a full map, opened from the map preview on its workspace Profile
 * (`/admin/[orgId]/address`) or its public page (`/organizations/[orgId]/map`) — docs/org-profile.md §3.
 */
export function OrgAddressMapPage({ orgId, backLabel, onBack }: { orgId: string; backLabel: string; onBack: () => void }) {
  // rooms-ok: MapPage has no place for it; in the workspace the layout's RoomFailure says it, on the public page RoomFailureNotice does
  const { org, isLoading, notFound } = useOrgSummary(orgId);
  return (
    <MapPage
      backLabel={backLabel}
      onBack={onBack}
      isLoading={isLoading}
      emptyText={notFound ? 'This organisation was not found.' : org?.address ? null : 'This organisation has no address yet.'}
      name={org?.name || ''}
      address={org?.address || null}
    />
  );
}
