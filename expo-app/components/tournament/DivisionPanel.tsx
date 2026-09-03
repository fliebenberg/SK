import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  GameSummary,
  SocketAction,
  TournamentDivision,
  TournamentStage,
  participantLabel,
  hasLiveScore,
} from '@sk/shared';
import { GlassCard } from '../GlassCard';
import { Tabs, TabItem } from '../Tabs';
import { ConfirmationModal } from '../ConfirmationModal';
import { useLiveRoom } from '../../hooks/useLiveRoom';
import { wsService } from '../../services/websocket';
import { useActiveTheme } from '../../store/settingsStore';
import { COLORS, getThemeColor } from '../../constants/Colors';
import { isCollapsed, stageSublabel, structureAnnouncement } from '@sk/shared';

/**
 * One division: its stages, and the fixtures under them.
 *
 * **This is the piece the collapse rule shares** (U15). A tournament with one division renders it
 * inline on the event screen — the event screen *is* the division screen — and a tournament with
 * several gives each one its own screen at
 * `/admin/[orgId]/events/[eventId]/divisions/[divisionId]`. Both mount this, so there is one
 * rendering of a division rather than two that drift.
 *
 * It joins `division:{id}:fixtures`, which is public and carries the division, its stages and its
 * fixtures. The roster and the manual adjustments live in the member-tier `division:{id}` room and
 * are not read here — this panel shows structure and fixtures, which is what Phase 5 delivers.
 * Entrants arrive in Phase 6 and the schedule grid in Phase 7.
 */

export interface DivisionPanelProps {
  orgId: string;
  eventId: string;
  divisionId: string;
  /**
   * Whether this viewer may change the division's structure.
   *
   * Derived by the caller as `canEditEvent || convenesDivisionIds.includes(divisionId)` — one field
   * fewer on the wire than a `canEdit` per division, and no per-user data on a shared object.
   */
  canEdit: boolean;
  /**
   * True when this is the tournament's only division and is therefore being rendered inline.
   * The word "division" does not appear in that case: the concept is collapsed away.
   */
  collapsed?: boolean;
}

