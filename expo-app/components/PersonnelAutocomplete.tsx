import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';
import { wsService } from '../services/websocket';
import { OrgProfile } from '@sk/shared';
import { themeColor } from '../constants/Colors';

interface PersonnelAutocompleteProps {
  orgId: string;
  value: string;
  onChangeText: (text: string) => void;
  onSelectPerson: (person: OrgProfile | null) => void;
  onSelectNewPerson?: () => void;
  placeholder?: string;
}

export function PersonnelAutocomplete({
  orgId,
  value,
  onChangeText,
  onSelectPerson,
  onSelectNewPerson,
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
    if (onSelectNewPerson) {
      onSelectNewPerson();
    }
    setIsOpen(false);
  };

  return (
    <View style={styles.container}>
      <View className="flex-row items-center bg-sunken border border-line rounded-xl px-4 py-2.5">
        <TextInput
          value={value}
          onChangeText={(text) => {
            onChangeText(text);
            onSelectPerson(null); // Reset suggestion selection
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          placeholderTextColor={themeColor(isDark, 'ink-muted')}
          /* Opts out of Chrome's saved-addresses popup, which otherwise covers these results. */
          autoComplete="off"
          autoCorrect={false}
          spellCheck={false}
          className="flex-1 font-inter text-sm text-ink outline-none"
        />
        {isLoading ? (
          <ActivityIndicator size="small" color={themeColor(isDark, 'primary')} />
        ) : (
          <Ionicons name="search-outline" size={16} color={themeColor(isDark, 'ink-muted')} />
        )}
      </View>

      {isOpen && value.trim().length > 0 && (
        <View 
          className="absolute left-0 right-0 z-50 rounded-xl border border-line-strong mt-1 overflow-hidden bg-card"
          style={{
            top: 50,
            maxHeight: 220,
            shadowColor: themeColor(isDark, 'shadow'),
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 5,
            flexDirection: 'column',
            backgroundColor: themeColor(isDark, 'card'),
          }}
        >
          {suggestions.length > 0 ? (
            <ScrollView 
              style={{ flex: 1, maxHeight: 150 }}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
            >
              <View className="bg-sunken px-3 py-1 border-b border-line">
                <Text className="font-orbitron-bold text-[8px] text-ink-muted uppercase tracking-wider">
                  Existing Persons
                </Text>
              </View>
              {suggestions.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => handleSelect(item)}
                  className="flex-row items-center px-4 py-2 border-b border-line-soft active:bg-sunken"
                >
                  <View className="w-5 h-5 rounded-full bg-primary-soft items-center justify-center mr-3">
                    <Text className="font-inter-bold text-[10px] text-primary-ink">
                      {item.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-inter-semibold text-sm text-ink">
                      {item.name}
                    </Text>
                    {!!item.email && (
                      <Text className="font-inter text-xs text-ink-muted">
                        {item.email}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="checkmark-circle-outline" size={14} color={themeColor(isDark, 'success')} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}

          <View className="border-t border-line bg-card">
            <View className="bg-sunken px-3 py-1 border-b border-line">
              <Text className="font-orbitron-bold text-[8px] text-ink-muted uppercase tracking-wider">
                Create New Member
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleNewPerson}
              className="flex-row items-center px-4 py-2 active:bg-sunken"
            >
              <View className="w-5 h-5 rounded-full bg-line items-center justify-center mr-3">
                <Ionicons name="person-add-outline" size={10} color={themeColor(isDark, 'ink')} />
              </View>
              <Text className="font-inter-bold text-[11px] text-primary-ink">
                Add "{value}" as a new person
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
