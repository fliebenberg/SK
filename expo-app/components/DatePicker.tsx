import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function DatePicker({ value, onChange, placeholder }: DatePickerProps) {
  const [showPicker, setShowPicker] = useState(false);

  const dateValue = value ? new Date(value) : new Date();

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowPicker(false);
    if (selectedDate) {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      onChange(`${year}-${month}-${day}`);
    }
  };

  return (
    <View className="flex-row items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden w-full">
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder || "YYYY-MM-DD"}
        placeholderTextColor="#94A3B8"
        className="flex-1 px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
        style={{ height: 44 }}
      />
      <TouchableOpacity
        onPress={() => setShowPicker(true)}
        className="px-4 h-full items-center justify-center border-l border-slate-200 dark:border-white/5"
      >
        <Ionicons name="calendar-outline" size={18} color="#FF3E00" />
      </TouchableOpacity>

      {showPicker && (
        <DateTimePicker
          value={dateValue}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      )}
    </View>
  );
}
