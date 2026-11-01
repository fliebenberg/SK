import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';
import { themeColor } from '../constants/Colors';

/**
 * The one pager, above and below every paged list (docs/design_spec.md §5.4): how much is showing,
 * then first, previous, a page number to jump to, next and last. On a phone it stays on one line,
 * without the words. A list that fits on one page shows none.
 */
export function ListPager({ page, limit, total, noun, onPageChange, disabled, testID }: {
  page: number;
  limit: number;
  total: number;
  /** What the list is of, in the plural ("teams"), said on a wide screen. */
  noun?: string;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const isDark = useActiveTheme() === 'dark';
  const { width } = useWindowDimensions();
  const isPhone = width < 640;
  // The narrowest phones need the room for the count, so first and last go: the number jumps there.
  const isNarrowPhone = width < 380;
  const [jump, setJump] = useState(String(page));
  useEffect(() => setJump(String(page)), [page]);

  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const go = (next: number) => {
    const target = Math.min(Math.max(1, next), pages);
    if (target !== page) onPageChange(target);
    setJump(String(target));
  };
  const submitJump = () => {
    const parsed = parseInt(jump, 10);
    if (Number.isNaN(parsed)) setJump(String(page));
    else go(parsed);
  };
  const control = (icon: keyof typeof Ionicons.glyphMap, label: string, target: number, off: boolean) => (
    <TouchableOpacity
      onPress={() => go(target)}
      disabled={off || disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off || !!disabled }}
      className={`w-7 h-7 rounded-lg items-center justify-center border border-line ${off ? 'opacity-30 bg-sunken' : 'bg-raised active:opacity-75'}`}
    >
      <Ionicons name={icon} size={icon.startsWith('play') ? 12 : 14} color={themeColor(isDark, 'ink-soft')} />
    </TouchableOpacity>
  );

  return (
    <View testID={testID} className="py-2 px-2.5 bg-card border border-line rounded-xl flex-row items-center justify-between gap-2 shadow-sm">
      <Text numberOfLines={1} className="font-inter text-xs text-ink-muted">
        {isPhone ? '' : 'Showing '}
        <Text className="font-inter-bold text-ink-soft">{from.toLocaleString()}–{to.toLocaleString()}</Text>
        {' of '}
        <Text className="font-inter-bold text-ink-soft">{total.toLocaleString()}</Text>
        {!isPhone && noun ? ` ${noun}` : ''}
      </Text>
      <View className="flex-row items-center gap-1">
        {isNarrowPhone ? null : control('play-skip-back', 'First page', 1, page === 1)}
        {control('chevron-back', 'Previous page', page - 1, page === 1)}
        <View className="flex-row items-center gap-1 px-0.5">
          {isPhone ? null : <Text className="font-inter text-xs text-ink-muted">Page</Text>}
          <TextInput
            value={jump}
            onChangeText={setJump}
            onBlur={submitJump}
            onSubmitEditing={submitJump}
            editable={!disabled}
            keyboardType="number-pad"
            selectTextOnFocus
            accessibilityLabel="Page number"
            className="w-9 h-7 text-center font-inter-bold text-xs bg-sunken text-ink border border-line rounded-md py-0 px-1 outline-none"
          />
          <Text className="font-inter text-xs text-ink-muted">of {pages}</Text>
        </View>
        {control('chevron-forward', 'Next page', page + 1, page === pages)}
        {isNarrowPhone ? null : control('play-skip-forward', 'Last page', pages, page === pages)}
      </View>
    </View>
  );
}
