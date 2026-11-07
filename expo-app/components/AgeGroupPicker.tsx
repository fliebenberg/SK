import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AgeGroup, SocketAction, ageGroupNameKey, sortAgeGroups } from '@sk/shared';
import { sendAction } from '../services/actions';
import CustomSelect from './CustomSelect';

import { useActiveTheme } from '../store/settingsStore';
import { themeColor } from '../constants/Colors';
/**
 * Chooses an age group from a sport's list — the one control every screen that gives a team,
 * division or league an age group uses.
 *
 * A select listing the sport's **official** entries (curated by an admin in the sport editor) and
 * the **custom** ones other users have added, so the second school needing "U13 Girls" picks the
 * first school's. **Other…** swaps the select for a box that adds a new one, with a ✕ that cancels
 * back to the earlier choice. The server returns the existing entry when a typed name matches one
 * ignoring case, so "u13" typed here simply selects "U13".
 *
 * **An age group is always required.** `undefined` means nothing is chosen yet — including while
 * the box is open, so a form cannot save the earlier choice under a name the user has typed over —
 * and a form keeps Save disabled until it gets one. Where any age is allowed (`noneLabel`), `null`
 * is that choice, made like any other; such a form starts on it.
 *
 * An added entry is kept locally and handed to `onChange`, so the screen does not have to reload
 * the sports list to show it.
 */

interface AgeGroupPickerProps {
  /** The sport the age group belongs to. Without one there is nothing to choose from. */
  sportId?: string | null;
  /** The sport's list, as `get_data: sports` carries it on `sport.ageGroups`. */
  ageGroups?: AgeGroup[];
  /** An age group id; `null` for `noneLabel`; `undefined` (or `null` without `noneLabel`) for none chosen yet. */
  value?: string | null;
  onChange: (ageGroupId: string | null | undefined, ageGroup?: AgeGroup) => void;
  /** Offers a "no age group" choice with this label — for divisions and leagues, which may be open to any age. */
  noneLabel?: string;
  /** The workspace the user is acting from, recorded against a custom entry they add. */
  orgId?: string;
  disabled?: boolean;
}

/** Not an age group id — the row that opens the "add a new one" box. */
const ADD_NEW = '__add_new__';
/** Not an age group id — matches no option, so the select shows its placeholder. */
const NONE_CHOSEN = '__none_chosen__';

export function AgeGroupPicker({
  sportId,
  ageGroups = [],
  value,
  onChange,
  noneLabel,
  orgId,
  disabled,
}: AgeGroupPickerProps) {
  const isDark = useActiveTheme() === 'dark';
  const [added, setAdded] = useState<AgeGroup[]>([]);
  const [showOther, setShowOther] = useState(false);
  const [draft, setDraft] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  /** The choice before Other… cleared it — put back if the new entry is cancelled. */
  const [beforeOther, setBeforeOther] = useState<string | null | undefined>(undefined);

  // Entries added here belong to the sport they were added for.
  useEffect(() => {
    setAdded([]);
    setShowOther(false);
    setDraft('');
  }, [sportId]);

  const all = useMemo(() => {
    const known = new Set(ageGroups.map(g => g.id));
    return sortAgeGroups([...ageGroups, ...added.filter(g => !known.has(g.id))]);
  }, [ageGroups, added]);

  if (!sportId) {
    return (
      <Text className="font-inter text-xs text-ink-muted">
        Choose a sport first — each sport has its own age groups.
      </Text>
    );
  }

  const choose = (group: AgeGroup) => {
    setDraft('');
    setShowOther(false);
    onChange(group.id, group);
  };

  const addDraft = () => {
    const name = draft.trim();
    if (!name || isAdding) return;
    // Already on the list: pick it without a round trip.
    const existing = all.find(g => ageGroupNameKey(g.name) === ageGroupNameKey(name));
    if (existing) {
      choose(existing);
      return;
    }
    setIsAdding(true);
    sendAction(SocketAction.ADD_AGE_GROUP, { sportId, name, orgId }).then(result => {
      setIsAdding(false);
      // A refusal is already toasted; the draft is kept so it can be corrected.
      if (!result.ok) return;
      const group = result.data;
      setAdded(prev => [...prev, group]);
      choose(group);
    });
  };

  const cancelOther = () => {
    setShowOther(false);
    setDraft('');
    onChange(beforeOther, all.find(g => g.id === beforeOther));
  };

  const selectValue = value ? value : value === null && noneLabel !== undefined ? '' : NONE_CHOSEN;

  return (
    <View className={disabled ? 'opacity-50' : ''} pointerEvents={disabled ? 'none' : 'auto'}>
      {showOther ? (
        <View className="flex-row items-center gap-2">
          <View className="flex-1 justify-center">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={addDraft}
              placeholder="Add an age group, e.g. U13 Girls"
              placeholderTextColor={themeColor(isDark, 'ink-muted')}
              maxLength={40}
              autoFocus
              accessibilityLabel="New age group"
              className="font-inter text-sm text-ink bg-canvas border border-line rounded-xl pl-3 pr-9 py-2 outline-none"
            />
            <TouchableOpacity
              onPress={cancelOther}
              accessibilityLabel="Cancel and choose from the list"
              className="absolute right-2 p-1"
            >
              <Ionicons name="close" size={16} color={themeColor(isDark, 'ink-muted')} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={addDraft}
            disabled={!draft.trim() || isAdding}
            className={`px-3.5 py-2 rounded-xl bg-primary flex-row items-center gap-1 ${!draft.trim() ? 'opacity-50' : ''}`}
          >
            {isAdding ? (
              <ActivityIndicator size="small" color={themeColor(isDark, 'on-primary')} />
            ) : (
              <>
                <Ionicons name="add" size={14} color={themeColor(isDark, 'on-primary')} />
                <Text className="font-inter-bold text-xs text-on-primary">Add</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <CustomSelect
          value={selectValue}
          onChange={picked => {
            if (picked === ADD_NEW) {
              // Nothing is chosen while the box is open: a form must not save the earlier choice
              // under a name the user has typed over. The ✕ puts it back.
              setBeforeOther(value);
              setDraft('');
              setShowOther(true);
              onChange(undefined);
              return;
            }
            const group = all.find(g => g.id === picked);
            if (group) choose(group);
            else onChange(null);
          }}
          // The closed control reads "Any age" off the `''` option, so the placeholder is free to
          // stay the instruction — which is also the select's modal heading.
          placeholder="Choose an age group"
          options={[
            ...(noneLabel !== undefined ? [{ value: '', label: noneLabel }] : []),
            ...all.map(group => ({ value: group.id, label: group.name })),
            { value: ADD_NEW, label: 'Other…', description: 'Add an age group this list does not have' },
          ]}
        />
      )}
      {showOther && draft.trim() ? (
        <Text className="font-inter text-xs text-ink-muted mt-1.5">
          Press Add to keep {draft.trim()}, or ✕ to choose from the list.
        </Text>
      ) : null}
    </View>
  );
}
