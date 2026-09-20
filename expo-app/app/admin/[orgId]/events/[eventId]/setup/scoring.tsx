import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEFAULT_SCORING_SYSTEM, ScoringSystem, SocketAction, reseedDecision } from '@sk/shared';
import { AccessDenied } from '../../../../../../components/AccessDenied';
import { Button } from '../../../../../../components/Button';
import { FloatingSaveBar, FLOATING_SAVE_BAR_PADDING } from '../../../../../../components/FloatingSaveBar';
import { ScreenHeader } from '../../../../../../components/ScreenHeader';
import { SetupStepFooter } from '../../../../../../components/tournament/SetupStepFooter';
import { useSetupStepScreen } from '../../../../../../hooks/useSetupStepScreen';
import { useUnsavedChanges } from '../../../../../../hooks/useUnsavedChanges';
import { sendAction } from '../../../../../../services/actions';
import { useAuthStore } from '../../../../../../store/authStore';
import { useActiveTheme } from '../../../../../../store/settingsStore';
import { COLORS, getThemeColor } from '../../../../../../constants/Colors';

/** The three point fields, plus the event they belong to. */
interface ScoringDraft {
  eventId: string;
  win: string;
  draw: string;
  loss: string;
}

/**
 * How the competition is scored (U48).
 *
 * Placed before fixtures rather than last, because it is a rule of the competition rather than a
 * finishing touch: it binds the moment the first result is entered, and leaving it to the end is
 * how a morning gets scored on defaults nobody chose. Changing it rebuilds every table under the
 * event immediately (`FIX-14`) — the points a table was built with are not the points it should
 * show a moment later.
 */
