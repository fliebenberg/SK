import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useActiveTheme } from '../store/settingsStore';
import { COLORS } from '../constants/Colors';

const FIELD_HEIGHT = 44;

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Format a Date as `YYYY-MM-DD` using local calendar fields. */
function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a `YYYY-MM-DD` string as a local date; fall back to today when empty or invalid.
 * Anchoring at midday avoids `new Date('YYYY-MM-DD')` being read as UTC midnight,
 * which shows the previous day in negative-offset timezones.
 */
function toLocalDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T12:00:00`);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export default function DatePicker({ value, onChange, placeholder }: DatePickerProps) {
  const isDark = useActiveTheme() === 'dark';
  const [showPicker, setShowPicker] = useState(false);
  // iOS only: the date being browsed in the modal before the user taps Done.
  const [pendingDate, setPendingDate] = useState<Date>(() => toLocalDate(value));

  const openPicker = () => {
    setPendingDate(toLocalDate(value));
    setShowPicker(true);
  };

  // Android renders a native dialog: a single event either selects a date or dismisses.
  const handleAndroidChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowPicker(false);
    if (event.type === 'set' && selectedDate) {
      onChange(toDateString(selectedDate));
    }
  };

  const confirmIos = () => {
    onChange(toDateString(pendingDate));
    setShowPicker(false);
  };

  return (
    // The row needs an explicit height: a percentage-height child (the old `h-full` button)
    // inside an auto-height row resolves against the available screen space on Android,
    // which inflated this field to several hundred pixels.
    <View
      className="flex-row items-stretch bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden w-full"
      style={{ height: FIELD_HEIGHT }}
    >
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder || 'YYYY-MM-DD'}
        placeholderTextColor="#94A3B8"
        className="flex-1 px-4 font-inter text-sm text-slate-850 dark:text-white"
        style={{ height: FIELD_HEIGHT, paddingVertical: 0 }}
      />
      <TouchableOpacity
        onPress={openPicker}
        className="px-4 items-center justify-center border-l border-slate-200 dark:border-white/5"
      >
        <Ionicons name="calendar-outline" size={18} color={COLORS.brand.orange} />
      </TouchableOpacity>

      {/* Android: the picker is a native dialog and adds nothing to the layout. */}
      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker value={toLocalDate(value)} mode="date" display="default" onChange={handleAndroidChange} />
      )}

      {/* iOS: the inline calendar must live in a modal, otherwise it expands the input row. */}
      {Platform.OS === 'ios' && (
        <Modal transparent visible={showPicker} animationType="fade" onRequestClose={() => setShowPicker(false)}>
          <Pressable
            className="flex-1 bg-slate-950/40 items-center justify-center p-6"
            onPress={() => setShowPicker(false)}
          >
            <Pressable
              className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-white/10 w-full max-w-sm shadow-lg"
              onPress={(e) => e.stopPropagation()}
            >
              <View className="flex-row justify-between items-center pb-3 border-b border-slate-100 dark:border-white/5 mb-2">
                <Text className="font-orbitron-bold text-sm text-slate-850 dark:text-white uppercase tracking-wider">
                  {placeholder || 'Select Date'}
                </Text>
                <TouchableOpacity onPress={() => setShowPicker(false)}>
                  <Ionicons name="close" size={20} color={isDark ? '#94A3B8' : '#64748B'} />
                </TouchableOpacity>
              </View>

              <DateTimePicker
                value={pendingDate}
                mode="date"
                display="inline"
                themeVariant={isDark ? 'dark' : 'light'}
                accentColor={COLORS.brand.orange}
                onChange={(_event, selectedDate) => {
                  if (selectedDate) setPendingDate(selectedDate);
                }}
              />

              <View className="flex-row justify-end gap-3 pt-3 border-t border-slate-100 dark:border-white/5 mt-2">
                <TouchableOpacity onPress={() => setShowPicker(false)} className="px-4 py-2">
                  <Text className="font-inter text-sm text-slate-500 dark:text-slate-400">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmIos} className="px-4 py-2 rounded-xl bg-brand-orange">
                  <Text className="font-inter-bold text-sm text-white">Done</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}
