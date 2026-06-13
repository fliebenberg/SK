import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';
import { wsService } from '../services/websocket';
import { OrgProfile } from '@sk/types';

interface PersonnelAutocompleteProps {
  orgId: string;
  value: string;
  onChangeText: (text: string) => void;
  onSelectPerson: (person: OrgProfile | null) => void;
  placeholder?: string;
}

export function PersonnelAutocomplete({
  orgId,
  value,
  onChangeText,
  onSelectPerson,
  placeholder = 'Search roster or enter name...',
}: PersonnelAutocompleteProps) {
  const isDark = useActiveTheme() === 'dark';
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<OrgProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!value.trim() || value.length < 2) {
      setSuggestions([]);
      return;
    }

    const delayDebounce = setTimeout(() => {
      setIsLoading(true);
      wsService.emit('get_data', { type: 'search_people', query: value, orgId }, (results: any) => {
        setIsLoading(false);
        if (Array.isArray(results)) {
          setSuggestions(results);
        } else {
          setSuggestions([]);
        }
      });
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [value, orgId]);

  const handleSelect = (person: OrgProfile) => {
    onChangeText(person.name);
    onSelectPerson(person);
    setIsOpen(false);
  };

  const handleNewPerson = () => {
    onSelectPerson(null);
    setIsOpen(false);
  };

  return (
    <View style={styles.container}>
      <View className="flex-row items-center bg-slate-100/30 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5">
        <TextInput
          value={value}
          onChangeText={(text) => {
            onChangeText(text);
            onSelectPerson(null); // Reset suggestion selection
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          className="flex-1 font-inter text-sm text-slate-800 dark:text-white outline-none"
        />
        {isLoading ? (
          <ActivityIndicator size="small" color="#FF3E00" />
        ) : (
          <Ionicons name="search-outline" size={16} color="#94A3B8" />
        )}
      </View>

      {isOpen && value.trim().length > 0 && (
        <View 
          className="absolute left-0 right-0 z-50 rounded-xl border border-slate-200 dark:border-white/10 mt-1 overflow-hidden"
          style={{
            top: 50,
            backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 5,
          }}
        >
          <View style={{ maxHeight: 200 }}>
            {suggestions.length > 0 && (
              <View>
                <View className="bg-slate-100/50 dark:bg-slate-800/30 px-3 py-1.5 border-b border-slate-200 dark:border-white/5">
                  <Text className="font-orbitron-bold text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Existing Roster Matches
                  </Text>
                </View>
                {suggestions.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => handleSelect(item)}
                    className="flex-row items-center px-4 py-3 border-b border-slate-100 dark:border-white/5 active:bg-slate-100 dark:active:bg-slate-800"
                  >
                    <View className="w-6 h-6 rounded-full bg-brand-orange/10 items-center justify-center mr-3">
                      <Text className="font-orbitron-bold text-xs text-brand-orange">
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white">
                        {item.name}
                      </Text>
                      {item.email && (
                        <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500">
                          {item.email}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#10B981" />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View className="bg-slate-100/50 dark:bg-slate-800/30 px-3 py-1.5 border-b border-slate-200 dark:border-white/5">
              <Text className="font-orbitron-bold text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Create New Member
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleNewPerson}
              className="flex-row items-center px-4 py-3 active:bg-slate-100 dark:active:bg-slate-800"
            >
              <View className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 items-center justify-center mr-3">
                <Ionicons name="person-add-outline" size={12} color={isDark ? 'white' : '#1E293B'} />
              </View>
              <Text className="font-inter-bold text-xs text-brand-orange">
                Use literal "{value}" as a new person
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 50,
  },
});
