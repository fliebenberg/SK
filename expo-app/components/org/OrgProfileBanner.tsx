import React from 'react';
import { Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Organization, orgColors } from '@sk/shared';
import { OrgBrandedCard } from '../OrgBrandedCard';
import { OrgLogo } from '../OrgLogo';
import { getContrastColor } from '../../utils/colorUtils';
import { COLORS } from '../../constants/Colors';
import { addressLocality } from '../../services/places';
import { orgTypeIcon, orgTypeLabel } from './orgTypes';

/**
 * The top of the org Profile page: the organisation as everyone else sees it (docs/org-profile.md §2).
 *
 * Logo, then the name with the short code directly under it in the same font — it is the name's
 * short form, not a badge. Type and location sit in a footer row, each with its own icon, so they
 * read as separate facts, and Edit ends that row so the name gets the whole top row on a phone.
 * Padding is kept tight: the banner already sits in the page's margin.
 */
export function OrgProfileBanner({ org, onEdit, onEditLogo }: { org: Organization; onEdit?: () => void; onEditLogo?: () => void }) {
  const { width } = useWindowDimensions();
  const isNarrow = width < 768;
  const { primary, secondary } = orgColors(org);
  const ink = getContrastColor(primary);
  const location = addressLocality(org.address, !isNarrow);
  const type = orgTypeLabel(org.type, org.customType);
  const logoSize = isNarrow ? 52 : 64;

  const crest = (
    <View
      className="items-center justify-center rounded-2xl overflow-hidden border bg-white/15 border-white/25"
      style={{ width: logoSize, height: logoSize }}
    >
      {org.logo ? (
        <OrgLogo logo={org.logo} settings={org.settings} size={logoSize} />
      ) : (
        <Ionicons name="business" size={logoSize * 0.45} color={ink} />
      )}
    </View>
  );

  return (
    <OrgBrandedCard primaryColor={primary} secondaryColor={secondary} className="p-3 gap-2.5">
      <View className="flex-row items-center gap-3">
        {onEditLogo ? (
          <TouchableOpacity onPress={onEditLogo} accessibilityRole="button" accessibilityLabel="Change the logo" activeOpacity={0.85}>
            {crest}
            <View className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full bg-brand-orange border-2 border-white items-center justify-center">
              <Ionicons name="pencil" size={9} color="white" />
            </View>
          </TouchableOpacity>
        ) : crest}
        <View className="flex-1 min-w-0">
          <Text className={`font-inter-bold ${isNarrow ? 'text-lg' : 'text-2xl'} leading-tight`} style={{ color: ink }}>
            {org.name}
          </Text>
          {org.shortName ? (
            <Text className={`font-inter-semibold ${isNarrow ? 'text-sm' : 'text-base'} mt-0.5`} style={{ color: ink, opacity: 0.85 }}>
              {org.shortName}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1.5">
        {type ? <Fact icon={orgTypeIcon(org.type)} text={type} color={ink} /> : null}
        {location ? <Fact icon="location-outline" text={location} color={ink} /> : null}
        {onEdit ? (
          <TouchableOpacity
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel="Edit the name, short code, type and colours"
            className="ml-auto flex-row items-center gap-1.5 rounded-full px-3 py-1 border bg-black/20 border-white/30"
          >
            <Ionicons name="pencil" size={12} color="white" />
            <Text className="font-inter-semibold text-sm text-white">Edit</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </OrgBrandedCard>
  );
}

function Fact({ icon, text, color }: { icon: keyof typeof Ionicons.glyphMap; text: string; color: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Ionicons name={icon} size={14} color={color} />
      <Text className="font-inter text-sm" style={{ color }}>{text}</Text>
    </View>
  );
}
