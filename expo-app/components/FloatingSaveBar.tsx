import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * The admin edit screens' floating save bar.
 *
 * Every admin form that edits a record in place shows the same thing once it is dirty: a card
 * pinned to the bottom naming what changed, with Cancel and Save. It was copy-pasted onto nine
 * screens before this component existed, which is why the markup here is a faithful copy rather
 * than an improvement on it — the point is that the tenth screen and the nine look identical.
 *
 * Pair it with two things on the host screen, or it only half works:
 *
 * 1. `useUnsavedChanges(isDirty, onCancel)` — so leaving the screen warns, and *discarding* runs
 *    the same reset the Cancel button does. A screen that warns but cannot discard is the state
 *    the tournament screen was in before this.
 * 2. `contentContainerStyle={{ paddingBottom: isDirty ? FLOATING_SAVE_BAR_PADDING : 60 }}` on the
 *    scroll container — the bar is absolutely positioned and would otherwise cover the last field.
 *
 * The `active:` pseudo-class below is the codebase-wide `UI-2` debt (`okf/design_system.md` says
 * use `activeOpacity`). It stays for now because this markup must render identically to the nine
 * bars it stands in for; `UI-2` covers changing them all at once.
 */
export interface FloatingSaveBarProps {
  /** Whether there is anything to save. The bar renders nothing when false. */
  visible: boolean;
  /** Heading. Defaults to "Unsaved Changes"; creation screens pass "New Site", "New Team", … */
  title?: string;
  /** The line under the heading — say which record was modified. */
  description?: string;
  saveLabel?: string;
  cancelLabel?: string;
  onSave: () => void;
  onCancel: () => void;
  /** Shows a spinner in place of the Save label and blocks both buttons. */
  isProcessing?: boolean;
  /** Save is unusable because the form is incomplete — dimmed rather than hidden, so the
   *  user can see there is something still to fix rather than wondering where Save went. */
  saveDisabled?: boolean;
}

/** Bottom padding a scroll container needs while the bar is up, so nothing hides behind it. */
export const FLOATING_SAVE_BAR_PADDING = 140;

export function FloatingSaveBar({
  visible,
  title = 'Unsaved Changes',
  description,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
  onSave,
  onCancel,
  isProcessing = false,
  saveDisabled = false,
}: FloatingSaveBarProps) {
  if (!visible) return null;

  return (
    <View className="absolute bottom-6 left-6 right-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-4 rounded-2xl flex-row items-center justify-between shadow-xl z-40">
      <View className="flex-1 mr-4">
        <Text className="font-orbitron-bold text-[10px] text-slate-800 dark:text-white uppercase tracking-wider">
          {title}
        </Text>
        {!!description && (
          <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
            {description}
          </Text>
        )}
      </View>
      <View className="flex-row items-center gap-2.5">
        <TouchableOpacity
          onPress={onCancel}
          disabled={isProcessing}
          className="bg-slate-100 dark:bg-slate-800 px-4 py-2.5 rounded-xl active:scale-95 border border-slate-200 dark:border-white/5"
        >
          <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-300 uppercase tracking-widest">
            {cancelLabel}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSave}
          disabled={isProcessing || saveDisabled}
          className={`px-5 py-2.5 rounded-xl flex-row items-center gap-2 active:scale-95 shadow-md ${
            saveDisabled ? 'bg-brand-orange/40 shadow-none' : 'bg-brand-orange shadow-brand-orange/30'
          }`}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={14} color="white" />
              <Text className="font-orbitron-bold text-[9px] text-white uppercase tracking-widest mt-0.5">
                {saveLabel}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
