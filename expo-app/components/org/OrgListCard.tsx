import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { OrgDirectoryEntry, orgColors } from '@sk/shared';
import { BrandedListCard } from '../BrandedListCard';
import { OrgLogo } from '../OrgLogo';
import { orgTypeIcon, orgTypeLabel } from './orgTypes';
import { useAuthStore } from '../../store/authStore';
import { inkOnBrand } from '../../utils/colorUtils';
import { formatDistance } from '../../utils/distance';
import { orgAccess } from '../../utils/orgAccess';

interface OrgListCardProps {
  org: Pick<OrgDirectoryEntry, 'id' | 'name' | 'logo' | 'primaryColor' | 'secondaryColor' | 'tertiaryColor' | 'type' | 'customType'>
    & { isPrivate?: boolean; isActive?: boolean };
  /** Where it is: the town, or on Home the suburb. */
  place?: string | null;
  /** How far from the viewer, on a list that knows: after its type. */
  km?: number | null;
  testID?: string;
}

/**
 * An organisation's card, wherever organisations are browsed (docs/design_spec.md §5.4). It opens the
 * workspace for those who run the organisation, and otherwise its public page, which offers a team
 * duty its part of the workspace.
 */
export function OrgListCard({ org, place, km = null, testID }: OrgListCardProps) {
  const router = useRouter();
  const { user, orgMemberships, teamMemberships } = useAuthStore();
  const access = orgAccess(org.id, user?.globalRole === 'admin', orgMemberships, teamMemberships);

  const ink = inkOnBrand(orgColors(org).primary);
  const type = orgTypeLabel(org.type, org.customType);
  const distance = km === null ? null : formatDistance(km);

  const flags: string[] = [];
  if (org.isPrivate) flags.push('Private');
  if (org.isActive === false) flags.push('Inactive');
  // Only a role they hold there: a system admin reads as Admin everywhere, which tells them nothing.
  if (access.membership && access.role) flags.push(access.role);

  return (
    <BrandedListCard
      testID={testID}
      primaryColor={org.primaryColor}
      secondaryColor={org.secondaryColor}
      tertiaryColor={org.tertiaryColor}
      title={org.name}
      subtitle={place}
      flags={flags}
      accessibilityLabel={[org.name, place, type, distance, ...flags].filter(Boolean).join(', ')}
      onPress={() => router.push((access.canManage ? `/admin/${org.id}` : `/organizations/${org.id}`) as any)}
      mark={<OrgLogo logo={org.logo ?? undefined} size={44} className="border" style={{ borderColor: ink.border }} />}
      detail={type || distance ? (
        <View className="flex-row items-center gap-2.5">
          {type ? (
            <View className="flex-row items-center gap-1">
              <Ionicons name={orgTypeIcon(org.type)} size={14} color={ink.text} />
              <Text numberOfLines={1} style={{ color: ink.text }} className="font-inter-semibold text-xs leading-4">{type}</Text>
            </View>
          ) : null}
          {distance ? (
            <View className="flex-row items-center gap-0.5">
              <Ionicons name="location-outline" size={13} color={ink.text} />
              <Text numberOfLines={1} style={{ color: ink.text }} className="font-inter-semibold text-xs leading-4">{distance}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    />
  );
}
