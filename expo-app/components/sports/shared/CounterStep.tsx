import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useActiveTheme } from '../../../store/settingsStore';
import { themeColor } from '../../../constants/Colors';
interface CounterStepProps {
  label?: string;
  value: number;
  onChange: (newValue: number) => void;
  min?: number;
  max?: number;
}

export function CounterStep({
  label = 'Resets',
  value = 0,
  onChange,
  min = 0,
  max = 99,
}: CounterStepProps) {
  const isDark = useActiveTheme() === 'dark';
  const handleDecrement = () => {
    if (value > min) {
      onChange(value - 1);
    }
  };

  const handleIncrement = () => {
    if (value < max) {
      onChange(value + 1);
    }
  };

  return (
    <View className="items-center justify-center space-y-3 py-4">
      <Text className="font-inter-bold text-xs text-ink-muted uppercase tracking-wider">
        {label}
      </Text>

      <View className="flex-row items-center gap-6 bg-sunken p-3 rounded-2xl border border-line shadow-sm">
        <TouchableOpacity
          onPress={handleDecrement}
          disabled={value <= min}
          className={`w-12 h-12 rounded-xl items-center justify-center border ${
            value <= min
              ? 'bg-sunken border-line opacity-40'
              : 'bg-raised border-line active:bg-line'
          }`}
        >
          <Ionicons name="remove" size={24} color={value <= min ? themeColor(isDark, 'ink-muted') : themeColor(isDark, 'primary')} />
        </TouchableOpacity>

        <View className="w-16 items-center">
          <Text className="font-orbitron-bold text-3xl text-ink">
            {value}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleIncrement}
          disabled={value >= max}
          className={`w-12 h-12 rounded-xl items-center justify-center border ${
            value >= max
              ? 'bg-sunken border-line opacity-40'
              : 'bg-raised border-line active:bg-line'
          }`}
        >
          <Ionicons name="add" size={24} color={value >= max ? themeColor(isDark, 'ink-muted') : themeColor(isDark, 'primary')} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