export default function SetupScoring() {
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const user = useAuthStore((state: any) => state.user);

  const {
    step,
    event,
    canEdit,
    isLoadingCapabilities,
    accessDenied,
    isProcessing,
    setIsProcessing,
    goBackToChecklist,
    nextStep,
    finishSave,
    dismissStep,
  } = useSetupStepScreen('scoring');

  // The form. Strings, because they are text inputs; parsed on save.
  const [ptsWin, setPtsWin] = useState('');
  const [ptsDraw, setPtsDraw] = useState('');
  const [ptsLoss, setPtsLoss] = useState('');
  /**
   * "Use these defaults", pressed.
   *
   * The step is only `done` once `settings.scoring` exists, but an untouched 3 / 1 / 0 form is not
   * *dirty* — it already matches what the server would use. So confirming the defaults is a change
   * the form cannot express, and this flag is how it says so: it makes the page dirty, the save bar
   * comes up, and Save writes the defaults out like any other edit.
   */
  const [confirmDefaultScoring, setConfirmDefaultScoring] = useState(false);

  /**
   * Seed from what the server would actually use: the event's own system if it has one, otherwise
   * the shared 3 / 1 / 0 default (D17). A `byPlacing` system has no per-result points and is not
   * editable here yet, so the form shows blanks rather than inventing numbers.
   */
  const savedScoring: ScoringSystem = event?.settings?.scoring || DEFAULT_SCORING_SYSTEM;

  /** The saved points as the three text fields hold them. Blank for a system this form cannot edit. */
  const savedPoints =
    savedScoring.mode === 'byResult'
      ? {
          eventId,
          win: String(savedScoring.pointsPerWin),
          draw: String(savedScoring.pointsPerDraw),
          loss: String(savedScoring.pointsPerLoss),
        }
      : { eventId, win: '', draw: '', loss: '' };

  /**
   * What the fields were last seeded from — never the live event (`UI-18`).
   *
   * This screen had the flash and the clobber in a sharper form than the others: its effect was
   * keyed on `event.settings.scoring`, an object parsed fresh out of JSONB on every broadcast, so
   * **any** update to the event — a rename, a date — gave it a new identity and re-seeded the form
   * over whatever was being typed.
   *
   * `confirmDefaultScoring` is deliberately *outside* the baseline. It is not a value the form
   * holds but an assertion about one ("the defaults are right"), so it cannot be compared against
   * anything saved; it is an extra dirty term, and adopting a record clears it because the event
   * coming back with a scoring system is what confirming meant.
   */
  const [pointsBaseline, setPointsBaseline] = useState<ScoringDraft | null>(null);
  const pointsBaselineForEvent = pointsBaseline?.eventId === eventId ? pointsBaseline : null;

  const seedPoints = useCallback((from: ScoringDraft) => {
    setPtsWin(from.win);
    setPtsDraw(from.draw);
    setPtsLoss(from.loss);
    setPointsBaseline(from);
    setConfirmDefaultScoring(false);
  }, []);

  useEffect(() => {
    if (!event) return;
    const decision = reseedDecision<ScoringDraft>({
      baseline: pointsBaselineForEvent,
      drafts: { eventId, win: ptsWin, draw: ptsDraw, loss: ptsLoss },
      incoming: savedPoints,
      same: (a, b) => a.win === b.win && a.draw === b.draw && a.loss === b.loss,
    });
    if (decision === 'adopt') seedPoints(savedPoints);
    // Keyed on the values rather than on `settings.scoring`, whose identity changes on every sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, savedPoints.win, savedPoints.draw, savedPoints.loss]);

  const isDirty =
    canEdit &&
    savedScoring.mode === 'byResult' &&
    !!pointsBaselineForEvent &&
    (confirmDefaultScoring ||
      ptsWin !== pointsBaselineForEvent.win ||
      ptsDraw !== pointsBaselineForEvent.draw ||
      ptsLoss !== pointsBaselineForEvent.loss);

  /** Cancel goes back to what is saved now, not to what was saved when the screen opened. */
  const handleCancel = useCallback(() => {
    seedPoints(savedPoints);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedPoints, savedPoints.win, savedPoints.draw, savedPoints.loss]);

  const { confirmThenNavigate } = useUnsavedChanges(isDirty && !isProcessing, handleCancel);

  /**
   * `settings` carries the rest of the object across untouched, because `UPDATE_EVENT` replaces
   * that column rather than merging into it — writing the bare key would drop the organiser's
   * dismissed steps.
   */
  const handleSave = useCallback(
    (onDone?: () => void) => {
      if (!event) return;

      const scoring: ScoringSystem = {
        mode: 'byResult',
        pointsPerWin: parseInt(ptsWin, 10) || 0,
        pointsPerDraw: parseInt(ptsDraw, 10) || 0,
        pointsPerLoss: parseInt(ptsLoss, 10) || 0,
      };

      setIsProcessing(true);
      sendAction(SocketAction.UPDATE_EVENT, {
        id: eventId,
        orgId,
        data: { settings: { ...(event.settings || {}), scoring } },
      }).then(result => finishSave(result, onDone));
    },
    [event, ptsWin, ptsDraw, ptsLoss, eventId, orgId, user?.id, setIsProcessing, finishSave]
  );

  const handleBack = useCallback(
    () => confirmThenNavigate(() => goBackToChecklist()),
    [confirmThenNavigate, goBackToChecklist]
  );

  const handleNext = useCallback(() => {
    const go = () => goBackToChecklist(nextStep);
    if (isDirty) handleSave(go);
    else go();
  }, [isDirty, handleSave, goBackToChecklist, nextStep]);

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

  const pointsIncomplete = !ptsWin || !ptsDraw || !ptsLoss;

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      <ScreenHeader context={event?.name} title={step.label} onBack={handleBack} />

      {!event ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.brand.orange} />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-6 py-6"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: isDirty ? FLOATING_SAVE_BAR_PADDING : 60 }}
        >
          <View className="space-y-6">
            <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl">
              <View className="p-5 space-y-4">
                {savedScoring.mode === 'byPlacing' ? (
                  <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
                    This tournament awards points by finishing position. Editing that here is not
                    available yet.
                  </Text>
                ) : (
                  <>
                    <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
                      How many league points each result is worth. These apply to every division
                      unless a division sets its own.
                    </Text>
                    <View className="flex-row gap-3">
                      {(
                        [
                          ['Win', ptsWin, setPtsWin],
                          ['Draw', ptsDraw, setPtsDraw],
                          ['Loss', ptsLoss, setPtsLoss],
                        ] as Array<[string, string, (v: string) => void]>
                      ).map(([label, value, setValue]) => (
                        <View key={label} className="flex-1 space-y-1.5">
                          <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {label}
                          </Text>
                          <TextInput
                            value={value}
                            onChangeText={text => {
                              // Typing a number supersedes "use the defaults" — whatever is in the
                              // boxes at Save time is what gets written either way.
                              setConfirmDefaultScoring(false);
                              setValue(text.replace(/[^0-9]/g, ''));
                            }}
                            keyboardType="number-pad"
                            placeholder="0"
                            placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white text-center"
                          />
                        </View>
                      ))}
                    </View>
                    {/* The step is only done once the event *has* a scoring system, but an
                        untouched 3 / 1 / 0 is not a change the form can register — so confirming
                        the defaults needs an affordance of its own. It does not write on its own:
                        it makes the page dirty and the save bar takes it from there. */}
                    {!event.settings?.scoring &&
                      (confirmDefaultScoring ? (
                        <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
                          The defaults will be confirmed when you save.
                        </Text>
                      ) : isDirty ? null : (
                        <View className="gap-2">
                          <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
                            These are the defaults. Confirm them as they are, or change them first.
                          </Text>
                          <Button
                            title="Use These Defaults"
                            onPress={() => setConfirmDefaultScoring(true)}
                            className="py-2.5 rounded-lg"
                          />
                        </View>
                      ))}
                  </>
                )}
              </View>
            </View>

            <SetupStepFooter
              label={step.label}
              nextStep={nextStep}
              onNext={handleNext}
              onBackToChecklist={handleBack}
              isDirty={isDirty}
              isProcessing={isProcessing}
              nextDisabled={isDirty && pointsIncomplete}
              onDismiss={dismissStep}
            />
          </View>
        </ScrollView>
      )}

      <FloatingSaveBar
        visible={isDirty}
        description="You have modified this tournament's scoring."
        onSave={() => handleSave()}
        onCancel={handleCancel}
        isProcessing={isProcessing}
        saveDisabled={pointsIncomplete}
      />
    </SafeAreaView>
  );
}
