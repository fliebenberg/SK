import React from 'react';
import { Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/Colors';

/**
 * The bar at the top of a pushed screen: back on the left, the screen's name in the middle.
 *
 * Extracted 2026-09-11 while the tournament setup accordion became a screen per step (U48), which
 * would otherwise have added four more hand-written copies of it. Every admin screen in the app
 * carries this markup inline and they are identical to the character — `UI-10` covers converting
 * the ones this change did not touch.
 *
 * **The title slot is a fixed-width spacer on the right, not `justify-between` alone.** The title
 * is centred in the row, so without something the same width as the back control on the other
 * side it is centred in what is left over and drifts as the label changes.
 *
 * `onBack` rather than an href, because a screen with unsaved edits routes its back through
 * `confirmThenNavigate` and one with none routes it through
 * [`useSafeBack`](file:///c:/Fred/Coding/SK/expo-app/hooks/useSafeBack.ts) — the component should
 * not have to know which.
 */
export interface ScreenHeaderProps {
  title: string;
  /**
   * What the screen's subject belongs to — a tournament's name in front of `Basic Info`, so the
   * screen says *whose* basic info it is (U49). Rendered as `{context} - {title}`.
   *
   * **Dropped below 768px rather than wrapped or truncated.** One centred line is the right shape
   * for this, but `Fred's Test Tournament - Basic Info` does not fit a phone, and the end is what
   * `numberOfLines={1}` clips — which would drop the half that names the screen and keep the half
   * that does not. So the wide layout gets both and the narrow one gets the title alone, where the
   * question "which tournament" barely arises: a phone reached this screen by tapping a row on
   * that tournament's own checklist, one screen back.
   */
  context?: string;
  onBack: () => void;
  /** An action on the right. Replaces the spacer, so it should be about as wide as "Back". */
  right?: React.ReactNode;
  backLabel?: string;
}

export function ScreenHeader({ title, context, onBack, right, backLabel = 'Back' }: ScreenHeaderProps) {
  /**
   * 768px, the breakpoint [selection.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/events/%5BeventId%5D/games/%5BgameId%5D/selection.tsx)
   * already uses and the one `UI-11` names as this repo's precedent.
   *
   * Static web export renders at a width of 0 before hydration, so the first paint takes the
   * narrow branch and the wide one arrives with the real measurement. That is the safe way round:
   * the title alone is always correct, and the context is an enhancement on top of it.
   */
  const { width } = useWindowDimensions();
  const showContext = !!context && width >= 768;

  return (
    <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
      <TouchableOpacity onPress={onBack} className="flex-row items-center gap-1 active:opacity-85">
        <Ionicons name="chevron-back" size={20} color={COLORS.brand.orange} />
        <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
          {backLabel}
        </Text>
      </TouchableOpacity>
      <Text
        className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase flex-1 text-center px-4"
        numberOfLines={1}
      >
        {showContext ? `${context} - ${title}` : title}
      </Text>
      {right ?? <View className="w-10" />}
    </View>
  );
}
