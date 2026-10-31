import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { themeColor } from '../../constants/Colors';
import { useActiveTheme } from '../../store/settingsStore';

/**
 * "Private", beside a private organisation's name (`ORG-14`). Only its members ever see one, so the
 * tag tells them why nobody else can — wherever the organisation is listed or opened (design rule 14:
 * a list row and the record it opens say the same thing).
 *
 * Two looks for two surfaces: `PrivateOrgTag` on the app's own cards and rows, as a pill beside a
 * role badge; `PrivateOrgChip` on a card painted in the organisation's colours, in that card's ink.
 * The org's page header shows it as one of its facts instead (`OrgProfileBanner`).
 */
export function PrivateOrgTag() {
  const isDark = useActiveTheme() === 'dark';
  return (
    <View className="flex-row items-center gap-1 rounded-full border bg-sunken border-line px-2 py-px flex-shrink-0" accessibilityLabel="Private organisation">
      <Ionicons name="lock-closed" size={10} color={themeColor(isDark, 'ink-soft')} />
      <Text className="font-inter-semibold text-[11px] text-ink-soft">Private</Text>
    </View>
  );
}

/** The same, on a card in the organisation's colours: pass that card's ink. */
export function PrivateOrgChip({ textColor, chipColor, borderColor }: { textColor: string; chipColor: string; borderColor: string }) {
  return (
    <View
      style={{ backgroundColor: chipColor, borderColor }}
      className="flex-row items-center gap-1 border px-2.5 py-0.5 rounded"
      accessibilityLabel="Private organisation"
    >
      <Ionicons name="lock-closed" size={12} color={textColor} />
      <Text style={{ color: textColor }} className="font-orbitron-bold text-[9px] uppercase tracking-widest">
        Private
      </Text>
    </View>
  );
}
