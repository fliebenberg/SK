import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { OrgAddressMapPage } from '../../../../components/address/OrgAddressMapPage';
import { useSafeBack } from '../../../../hooks/useSafeBack';

/**
 * The org's address on a full map, as anyone sees it — opened from the map on its public page
 * (docs/org-profile.md §3). Public like the page: it reads only the org's summary room.
 */
export default function PublicOrgAddressMap() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const safeBack = useSafeBack();
  return <OrgAddressMapPage orgId={orgId} backLabel="Organisation" onBack={() => safeBack(`/(tabs)/organizations/${orgId}`)} />;
}
