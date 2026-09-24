import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { CandidateTeam, Game, GameParticipant, SocketAction } from '@sk/shared';
import { GlassCard } from '../GlassCard';
import { Button } from '../Button';
import CustomSelect from '../CustomSelect';
import { sendAction } from '../../services/actions';
import { wsService } from '../../services/websocket';
import { useAuthStore } from '../../store/authStore';
import { useActiveTheme } from '../../store/settingsStore';

/**
 * Who actually played a tournament fixture (2026-09-24, `FIX-20`).
 *
 * The last-minute case: U14 B turned out instead of U14 A, and the result was recorded against the
 * draw as it stood. Changing it here changes the team shown on that one fixture and nothing else —
 * the result still counts for the place in the draw (the entrant), and the change is written to the
 * fixture's log. It is deliberately **not** the roster: "somebody else from now on" is Replace on
 * the Entrants screen, which keeps every result with whoever earned it.
 *
 * Only sides that belong to a division entrant are offered. A hand-added fixture's teams are
 * edited in the form above, where they always were.
 */
export function ChangeWhoPlayedCard({
  game,
  orgId,
  eventId,
  onChanged,
}: {
  game: Game;
  /** The workspace acting — the gate's `orgId`. */
  orgId: string;
  eventId: string;
  /** The side now names `teamId`, called `name`. The screen keeps its copy of the game in step. */
  onChanged: (participantId: string, teamId: string, name: string) => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [changing, setChanging] = useState<GameParticipant | null>(null);
  const [teams, setTeams] = useState<CandidateTeam[]>([]);
  const [teamId, setTeamId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sides = (game.participants || []).filter(p => !!p.entrantId);

  // What could have played — read when the dialog opens, since most fixtures never need it.
  useEffect(() => {
    if (!changing) return;
    let active = true;
    wsService.emit(
      'get_data',
      { type: 'event_candidate_teams', eventId, divisionId: (game as any).divisionId },
      (res: any) => {
        if (active && res && Array.isArray(res.teams)) setTeams(res.teams);
      }
    );
    return () => {
      active = false;
    };
  }, [changing, eventId, game]);

  const choices = useMemo(() => {
    const onThisFixture = new Set((game.participants || []).map(p => p.teamId).filter(Boolean));
    return teams.filter(team => team.sportId === game.sportId && !onThisFixture.has(team.id));
  }, [teams, game]);

  if (!sides.length) return null;

  const nameOf = (side: GameParticipant) => (side as any).name || (side as any).entrantLabel || 'TBC';

  const close = () => {
    setChanging(null);
    setTeamId('');
    setError(null);
  };

  const save = () => {
    if (!changing || !teamId) return;
    setIsSaving(true);
    setError(null);
    const { user, orgMemberships = [] } = useAuthStore.getState() as any;
    // Credited to the caller's own profile, as a result entry is.
    const initiatorOrgProfileId =
      user?.globalRole === 'admin'
        ? orgMemberships.find((m: any) => m.orgId === 'org-system-admins')?.orgProfileId
        : orgMemberships[0]?.orgProfileId;
    sendAction(
      SocketAction.CHANGE_FIXTURE_SIDE,
      { gameParticipantId: changing.id, orgId, teamId, initiatorOrgProfileId },
      { suppressToast: true }
    ).then(result => {
      setIsSaving(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onChanged(changing.id, teamId, choices.find(t => t.id === teamId)?.name || '');
      close();
    });
  };

  return (
    <GlassCard className="border border-slate-200 dark:border-white/5 p-5 mt-6">
      <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Who played</Text>
      <Text className="font-inter text-xs text-slate-500 mt-0.5 mb-3">
        If another team turned out for one side, change it here. The result still counts for that
        place in the draw.
      </Text>
      <View className="space-y-2">
        {sides.map(side => (
          <View key={side.id} className="flex-row items-center justify-between">
            <Text className="font-inter text-xs text-slate-800 dark:text-white flex-1" numberOfLines={1}>
              {nameOf(side)}
            </Text>
            <TouchableOpacity onPress={() => setChanging(side)} className="px-3 py-1.5 border border-brand-orange rounded-lg">
              <Text className="font-inter-bold text-[10px] text-brand-orange uppercase">Change</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <Modal visible={!!changing} transparent animationType="fade" onRequestClose={close}>
        <View className="flex-1 bg-slate-950/75 justify-center px-6">
          <GlassCard
            className="w-full max-w-lg self-center border border-slate-200 dark:border-white/10 p-5 shadow-lg"
            style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }}
          >
            <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white uppercase tracking-wider mb-1">
              Who played
            </Text>
            <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mb-4">
              Instead of {changing ? nameOf(changing) : ''}, in this match only
            </Text>
            <CustomSelect
              value={teamId}
              onChange={setTeamId}
              options={choices.map(team => ({ value: team.id, label: team.name, description: team.orgName }))}
              placeholder="Choose the team that played"
              showSearch={choices.length > 8}
            />
            <Text className="font-inter text-xs text-slate-600 dark:text-slate-300 leading-relaxed mt-4">
              The fixture will show the team that played, and the change is noted in its log. The result
              still counts for {changing ? nameOf(changing) : 'this side'}'s place in the draw. To put
              another team in that place for the rest of the tournament, use Replace on the Entrants
              screen instead.
            </Text>
            {!!error && <Text className="font-inter text-xs text-brand-red mt-3">{error}</Text>}
            <View className="flex-row gap-3 pt-5">
              <Button title="Cancel" variant="secondary" onPress={close} className="flex-1" />
              <Button
                title={isSaving ? 'Saving...' : 'Save'}
                onPress={save}
                disabled={!teamId || isSaving}
                className="flex-1"
              />
            </View>
          </GlassCard>
        </View>
      </Modal>
    </GlassCard>
  );
}
