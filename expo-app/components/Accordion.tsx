import React from 'react';
import { View, Text, TouchableOpacity, Platform, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';
import { getThemeColor } from '../constants/Colors';

/**
 * The header row of an accordion section.
 *
 * **Pinning it takes a different mechanism on each platform, and that is not a detail the caller
 * may ignore.** A pinned row must be *pushed off* by the next section's row rather than covered
 * by it — headers piling up on top of one another is the bug this component was corrected for on
 * 2026-09-09.
 *
 * - **Native** gets it from `ScrollView`'s `stickyHeaderIndices`, which tracks the following
 *   header's offset and translates the current one out of the way. It can pin only a **direct
 *   child** of the scroll, so the caller renders the header and its panel as *siblings* and lists
 *   the header's index. Two things follow, and bite if forgotten: the scroll's children must be a
 *   **flat array with no `false` or `null` in it** (native indexes through
 *   `React.Children.toArray`, which strips falsy children and re-indexes, while `react-native-web`
 *   uses `React.Children.map`, which does not), and the row needs an **opaque background**,
 *   which is why it is a card rather than bare text.
 *
 * An **expanded row is the top of its panel's card, not a card of its own**: it drops its bottom
 * radius and bottom border so the panel — which repeats this surface and closes it with
 * `rounded-b-2xl` — continues it. A row floating above a separate content card gave the reader
 * nothing tying the two together, which is the bug this was corrected for on 2026-09-09.
 * - **Web** gets it from `position: sticky` via {@link AccordionHeaderProps.sticky}, and there the
 *   push is a property of the *containing block*: a sticky element cannot leave its parent, so
 *   wrapping each header with its own panel means the section's bottom edge shoves the header out
 *   as it leaves. `stickyHeaderIndices` is no use here — `react-native-web` implements it as
 *   `position: sticky; top: 0; z-index: 10` on siblings of one container, so every header pins to
 *   the same line and the later one simply paints over the earlier. That is why the web tree
 *   nests where the native tree is flat.
 *
 * The wrapper each section needs on web also has consequences for stacking: every
 * `react-native-web` `View` carries `position: relative; z-index: 0` and is therefore its own
 * stacking context, so **section wrappers must be given descending z-indices** or a later
 * section's content paints over the pinned header it is supposed to slide under.
 *
 * Controlled on purpose. Which section is open is a decision the screen makes — open the first
 * unfinished one, keep several open at once — and a component holding its own state cannot be
 * told any of that.
 */
export interface AccordionHeaderProps {
  label: string;
  /** Where this section stands, in a few words: "3 divisions · 2 organisers", "12 entered". */
  detail?: string;
  /**
   * A completion mark. `undefined` renders no icon, for an accordion that is not a checklist.
   */
  status?: 'done' | 'todo';
  expanded: boolean;
  onToggle: () => void;
  /** A dot beside the label: this section holds edits that have not been saved. */
  isDirty?: boolean;
  /**
   * Pin the row to the top of the scroll **on web**, where the caller has wrapped this header and
   * its panel in one container. Ignored on native, which pins through `stickyHeaderIndices`
   * instead — `position: 'sticky'` is not a value React Native accepts.
   */
  sticky?: boolean;
}

export function AccordionHeader({
  label,
  detail,
  status,
  expanded,
  onToggle,
  isDirty = false,
  sticky = false,
}: AccordionHeaderProps) {
  const isDark = useActiveTheme() === 'dark';
  const secondary = getThemeColor(isDark, 'textSecondary');
  const isDone = status === 'done';

  // `zIndex` keeps the row above its own panel, which is its next sibling inside the wrapper.
  const stickyStyle: StyleProp<ViewStyle> =
    sticky && Platform.OS === 'web' ? ({ position: 'sticky', top: 0, zIndex: 1 } as any) : undefined;

  return (
    <View
      style={stickyStyle}
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 ${
        expanded ? 'rounded-t-2xl border-b-0' : 'rounded-2xl'
      }`}
    >
      <TouchableOpacity
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${label}${status ? `, ${isDone ? 'done' : 'to do'}` : ''}${
          isDirty ? ', unsaved changes' : ''
        }`}
        activeOpacity={0.8}
        className="flex-row items-center gap-3 px-4 py-3.5"
      >
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2">
            <Text className="font-orbitron-bold text-[11px] text-slate-800 dark:text-white uppercase tracking-widest">
              {label}
            </Text>
            {/* Collapsing a section does not discard what was typed into it, and one save bar
                covers the whole screen — so without this there is no way to tell which closed
                section the bar is talking about. */}
            {isDirty && <View className="w-1.5 h-1.5 rounded-full bg-brand-orange" />}
          </View>
          {/* The detail is *information* — "3 divisions · 2 organisers" — and stays neutral in
              both states. Colouring it green made it do the status word's job, at 1.67:1 on a
              light surface, which is the contrast rule twice over. */}
          {!!detail && (
            <Text className="font-inter text-[11px] mt-0.5 text-slate-500 dark:text-slate-400" numberOfLines={1}>
              {detail}
            </Text>
          )}
        </View>

        {/* Where a section stands, said in a word rather than drawn as a circle.
            An empty `ellipse-outline` in the leading slot read as an unselected radio button —
            an invitation to pick one section of five — which is the opposite of what a checklist
            row means. The word carries the state without relying on colour alone, and green is
            the light-safe `success` token, never `brand.green`, which fails on white. */}
        {!!status && (
          <View className="flex-row items-center gap-1">
            {isDone && <Ionicons name="checkmark" size={13} color={getThemeColor(isDark, 'success')} />}
            <Text
              className={`font-inter-bold text-[10px] uppercase tracking-widest ${
                isDone ? 'text-emerald-800 dark:text-brand-green' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {isDone ? 'Done' : 'To do'}
            </Text>
          </View>
        )}

        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={secondary} />
      </TouchableOpacity>
    </View>
  );
}
