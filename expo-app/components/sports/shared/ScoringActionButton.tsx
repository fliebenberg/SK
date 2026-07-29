import React from 'react';
import { View, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { useSettingsStore } from '../../../store/settingsStore';
import { COLORS } from '../../../constants/Colors';

interface ScoringActionButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  variant?: 'primary' | 'success' | 'danger' | 'warning' | 'muted' | 'ghost' | 'scrim' | 'purple' | 'blue' | 'red' | 'none';
  selected?: boolean;
  description?: string;
  mobileLabel?: string;
}

export function ScoringActionButton({
  label,
  onClick,
  disabled,
  className = '',
  variant = 'primary',
  selected = false,
  mobileLabel,
}: ScoringActionButtonProps) {
  const hapticsEnabled = useSettingsStore((state) => state.getEffectivePreference('hapticFeedbackEnabled'));

  const handlePress = () => {
    if (disabled) return;
    if (hapticsEnabled) {
      try {
        const Haptics = require('expo-haptics');
        if (Haptics && Haptics.impactAsync) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle?.Medium || 'medium');
        }
      } catch (e) {
        // Haptics might fail on web/unsupported envs
      }
    }
    onClick();
  };

  const textLabel = mobileLabel || label;

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.7}
      className={`h-11 w-full flex-col items-center justify-center rounded-xl px-1 py-0.5 border active:scale-95 ${
        disabled ? 'opacity-30' : ''
      } ${
        variant === 'danger'
          ? 'bg-red-500/10 border-red-500/30'
          : variant === 'warning'
          ? 'bg-amber-500/10 border-amber-500/30'
          : variant === 'success'
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : variant === 'blue'
          ? 'bg-blue-500/15 border-blue-500/40 dark:bg-blue-500/20 dark:border-blue-500/40'
          : variant === 'red'
          ? 'bg-rose-500/15 border-rose-500/40 dark:bg-rose-500/20 dark:border-rose-500/40'
          : 'bg-brand-orange/10 border-brand-orange/30'
      } ${className}`}
    >
      <Text
        adjustsFontSizeToFit={true}
        minimumFontScale={0.65}
        numberOfLines={2}
        className={`font-orbitron-bold text-[10px] sm:text-[11px] leading-tight uppercase tracking-tight text-center ${
          variant === 'danger'
            ? 'text-red-500'
            : variant === 'warning'
            ? 'text-amber-500'
            : variant === 'success'
            ? 'text-emerald-500'
            : variant === 'blue'
            ? 'text-blue-600 dark:text-blue-400'
            : variant === 'red'
            ? 'text-rose-600 dark:text-rose-400'
            : 'text-brand-orange'
        }`}
      >
        {textLabel}
      </Text>
    </TouchableOpacity>
  );
}

export function RosterGrid({
  roster,
  onSelect,
  selectedPlayerId,
  className = '',
}: {
  roster: any[];
  onSelect: (playerId: string) => void;
  selectedPlayerId?: string;
  className?: string;
}) {
  if (!roster || roster.length === 0) {
    return (
      <View className="py-6 items-center justify-center border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
        <Text className="font-inter-bold text-xs text-slate-400 uppercase tracking-wider">
          No players registered for this team
        </Text>
      </View>
    );
  }

  return (
    <View className={`flex-row flex-wrap gap-2 ${className}`}>
      {roster.map((item) => {
        const isSelected = selectedPlayerId === item.orgProfileId;
        const playerName = item.name || item.orgProfileName || item.position || 'Player';
        return (
          <TouchableOpacity
            key={item.orgProfileId || item.id}
            onPress={() => onSelect(item.orgProfileId)}
            className={`px-3 py-2 rounded-xl border flex-row items-center gap-2 ${
              isSelected
                ? 'bg-brand-orange border-brand-orange'
                : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'
            }`}
          >
            <Text className={`font-orbitron-bold text-xs ${isSelected ? 'text-white' : 'text-brand-orange'}`}>
              #{item.position || '?'}
            </Text>
            <Text
              className={`font-inter-bold text-xs ${
                isSelected ? 'text-white' : 'text-slate-800 dark:text-white'
              }`}
            >
              {playerName}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
