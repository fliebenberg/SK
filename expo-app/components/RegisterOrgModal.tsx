import React, { useEffect, useState } from 'react';
import { Modal, Text, TextInput, View } from 'react-native';
import { ORG_SHORT_CODE_MAX_LENGTH, Organization, SocketAction } from '@sk/shared';
import { Button } from './Button';
import { FieldLabel } from './FieldLabel';
import { sendAction } from '../services/actions';
import { useOrgShortCode } from '../hooks/useOrgShortCode';
import { useActiveTheme } from '../store/settingsStore';
import { getThemeColor } from '../constants/Colors';

/**
 * Registering an organisation that is not on the system yet — somebody else's, unclaimed.
 *
 * **Wherever an organisation is chosen for something, it can be created there** (settled
 * 2026-09-21). An organiser putting a fixture or a tournament together who finds the visiting
 * school missing should not have to leave, create it somewhere else, and come back — that is the
 * friction that gets a feature abandoned on its first real use. Two screens did this with near
 * identical inline copies, and the tournament entrants screen, which chooses organisations too,
 * had none at all. This is the one component all three use.
 *
 * **It creates an unclaimed organisation, and that is not the same act as creating your own.**
 * The organisations directory's "Add organisation" makes *you* its admin — you run it. This one
 * records a school you do not run, so nobody is made an admin and it waits to be claimed. That is
 * why the directory keeps its own dialog rather than using this: merging them would blur "I run
 * this" with "somebody else runs this", which is exactly the line the claim process exists to hold.
 *
 * **The contact email is handed back, not sent.** One caller invites the contact straight away;
 * another holds the invitation until the form around it is saved. Which is right depends on the
 * caller, so the dialog creates the organisation and returns the address, and the caller decides.
 */
export interface RegisterOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-fills the name — usually whatever was typed into the search that found nothing. */
  initialName?: string;
  /** The sport it plays, if the caller knows, so the new organisation is offered for it. */
  sportId?: string;
  /** Created. `contactEmail` is the caller's to invite now, later, or not at all. */
  onRegistered: (org: Organization, contactEmail: string) => void;
}

export function RegisterOrgModal({ isOpen, onClose, initialName, sportId, onRegistered }: RegisterOrgModalProps) {
  const isDark = useActiveTheme() === 'dark';
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const shortCode = useOrgShortCode();

  // Fresh each time it opens, seeded from the search that found nothing.
  useEffect(() => {
    if (!isOpen) return;
    const seeded = (initialName || '').trim();
    setName(seeded);
    setContactEmail('');
    shortCode.reset();
    if (seeded) shortCode.onNameChange(seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const canSave = !!name.trim() && !!shortCode.shortCode && !isSaving;

  const handleSave = () => {
    if (!canSave) return;
    setIsSaving(true);
    sendAction(SocketAction.ADD_ORG, {
      name: name.trim(),
      shortName: shortCode.shortCode,
      joinPolicy: 'request',
      supportedSportIds: sportId ? [sportId] : [],
      isClaimed: false,
    } as any).then(result => {
      setIsSaving(false);
      // A refusal is already toasted; the dialog stays open with what was typed.
      if (!result.ok) return;
      onRegistered(result.data, contactEmail.trim());
      onClose();
    });
  };

  const inputClass =
    'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-800 dark:text-white';

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-center px-6">
        <View className="w-full max-w-md self-center bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-white/5 shadow-xl space-y-4">
          <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white uppercase tracking-wider">
            Register an organisation
          </Text>
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 leading-4">
            For a school or club that is not on ScoreKeeper yet. It is added unclaimed — nobody runs it
            until somebody from there claims it.
          </Text>

          <View className="space-y-1.5">
            <FieldLabel label="Full name" />
            <TextInput
              value={name}
              onChangeText={text => {
                setName(text);
                shortCode.onNameChange(text);
              }}
              placeholder="e.g. St John's College"
              placeholderTextColor={getThemeColor(isDark, 'placeholder')}
              className={inputClass}
            />
          </View>

          {/* Required, but filled in from the name as it is typed — see `useOrgShortCode`. */}
          <View className="space-y-1.5">
            <FieldLabel label="Short code" help="Used wherever the full name will not fit — tabs, columns and team flags." />
            <TextInput
              value={shortCode.shortCode}
              onChangeText={shortCode.onShortCodeChange}
              maxLength={ORG_SHORT_CODE_MAX_LENGTH}
              autoCapitalize="characters"
              autoCorrect={false}
              spellCheck={false}
              placeholder="SJC"
              placeholderTextColor={getThemeColor(isDark, 'placeholder')}
              className={`${inputClass} font-orbitron-bold w-32 text-center`}
            />
          </View>

          <View className="space-y-1.5">
            <FieldLabel
              label="Contact email"
              optional
              help="If you know who runs this school or club — the head of sport, the club secretary — we can invite them to claim it and take over their teams and schedules."
            />
            <TextInput
              value={contactEmail}
              onChangeText={setContactEmail}
              placeholder="contact@school.edu"
              placeholderTextColor={getThemeColor(isDark, 'placeholder')}
              keyboardType="email-address"
              autoCapitalize="none"
              className={inputClass}
            />
          </View>

          <View className="flex-row gap-3 pt-2">
            <Button title="Cancel" variant="secondary" onPress={onClose} className="flex-1" />
            <Button
              title={isSaving ? 'Registering...' : 'Register'}
              onPress={handleSave}
              disabled={!canSave}
              className="flex-1"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
