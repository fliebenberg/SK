import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FieldLabel } from './FieldLabel';
import { useActiveTheme } from '../store/settingsStore';
import { themeColor } from '../constants/Colors';

/**
 * One card of a read-first page: a label, the values as text, and an Edit link that opens the
 * card's `EditDialog` (design_system.md, *Read-first record pages*).
 *
 * The label is a `FieldLabel`, so a card that needs explaining gets the info icon rather than a
 * standing paragraph. Leave `onEdit` out when the reader cannot edit, or when the card is empty and
 * its empty state carries the action instead (`ReadCardEmpty`) — an empty card with an Edit link
 * offers two ways to do one thing.
 */
export interface ReadCardProps {
  label: string;
  help?: string;
  onEdit?: () => void;
  editLabel?: string;
  /** For a card whose action adds rather than edits — "Add" on a list of guardians. */
  editIcon?: keyof typeof Ionicons.glyphMap;
  /** Amber, for a task that needs doing (a missing administrator). */
  tone?: 'default' | 'attention';
  children?: React.ReactNode;
}

export function ReadCard({ label, help, onEdit, editLabel = 'Edit', editIcon = 'pencil', tone = 'default', children }: ReadCardProps) {
  const attention = tone === 'attention';
  return (
    <View
      className={`rounded-2xl border p-4 gap-2.5 ${
        attention
          ? 'bg-warning-soft border-warning-line'
          : 'bg-card border-line'
      }`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">
          <FieldLabel label={label} help={help} />
        </View>
        {onEdit ? <EditLink label={editLabel} onPress={onEdit} icon={editIcon} /> : null}
      </View>
      {children}
    </View>
  );
}

export function EditLink({ label = 'Edit', onPress, icon = 'pencil' }: { label?: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap | null }) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      className="flex-row items-center gap-1"
    >
      {icon ? <Ionicons name={icon} size={13} color={themeColor(isDark, 'primary')} /> : null}
      <Text className="font-inter-bold text-sm text-primary-ink">{label}</Text>
    </TouchableOpacity>
  );
}

/** What an empty card says: what is missing, and the one action that fills it. */
export function ReadCardEmpty({ text, action, onPress }: { text: string; action?: string; onPress?: () => void }) {
  return (
    <Text className="font-inter text-sm text-ink-muted">
      {text}
      {action && onPress ? (
        <>
          {' '}
          <Text onPress={onPress} accessibilityRole="button" className="font-inter-bold text-primary-ink">
            {action}
          </Text>
        </>
      ) : null}
    </Text>
  );
}
