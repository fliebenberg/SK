import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';
import { getThemeColor } from '../constants/Colors';

/**
 * Where one card of a read-first page is edited (design_system.md, *Read-first record pages*).
 *
 * The page shows values as text; each card's Edit opens its fields here, and Save writes only
 * those fields. Centred on a wide screen, a bottom sheet below 768px. Added 2026-10-01 for the org
 * Profile and Settings pages.
 *
 * **Closing with unsaved edits asks first, inside the dialog.** The footer turns into "Discard your
 * changes?" rather than a second modal on top, which React Native Web stacks unreliably. Pass
 * `isDirty` and the dialog does the rest; the caller's `onClose` runs only once the edits are
 * really to go.
 *
 * **Save failing keeps the dialog open.** The caller's `onSave` sends through `sendAction`, which
 * has already said what went wrong; the dialog closes only when the caller sets `visible` false.
 */
export interface EditDialogProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Omit for a dialog with nothing to save (the footer then shows Close). */
  onSave?: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  isSaving?: boolean;
  isDirty?: boolean;
  /** Something quieter at the left of the footer, such as "Remove address". */
  footerLeft?: React.ReactNode;
  children: React.ReactNode;
}

export function EditDialog({
  visible, title, onClose, onSave, saveLabel = 'Save', saveDisabled, isSaving, isDirty, footerLeft, children,
}: EditDialogProps) {
  const isDark = useActiveTheme() === 'dark';
  const { width } = useWindowDimensions();
  const isSheet = width < 768;
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  useEffect(() => {
    if (!visible) setConfirmingDiscard(false);
  }, [visible]);

  const requestClose = () => {
    if (isSaving) return;
    if (isDirty) setConfirmingDiscard(true);
    else onClose();
  };

  return (
    <Modal transparent visible={visible} animationType={isSheet ? 'slide' : 'fade'} onRequestClose={requestClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View className={`flex-1 bg-slate-950/60 ${isSheet ? 'justify-end' : 'items-center justify-center p-6'}`}>
          <Pressable className="absolute inset-0" onPress={requestClose} accessibilityLabel="Close" />
          <View
            className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 ${
              isSheet ? 'w-full rounded-t-3xl' : 'w-full max-w-lg rounded-2xl'
            }`}
            style={{ maxHeight: isSheet ? '92%' : '90%' }}
          >
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/5">
              <Text className="font-inter-bold text-base text-slate-900 dark:text-white flex-1 mr-3" numberOfLines={1}>
                {title}
              </Text>
              <TouchableOpacity onPress={requestClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={getThemeColor(isDark, 'textSecondary')} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
              {children}
            </ScrollView>

            <View className={`flex-row items-center gap-2 px-5 py-3 border-t border-slate-200 dark:border-white/5 ${isSheet ? 'pb-6' : ''}`}>
              {confirmingDiscard ? (
                <>
                  <Text className="font-inter-semibold text-sm text-slate-700 dark:text-slate-200 flex-1">Discard your changes?</Text>
                  <DialogButton label="Keep editing" variant="ghost" onPress={() => setConfirmingDiscard(false)} />
                  <DialogButton label="Discard" variant="danger" onPress={() => { setConfirmingDiscard(false); onClose(); }} />
                </>
              ) : (
                <>
                  <View className="flex-1 flex-row">{footerLeft}</View>
                  {onSave ? (
                    <>
                      <DialogButton label="Cancel" variant="ghost" onPress={requestClose} disabled={isSaving} />
                      <DialogButton label={saveLabel} onPress={onSave} disabled={saveDisabled || isSaving} loading={isSaving} />
                    </>
                  ) : (
                    <DialogButton label="Close" variant="ghost" onPress={onClose} />
                  )}
                </>
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DialogButton({ label, onPress, variant = 'primary', disabled, loading }: {
  label: string; onPress: () => void; variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; loading?: boolean;
}) {
  const classes = {
    primary: 'bg-brand-orange border-brand-orange',
    ghost: 'bg-transparent border-slate-200 dark:border-white/10',
    danger: 'bg-red-600 border-red-600',
  }[variant];
  const text = variant === 'ghost' ? 'text-slate-700 dark:text-slate-200' : 'text-white';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      className={`min-h-[40px] px-4 rounded-xl border items-center justify-center ${classes} ${disabled ? 'opacity-40' : ''}`}
    >
      {loading ? <ActivityIndicator size="small" color="white" /> : <Text className={`font-inter-bold text-sm ${text}`}>{label}</Text>}
    </TouchableOpacity>
  );
}

/** A label-and-value row on a read-first card. */
export function ReadRow({ label, value, sub, right }: { label: string; value?: React.ReactNode; sub?: string; right?: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-4 py-2.5">
      <View className="flex-1 min-w-0">
        <Text className="font-inter-semibold text-sm text-slate-800 dark:text-white">{label}</Text>
        {sub ? <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</Text> : null}
      </View>
      {value !== undefined ? <View className="flex-row items-center gap-3">{typeof value === 'string' ? <Text className="font-inter text-sm text-slate-600 dark:text-slate-300">{value}</Text> : value}</View> : null}
      {right}
    </View>
  );
}
