import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { Button } from './Button';
import { themeColor } from '../constants/Colors';
import { useActiveTheme } from '../store/settingsStore';

/** One thing *Save mine anyway* would replace: what is saved now, and what this save puts there. */
export interface EditConflictRow {
  key: string;
  label: string;
  theirs: string;
  yours: string;
}

interface EditConflictModalProps {
  /** Open while a save is refused over a change made since the form was opened. */
  isOpen: boolean;
  /** The server's refusal, which says who changed what. */
  message: string;
  /** Each field (or player) whose saved value this save would replace. */
  rows: EditConflictRow[];
  /** Drop these edits and show what is saved now. */
  onShowTheirs: () => void;
  /** Save again over the change just reported. Only offered once the rows have been seen. */
  onSaveAnyway: () => void;
  /** Close and keep the edits as they are, unsaved. */
  onClose: () => void;
  isProcessing?: boolean;
}

/**
 * A save refused because someone else changed the same thing after the form was opened (`SYNC-11`).
 *
 * Says who changed what, and offers three ways on: show their version (drop these edits), keep
 * editing, or *Save mine anyway* — which first lists exactly what would be replaced, theirs beside
 * yours, and saves only when confirmed. The save it sends is based on the values just reported, so
 * a third change made in the meantime is refused in turn rather than overwritten unseen.
 */
export function EditConflictModal({ isOpen, message, rows, onShowTheirs, onSaveAnyway, onClose, isProcessing = false }: EditConflictModalProps) {
  const isDark = useActiveTheme() === 'dark';
  const [step, setStep] = useState<'clash' | 'confirm'>('clash');

  // Each refusal starts at its own explanation, even when the last one ended on the list.
  useEffect(() => {
    if (isOpen) setStep('clash');
  }, [isOpen, message]);

  return (
    <Modal transparent visible={isOpen} animationType="fade" onRequestClose={isProcessing ? undefined : onClose}>
      <View className="flex-1 bg-overlay/75 items-center justify-center p-6">
        <GlassCard
          className="w-full max-w-md border border-line p-6 gap-4 shadow-lg"
          style={{ backgroundColor: themeColor(isDark, 'popover'), maxHeight: '85%' }}
        >
          <View className="items-center">
            <View className="w-12 h-12 rounded-full items-center justify-center mb-3 bg-warning-soft">
              <Ionicons name="people-outline" size={24} color={themeColor(isDark, 'warning-ink')} />
            </View>
            <Text className="font-orbitron-bold text-base text-ink uppercase tracking-wider text-center">
              {step === 'clash' ? 'Changed by someone else' : 'Replace their changes?'}
            </Text>
            <Text testID="edit-conflict-message" className="font-inter text-xs text-ink-muted text-center mt-2 leading-relaxed">
              {step === 'clash'
                ? message
                : 'Saving yours replaces what is saved now:'}
            </Text>
          </View>

          {step === 'confirm' && (
            <ScrollView className="border border-line rounded-xl" style={{ maxHeight: 320 }}>
              {rows.map((row, i) => (
                <View key={row.key} testID="edit-conflict-row" className={`px-3 py-2.5 gap-1 ${i ? 'border-t border-line' : ''}`}>
                  <Text className="font-inter-semibold text-xs text-ink">{row.label}</Text>
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Text className="font-inter text-[10px] text-ink-muted uppercase tracking-wider">Saved now</Text>
                      <Text className="font-inter text-xs text-ink-soft line-through">{row.theirs}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-inter text-[10px] text-ink-muted uppercase tracking-wider">Yours</Text>
                      <Text className="font-inter-semibold text-xs text-ink">{row.yours}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {step === 'clash' ? (
            <View className="gap-2 pt-2">
              <Button
                testID="edit-conflict-save-anyway"
                title="Save mine anyway"
                variant="primary"
                onPress={() => setStep('confirm')}
                disabled={isProcessing || rows.length === 0}
                className="min-h-[40px] py-2"
              />
              <View className="flex-row gap-3">
                <Button title="Show theirs" variant="ghost" onPress={onShowTheirs} disabled={isProcessing} className="flex-1 min-h-[40px] py-2" />
                <Button title="Keep editing" variant="ghost" onPress={onClose} disabled={isProcessing} className="flex-1 min-h-[40px] py-2" />
              </View>
            </View>
          ) : (
            <View className="flex-row gap-3 pt-2">
              <Button title="Back" variant="ghost" onPress={() => setStep('clash')} disabled={isProcessing} className="flex-1 min-h-[40px] py-2" />
              <Button
                testID="edit-conflict-confirm"
                title="Replace them"
                variant="danger"
                onPress={onSaveAnyway}
                isLoading={isProcessing}
                disabled={isProcessing}
                className="flex-1 min-h-[40px] py-2"
              />
            </View>
          )}
        </GlassCard>
      </View>
    </Modal>
  );
}
