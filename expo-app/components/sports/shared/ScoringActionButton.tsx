import React from 'react';
import { View, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { useSettingsStore } from '../../../store/settingsStore';


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
      className={`h-9 w-full flex-col items-center justify-center rounded-xl px-1 py-0.5 border active:scale-95 ${
        disabled ? 'opacity-30' : ''
      } ${
        variant === 'danger'
          ? 'bg-danger-soft border-danger-line'
          : variant === 'warning'
          ? 'bg-warning-soft border-warning-line'
          : variant === 'success'
          ? 'bg-success-soft border-success-line'
          : variant === 'blue'
          ? 'bg-info-soft border-info-line'
          : variant === 'red'
          ? 'bg-danger-soft border-danger-line'
          : 'bg-primary-soft border-primary-line'
      } ${className}`}
    >
      <Text
        adjustsFontSizeToFit={true}
        minimumFontScale={0.65}
        numberOfLines={2}
        className={`font-orbitron-bold text-[9px] sm:text-[10px] leading-tight uppercase tracking-tight text-center ${
          variant === 'danger'
            ? 'text-danger-ink'
            : variant === 'warning'
            ? 'text-warning-ink'
            : variant === 'success'
            ? 'text-success-ink'
            : variant === 'blue'
            ? 'text-info-ink'
            : variant === 'red'
            ? 'text-danger-ink'
            : 'text-primary-ink'
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
      <View className="py-6 items-center justify-center border border-dashed border-line rounded-xl">
        <Text className="font-inter-bold text-xs text-ink-muted uppercase tracking-wider">
          No players registered for this team
        </Text>
      </View>
    );
  }

  // Sort roster in position order (numeric 1..N first, then non-numeric/reserves, then by name)
  const sortedRoster = [...roster].sort((a, b) => {
    const posAStr = a.position !== undefined && a.position !== null ? String(a.position).trim() : '';
    const posBStr = b.position !== undefined && b.position !== null ? String(b.position).trim() : '';

    const numA = parseInt(posAStr, 10);
    const numB = parseInt(posBStr, 10);

    const isNumA = !isNaN(numA) && String(numA) === posAStr;
    const isNumB = !isNaN(numB) && String(numB) === posBStr;

    if (isNumA && isNumB) return numA - numB;
    if (isNumA && !isNumB) return -1;
    if (!isNumA && isNumB) return 1;

    if (posAStr && posBStr) return posAStr.localeCompare(posBStr);
    if (posAStr && !posBStr) return -1;
    if (!posAStr && posBStr) return 1;

    const nameA = a.name || a.orgProfileName || '';
    const nameB = b.name || b.orgProfileName || '';
    return nameA.localeCompare(nameB);
  });

  return (
    <View className={`flex-row flex-wrap gap-2.5 ${className}`}>
      {sortedRoster.map((item) => {
        const playerId = item.orgProfileId || item.id;
        const isSelected = selectedPlayerId === playerId;
        const rawName = item.name || item.orgProfileName;
        const positionDisplay = item.position ? `${item.position}` : '?';
        const playerName = rawName || (item.position ? `Player ${item.position}` : 'Player');

        return (
          <TouchableOpacity
            key={playerId}
            onPress={() => onSelect(playerId)}
            activeOpacity={0.7}
            style={{ flexGrow: 1, minWidth: 120, maxWidth: '48%' }}
            className={`p-2.5 rounded-xl border flex-row items-center gap-2.5 ${
              isSelected
                ? 'bg-primary border-primary'
                : 'bg-sunken border-line'
            }`}
          >
            <View
              className={`w-8 h-8 rounded-lg items-center justify-center ${
                isSelected
                  ? 'bg-on-fill/20'
                  : 'bg-primary-soft border border-primary-line'
              }`}
            >
              <Text
                className={`font-orbitron-bold text-sm ${
                  isSelected ? 'text-on-fill' : 'text-primary-ink'
                }`}
              >
                {positionDisplay}
              </Text>
            </View>
            <View className="flex-1 min-w-0">
              <Text
                numberOfLines={1}
                className={`font-inter-bold text-xs ${
                  isSelected ? 'text-on-fill' : 'text-ink'
                }`}
              >
                {playerName}
              </Text>
              {item.isReserve && (
                <Text
                  className={`font-orbitron-bold text-[9px] uppercase tracking-wider ${
                    isSelected ? 'text-on-fill/80' : 'text-ink-muted'
                  }`}
                >
                  Reserve
                </Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
