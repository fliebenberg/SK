import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  GameSummary,
  TournamentDivision,
  TournamentEntrant,
  TournamentStage,
  drawChanges,
  isPlayedFixture,
} from '@sk/shared';
import { AccessDenied } from '../../../../../../components/AccessDenied';
import { Button } from '../../../../../../components/Button';
import { ScreenHeader } from '../../../../../../components/ScreenHeader';
import { SetupStepFooter } from '../../../../../../components/tournament/SetupStepFooter';
import { useSetupStepScreen } from '../../../../../../hooks/useSetupStepScreen';
import { useLiveRoom } from '../../../../../../hooks/useLiveRoom';
import { useEventEntrants } from '../../../../../../hooks/useEventEntrants';
import { useActiveTheme } from '../../../../../../store/settingsStore';
import { COLORS, getThemeColor } from '../../../../../../constants/Colors';

/**
 * Fixtures, division by division (2026-09-24, closes `UI-20`).
 *
 * A draw is made per division — each has its own entrants, format and stages — so this step is a
 * list of the divisions with where each one has got to, and a row opens that division's stages,
 * draw and fixtures. It used to be an event-wide fixture count and a pointer to the Schedule tab,
 * which told an organiser with six divisions nothing about which of them still needed a draw.
 *
 * Nothing is drawn automatically. Each division starts with the stages its tournament's format
 * implies, and generating the draw is one tap on its screen: a draw made from a roster that is not
 * final is a draw that has to be made again, with every late entry.
 */
