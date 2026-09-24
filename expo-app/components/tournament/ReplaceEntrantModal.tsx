import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  CandidateTeam,
  SocketAction,
  TournamentDivision,
  TournamentEntrant,
  divisionsForTeam,
} from '@sk/shared';
import { GlassCard } from '../GlassCard';
import { Button } from '../Button';
import CustomSelect from '../CustomSelect';
import { FieldLabel } from '../FieldLabel';
import { sendAction } from '../../services/actions';
import { useActiveTheme } from '../../store/settingsStore';
import { getThemeColor } from '../../constants/Colors';

/**
 * Put somebody else in an entrant's place without redrawing (2026-09-24).
 *
 * One dialog for the three times an organiser needs it: a placeholder is confirmed, a team pulls
 * out and a replacement has been found, and — from the Fixtures step — a late entry is swapped into
 * a withdrawn team's remaining fixtures. The server decides which of two things happens
 * (`REPLACE_ENTRANT`), and the dialog says which **before** it is confirmed, because the difference
 * is the organiser's table: with nothing played the replacement simply becomes the entrant; with
 * results, the old team keeps them and stays in the table as withdrawn.
 */
export interface ReplaceEntrantModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The workspace acting — the gate's `orgId`. */
  orgId: string;
  division: TournamentDivision;
  /** Who is being replaced. */
  entrant: TournamentEntrant | null;
  /** Every team that could be entered; filtered here to this division and to teams not playing. */
  candidateTeams: CandidateTeam[];
  /** Every entrant in the tournament, so a team already playing anywhere is not offered. */
  tournamentEntrants: TournamentEntrant[];
  /**
   * Entrants already in this division but not in the draw — the late entries. Offered first when
   * there are any, since swapping one in is usually why the organiser is here.
   */
  lateEntrants?: TournamentEntrant[];
  /** Fixtures the entrant still has to play, when the caller knows — makes the sentence concrete. */
  unplayedCount?: number;
}

type Kind = 'late' | 'team' | 'placeholder';

