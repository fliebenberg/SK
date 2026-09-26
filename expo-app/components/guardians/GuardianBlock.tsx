import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OrgMinorsSettings, isUnderAge } from '@sk/shared';
import { GuardianDraftFields } from './GuardianDraftFields';
import { GuardianDraft, emptyGuardianDraft, isGuardianDraftStarted } from './guardianDraft';

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
 * An optional guardian on an "add a player" form (`MEMBER-3`).
 *
 * Opens by itself when the birthdate makes the player a minor under the org's minor age — **age
 * prompts the question, it never answers it**: the block can be closed for a minor and opened for an
 * adult. Closing it discards what was typed, so a closed block never saves a guardian.
 */
export function GuardianBlock({ orgId, draft, onChange, open, onOpenChange, birthdate, settings, playerProfileId }: GuardianBlockProps) {
  const isMinor = isUnderAge(birthdate, settings.minorAge);
  const isOpen = open ?? isMinor;

  const toggle = () => {
    if (isOpen) onChange(emptyGuardianDraft());
    onOpenChange(!isOpen);
  };

  return (
    <View className="border border-slate-200 dark:border-white/5 rounded-xl p-4 mt-2" style={{ zIndex: 20 }}>
      <TouchableOpacity onPress={toggle} className="flex-row items-center justify-between">
        <View className="flex-1 mr-3">
          <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-widest">
            Guardian {isOpen ? '' : '(optional)'}
          </Text>
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isMinor
              ? `Under ${settings.minorAge}: record the adult who answers for them.`
              : 'Record a parent or guardian who answers for this player.'}
          </Text>
        </View>
        <Ionicons name={isOpen ? 'chevron-up' : 'add-circle-outline'} size={18} color="#FF3E00" />
      </TouchableOpacity>
      {isOpen ? (
        <View className="mt-4">
          <GuardianDraftFields orgId={orgId} draft={draft} onChange={onChange} excludeProfileId={playerProfileId} />
          {isGuardianDraftStarted(draft) ? null : (
            <Text className="font-inter text-[11px] text-slate-400 mt-3">Leave empty to add the player without a guardian.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