export default function SetupFixtures() {
  const router = useRouter();
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();

  const {
    step,
    event,
    canEdit,
    isLoadingCapabilities,
    accessDenied,
    goBackToChecklist,
    nextStep,
    dismissStep,
  } = useSetupStepScreen('fixtures');

  const { items: divisions } = useLiveRoom<TournamentDivision>(
    eventId ? `event:${eventId}:divisions` : null,
    {
      reduce: (message) => {
        switch (message.type) {
          case 'DIVISIONS_SYNC':
            return { kind: 'replace', items: message.data || [] };
          case 'DIVISION_ADDED':
          case 'DIVISION_UPDATED':
            return { kind: 'upsert', item: message.data };
          case 'DIVISION_DELETED':
            return { kind: 'remove', id: message.data?.id };
          default:
            return { kind: 'ignore' };
        }
      },
    }
  );
  const orderedDivisions = useMemo(
    () => [...divisions].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [divisions]
  );

  /* Split out of `event:{id}` on 2026-09-11; this screen was still listening on the old room until
     2026-09-15, so the sync never arrived — same defect as the facilities one on `basics.tsx`. */
  const { items: games } = useLiveRoom<GameSummary>(
    eventId ? `event:${eventId}:fixtures` : null,
    {
      reduce: (message) => {
        switch (message.type) {
          case 'GAME_SUMMARIES_SYNC':
            return { kind: 'replace', items: message.data || [] };
          case 'STAGE_FIXTURES_SYNC':
            return { kind: 'upsertMany', items: message.data?.games || [] };
          case 'GAME_SUMMARY_UPDATED':
            return { kind: 'upsert', item: message.data };
          case 'GAME_SUMMARY_REMOVED':
          case 'GAME_DELETED':
            return { kind: 'remove', id: message.data?.id };
          default:
            return { kind: 'ignore' };
        }
      },
    }
  );

  const { byDivision } = useEventEntrants(eventId, canEdit);

  const gamesByDivision = useMemo(() => {
    const map = new Map<string, GameSummary[]>();
    for (const game of games) {
      if (!game.divisionId) continue;
      map.set(game.divisionId, [...(map.get(game.divisionId) || []), game]);
    }
    return map;
  }, [games]);

  /** Fixtures that belong to no division — hand-added before `FIX-12`, or outside any stage. */
  const looseFixtures = games.filter(game => !game.divisionId).length;

  const handleBack = useCallback(() => goBackToChecklist(), [goBackToChecklist]);
  const handleNext = useCallback(() => goBackToChecklist(nextStep), [goBackToChecklist, nextStep]);

  if (accessDenied || (!isLoadingCapabilities && !canEdit)) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
        <AccessDenied
          message="You do not have permission to set this tournament up."
          actionLabel="Back to the tournament"
          onAction={() => goBackToChecklist()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      <ScreenHeader context={event?.name} title={step.label} onBack={handleBack} />

      {!event ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.brand.orange} />
        </View>
      ) : (
        <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 60 }}>
          <View className="space-y-6">
            <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-5 space-y-4">
              <Text className="font-inter text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Each division gets its own draw. Open one to set its format and generate its fixtures.
              </Text>

              {orderedDivisions.length === 0 ? (
                <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 italic">
                  No divisions yet. Choose the sports being played under Sports & Divisions first.
                </Text>
              ) : (
                <View className="space-y-2">
                  {orderedDivisions.map(division => (
                    <DivisionFixturesRow
                      key={division.id}
                      division={division}
                      games={gamesByDivision.get(division.id) || []}
                      entrants={byDivision.get(division.id) || []}
                      onPress={() =>
                        router.push(`/admin/${orgId}/events/${eventId}/divisions/${division.id}/schedule`)
                      }
                    />
                  ))}
                </View>
              )}

              {/* Hand-built fixtures sit beside generated ones rather than under them (D8). */}
              <Button
                title="Add a fixture by hand"
                variant="secondary"
                onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/new`)}
                className="py-2.5 rounded-lg"
              />
              {looseFixtures > 0 && (
                <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400">
                  {looseFixtures} fixture{looseFixtures === 1 ? ' is' : 's are'} not in any division, and
                  {looseFixtures === 1 ? ' shows' : ' show'} on the Schedule tab.
                </Text>
              )}
            </View>

            <SetupStepFooter
              label={step.label}
              nextStep={nextStep}
              onNext={handleNext}
              onBackToChecklist={handleBack}
              onDismiss={dismissStep}
            />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/**
 * One division: its format and field on the second line, and where its draw has got to on the
 * right.
 *
 * Joins the division's stages room itself. The stages are what the format *is* — a division may
 * have been given a knockout after its pools — and `event:{id}:divisions` does not carry them, so
 * each row subscribes to the one small room it displays (live-data rule 2) rather than the screen
 * reading every division's stages up front.
 */
function DivisionFixturesRow({
  division,
  games,
  entrants,
  onPress,
}: {
  division: TournamentDivision;
  games: GameSummary[];
  entrants: TournamentEntrant[];
  onPress: () => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const secondary = getThemeColor(isDark, 'textSecondary');

  const { items: stages } = useLiveRoom<TournamentStage>(`division:${division.id}:stages`, {
    reduce: (message) =>
      message.type === 'STAGES_SYNC'
        ? { kind: 'replace', items: message.data?.stages || [] }
        : { kind: 'ignore' },
  });
  const ordered = [...stages].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

  const active = entrants.filter(entrant => entrant.status !== 'withdrawn').length;
  const played = games.filter(isPlayedFixture).length;
  // The division's own `firstStageId`, as the checklist reads it — so the two always agree.
  const changes = drawChanges(division.firstStageId ?? ordered, games, entrants);

  // The stage names are the organiser's words for the format ("Pools → Knockout").
  const format = ordered.map(stage => stage.name).join(' → ') || 'No stages';
  const field = `${active} ${active === 1 ? 'entrant' : 'entrants'}`;

  /** What is left to do, in the order it has to be done. Amber when it needs the organiser. */
  const status: { text: string; tone: 'todo' | 'done' | 'warn' } = !division.sportId
    ? { text: 'Needs a sport', tone: 'warn' }
    : games.length === 0
      ? active >= 2
        ? { text: 'Ready to draw', tone: 'todo' }
        : { text: 'Needs entrants', tone: 'todo' }
      : changes.count > 0
        ? { text: `${changes.count} change${changes.count === 1 ? '' : 's'} since the draw`, tone: 'warn' }
        : {
            text: `${games.length} fixture${games.length === 1 ? '' : 's'}${played ? ` · ${played} played` : ''}`,
            tone: 'done',
          };

  // Done is the contrast-safe success green (`UI-6`), taken from the theme as the checklist does.
  const toneClass =
    status.tone === 'warn'
      ? 'text-amber-800 dark:text-amber-300'
      : status.tone === 'done'
        ? ''
        : 'text-slate-500 dark:text-slate-400';
  const toneStyle = status.tone === 'done' ? { color: getThemeColor(isDark, 'success') } : undefined;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${division.name}, ${status.text}`}
      className="flex-row items-center gap-2 bg-slate-50 dark:bg-white/5 rounded-xl px-3 py-3"
    >
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-2">
          <Text className="font-inter-bold text-xs text-slate-800 dark:text-white flex-1" numberOfLines={1}>
            {division.name}
          </Text>
          <Text className={`font-inter-bold text-[10px] flex-shrink ${toneClass}`} style={toneStyle} numberOfLines={1}>
            {status.text}
          </Text>
        </View>
        <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 mt-0.5" numberOfLines={1}>
          {format} · {field}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={secondary} />
    </TouchableOpacity>
  );
}
