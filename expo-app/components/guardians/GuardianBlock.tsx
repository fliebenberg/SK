import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OrgMinorsSettings, isUnderAge } from '@sk/shared';
import { GuardianDraftFields } from './GuardianDraftFields';
import { GuardianDraft, emptyGuardianDraft, isGuardianDraftStarted } from './guardianDraft';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

interface GuardianBlockProps {
  orgId: string;
  draft: GuardianDraft;
  onChange: (draft: GuardianDraft) => void;
  /** `null` until the user opens or closes it; then their choice stands. */
  open: boolean | null;
  onOpenChange: (open: boolean) => void;
  /** The birthdate typed so far, which decides whether the block opens by itself. */
  birthdate?: string;
  settings: OrgMinorsSettings;
  /** The person being added, if they are someone already on record. */
  playerProfileId?: string;
}

/**
 * An optional guardian on an "add a person" form (`MEMBER-3`).
 *
 * Closed, it is one link, "Add a guardian". Opens by itself when the birthdate makes the person a
 * minor under the org's minor age — **age prompts the question, it never answers it**: the block
 * can be closed for a minor and opened for an adult. Closing it discards what was typed, so a
 * closed block never saves a guardian.
 */
export function GuardianBlock({ orgId, draft, onChange, open, onOpenChange, birthdate, settings, playerProfileId }: GuardianBlockProps) {
  const isDark = useActiveTheme() === 'dark';
  const isMinor = isUnderAge(birthdate, settings.minorAge);
  const isOpen = open ?? isMinor;

  const toggle = () => {
    if (isOpen) onChange(emptyGuardianDraft());
    onOpenChange(!isOpen);
  };

  if (!isOpen) {
    return (
      <TouchableOpacity onPress={toggle} accessibilityRole="button" className="flex-row items-center gap-1.5 self-start">
        <Ionicons name="add" size={16} color={themeColor(isDark, 'primary')} />
        <Text className="font-inter-bold text-sm text-primary-ink">Add a guardian</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View className="border border-line rounded-xl p-4 gap-3" style={{ zIndex: 20 }}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-inter-bold text-sm text-ink">Guardian</Text>
          <Text className="font-inter text-xs text-ink-muted mt-0.5">
            {isMinor
              ? `Under ${settings.minorAge}: record the adult who answers for them.`
              : 'A parent or other adult who answers for this person.'}
            {isGuardianDraftStarted(draft) ? '' : ' Leave empty to add them without one.'}
          </Text>
        </View>
        <TouchableOpacity onPress={toggle} accessibilityRole="button" hitSlop={8}>
          <Text className="font-inter-bold text-sm text-ink-muted">Remove</Text>
        </TouchableOpacity>
      </View>
      <GuardianDraftFields orgId={orgId} draft={draft} onChange={onChange} excludeProfileId={playerProfileId} />
    </View>
  );
}
