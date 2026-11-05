import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useOrgAccess } from '../../../../hooks/useOrgAccess';
import { useSafeBack } from '../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { requestKeyFor, sendAction } from '../../../../services/actions';
import { readData } from '../../../../services/reads';
import { useRequestScope } from '../../../../hooks/useRequestScope';
import { useToastStore } from '../../../../store/toastStore';
import { SocketAction } from '@sk/shared';

import MatchForm, { MatchFormData } from '../../../../components/MatchForm';
import { venueInputsToInstant } from '../../../../utils/dates';
import { useActiveTheme } from '../../../../store/settingsStore';
import { themeColor } from '../../../../constants/Colors';

/**
 * Scheduling **one match** — which is now the only thing this screen does (U45).
 *
 * It used to serve tournaments as well, and for them it was a mistake: a tournament is not built
 * in one sitting, so a form that refused to write anything until it had a name, a venue, a
 * facility and a sport asked for more than an organiser knows in March, and then dropped them back
 * on the events list to go and find what they had just made. Creating a tournament is now a name
 * and a date on that list, and the Setup screen is the form.
 *
 * A single match is the opposite case and keeps its form: two teams and a kickoff time are settled
 * in one sitting, and the thing is complete the moment it is saved. Everything it asks lives in
 * [`<MatchForm>`](file:///c:/Fred/Coding/SK/expo-app/components/MatchForm.tsx), which the edit
 * screen mounts too — so what is left here is the save: a `SingleMatch` event, the one game inside
 * it, and any referrals the form collected on the way.
 */
export default function CreateEvent() {
  const isDark = useActiveTheme() === 'dark';
  const safeBack = useSafeBack();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();

  const [isProcessing, setIsProcessing] = useState(false);
  const [form, setForm] = useState<MatchFormData | null>(null);
  // Admin and Staff field any team; a coach their own (`PERM-5`).
  const access = useOrgAccess(orgId);

  const isFormValid = () =>
    !!form?.homeTeamId && !!form?.awayTeamId && !!form?.sportId && !!form?.siteId && !!form?.timeZone;

  /**
   * A match names itself after the teams playing it.
   *
   * The names are read at save time rather than tracked while the form is open: `MatchForm` owns
   * every list it offers and reports its answers as ids, and mirroring its team lists here just to
   * build one string is how the two would drift. Two reads, once, on a button press. If either fails
   * nothing is saved: a match must not be named "Team vs Team" because a read did (`SYNC-9`).
   */
  const readTeam = (teamId: string) => readData<{ name?: string } | null>('team', { id: teamId }, { suppressToast: true });

  // Kept across retries of one save, so a retry after the game fails does not create a second
  // match (SYNC-3): the event is answered from the server's replay rather than created again.
  const saveRequestScope = useRequestScope();

  const handleSubmit = async () => {
    if (!form || !form.timeZone || !isFormValid()) return;

    // The kick-off as the organiser typed it, on the venue's clock — or noon there that day while it
    // is TBD (date-formatting skill, DATE-2). Refused before anything is sent if the date or time is
    // half-typed.
    const scheduledStartTime = venueInputsToInstant(form.gameDate, form.isTbd ? null : form.startTime, form.timeZone);
    if (!scheduledStartTime) {
      useToastStore.getState().showError('Enter the full match date and start time.', 'Date Needed');
      return;
    }
    setIsProcessing(true);

    const [homeTeam, awayTeam] = await Promise.all([readTeam(form.homeTeamId), readTeam(form.awayTeamId)]);
    if (!homeTeam.ok || !awayTeam.ok) {
      const reason = !homeTeam.ok ? homeTeam.message : !awayTeam.ok ? awayTeam.message : '';
      useToastStore.getState().showError(`The team names did not load, so nothing was saved. ${reason}`, 'Match Not Saved');
      setIsProcessing(false);
      return;
    }

    const eventPayload = {
      name: `${homeTeam.data?.name || 'Team'} vs ${awayTeam.data?.name || 'Team'}`,
      type: 'SingleMatch' as const,
      startDate: form.gameDate,
      siteId: form.siteId || undefined,
      facilityId: form.facilityId || undefined,
      orgId,
      sportIds: form.sportId ? [form.sportId] : [],
      /* Both sides, the acting organisation included. It used to be filtered out on the grounds
         that the host is implicitly taking part; since 2026-09-21 participation is a row like any
         other, so leaving it out would be recording that the home side is not in its own match. */
      participatingOrgIds: [form.homeOrgId, form.awayOrgId].filter(Boolean) as string[],
      status: 'Scheduled' as const,
    };
    const eventResult = await sendAction(SocketAction.ADD_EVENT, eventPayload, {
      requestId: requestKeyFor(saveRequestScope.current(), SocketAction.ADD_EVENT, eventPayload),
    });
    // A refusal is already toasted; the form stays as filled in.
    if (!eventResult.ok) {
      setIsProcessing(false);
      return;
    }
    const newEvent = eventResult.data;

    // Toasted here rather than by `sendAction`, so the message can say the event did get created.
    const gamePayload = {
      eventId: newEvent.id,
      sportId: form.sportId,
      participants: [{ teamId: form.homeTeamId }, { teamId: form.awayTeamId }],
      scheduledStartTime,
      startTime: scheduledStartTime,
      siteId: form.siteId || undefined,
      facilityId: form.facilityId || undefined,
      customSettings: { timeTbd: form.isTbd },
    };
    const gameResult = await sendAction(SocketAction.ADD_GAME, gamePayload, {
      suppressToast: true,
      requestId: requestKeyFor(saveRequestScope.current(), SocketAction.ADD_GAME, gamePayload),
    });
    setIsProcessing(false);
    if (!gameResult.ok) {
      useToastStore
        .getState()
        .showError(`The match was created, but its game was not: ${gameResult.message}`, 'Game Not Added');
      return;
    }
    saveRequestScope.renew();
    safeBack(`/admin/${orgId}/events`);
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-line-soft bg-card z-10">
        <TouchableOpacity
          onPress={() => safeBack(`/admin/${orgId}/events`)}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color={themeColor(isDark, 'primary')} />
          <Text className="font-inter-bold text-xs text-ink-muted uppercase tracking-wider">
            Cancel
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-ink uppercase">
          Schedule Match
        </Text>
        <TouchableOpacity
          className={`active:opacity-85 ${!isFormValid() ? 'opacity-40' : ''}`}
          disabled={!isFormValid() || isProcessing}
          onPress={handleSubmit}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={themeColor(isDark, 'primary')} />
          ) : (
            <Text className="font-inter-bold text-xs text-primary-ink uppercase tracking-wider">
              Save
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 60 }}>
        <MatchForm orgId={orgId} onChange={setForm} ownTeamIds={access.canManage ? undefined : access.coachedTeamIds} />
      </ScrollView>
    </SafeAreaView>
  );
}
