import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';
import { COLORS, getThemeColor } from '../constants/Colors';
import { EVENT_ROLES, EVENT_ROLE_DESCRIPTIONS, EventRole } from '@sk/shared';

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
  if (!roles.length) return null;

  return (
    <View className="flex-row items-center gap-1.5 flex-wrap">
      {roles.map(role => (
        <View
          key={role}
          className="flex-row items-center gap-1 bg-brand-blue/10 dark:bg-brand-blue/20 border border-brand-blue/30 px-2 py-0.5 rounded-md"
        >
          <Ionicons name={ROLE_ICONS[role]} size={10} color={COLORS.brand.blue} />
          <Text className="font-inter-bold text-[9px] text-brand-blue uppercase tracking-widest">
            {role}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The scope filter over the same vocabulary (U5).
 *
 * **Multi-select, because roles overlap.** A segmented control would force one answer to a question
 * that genuinely has several — you can be hosting a tournament, convening its netball and coaching
 * a team in it at once — and a chip row sits beside the existing `Upcoming / Past` toggle without
 * becoming a second segmented control competing with the first.
 *
 * Nothing selected means no narrowing, which is the state to be in by default: a filter that starts
 * switched on hides things before the user has asked for anything.
 */
export function EventRoleFilter({
  selected,
  onChange,
}: {
  selected: EventRole[];
  onChange: (roles: EventRole[]) => void;
}) {
  const isDark = useActiveTheme() === 'dark';

  const toggle = (role: EventRole) => {
    onChange(selected.includes(role) ? selected.filter(r => r !== role) : [...selected, role]);
  };

  return (
    <View className="flex-row items-center gap-2 flex-wrap">
      {EVENT_ROLES.map(role => {
        const isOn = selected.includes(role);
        return (
          <TouchableOpacity
            key={role}
            onPress={() => toggle(role)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isOn }}
            accessibilityLabel={`${role} — ${EVENT_ROLE_DESCRIPTIONS[role]}`}
            className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl border active:opacity-80 ${
              isOn
                ? 'bg-brand-orange/10 dark:bg-brand-orange/20 border-brand-orange/40'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5'
            }`}
          >
            <Ionicons
              name={isOn ? 'checkmark-circle' : ROLE_ICONS[role]}
              size={13}
              color={isOn ? COLORS.brand.orange : getThemeColor(isDark, 'textSecondary')}
            />
            <Text
              className={`font-inter-bold text-[10px] uppercase tracking-widest ${
                isOn ? 'text-brand-orange' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {role}
            </Text>
          </TouchableOpacity>
        );
      })}
      {selected.length > 0 && (
        <TouchableOpacity onPress={() => onChange([])} className="px-2 py-2 active:opacity-80">
          <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 underline">
            Clear
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
