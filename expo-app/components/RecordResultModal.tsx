import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Game, SocketAction, gameResultScores, isResultNotProvided } from '@sk/shared';
import { useActiveTheme } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { sendAction } from '../services/actions';
import { GlassCard } from './GlassCard';
import { Button } from './Button';
import { themeColor } from '../constants/Colors';


interface RecordResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: Game;
  /** A label for each of `game.participants`, in the same order. */
  sideLabels: string[];
  /** Called with the finished match once the server has saved it — and only then. */
  onRecorded?: (game: Game) => void;
}

/**
 * Record a match's result after the fact — or that nobody knows it (2026-09-21).
 *
 * The one way to finish a match outside live scoring. **Score not provided** is a result in its own
 * right: the match is finished and counts toward no table, which is better than making somebody
 * invent a score to close it. Opening this on a finished match prefills what was recorded, so saving
 * again corrects it.
 */
export const RecordResultModal: React.FC<RecordResultModalProps> = ({ isOpen, onClose, game, sideLabels, onRecorded }) => {
  const isDark = useActiveTheme() === 'dark';
  const sides = game.participants || [];

  const [scores, setScores] = useState<Record<string, string>>({});
  const [notProvided, setNotProvided] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Start from what is recorded each time the dialog opens, not from an abandoned earlier attempt.
  useEffect(() => {
    if (!isOpen) return;
    const known = gameResultScores(game) || {};
    setScores(Object.fromEntries(sides.map(p => [p.id, known[p.id] !== undefined ? String(known[p.id]) : ''])));
    setNotProvided(isResultNotProvided(game.finalScoreData));
  }, [isOpen, game]);

  const parsed = sides.map(p => Number((scores[p.id] ?? '').trim()));
  const scoresComplete = sides.every((p, i) => (scores[p.id] ?? '').trim() !== '' && Number.isFinite(parsed[i]) && parsed[i] >= 0);
  const sidesKnown = sides.length >= 2 && sides.every(p => p.teamId || p.orgProfileId || p.entrantId);
  const canSave = sidesKnown && (notProvided || scoresComplete);

  // As the scoring panel credits a log entry: the caller's own profile, the system one for an app admin.
  const initiatorId = (): string | undefined => {
    const { user, orgMemberships = [] } = useAuthStore.getState() as any;
    if (!user) return undefined;
    if (user.globalRole === 'admin') {
      const adminMem = orgMemberships.find((m: any) => m.orgId === 'org-system-admins');
      if (adminMem?.orgProfileId) return adminMem.orgProfileId;
    }
    return orgMemberships[0]?.orgProfileId || undefined;
  };

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    const result = await sendAction(SocketAction.RECORD_GAME_RESULT, {
      id: game.id,
      ...(notProvided
        ? { notProvided: true }
        : { scores: Object.fromEntries(sides.map((p, i) => [p.id, parsed[i]])) }),
      initiatorOrgProfileId: initiatorId(),
    });
    setIsSaving(false);
    // A refusal is already announced; the dialog stays open with what was typed.
    if (!result.ok) return;
    onRecorded?.(result.data);
    onClose();
  };

  return (
    <Modal transparent visible={isOpen} animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-overlay/75 items-center justify-center p-6">
        <GlassCard
          className="w-full max-w-sm border border-line p-6 gap-4 shadow-lg"
          style={{ backgroundColor: themeColor(isDark, 'popover') }}
        >
          <View className="items-center">
            <View className="w-12 h-12 rounded-full items-center justify-center mb-3 bg-primary-soft">
              <Ionicons name="trophy-outline" size={24} color={themeColor(isDark, 'primary')} />
            </View>
            <Text className="font-orbitron-bold text-base text-ink uppercase tracking-wider text-center">
              Record Result
            </Text>
            <Text className="font-inter text-xs text-ink-muted text-center mt-2 leading-relaxed">
              Saving finishes the match and updates the standings.
            </Text>
          </View>

          {!sidesKnown ? (
            <Text className="font-inter text-xs text-danger-ink text-center">
              Both sides must be known before a result can be recorded.
            </Text>
          ) : (
            <View className="gap-3">
              {sides.map((p, i) => (
                <View key={p.id} className="flex-row items-center justify-between gap-3">
                  <Text className="font-inter-bold text-sm text-ink flex-1" numberOfLines={1}>
                    {sideLabels[i] || `Side ${i + 1}`}
                  </Text>
                  <TextInput
                    value={notProvided ? '' : scores[p.id] ?? ''}
                    onChangeText={text => setScores(prev => ({ ...prev, [p.id]: text.replace(/[^0-9.]/g, '') }))}
                    editable={!notProvided}
                    keyboardType="numeric"
                    placeholder={notProvided ? '–' : '0'}
                    placeholderTextColor={themeColor(isDark, 'ink-muted')}
                    accessibilityLabel={`Score for ${sideLabels[i] || `side ${i + 1}`}`}
                    className={`w-20 text-center font-orbitron-bold text-lg px-3 py-2 rounded-xl border border-line bg-field text-ink ${
                      notProvided ? 'opacity-40' : ''
                    }`}
                  />
                </View>
              ))}

              <TouchableOpacity
                onPress={() => setNotProvided(v => !v)}
                activeOpacity={0.8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: notProvided }}
                className="flex-row items-start gap-2.5 pt-3 border-t border-line-soft"
              >
                <Ionicons
                  name={notProvided ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={notProvided ? themeColor(isDark, 'primary') : themeColor(isDark, 'ink-muted')}
                />
                <View className="flex-1">
                  <Text className="font-inter-bold text-sm text-ink">Score not provided</Text>
                  <Text className="font-inter text-[11px] text-ink-muted mt-0.5 leading-relaxed">
                    The match was played but nobody has the score. It is marked finished and left out of the standings.
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          <View className="flex-row gap-3 pt-2">
            <Button title="Cancel" variant="ghost" onPress={onClose} disabled={isSaving} className="flex-1 min-h-[40px] py-2" />
            <Button
              title="Save Result"
              variant="primary"
              onPress={handleSave}
              isLoading={isSaving}
              disabled={isSaving || !canSave}
              className="flex-1 min-h-[40px] py-2"
            />
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
};
