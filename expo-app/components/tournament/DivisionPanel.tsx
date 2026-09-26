import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  CandidateTeam,
  GameSummary,
  SocketAction,
  TournamentDivision,
  TournamentEntrant,
  TournamentStage,
  drawChanges,
  participantLabel,
  hasLiveScore,
  isScoreNotProvided,
} from '@sk/shared';
import { GlassCard } from '../GlassCard';
import { Tabs, TabItem } from '../Tabs';
import { ConfirmationModal } from '../ConfirmationModal';
import { ReplaceEntrantModal } from './ReplaceEntrantModal';
import { useLiveRoom } from '../../hooks/useLiveRoom';
import { useDivisionEntrants } from '../../hooks/useDivisionEntrants';
import { wsService } from '../../services/websocket';
import { sendAction } from '../../services/actions';
import { useWsStore } from '../../store/wsStore';
import { useActiveTheme } from '../../store/settingsStore';
import { COLORS, getThemeColor } from '../../constants/Colors';
import { isCollapsed, stageSublabel, structureAnnouncement } from '@sk/shared';
import { formatKickoffTime } from '../../utils/dates';

/**
 * One division: its stages, and the fixtures under them.
 *
 * **This is the piece the collapse rule shares** (U15). A tournament with one division renders it
 * inline on the event screen — the event screen *is* the division screen — and a tournament with
 * several gives each one its own schedule screen at
 * `/admin/[orgId]/events/[eventId]/divisions/[divisionId]/schedule` (U53). Both mount this, so there is one
 * rendering of a division rather than two that drift.
 *
 * It joins `division:{id}:fixtures`, which is public and carries the division, its stages and its
 * fixtures. It joins the member-tier roster room **only for a viewer who may edit** — the roster
 * may name people rather than teams, and a spectator has no business in it. That viewer gets the
 * generate control, the changes since the draw, and a link to the Entrants step for this division;
 * a spectator's panel is the stages and fixtures alone. (The roster used to be edited inline here,
 * for convenors, until they got the Entrants step for their own divisions — `UI-20`.)
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
  const [generateFor, setGenerateFor] = useState<TournamentStage | null>(null);
  const [isConfirmingResults, setIsConfirmingResults] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  /** A withdrawn entrant whose remaining fixtures are being handed on, with how many there are. */
  const [handingOn, setHandingOn] = useState<{ entrant: TournamentEntrant; unplayed: number } | null>(null);

  // One room per dataset (rule 4). `division:{id}:fixtures` carried the division record, its
  // stages, its fixtures and its venues until 2026-09-11; `division:{id}` carried the roster, the
  // pool membership and the adjustments. Now each is its own.
  const divisionRoom = divisionId ? `division:${divisionId}` : null;
  const fixturesRoom = divisionId ? `division:${divisionId}:fixtures` : null;
  const stagesRoom = divisionId ? `division:${divisionId}:stages` : null;

  const { items: divisions } = useLiveRoom<TournamentDivision>(divisionRoom, {
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

  const { items: stages } = useLiveRoom<TournamentStage>(stagesRoom, {
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
  const { entrants } = useDivisionEntrants(divisionId, canEdit);

  /**
   * The teams that could take a withdrawn team's place, for the Replace dialog — a one-shot read,
   * because no room owns "teams that could enter", and only when that dialog opens. Addressed by
   * division so a convenor, who holds no event-scope grant, is answered too.
   */
  const [candidateTeams, setCandidateTeams] = useState<CandidateTeam[]>([]);

  useEffect(() => {
    if (!isConnected || !divisionId || !canEdit || !handingOn) return;
    let active = true;
    wsService.emit('get_data', { type: 'event_candidate_teams', eventId, divisionId }, (res: any) => {
      if (active && res && Array.isArray(res.teams)) setCandidateTeams(res.teams);
    });
    return () => {
      active = false;
    };
  }, [isConnected, divisionId, eventId, canEdit, handingOn]);

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
    sendAction(SocketAction.ADD_STAGE, {
      divisionId,
      orgId,
      // Named for what it usually is at this point. Renamable, like every other stage (D3).
      name: `Stage ${orderedStages.length + 1}`,
      format: 'Knockout',
    }).then(result => {
      setIsSavingStage(false);
      setIsAddingStage(false);
      // A refusal is already toasted.
      if (result.ok) setActiveStageId(result.data.id);
    });
  };

  const announcement = structureAnnouncement({
    level: 'stage',
    existingName: stagesCollapsed ? orderedStages[0]?.name : undefined,
  });

  // ------------------------------------------------------------------------------------------
  // Generation (D8, D9)
  // ------------------------------------------------------------------------------------------

  const activeEntrants = entrants.filter(entrant => entrant.status !== 'withdrawn');

  /**
   * How the roster has moved since the draw — only for a viewer who can act on it, since only they
   * hold the roster. See `drawChanges` for the two kinds.
   */
  const changes = useMemo(
    () => (canEdit ? drawChanges(orderedStages, games, entrants) : null),
    [canEdit, orderedStages, games, entrants]
  );

  /* `rosterOrgs` used to be deduplicated from the candidate teams here. It came with the same hole
     the entrants screen had: a school with no team of any sport never appeared, so the one place a
     convenor could have made them a team was missing. The read answers it directly now. */

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
    sendAction(
      SocketAction.GENERATE_STAGE_FIXTURES,
      { stageId: stage.id, orgId, mode, deleteResults },
      // The dialog shows the refusal itself, with the counts in it. A toast on top of that is the
      // same sentence twice.
      { timeoutMs: 15000, suppressToast: true }
    ).then(result => {
      setIsGenerating(false);
      if (!result.ok) {
        // The server refuses for reasons the client cannot always predict — too few entrants, a
        // division with no sport, a Swiss stage. Its sentence is more specific than anything
        // this screen could compose, so it is shown rather than replaced.
        setGenerationError(result.message);
        return;
      }
      setGenerateFor(null);
      setIsConfirmingResults(false);
      setActiveStageId(stage.id);
    });
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
      const time = game.timeTbd ? '' : formatKickoffTime(game.scheduledStartTime || game.startTime);
      const key = time || 'Time TBD';
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
                : isScoreNotProvided(game)
                  ? 'No score'
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

      {!!changes && changes.count > 0 && (
        /*
          The draw is not topped up or reshuffled behind the organiser's back (D9), so when the
          roster moves after it, this is where they are told — and offered the two ways out: hand a
          withdrawn team's fixtures to somebody, or regenerate below.
        */
        <View className="mb-4 rounded-xl border border-amber-300 dark:border-amber-400/40 bg-amber-50 dark:bg-amber-400/10 p-3 space-y-2">
          <Text className="font-orbitron-bold text-[10px] text-amber-800 dark:text-amber-300 uppercase tracking-widest">
            Changes since the draw
          </Text>
          {changes.leftDraw.map(({ entrant, unplayed }) => (
            <View key={entrant.id} className="flex-row items-center gap-3">
              <Text className="flex-1 font-inter text-xs text-slate-700 dark:text-slate-200">
                <Text className="font-inter-bold">{entrant.name || entrant.label || 'A team'}</Text> withdrew with{' '}
                {unplayed === 1 ? 'a fixture' : `${unplayed} fixtures`} still to play.
              </Text>
              <TouchableOpacity
                onPress={() => setHandingOn({ entrant, unplayed })}
                className="px-3 py-1.5 rounded-lg bg-brand-orange active:opacity-85"
              >
                <Text className="font-inter-bold text-[10px] text-white uppercase tracking-wider">Replace</Text>
              </TouchableOpacity>
            </View>
          ))}
          {changes.notInDraw.map(entrant => (
            <Text key={entrant.id} className="font-inter text-xs text-slate-700 dark:text-slate-200">
              <Text className="font-inter-bold">{entrant.name || entrant.label || 'An entrant'}</Text> was entered
              after the draw and has no fixtures.
            </Text>
          ))}
          <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400">
            {changes.leftDraw.length && changes.notInDraw.length
              ? 'Replace a withdrawn team with a late entry to keep the draw, or regenerate it.'
              : changes.leftDraw.length
                ? 'Replace it with another team to keep the draw, or regenerate it.'
                : 'Regenerate the draw to include them, or add their fixtures by hand.'}
          </Text>
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
        Who is entered is edited on the Entrants step (2026-09-24, `UI-20`) — convenors included,
        for their own divisions — so this is a count and a way there rather than a second copy of
        the editor. Filtered to this division on arrival.
      */}
      {canEdit && (
        <TouchableOpacity
          onPress={() => router.push(`/admin/${orgId}/events/${eventId}/entrants?divisionId=${divisionId}` as any)}
          className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 flex-row items-center justify-between active:opacity-80"
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
            <Ionicons name="chevron-forward" size={14} color={secondary} />
          </View>
        </TouchableOpacity>
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

      {!!division && (
        <ReplaceEntrantModal
          isOpen={!!handingOn}
          onClose={() => setHandingOn(null)}
          orgId={orgId}
          division={division}
          entrant={handingOn?.entrant || null}
          unplayedCount={handingOn?.unplayed}
          candidateTeams={candidateTeams}
          tournamentEntrants={entrants}
          lateEntrants={changes?.notInDraw || []}
        />
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
