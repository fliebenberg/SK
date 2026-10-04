import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';
import { EventRole } from '@sk/shared';
import { themeColor } from '../constants/Colors';

/**
 * A viewer's roles in one event, shown as a set (U4).
 *
 * Every role they hold, not the most senior one: a host who also coaches a team needs to see both,
 * because they will use the screen for both.
 */

const ROLE_ICONS: Record<EventRole, keyof typeof Ionicons.glyphMap> = {
  Hosting: 'ribbon-outline',
  Convening: 'clipboard-outline',
  Attending: 'people-outline',
};

export function EventRoleChips({ roles }: { roles: EventRole[] }) {
  const isDark = useActiveTheme() === 'dark';
  if (!roles.length) return null;

  return (
    <View className="flex-row items-center gap-1.5 flex-wrap">
      {roles.map(role => (
        <View
          key={role}
          className="flex-row items-center gap-1 bg-accent-soft border border-accent-line px-2 py-0.5 rounded-md"
        >
          <Ionicons name={ROLE_ICONS[role]} size={10} color={themeColor(isDark, 'accent-ink')} />
          <Text className="font-inter-bold text-[9px] text-accent-ink uppercase tracking-widest">
            {role}
          </Text>
        </View>
      ))}
    </View>
  );
}
