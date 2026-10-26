import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { OrgAddressMapPage } from '../../../components/address/OrgAddressMapPage';
import { useSafeBack } from '../../../hooks/useSafeBack';

/** The org's address on a map, opened from the map on its Profile (docs/org-profile.md §3). */
export default function OrgAddressMap() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const safeBack = useSafeBack();
  return <OrgAddressMapPage orgId={orgId} backLabel="Profile" onBack={() => safeBack(`/admin/${orgId}/profile`)} />;
}
