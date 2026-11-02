import React from 'react';
import { Text, View } from 'react-native';
import { orgColors } from '@sk/shared';
import { OrgBrandedCard } from '../OrgBrandedCard';
import { OrgLogo } from '../OrgLogo';
import { inkOnBrand } from '../../utils/colorUtils';

interface WorkspaceTileProps {
  org?: {
    name?: string;
    shortName?: string | null;
    logo?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    tertiaryColor?: string | null;
  } | null;
  markSize: number;
}

/**
 * Which organisation's workspace this is, in the side rail and the phone's workspace menu: a small
 * banner, with the bands of the one on the page beside it (docs/design_spec.md §5.4).
 */
export function WorkspaceTile({ org, markSize }: WorkspaceTileProps) {
  const ink = inkOnBrand(orgColors(org).primary);

  return (
    <OrgBrandedCard
      primaryColor={org?.primaryColor}
      secondaryColor={org?.secondaryColor}
      tertiaryColor={org?.tertiaryColor}
      markSize={markSize}
      style={{ padding: 10 }}
      mark={<OrgLogo logo={org?.logo ?? undefined} size={markSize} className="border" primaryColor={ink.text} style={{ borderColor: ink.border }} />}
    >
      <View className="justify-center" style={{ minHeight: markSize }}>
        <Text numberOfLines={1} className="font-orbitron-bold text-sm uppercase leading-tight" style={{ color: ink.text }}>
          {org?.shortName || org?.name?.substring(0, 3) || 'ORG'}
        </Text>
      </View>
    </OrgBrandedCard>
  );
}