export function DivisionPanel({ orgId, eventId, divisionId, canEdit, collapsed = false }: DivisionPanelProps) {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';
  const secondary = getThemeColor(isDark, 'textSecondary');

  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [isAddingStage, setIsAddingStage] = useState(false);
  const [isSavingStage, setIsSavingStage] = useState(false);

  const fixturesRoom = divisionId ? `division:${divisionId}:fixtures` : null;

  const { items: divisions } = useLiveRoom<TournamentDivision>(fixturesRoom, {
    reduce: (message) => {
      switch (message.type) {
        case 'DIVISION_ADDED':
        case 'DIVISION_UPDATED':
          return { kind: 'upsert', item: message.data };
        case 'DIVISION_DELETED':
          return { kind: 'remove', id: message.data?.id };
        default:
          return { kind: 'ignore' };
      }
    },
  });

  const { items: stages } = useLiveRoom<TournamentStage>(fixturesRoom, {
    reduce: (message) => {
      // Stages always arrive as a set, because their order is part of what changed.
      if (message.type === 'STAGES_SYNC') return { kind: 'replace', items: message.data?.stages || [] };
      return { kind: 'ignore' };
    },
  });

  const { items: games, isLoading } = useLiveRoom<GameSummary>(fixturesRoom, {
    reduce: (message) => {
      switch (message.type) {
        case 'DIVISION_GAMES_SYNC':
          return { kind: 'replace', items: message.data || [] };
        // Generation publishes a whole stage's fixtures as one message (D13), so they merge as one
        // state update rather than as ninety (U32).
        case 'STAGE_FIXTURES_SYNC':
          return { kind: 'upsertMany', items: message.data?.games || [] };
        case 'GAME_SUMMARY_UPDATED':
          return { kind: 'upsert', item: message.data };
        case 'GAME_SUMMARY_REMOVED':
          return { kind: 'remove', id: message.data?.id };
        default:
          return { kind: 'ignore' };
      }
    },
  });

  const division = divisions.find(d => d.id === divisionId);
  const orderedStages = useMemo(
    () => [...stages].sort((a, b) => (a.sequence || 0) - (b.sequence || 0)),
    [stages]
  );

  const gamesByStage = useMemo(() => {
    const map: Record<string, GameSummary[]> = {};
    for (const game of games) {
      const key = game.stageId || 'unassigned';
      (map[key] = map[key] || []).push(game);
    }
    return map;
  }, [games]);

  // One stage renders inline and shows no tabs; the concept appears when a second one does (U15).
  const stagesCollapsed = isCollapsed(orderedStages.length);
  const activeStage =
    orderedStages.find(stage => stage.id === activeStageId) || orderedStages[0] || null;

  const stageTabs: TabItem[] = orderedStages.map(stage => {
    const stageGames = gamesByStage[stage.id] || [];
    return {
      key: stage.id,
      label: stage.name,
      // The state each stage has got to, so the organiser sees it without opening anything (U14).
      // `sublabel` already exists on TabItem, from SCORE-10's scoring stepper.
      sublabel: stageSublabel({
        status: stage.status,
        played: stageGames.filter(g => g.status === 'Finished').length,
        total: stageGames.length,
      }),
    };
  });

  const handleAddStage = () => {
    setIsSavingStage(true);
    wsService.emit(
      'action',
      {
        type: SocketAction.ADD_STAGE,
        payload: {
          divisionId,
          orgId,
          // Named for what it usually is at this point. Renamable, like every other stage (D3).
          name: `Stage ${orderedStages.length + 1}`,
          format: 'Knockout',
        },
      },
      (res: any) => {
        setIsSavingStage(false);
        setIsAddingStage(false);
        if (res?.id) setActiveStageId(res.id);
      }
    );
  };

  const announcement = structureAnnouncement({
    level: 'stage',
    existingName: stagesCollapsed ? orderedStages[0]?.name : undefined,
  });

  const renderFixtures = (stage: TournamentStage | null) => {
    const stageGames = stage ? gamesByStage[stage.id] || [] : [];
    // A fixture that belongs to no stage still belongs to this division's screen — it would
    // otherwise be invisible everywhere. `PEOPLE-3` is why they should not exist; showing them is
    // how anybody would find out that one does.
    const orphaned = stagesCollapsed ? gamesByStage['unassigned'] || [] : [];
    const shown = [...stageGames, ...orphaned];

    if (isLoading) {
      return (
        <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 italic py-6 text-center">
          Loading fixtures...
        </Text>
      );
    }

    if (shown.length === 0) {
      return (
        <View className="items-center justify-center py-10">
          <Ionicons name="calendar-outline" size={36} color={secondary} style={{ opacity: 0.3, marginBottom: 8 }} />
          <Text className="font-orbitron text-[10px] text-slate-500 uppercase tracking-widest">
            No fixtures yet
          </Text>
          {canEdit && (
            <TouchableOpacity
              onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/new`)}
              className="mt-4 px-4 py-2 rounded-lg bg-brand-orange/10 border border-brand-orange/30 active:opacity-80"
            >
              <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                Add a fixture
              </Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    // Grouped by kick-off, which is how a fixture list is read on the day. Anything without a time
    // yet sorts last under "Time TBD" rather than disappearing into the top of the list.
    const groups = new Map<string, GameSummary[]>();
    for (const game of shown) {
      const iso = game.scheduledStartTime || game.startTime;
      const time = iso && !game.timeTbd ? new Date(iso) : null;
      const key =
        time && !isNaN(time.getTime())
          ? time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'Time TBD';
      groups.set(key, [...(groups.get(key) || []), game]);
    }
    const orderedGroups = [...groups.entries()].sort(([a], [b]) =>
      a === 'Time TBD' ? 1 : b === 'Time TBD' ? -1 : a.localeCompare(b)
    );

    return (
      <View className="space-y-3">
        {orderedGroups.map(([groupLabel, groupGames]) => (
          <View key={groupLabel} className="space-y-2">
            {orderedGroups.length > 1 && (
              <Text className="font-orbitron-bold text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                {groupLabel}
              </Text>
            )}
            {groupGames.map(game => {
              const home = participantLabel(game.participants?.[0]);
              const away = participantLabel(game.participants?.[1]);
              const score = hasLiveScore(game)
                ? `${game.scores?.[game.participants?.[0]?.id || ''] ?? 0} - ${game.scores?.[game.participants?.[1]?.id || ''] ?? 0}`
                : null;

              return (
                <TouchableOpacity
                  key={game.id}
                  onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/${game.id}/view`)}
                  className="flex-row items-center justify-between bg-slate-50 dark:bg-white/5 rounded-xl px-3 py-3 active:opacity-85"
                >
                  <Text className="font-inter-bold text-xs text-slate-800 dark:text-white flex-1" numberOfLines={1}>
                    {home || 'TBD'} vs {away || 'TBD'}
                  </Text>
                  <Text
                    className={`font-orbitron-bold text-xs pl-2 ${
                      game.status === 'Live' ? 'text-brand-orange' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {score || game.status}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  return (
    <GlassCard className="border border-slate-200 dark:border-white/5 p-5">
      {!collapsed && (
        <View className="flex-row items-center justify-between mb-4">
          <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white" numberOfLines={1}>
            {division?.name || 'Division'}
          </Text>
          {!!division?.ageGroup && (
            <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {division.ageGroup}
            </Text>
          )}
        </View>
      )}

      {/* Stage tabs appear only when there is more than one stage to choose between. */}
      {!stagesCollapsed && (
        <View className="mb-4">
          <Tabs
            items={stageTabs}
            activeKey={activeStage?.id || ''}
            onChange={setActiveStageId}
            scrollable={stageTabs.length > 3}
          />
        </View>
      )}

      {stagesCollapsed && orderedStages.length === 1 && (
        // No tabs, but the fixtures still need a heading, and naming the one stage is how the
        // organiser learns the word before a second one appears.
        <View className="flex-row items-center justify-between mb-3">
          <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            {orderedStages[0].name}
          </Text>
          <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
            {stageSublabel({
              status: orderedStages[0].status,
              played: (gamesByStage[orderedStages[0].id] || []).filter(g => g.status === 'Finished').length,
              total: (gamesByStage[orderedStages[0].id] || []).length,
            })}
          </Text>
        </View>
      )}

      {renderFixtures(activeStage)}

      {canEdit && (
        <TouchableOpacity
          onPress={() => setIsAddingStage(true)}
          className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 flex-row items-center gap-2 active:opacity-80"
        >
          <Ionicons name="add-circle-outline" size={16} color={COLORS.brand.orange} />
          <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
            Add a stage
          </Text>
        </TouchableOpacity>
      )}

      {/* A structural change is never a surprise: say what will happen before it does (U15). */}
      <ConfirmationModal
        isOpen={isAddingStage}
        title={announcement.title}
        description={announcement.description}
        confirmText={announcement.confirmText}
        cancelText="Cancel"
        variant="primary"
        isProcessing={isSavingStage}
        onConfirm={handleAddStage}
        onClose={() => setIsAddingStage(false)}
      />
    </GlassCard>
  );
}
