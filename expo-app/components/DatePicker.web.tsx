import React from 'react';
import { View } from 'react-native';
import { useActiveTheme } from '../store/settingsStore';
import { themeColor } from '../constants/Colors';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function DatePicker({ value, onChange }: DatePickerProps) {
  const isDark = useActiveTheme() === 'dark';

  return (
    <View className="bg-canvas border border-line rounded-xl overflow-hidden">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          height: 44,
          padding: '0 16px',
          background: 'transparent',
          border: 'none',
          color: themeColor(isDark, 'ink'),
          fontFamily: 'Inter, System, sans-serif',
          fontSize: 14,
          outline: 'none',
          colorScheme: isDark ? 'dark' : 'light',
        }}
      />
    </View>
  );
}