export function ReplaceEntrantModal({
  isOpen,
  onClose,
  orgId,
  division,
  entrant,
  candidateTeams,
  tournamentEntrants,
  lateEntrants = [],
  unplayedCount,
}: ReplaceEntrantModalProps) {
  const isDark = useActiveTheme() === 'dark';
  const [kind, setKind] = useState<Kind>('team');
  const [teamId, setTeamId] = useState('');
  const [lateId, setLateId] = useState('');
  const [label, setLabel] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setKind(lateEntrants.length ? 'late' : 'team');
    setTeamId('');
    setLateId(lateEntrants.length === 1 ? lateEntrants[0].id : '');
    setLabel('');
    setError(null);
    // Reset per opening, not per render of the late list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, entrant?.id]);

  /** Teams of this division's sport and age group that are not playing anywhere in the tournament. */
  const teamChoices = useMemo(() => {
    const playing = new Set(
      tournamentEntrants.filter(e => e.status !== 'withdrawn' && e.teamId).map(e => e.teamId as string)
    );
    return candidateTeams.filter(
      team => !playing.has(team.id) && divisionsForTeam(team, [division]).qualifying.length > 0
    );
  }, [candidateTeams, tournamentEntrants, division]);

  if (!entrant) return null;

  const name = entrant.name || entrant.label || 'This entrant';
  const played = entrant.playedCount || 0;
  const incoming =
    kind === 'late'
      ? lateEntrants.find(e => e.id === lateId)?.name
      : kind === 'team'
        ? teamChoices.find(t => t.id === teamId)?.name
        : label.trim() || undefined;
  const who = incoming || 'The replacement';

  const remaining =
    unplayedCount === undefined
      ? 'its remaining fixtures'
      : unplayedCount === 1
        ? 'its 1 remaining fixture'
        : `its ${unplayedCount} remaining fixtures`;

  // The one sentence that matters: what happens to the table.
  const consequence =
    played > 0
      ? `${name} has played ${played === 1 ? 'a fixture' : `${played} fixtures`}. ${
          played === 1 ? 'That result stays' : 'Those results stay'
        } with ${name}, which is marked withdrawn and stays in the table. ${who} takes its place in the draw and ${remaining}.`
      : `${who} takes ${name}'s place in the draw — its seed, its pool and ${
          unplayedCount === undefined ? 'every fixture' : remaining
        }. Nothing is redrawn.`;

  const canSave =
    !isSaving && (kind === 'late' ? !!lateId : kind === 'team' ? !!teamId : !!label.trim());

  const handleSave = () => {
    if (!canSave) return;
    setIsSaving(true);
    setError(null);
    sendAction(
      SocketAction.REPLACE_ENTRANT,
      {
        divisionId: division.id,
        orgId,
        entrantId: entrant.id,
        ...(kind === 'late'
          ? { replacementEntrantId: lateId }
          : kind === 'team'
            ? { teamId }
            : { label: label.trim() }),
      },
      // The refusal is shown in the dialog, where the choice that caused it still is.
      { suppressToast: true }
    ).then(result => {
      setIsSaving(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // The roster, the fixtures and the table all arrive through their rooms.
      onClose();
    });
  };

  const chip = (active: boolean, text: string, onPress: () => void) => (
    <TouchableOpacity
      key={text}
      onPress={onPress}
      className={`px-3 py-1.5 rounded-xl border ${
        active
          ? 'bg-brand-orange/15 border-brand-orange'
          : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5'
      }`}
    >
      <Text
        className={`font-inter text-xs ${
          active ? 'text-brand-orange font-inter-bold' : 'text-slate-600 dark:text-slate-400'
        }`}
      >
        {text}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-slate-950/75 justify-center px-6">
        <GlassCard
          className="w-full max-w-lg self-center border border-slate-200 dark:border-white/10 p-5 shadow-lg"
          style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }}
        >
          <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white uppercase tracking-wider mb-1">
            Replace
          </Text>
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mb-4" numberOfLines={1}>
            {name} · {division.name}
          </Text>

          <ScrollView className="max-h-[440px]" keyboardShouldPersistTaps="handled">
            <View className="space-y-4">
              <View className="flex-row flex-wrap gap-2">
                {lateEntrants.length > 0 && chip(kind === 'late', 'Already entered', () => setKind('late'))}
                {chip(kind === 'team', 'A team', () => setKind('team'))}
                {chip(kind === 'placeholder', 'A placeholder', () => setKind('placeholder'))}
              </View>

              {kind === 'late' && (
                <View className="space-y-2">
                  <FieldLabel
                    label="Entered, not in the draw"
                    help="Teams entered in this division after its fixtures were generated."
                  />
                  <CustomSelect
                    value={lateId}
                    onChange={setLateId}
                    options={lateEntrants.map(e => ({ value: e.id, label: e.name || e.label || 'TBC' }))}
                    placeholder="Choose an entrant"
                  />
                </View>
              )}

              {kind === 'team' && (
                <View className="space-y-2">
                  <FieldLabel
                    label="Team"
                    help="Teams that qualify for this division and are not playing anywhere else in the tournament."
                  />
                  {teamChoices.length ? (
                    <CustomSelect
                      value={teamId}
                      onChange={setTeamId}
                      options={teamChoices.map(team => ({
                        value: team.id,
                        label: team.name,
                        description: team.orgName,
                      }))}
                      placeholder="Choose a team"
                      showSearch={teamChoices.length > 8}
                    />
                  ) : (
                    <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
                      No team that qualifies is free. Add one on the Entrants screen, or use a placeholder.
                    </Text>
                  )}
                </View>
              )}

              {kind === 'placeholder' && (
                <View className="space-y-2">
                  <FieldLabel
                    label="Description"
                    help="What goes in this place until it is known. Naming it later fills in every fixture at once."
                  />
                  <TextInput
                    value={label}
                    onChangeText={setLabel}
                    placeholder="Replacement to be confirmed"
                    placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white"
                  />
                </View>
              )}

              <Text className="font-inter text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {consequence}
              </Text>

              {!!error && <Text className="font-inter text-xs text-brand-red">{error}</Text>}
            </View>
          </ScrollView>

          <View className="flex-row gap-3 pt-5">
            <Button title="Cancel" variant="secondary" onPress={onClose} className="flex-1" />
            <Button
              title={isSaving ? 'Replacing...' : 'Replace'}
              onPress={handleSave}
              disabled={!canSave}
              className="flex-1"
            />
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
}
