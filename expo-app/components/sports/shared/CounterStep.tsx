import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
      <Text className="font-inter-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        {label}
      </Text>

      <View className="flex-row items-center gap-6 bg-slate-100 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
        <TouchableOpacity
          onPress={handleDecrement}
          disabled={value <= min}
          className={`w-12 h-12 rounded-xl items-center justify-center border ${
            value <= min
              ? 'bg-slate-200/50 dark:bg-white/5 border-slate-200 dark:border-white/5 opacity-40'
              : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-white/10 active:bg-slate-200'
          }`}
        >
          <Ionicons name="remove" size={24} color={value <= min ? '#94A3B8' : '#F97316'} />
        </TouchableOpacity>

        <View className="w-16 items-center">
          <Text className="font-orbitron-bold text-3xl text-slate-900 dark:text-white">
            {value}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleIncrement}
          disabled={value >= max}
          className={`w-12 h-12 rounded-xl items-center justify-center border ${
            value >= max
              ? 'bg-slate-200/50 dark:bg-white/5 border-slate-200 dark:border-white/5 opacity-40'
              : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-white/10 active:bg-slate-200'
          }`}
        >
          <Ionicons name="add" size={24} color={value >= max ? '#94A3B8' : '#F97316'} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
