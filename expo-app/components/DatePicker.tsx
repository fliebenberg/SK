import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useActiveTheme } from '../store/settingsStore';

import { calendarDateForPicker, calendarDateOf } from '../utils/dates';
import { themeColor } from '../constants/Colors';

const FIELD_HEIGHT = 44;

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/*
  The value is a calendar date (`YYYY-MM-DD`); the native picker speaks `Date`. Both conversions
  are in utils/dates.ts — the picker opens on the value's day at local noon, and the day picked is
  read off in local time (date-formatting skill).
*/

export default function DatePicker({ value, onChange, placeholder }: DatePickerProps) {
  const isDark = useActiveTheme() === 'dark';
  const [showPicker, setShowPicker] = useState(false);
  // iOS only: the date being browsed in the modal before the user taps Done.
  const [pendingDate, setPendingDate] = useState<Date>(() => calendarDateForPicker(value));

  const openPicker = () => {
    setPendingDate(calendarDateForPicker(value));
    setShowPicker(true);
  };

  // Android renders a native dialog: a single event either selects a date or dismisses.
  const handleAndroidChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowPicker(false);
    if (event.type === 'set' && selectedDate) {
      onChange(calendarDateOf(selectedDate));
    }
  };

  const confirmIos = () => {
    onChange(calendarDateOf(pendingDate));
    setShowPicker(false);
  };

  return (
    // The row needs an explicit height: a percentage-height child (the old `h-full` button)
    // inside an auto-height row resolves against the available screen space on Android,
    // which inflated this field to several hundred pixels.
    <View
      className="flex-row items-stretch bg-canvas border border-line rounded-xl overflow-hidden w-full"
      style={{ height: FIELD_HEIGHT }}
    >
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder || 'YYYY-MM-DD'}
        placeholderTextColor={themeColor(isDark, 'ink-muted')}
        className="flex-1 px-4 font-inter text-sm text-ink"
        style={{ height: FIELD_HEIGHT, paddingVertical: 0 }}
      />
      <TouchableOpacity
        onPress={openPicker}
        className="px-4 items-center justify-center border-l border-line"
      >
        <Ionicons name="calendar-outline" size={18} color={themeColor(isDark, 'primary')} />
      </TouchableOpacity>

      {/* Android: the picker is a native dialog and adds nothing to the layout. */}
      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker value={calendarDateForPicker(value)} mode="date" display="default" onChange={handleAndroidChange} />
      )}

      {/* iOS: the inline calendar must live in a modal, otherwise it expands the input row. */}
      {Platform.OS === 'ios' && (
        <Modal transparent visible={showPicker} animationType="fade" onRequestClose={() => setShowPicker(false)}>
          <Pressable
            className="flex-1 bg-overlay/40 items-center justify-center p-6"
            onPress={() => setShowPicker(false)}
          >
            <Pressable
              className="bg-card rounded-2xl p-5 border border-line w-full max-w-sm shadow-lg"
              onPress={(e) => e.stopPropagation()}
            >
              <View className="flex-row justify-between items-center pb-3 border-b border-line-soft mb-2">
                <Text className="font-orbitron-bold text-sm text-ink uppercase tracking-wider">
                  {placeholder || 'Select Date'}
                </Text>
                <TouchableOpacity onPress={() => setShowPicker(false)}>
                  <Ionicons name="close" size={20} color={themeColor(isDark, 'ink-muted')} />
                </TouchableOpacity>
              </View>

              <DateTimePicker
                value={pendingDate}
                mode="date"
                display="inline"
                themeVariant={isDark ? 'dark' : 'light'}
                accentColor={themeColor(isDark, 'primary')}
                onChange={(_event, selectedDate) => {
                  if (selectedDate) setPendingDate(selectedDate);
                }}
              />

              <View className="flex-row justify-end gap-3 pt-3 border-t border-line-soft mt-2">
                <TouchableOpacity onPress={() => setShowPicker(false)} className="px-4 py-2">
                  <Text className="font-inter text-sm text-ink-muted">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmIos} className="px-4 py-2 rounded-xl bg-primary">
                  <Text className="font-inter-bold text-sm text-on-fill">Done</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}
