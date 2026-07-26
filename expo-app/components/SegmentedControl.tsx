import React from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';
import { COLORS, getThemeColor } from '../constants/Colors';

export interface SegmentedControlOption<T extends string = string> {
  key: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconActive?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  options: Array<SegmentedControlOption<T>>;
  value: T;
  onChange: (key: T) => void;
  isCompact?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  isCompact: explicitIsCompact,
  className = '',
}: SegmentedControlProps<T>) {
  const { width } = useWindowDimensions();
  const isDark = useActiveTheme() === 'dark';
  const isCompact = explicitIsCompact ?? width < 640;

  return (
    <View className={`flex-row items-center bg-slate-100 dark:bg-slate-900/90 p-1 rounded-xl border border-slate-200/80 dark:border-white/10 ${className}`}>
      {options.map((item) => {
        const isActive = item.key === value;
        const iconName = (isActive && item.iconActive) ? item.iconActive : item.icon;

        if (isCompact && item.icon) {
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => onChange(item.key)}
              disabled={isActive || item.disabled}
              className={`w-8 h-8 rounded-lg items-center justify-center active:opacity-80 transition-all ${
                isActive
                  ? 'bg-white dark:bg-slate-800 border border-brand-orange/30 shadow-xs'
                  : 'bg-transparent border border-transparent'
              } ${item.disabled ? 'opacity-40' : ''}`}
            >
              <Ionicons
                name={iconName}
                size={14}
                color={isActive ? COLORS.brand.orange : getThemeColor(isDark, 'textSecondary')}
              />
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity
            key={item.key}
            onPress={() => onChange(item.key)}
            disabled={isActive || item.disabled}
            className={`flex-1 px-3 py-2 rounded-lg flex-row items-center justify-center gap-1.5 active:opacity-85 transition-all ${
              isActive
                ? 'bg-white dark:bg-slate-800 border border-brand-orange/30 shadow-xs'
                : 'bg-transparent border border-transparent'
            } ${item.disabled ? 'opacity-40' : ''}`}
          >
            {iconName && (
              <Ionicons
                name={iconName}
                size={14}
                color={isActive ? COLORS.brand.orange : getThemeColor(isDark, 'textSecondary')}
              />
            )}
            <Text
              className={`font-inter-bold text-xs ${
                isActive ? 'text-brand-orange' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
