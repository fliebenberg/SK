import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, Pressable, TextInput } from 'react-native';
import { useActiveTheme } from '../store/settingsStore';
import { Ionicons } from '@expo/vector-icons';
import { themeColor } from '../constants/Colors';

interface Option {
  value: string;
  label: string;
  /** Shown under the label in the list only; the closed control shows the label alone. */
  description?: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  style?: any;
  showSearch?: boolean;
  searchPlaceholder?: string;
  clearable?: boolean;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  className = '',
  style,
  showSearch = false,
  searchPlaceholder = 'Search...',
  clearable = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const isDark = useActiveTheme() === 'dark';

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (!isOpen) {
      setSearchText('');
    }
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <>
      <TouchableOpacity
        onPress={() => setIsOpen(true)}
        activeOpacity={0.8}
        className={`flex-row items-center justify-between bg-field border border-line rounded-xl px-4 py-3 ${className}`}
        style={style}
      >
        <Text className={`font-inter text-sm flex-1 ${selectedOption ? 'text-ink' : 'text-ink-muted'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <View className="flex-row items-center gap-1.5">
          {clearable && !!selectedOption && (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={themeColor(isDark, 'ink-muted')} />
            </TouchableOpacity>
          )}
          <Ionicons name="chevron-down" size={16} color={themeColor(isDark, 'ink-muted')} />
        </View>
      </TouchableOpacity>

      <Modal
        transparent
        visible={isOpen}
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable 
          className="flex-1 bg-overlay/40 items-center justify-center p-6"
          onPress={() => setIsOpen(false)}
        >
          <Pressable 
            className="bg-card rounded-2xl p-5 border border-line w-full max-w-sm shadow-lg space-y-3"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row justify-between items-center pb-3 border-b border-line-soft mb-1">
              <Text className="font-orbitron-bold text-sm text-ink uppercase tracking-wider">
                {placeholder}
              </Text>
              <TouchableOpacity onPress={() => setIsOpen(false)}>
                <Ionicons name="close" size={20} color={themeColor(isDark, 'ink-muted')} />
              </TouchableOpacity>
            </View>

            {showSearch && (
              <TextInput
                placeholder={searchPlaceholder}
                placeholderTextColor={themeColor(isDark, 'ink-muted')}
                value={searchText}
                onChangeText={setSearchText}
                className="bg-field border border-line rounded-xl px-3 py-2 font-inter text-xs text-ink mb-2"
              />
            )}

            <ScrollView 
              className="space-y-1.5"
              contentContainerStyle={{ gap: 6 }}
              showsVerticalScrollIndicator={true}
              style={{ maxHeight: 250 }}
            >
              {filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => handleSelect(opt.value)}
                    activeOpacity={0.7}
                    className={`flex-row items-center justify-between p-3 rounded-xl border ${
                      isSelected
                        ? 'bg-raised border-line-selected'
                        : 'bg-field border-line-soft'
                    }`}
                  >
                    <View className="flex-1 pr-2">
                      <Text className={`font-inter text-xs ${isSelected ? 'text-ink font-inter-bold' : 'text-ink'}`}>
                        {opt.label}
                      </Text>
                      {!!opt.description && (
                        <Text className="font-inter text-[11px] text-ink-muted mt-0.5">
                          {opt.description}
                        </Text>
                      )}
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark" size={16} color={themeColor(isDark, 'ink')} />
                    )}
                  </TouchableOpacity>
                );
              })}

              {filteredOptions.length === 0 && (
                <View className="items-center justify-center py-4">
                  <Text className="font-inter text-xs text-ink-muted">No options found</Text>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
