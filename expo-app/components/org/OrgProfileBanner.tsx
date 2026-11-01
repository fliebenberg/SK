import React from 'react';
import { Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Organization, orgColors } from '@sk/shared';
import { OrgBrandedCard } from '../OrgBrandedCard';
import { OrgLogo } from '../OrgLogo';
import { inkOnBrand } from '../../utils/colorUtils';

import { addressLocality } from '../../services/places';
import { orgTypeIcon, orgTypeLabel } from './orgTypes';
import { themeColor } from '../../constants/Colors';
import { useActiveTheme } from '../../store/settingsStore';

/**
 * The top of the org Profile page: the organisation as everyone else sees it (docs/org-profile.md §2).
 *
 * The look of the list cards (`OrgBrandedCard`): the logo on the slanted bands, and everything else
 * beside it. The name, with the short code under it — it is the name's short form, not a badge. Type
 * and location sit in a footer row, each with its own icon, so they read as separate facts, and Edit
 * ends that row.
 */
export function OrgProfileBanner({ org, onEdit, onEditLogo, action, aside }: {
  org: Organization;
  onEdit?: () => void;
  onEditLogo?: () => void;
  /** At the end of the footer row instead of Edit: the public page's way into the workspace (`UI-34`). */
  action?: { label: string; onPress: () => void };
  /** Also at the end of the footer row, before `action`: joining it, on a wide screen (`MEMBER-1`). */
  aside?: React.ReactNode;
}) {
  const isDark = useActiveTheme() === 'dark';
  const { width } = useWindowDimensions();
  const isNarrow = width < 768;
  const { primary, secondary, tertiary } = orgColors(org);
  const ink = inkOnBrand(primary);
  const location = addressLocality(org.address, !isNarrow);
  const type = orgTypeLabel(org.type, org.customType);
  const logoSize = isNarrow ? 52 : 64;

  const crest = <OrgLogo logo={org.logo} size={logoSize} className="border bg-logo-plate" style={{ borderColor: ink.border }} />;

  return (
    <OrgBrandedCard
      primaryColor={primary}
      secondaryColor={secondary}
      tertiaryColor={tertiary}
      markSize={logoSize}
      mark={onEditLogo ? (
        <TouchableOpacity onPress={onEditLogo} accessibilityRole="button" accessibilityLabel="Change the logo" activeOpacity={0.85}>
          {crest}
          <View className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full bg-primary border-2 border-card items-center justify-center">
            <Ionicons name="pencil" size={9} color={themeColor(isDark, 'on-primary')} />
          </View>
        </TouchableOpacity>
      ) : crest}
    >
      <Text className={`font-orbitron-bold uppercase tracking-wide ${isNarrow ? 'text-base' : 'text-xl'} leading-tight`} style={{ color: ink.text }}>
        {org.name}
      </Text>
      {org.shortName ? (
        <Text className={`font-inter-semibold ${isNarrow ? 'text-sm' : 'text-base'} mt-0.5`} style={{ color: ink.subtext }}>
          {org.shortName}
        </Text>
      ) : null}

      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5">
        {type ? <Fact icon={orgTypeIcon(org.type)} text={type} color={ink.text} /> : null}
        {location ? <Fact icon="location-outline" text={location} color={ink.text} /> : null}
        {/* Only its members ever see a private org, so this tells them why nobody else can (`ORG-14`). */}
        {org.isPrivate ? <Fact icon="lock-closed-outline" text="Private" color={ink.text} /> : null}
        {aside ? <View className="ml-auto">{aside}</View> : null}
        {onEdit ? (
          <TouchableOpacity
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel="Edit the name, short code, type and colours"
            style={{ backgroundColor: ink.chip, borderColor: ink.border }}
            className="ml-auto flex-row items-center gap-1.5 rounded-full px-3 py-1 border"
          >
            <Ionicons name="pencil" size={12} color={ink.text} />
            <Text className="font-inter-semibold text-sm" style={{ color: ink.text }}>Edit</Text>
          </TouchableOpacity>
        ) : action ? (
          <TouchableOpacity
            onPress={action.onPress}
            accessibilityRole="link"
            style={{ backgroundColor: ink.chip, borderColor: ink.border }}
            className={`${aside ? '' : 'ml-auto '}flex-row items-center gap-1.5 rounded-full px-3 py-1 border`}
          >
            <Text className="font-inter-semibold text-sm" style={{ color: ink.text }}>{action.label} ›</Text>
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
