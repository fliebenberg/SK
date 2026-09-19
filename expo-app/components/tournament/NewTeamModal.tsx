import React, { useEffect, useState } from 'react';
import { Modal, Text, TextInput, View } from 'react-native';
import { SocketAction, Team } from '@sk/shared';
import { GlassCard } from '../GlassCard';
import { Button } from '../Button';
import { wsService } from '../../services/websocket';
import { useActiveTheme } from '../../store/settingsStore';
import { getThemeColor } from '../../constants/Colors';

export interface NewTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The organisation the team belongs to — the school being entered, not the host. */
  orgId: string;
  orgName: string;
  /** Pre-filled from the division being entered, and read-only: they are what makes it qualify. */
  sportId?: string;
  /** The division's age group — what the new team is given, so it qualifies. */
  ageGroupId?: string | null;
  /** Its name, for display. */
  ageGroup?: string;
  sportName?: string;
  onCreated: (team: Team) => void;
}

/**
 * Create a team from inside the entry screen (U21).
 *
 * This belongs on the **organisation** axis, because that is the moment you discover it is needed:
 * you are going down Northcliff's list putting them into fifteen divisions, and there is no u16
 * netball team on the system. Sending the organiser away to the teams screen and back is the
 * friction that gets a feature abandoned during its first real use.
 *
 * The sport and age group are shown but not editable. They are not decoration — they are the two
 * fields that decide whether the new team qualifies for the division it is being created for, so
 * letting them be changed here would produce a team that cannot be entered into the division that
 * prompted it.
 */
export function NewTeamModal({
  isOpen,
  onClose,
  orgId,
  orgName,
  sportId,
  ageGroupId,
  ageGroup,
  sportName,
  onCreated,
}: NewTeamModalProps) {
  const isDark = useActiveTheme() === 'dark';
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seeded rather than left blank: the name an organiser wants is almost always the age group, and
  // one that is already right is faster to accept than an empty box is to fill.
  useEffect(() => {
    if (isOpen) {
      setName(ageGroup || '');
      setError(null);
    }
  }, [isOpen, ageGroup]);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed || !sportId) return;
    setIsSaving(true);
    setError(null);
    wsService.emit(
      'action',
      {
        type: SocketAction.ADD_TEAM,
        payload: {
          name: trimmed,
          ageGroupId: ageGroupId || null,
          sportId,
          orgId,
          isActive: true,
        },
      },
      (res: any) => {
        setIsSaving(false);
        if (res?.id) {
          onCreated(res as Team);
          onClose();
        } else {
          setError(res?.error || 'That team could not be created.');
        }
      }
    );
  };

  return (
    <Modal transparent visible={isOpen} animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-slate-950/75 items-center justify-center p-6">
        <GlassCard
          className="w-full max-w-sm border border-slate-200 dark:border-white/10 p-6 space-y-4 shadow-lg"
          style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }}
        >
          <View>
            <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white uppercase tracking-wider">
              New team
            </Text>
            <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-1">
              {orgName} has no {[ageGroup, sportName].filter(Boolean).join(' ') || 'matching'} team
              yet. Creating one here enters it straight away.
            </Text>
          </View>

          <View>
            <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
              Team name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              autoFocus
              placeholder="u16A"
              placeholderTextColor={getThemeColor(isDark, 'placeholder')}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white"
            />
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
                Sport
              </Text>
              <Text className="font-inter text-xs text-slate-700 dark:text-slate-300">
                {sportName || 'Not set'}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
                Age group
              </Text>
              <Text className="font-inter text-xs text-slate-700 dark:text-slate-300">
                {ageGroup || 'Any'}
              </Text>
            </View>
          </View>

          {!!error && (
            <Text className="font-inter text-[11px] text-red-500 dark:text-red-400">{error}</Text>
          )}

          <View className="flex-row gap-3 pt-1">
            <Button
              title="Cancel"
              variant="ghost"
              onPress={onClose}
              disabled={isSaving}
              className="flex-1 min-h-[40px] py-2"
            />
            <Button
              title="Create and enter"
              variant="primary"
              onPress={handleCreate}
              disabled={isSaving || !name.trim() || !sportId}
              isLoading={isSaving}
              className="flex-1 min-h-[40px] py-2"
            />
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
}
