import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  CandidateTeam,
  GameSummary,
  SocketAction,
  Sport,
  TournamentDivision,
  TournamentEntrant,
  TournamentStage,
  participantLabel,
  hasLiveScore,
} from '@sk/shared';
import { GlassCard } from '../GlassCard';
import { Tabs, TabItem } from '../Tabs';
import { ConfirmationModal } from '../ConfirmationModal';
import { DivisionEntrantsEditor } from './DivisionEntrantsEditor';
import { useLiveRoom } from '../../hooks/useLiveRoom';
import { wsService } from '../../services/websocket';
import { useWsStore } from '../../store/wsStore';
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
 * fixtures. It joins the member-tier `division:{id}` **only for a viewer who may edit** — that room
 * carries the roster, which may name people rather than teams, and a spectator has no business in
 * it. So the entrants section and the generate control appear together, for the same viewer, off
 * the same room, and a spectator's panel is exactly what it was before.
 *
 * The schedule grid is Phase 7; until then a fixture's time is entered on the fixture itself.
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

  const isConnected = useWsStore((state: any) => state.isConnected);

  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [isAddingStage, setIsAddingStage] = useState(false);
  const [isSavingStage, setIsSavingStage] = useState(false);
  const [showEntrants, setShowEntrants] = useState(false);
  const [generateFor, setGenerateFor] = useState<TournamentStage | null>(null);
  const [isConfirmingResults, setIsConfirmingResults] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const fixturesRoom = divisionId ? `division:${divisionId}:fixtures` : null;
  /** The organiser's tier: the roster, pool membership and the manual adjustments. */
  const memberRoom = divisionId ? `division:${divisionId}` : null;

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

  /**
   * The roster, for the viewer who may change it.
   *
   * `enabled` rather than a null room: a spectator's panel must not join the member tier at all,
   * and the same hook has to keep its place in the render either way.
   */
  const { items: entrants } = useLiveRoom<TournamentEntrant>(memberRoom, {
    enabled: canEdit,
    reduce: (message) =>
      message.type === 'DIVISION_ENTRANTS_SYNC' && message.data?.divisionId === divisionId
        ? { kind: 'replace', items: message.data?.entrants || [] }
        : { kind: 'ignore' },
  });

  /**
   * What could be entered — a one-shot read, because no room owns "teams that could enter".
   * Addressed by division so a convenor, who holds no event-scope grant, is answered too.
   */
  const [candidateTeams, setCandidateTeams] = useState<CandidateTeam[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);

  useEffect(() => {
    if (!isConnected || !divisionId || !canEdit || !showEntrants) return;
    let active = true;
    wsService.emit('get_data', { type: 'event_candidate_teams', eventId, divisionId }, (res: any) => {
      if (active && Array.isArray(res)) setCandidateTeams(res);
    });
    wsService.emit('get_data', { type: 'sports' }, (res: any) => {
      if (active && Array.isArray(res)) setSports(res);
    });
    return () => {
      active = false;
    };
  }, [isConnected, divisionId, eventId, canEdit, showEntrants]);

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
        if (res?.data?.id) setActiveStageId(res.data.id);
      }
    );
  };

  const announcement = structureAnnouncement({
    level: 'stage',
    existingName: stagesCollapsed ? orderedStages[0]?.name : undefined,
  });

  // ------------------------------------------------------------------------------------------
  // Generation (D8, D9)
  // ------------------------------------------------------------------------------------------

  const activeEntrants = entrants.filter(entrant => entrant.status !== 'withdrawn');

  /** The organisations whose teams could be entered, from the candidate list itself. */
  const rosterOrgs = useMemo(() => {
    const map = new Map<string, { id: string; name: string; shortName?: string }>();
    for (const team of candidateTeams) {
      if (!map.has(team.orgId)) {
        map.set(team.orgId, { id: team.orgId, name: team.orgName, shortName: team.orgShortName });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [candidateTeams]);

  /**
   * The concrete cost of regenerating a stage, from the fixtures this panel already holds.
   *
   * D9's dialog states *"this deletes 14 fixtures, 3 of which have results"* rather than warning in
   * the abstract, and it needs no server call to do it: `division:{id}:fixtures` is already the
   * source of truth for what is there. A fixture in progress counts as having a result — it has
   * points on it, and losing them is the thing the second confirmation exists to prevent.
   */
  const generationCost = (stage: TournamentStage | null) => {
    const stageGames = stage ? gamesByStage[stage.id] || [] : [];
    return {
      total: stageGames.length,
      played: stageGames.filter(game => game.status === 'Finished' || game.status === 'Live').length,
    };
  };

  const runGeneration = (stage: TournamentStage, mode: 'create' | 'regenerate', deleteResults = false) => {
    setIsGenerating(true);
    setGenerationError(null);
    wsService.emit(
      'action',
      {
        type: SocketAction.GENERATE_STAGE_FIXTURES,
        payload: { stageId: stage.id, orgId, mode, deleteResults },
      },
      (res: any) => {
        setIsGenerating(false);
        if (res?.error) {
          // The server refuses for reasons the client cannot always predict — too few entrants, a
          // division with no sport, a Swiss stage. Its sentence is more specific than anything
          // this screen could compose, so it is shown rather than replaced.
          setGenerationError(res.error);
          return;
        }
        setGenerateFor(null);
        setIsConfirmingResults(false);
        setActiveStageId(stage.id);
      },
      15000,
      // The dialog shows the refusal itself, with the counts in it. A toast on top of that is the
      // same sentence twice.
      { suppressToast: true }
    );
  };

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
            <View className="flex-row items-center gap-2 mt-4">
              {/*
                D8 — generation is offered as a *starting point*, and then gets out of the way.
                Adding by hand sits beside it rather than under it, because a hand-built division
                is not a lesser one: once the fixtures exist, both are indistinguishable.
              */}
              {!!stage && activeEntrants.length >= 2 && (
                <TouchableOpacity
                  onPress={() => {
                    setGenerationError(null);
                    setGenerateFor(stage);
                  }}
                  className="px-4 py-2 rounded-lg bg-brand-orange active:opacity-85"
                >
                  <Text className="font-inter-bold text-[10px] text-white uppercase tracking-wider">
                    Generate fixtures
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/new`)}
                className="px-4 py-2 rounded-lg bg-brand-orange/10 border border-brand-orange/30 active:opacity-80"
              >
                <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                  Add a fixture
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {canEdit && activeEntrants.length < 2 && (
            <Text className="font-inter text-[11px] text-slate-400 dark:text-slate-500 italic mt-3 text-center px-6">
              Enter at least two competitors and a draw can be generated for you.
            </Text>
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

      {/*
        Regeneration on a stage that already has fixtures. It sits under the list rather than in
        the empty state, because that is where the fixtures it would replace are.
      */}
      {canEdit && !!activeStage && (gamesByStage[activeStage.id] || []).length > 0 && activeEntrants.length >= 2 && (
        <TouchableOpacity
          onPress={() => {
            setGenerationError(null);
            setGenerateFor(activeStage);
          }}
          className="mt-4 flex-row items-center gap-2 active:opacity-80"
        >
          <Ionicons name="refresh-outline" size={15} color={secondary} />
          <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Regenerate the draw
          </Text>
        </TouchableOpacity>
      )}

      {/*
        The roster, for the viewer who may change it. Collapsed by default: the panel's subject is
        the fixtures, and entering teams is a thing you come here to do rather than a thing you
        read. Opening it is also what triggers the candidate-team read, so a panel nobody expands
        costs nothing.
      */}
      {canEdit && (
        <View className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5">
          <TouchableOpacity
            onPress={() => setShowEntrants(open => !open)}
            className="flex-row items-center justify-between active:opacity-80"
          >
            <View className="flex-row items-center gap-2">
              <Ionicons name="people-outline" size={16} color={COLORS.brand.orange} />
              <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                Entrants
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
                {activeEntrants.length} entered
              </Text>
              <Ionicons name={showEntrants ? 'chevron-up' : 'chevron-down'} size={14} color={secondary} />
            </View>
          </TouchableOpacity>

          {showEntrants && !!division && (
            <View className="mt-3">
              <DivisionEntrantsEditor
                orgId={orgId}
                division={division}
                entrants={entrants}
                candidateTeams={candidateTeams}
                orgs={rosterOrgs}
                sportName={sports.find(sport => sport.id === division.sportId)?.name}
                onTeamCreated={(team) =>
                  setCandidateTeams(prev => [
                    ...prev,
                    {
                      id: team.id,
                      name: team.name,
                      shortName: team.shortName,
                      orgId: team.orgId,
                      orgName: rosterOrgs.find(o => o.id === team.orgId)?.name || team.orgId,
                      orgShortName: rosterOrgs.find(o => o.id === team.orgId)?.shortName,
                      sportId: team.sportId,
                      ageGroup: team.ageGroup,
                    },
                  ])
                }
              />
            </View>
          )}
        </View>
      )}

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

      {/*
        D9 — exactly two paths, and the dialog states the concrete cost rather than warning in the
        abstract. Regenerating a stage that holds results escalates to a second confirmation; one
        that holds none does not, because there is nothing to lose and an extra tap would train the
        organiser to click through the one that matters.
      */}
      <ConfirmationModal
        isOpen={!!generateFor && !isConfirmingResults}
        title={generationCost(generateFor).total > 0 ? 'Regenerate the draw' : 'Generate fixtures'}
        description={(() => {
          const { total, played } = generationCost(generateFor);
          const from = `${activeEntrants.length} entrant${activeEntrants.length === 1 ? '' : 's'}`;
          if (generationError) return generationError;
          if (total === 0) {
            return `A draw will be generated from ${from}. You can delete, add and reorder fixtures freely afterwards.`;
          }
          return played > 0
            ? `This deletes ${total} fixture${total === 1 ? '' : 's'}, ${played} of which ${
                played === 1 ? 'has' : 'have'
              } results, and builds a new draw from ${from}.`
            : `This deletes ${total} fixture${total === 1 ? '' : 's'} and builds a new draw from ${from}. None of them have results.`;
        })()}
        confirmText={generationCost(generateFor).total > 0 ? 'Regenerate' : 'Generate'}
        cancelText="Cancel"
        variant={generationCost(generateFor).total > 0 ? 'danger' : 'primary'}
        isProcessing={isGenerating}
        onConfirm={() => {
          if (!generateFor) return;
          const { total, played } = generationCost(generateFor);
          if (total === 0) {
            runGeneration(generateFor, 'create');
          } else if (played > 0) {
            setIsConfirmingResults(true);
          } else {
            runGeneration(generateFor, 'regenerate');
          }
        }}
        onClose={() => {
          setGenerateFor(null);
          setGenerationError(null);
        }}
      />

      <ConfirmationModal
        isOpen={!!generateFor && isConfirmingResults}
        title="Those results will be lost"
        description={(() => {
          const { played } = generationCost(generateFor);
          return generationError
            ? generationError
            : `${played} fixture${played === 1 ? '' : 's'} in ${
                generateFor?.name || 'this stage'
              } ${played === 1 ? 'has' : 'have'} a score recorded. Regenerating deletes ${
                played === 1 ? 'it' : 'them'
              } along with the rest of the draw, and the tables will be rebuilt without ${
                played === 1 ? 'it' : 'them'
              }.`;
        })()}
        confirmText="Delete the results and regenerate"
        cancelText="Keep them"
        variant="danger"
        isProcessing={isGenerating}
        onConfirm={() => generateFor && runGeneration(generateFor, 'regenerate', true)}
        onClose={() => {
          setIsConfirmingResults(false);
          setGenerateFor(null);
          setGenerationError(null);
        }}
      />

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
