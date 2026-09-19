import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AgeGroup, SocketAction, ageGroupNameKey, sortAgeGroups } from '@sk/shared';
import { wsService } from '../services/websocket';
import { reportActionError } from '../utils/actionErrors';

/**
 * Chooses an age group from a sport's list — the one control every screen that gives a team,
 * division or league an age group uses.
 *
 * The **official** entries (curated by an admin in the sport editor) are chips, in their curated
 * order. **Other…** opens the **custom** entries other users have already added for the sport, so
 * the second school needing "U13 Girls" picks the first school's, and a box to add a new one. The
 * server returns the existing entry when a typed name matches one ignoring case, so "u13" typed
 * here simply selects "U13".
 *
 * An added entry is kept locally and handed to `onChange`, so the screen does not have to reload
 * the sports list to show it.
 */

interface AgeGroupPickerProps {
  /** The sport the age group belongs to. Without one there is nothing to choose from. */
  sportId?: string | null;
  /** The sport's list, as `get_data: sports` carries it on `sport.ageGroups`. */
  ageGroups?: AgeGroup[];
  value?: string | null;
  onChange: (ageGroupId: string | null, ageGroup?: AgeGroup) => void;
  /** Offers a "no age group" chip with this label — for divisions and leagues, which may be open to any age. */
  noneLabel?: string;
  /** The workspace the user is acting from, recorded against a custom entry they add. */
  orgId?: string;
  disabled?: boolean;
}

const chipClass = (isSelected: boolean) =>
  `px-3.5 py-2 rounded-xl border ${
    isSelected
      ? 'bg-brand-orange border-brand-orange'
      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/5'
  }`;

const chipTextClass = (isSelected: boolean) =>
  `font-inter-bold text-xs ${isSelected ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`;

export function AgeGroupPicker({
  sportId,
  ageGroups = [],
  value,
  onChange,
  noneLabel,
  orgId,
  disabled,
}: AgeGroupPickerProps) {
  const [added, setAdded] = useState<AgeGroup[]>([]);
  const [showOther, setShowOther] = useState(false);
  const [draft, setDraft] = useState('');
  const [isAdding, setIsAdding] = useState(false);

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
  const official = all.filter(g => g.isOfficial);
  const custom = all.filter(g => !g.isOfficial);
  const selected = all.find(g => g.id === value);
  const otherOpen = showOther || (!!selected && !selected.isOfficial);

  if (!sportId) {
    return (
      <Text className="font-inter text-xs text-slate-400 dark:text-slate-500">
        Choose a sport first — each sport has its own age groups.
      </Text>
    );
  }

  const addDraft = () => {
    const name = draft.trim();
    if (!name || isAdding) return;
    // Already on the list: pick it without a round trip.
    const existing = all.find(g => ageGroupNameKey(g.name) === ageGroupNameKey(name));
    if (existing) {
      onChange(existing.id, existing);
      setDraft('');
      return;
    }
    setIsAdding(true);
    wsService.emit(
      'action',
      { type: SocketAction.ADD_AGE_GROUP, payload: { sportId, name, orgId } },
      (response: any) => {
        setIsAdding(false);
        if (reportActionError(response, 'That age group could not be added.')) return;
        const group: AgeGroup = response.data;
        setAdded(prev => [...prev, group]);
        setDraft('');
        onChange(group.id, group);
      }
    );
  };

  return (
    <View className={disabled ? 'opacity-50' : ''} pointerEvents={disabled ? 'none' : 'auto'}>
      <View className="flex-row flex-wrap gap-2">
        {noneLabel !== undefined && (
          <TouchableOpacity onPress={() => onChange(null)} className={chipClass(!value)}>
            <Text className={chipTextClass(!value)}>{noneLabel}</Text>
          </TouchableOpacity>
        )}
        {official.map(group => (
          <TouchableOpacity key={group.id} onPress={() => onChange(group.id, group)} className={chipClass(value === group.id)}>
            <Text className={chipTextClass(value === group.id)}>{group.name}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={() => setShowOther(!otherOpen)}
          className={`${chipClass(!!selected && !selected.isOfficial)} flex-row items-center gap-1`}
        >
          <Text className={chipTextClass(!!selected && !selected.isOfficial)}>
            {selected && !selected.isOfficial ? selected.name : 'Other…'}
          </Text>
          <Ionicons
            name={otherOpen ? 'chevron-up' : 'chevron-down'}
            size={12}
            color={selected && !selected.isOfficial ? 'white' : '#94A3B8'}
          />
        </TouchableOpacity>
      </View>

      {otherOpen && (
        <View className="mt-3 p-3 rounded-xl border border-dashed border-slate-300 dark:border-white/10">
          {custom.length > 0 && (
            <>
              <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                Added by other users of this sport:
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-3">
                {custom.map(group => (
                  <TouchableOpacity key={group.id} onPress={() => onChange(group.id, group)} className={chipClass(value === group.id)}>
                    <Text className={chipTextClass(value === group.id)}>{group.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
          <View className="flex-row items-center gap-2">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={addDraft}
              placeholder="Add an age group, e.g. U13 Girls"
              placeholderTextColor="#94A3B8"
              maxLength={40}
              className="flex-1 font-inter text-sm text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 outline-none"
            />
            <TouchableOpacity
              onPress={addDraft}
              disabled={!draft.trim() || isAdding}
              className={`px-3.5 py-2 rounded-xl bg-brand-orange flex-row items-center gap-1 ${!draft.trim() ? 'opacity-50' : ''}`}
            >
              {isAdding ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="add" size={14} color="white" />
                  <Text className="font-inter-bold text-xs text-white">Add</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
