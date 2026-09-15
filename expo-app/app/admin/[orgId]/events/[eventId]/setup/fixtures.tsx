import React, { useCallback } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameSummary } from '@sk/shared';
import { AccessDenied } from '../../../../../../components/AccessDenied';
import { Button } from '../../../../../../components/Button';
import { ScreenHeader } from '../../../../../../components/ScreenHeader';
import { SetupStepFooter } from '../../../../../../components/tournament/SetupStepFooter';
import { useSetupStepScreen } from '../../../../../../hooks/useSetupStepScreen';
import { useLiveRoom } from '../../../../../../hooks/useLiveRoom';
import { useEventEntrants } from '../../../../../../hooks/useEventEntrants';
import { COLORS } from '../../../../../../constants/Colors';

/**
 * Getting fixtures into the tournament (U48).
 *
 * The one step screen with no form and no save bar: a draw is generated **per division**, from its
 * stage on the Schedule tab, and a fixture is added on its own screen. So this is a status and two
 * ways out — which is still worth a screen, because a checklist row that behaved differently from
 * the four beside it is the inconsistency this change set out to remove.
 *
 * It is also where draw generation will land when it stops being per-division-only, which is the
 * other reason not to collapse it into a link on the checklist.
 */
export default function SetupFixtures() {
  const router = useRouter();
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();

  const {
    step,
    event,
    eventRoom,
    canEdit,
    isLoadingCapabilities,
    accessDenied,
    goBackToChecklist,
    nextStep,
    dismissStep,
  } = useSetupStepScreen('fixtures');

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

  const { entrants } = useEventEntrants(eventId, canEdit);
  const entrantCount = entrants.filter(entrant => entrant.status !== 'withdrawn').length;

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
            <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl">
              <View className="p-5 space-y-4">
                <Text className="font-inter text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {games.length > 0
                    ? `${games.length} fixture${
                        games.length === 1 ? '' : 's'
                      } so far. Generating a draw is done per division, from its stage on the Schedule tab.`
                    : entrantCount >= 2
                    ? "No fixtures yet. Generate a draw from a division's stage on the Schedule tab, or add fixtures by hand."
                    : 'No fixtures yet. Enter at least two entrants to generate a draw, or add fixtures by hand at any time.'}
                </Text>

                <Button
                  title="Add a fixture"
                  variant="secondary"
                  onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/new`)}
                  className="py-2.5 rounded-lg"
                />

                {games.length > 0 && (
                  <Button
                    title="View the schedule"
                    variant="ghost"
                    onPress={() =>
                      router.replace(`/admin/${orgId}/events/${eventId}?tab=schedule` as any)
                    }
                    className="py-2.5 rounded-lg"
                  />
                )}
              </View>
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
