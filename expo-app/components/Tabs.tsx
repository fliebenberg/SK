import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';
import { COLORS, getThemeColor } from '../constants/Colors';

export interface TabItem<T extends string = string> {
  key: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  badge?: string | number;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  items: Array<TabItem<T>>;
  activeKey: T;
  onChange: (key: T) => void;
  variant?: 'underline' | 'pill';
  scrollable?: boolean;
  className?: string;
}

export function Tabs<T extends string = string>({
  items,
  activeKey,
  onChange,
  variant = 'underline',
  scrollable = false,
  className = '',
}: TabsProps<T>) {
  const isDark = useActiveTheme() === 'dark';

  const renderContent = () => (
    <View
      className={`flex-row items-center border-b border-slate-200 dark:border-white/10 ${
        variant === 'pill' ? 'border-b-0 gap-2' : ''
      } ${className}`}
    >
      {items.map((tab) => {
        const isActive = tab.key === activeKey;

        if (variant === 'pill') {
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => onChange(tab.key)}
              disabled={isActive || tab.disabled}
              className={`px-4 py-2 rounded-xl flex-row items-center gap-2 min-h-[44px] active:opacity-80 ${
                isActive
                  ? 'bg-brand-orange/10 dark:bg-brand-orange/20 border border-brand-orange/40'
                  : 'bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-white/5'
              } ${tab.disabled ? 'opacity-40' : ''}`}
            >
              {tab.icon && (
                <Ionicons
                  name={tab.icon}
                  size={16}
                  color={isActive ? COLORS.brand.orange : getThemeColor(isDark, 'textSecondary')}
                />
              )}
              <Text
                className={`font-inter-bold text-xs ${
                  isActive ? 'text-brand-orange' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {tab.label}
              </Text>
              {tab.badge !== undefined && (
                <View className={`px-1.5 py-0.5 rounded-full ${isActive ? 'bg-brand-orange' : 'bg-slate-300 dark:bg-slate-700'}`}>
                  <Text className={`text-[10px] font-inter-bold ${isActive ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                    {tab.badge}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }

        // Default 'underline' variant
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onChange(tab.key)}
            disabled={isActive || tab.disabled}
            className={`flex-1 py-3 px-2 flex-row items-center justify-center gap-2 relative min-h-[44px] active:opacity-80 ${
              tab.disabled ? 'opacity-40' : ''
            }`}
          >
            {tab.icon && (
              <Ionicons
                name={tab.icon}
                size={16}
                color={isActive ? COLORS.brand.orange : getThemeColor(isDark, 'textSecondary')}
              />
            )}
            <Text
              className={`font-inter-bold text-xs text-center ${
                isActive ? 'text-brand-orange' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {tab.label}
            </Text>
            {tab.badge !== undefined && (
              <View className={`px-1.5 py-0.5 rounded-full ${isActive ? 'bg-brand-orange/20' : 'bg-slate-200 dark:bg-slate-800'}`}>
                <Text className={`text-[10px] font-inter-bold ${isActive ? 'text-brand-orange' : 'text-slate-600 dark:text-slate-400'}`}>
                  {tab.badge}
                </Text>
              </View>
            )}
            {/* Active bottom underline indicator */}
            {isActive && (
              <View className="absolute bottom-0 left-2 right-2 h-0.5 bg-brand-orange rounded-full" />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {renderContent()}
      </ScrollView>
    );
  }

  return renderContent();
}
