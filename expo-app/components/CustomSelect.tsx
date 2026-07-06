import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, Pressable } from 'react-native';
import { useActiveTheme } from '../store/settingsStore';
import { Ionicons } from '@expo/vector-icons';

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  style?: any;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  className = '',
  style,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isDark = useActiveTheme() === 'dark';

  const selectedOption = options.find((opt) => opt.value === value);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setIsOpen(true)}
        activeOpacity={0.8}
        className={`flex-row items-center justify-between bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 ${className}`}
        style={style}
      >
        <Text className={`font-inter text-sm ${selectedOption ? 'text-slate-850 dark:text-white' : 'text-slate-450'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={isDark ? '#94A3B8' : '#64748B'} />
      </TouchableOpacity>

      <Modal
        transparent
        visible={isOpen}
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable 
          className="flex-1 bg-slate-950/40 items-center justify-center p-6"
          onPress={() => setIsOpen(false)}
        >
          <Pressable 
            className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-white/10 w-full max-w-sm shadow-2xl space-y-3"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row justify-between items-center pb-3 border-b border-slate-100 dark:border-white/5 mb-1">
              <Text className="font-orbitron-bold text-sm text-slate-850 dark:text-white uppercase tracking-wider">
                {placeholder}
              </Text>
              <TouchableOpacity onPress={() => setIsOpen(false)}>
                <Ionicons name="close" size={20} color={isDark ? '#94A3B8' : '#64748B'} />
              </TouchableOpacity>
            </View>

            <ScrollView 
              className="space-y-1.5"
              contentContainerStyle={{ gap: 6 }}
              showsVerticalScrollIndicator={true}
            >
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => handleSelect(opt.value)}
                    activeOpacity={0.7}
                    className={`flex-row items-center justify-between p-3 rounded-xl border ${
                      isSelected
                        ? 'bg-brand-orange/10 border-brand-orange'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-100 dark:border-white/5'
                    }`}
                  >
                    <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-inter-bold' : 'text-slate-855 dark:text-white'}`}>
                      {opt.label}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={16} color="#FF3E00" />
                    )}
                  </TouchableOpacity>
                );
              })}

              {options.length === 0 && (
                <View className="items-center justify-center py-4">
                  <Text className="font-inter text-xs text-slate-450">No options available</Text>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
