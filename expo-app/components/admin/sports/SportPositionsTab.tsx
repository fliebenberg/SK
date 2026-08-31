import React from 'react';
import { View, Text, TextInput } from 'react-native';
import { SportPosition } from '../../../services/api';
import { GlassCard } from '../../GlassCard';
import { AddButton, EmptyHint, RowActions, SectionLabel } from './editorPrimitives';

/**
 * The Positions tab: the default roster slots a team of this sport is picked into.
 *
 * The abbreviation is the id a roster stores, so it is uppercased and stripped of spaces as it
 * is typed, and duplicates are rejected on save.
 */

interface SportPositionsTabProps {
  positions: SportPosition[];
  onChange: (positions: SportPosition[]) => void;
}

export function SportPositionsTab({ positions, onChange }: SportPositionsTabProps) {
  const update = (index: number, patch: Partial<SportPosition>) =>
    onChange(positions.map((position, idx) => (idx === index ? { ...position, ...patch } : position)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= positions.length) return;
    const next = [...positions];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <View>
      <View className="flex-row items-center justify-between mb-3">
        <SectionLabel>Default Team Positions</SectionLabel>
        <AddButton label="Add Position" onPress={() => onChange([...positions, { id: '', name: '' }])} />
      </View>

      <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
        The slots a team sheet offers for this sport, in the order they are shown. A game can
        override them with its own list.
      </Text>

      <GlassCard className="border border-slate-200 dark:border-white/5 p-4 rounded-xl mb-6">
        {positions.length === 0 ? (
          <EmptyHint icon="people-outline" text='No positions added. Use "Add Position" above to configure some.' />
        ) : (
          <View className="space-y-3">
            {positions.map((position, index) => (
              <View key={index} className="flex-row items-center gap-2.5">
                <View className="w-16">
                  <TextInput
                    value={position.id}
                    onChangeText={(text) => update(index, { id: text.toUpperCase().replace(/\s+/g, '') })}
                    placeholder="ID"
                    autoCapitalize="characters"
                    className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-white/5 px-2 py-2.5 rounded-xl font-orbitron-bold text-xs text-center text-slate-800 dark:text-white"
                  />
                </View>
                <View className="flex-1">
                  <TextInput
                    value={position.name}
                    onChangeText={(text) => update(index, { name: text })}
                    placeholder="Name (e.g. Goalkeeper)"
                    className="bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-white/5 px-3 py-2.5 rounded-xl font-inter text-sm text-slate-800 dark:text-white"
                  />
                </View>
                <RowActions
                  canMoveUp={index > 0}
                  canMoveDown={index < positions.length - 1}
                  onMoveUp={() => move(index, -1)}
                  onMoveDown={() => move(index, 1)}
                  onDelete={() => onChange(positions.filter((_, idx) => idx !== index))}
                />
              </View>
            ))}
          </View>
        )}
      </GlassCard>
    </View>
  );
}
