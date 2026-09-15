import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Event, Facility, Site, SocketAction, TournamentOrganizer } from '@sk/shared';
import { AccessDenied } from '../../../../../../components/AccessDenied';
import CustomSelect from '../../../../../../components/CustomSelect';
import DatePicker from '../../../../../../components/DatePicker';
import { FloatingSaveBar, FLOATING_SAVE_BAR_PADDING } from '../../../../../../components/FloatingSaveBar';
import { OrganizerPicker } from '../../../../../../components/OrganizerPicker';
import { ScreenHeader } from '../../../../../../components/ScreenHeader';
import { FieldLabel } from '../../../../../../components/FieldLabel';
import { reportActionError } from '../../../../../../utils/actionErrors';
import { addDaysToDateString, isCompleteDateString } from '../../../../../../utils/dates';
import { FacilityPicker } from '../../../../../../components/tournament/FacilityPicker';
import { SetupStepFooter } from '../../../../../../components/tournament/SetupStepFooter';
import { useSetupStepScreen } from '../../../../../../hooks/useSetupStepScreen';
import { useUnsavedChanges } from '../../../../../../hooks/useUnsavedChanges';
import { useLiveRoom } from '../../../../../../hooks/useLiveRoom';
import { wsService } from '../../../../../../services/websocket';
import { useWsStore } from '../../../../../../store/wsStore';
import { useAuthStore } from '../../../../../../store/authStore';
import { useActiveTheme } from '../../../../../../store/settingsStore';
import { COLORS, getThemeColor } from '../../../../../../constants/Colors';

/**
 * What the tournament is, when it is, and where (U48).
 *
 * The first step, and the only one that is never dismissible: a tournament with no name and no
 * date is not a tournament. It carries the identity the events list shows, the **base site** and
 * the **set of facilities** — two different questions (U47) — and who is appointed to run it
 * (D33), because who runs it is known at the same time as the name and the dates.
 *
 * A division's own convenor and its own facilities are set on the division screen; this screen
 * never reaches into one.
 */
/**
 * A date field is as wide as a date (U49).
 *
 * `DatePicker` is `w-full`, so its width is whatever its parent gives it — which on a desktop card
 * was the whole card. 190px holds `YYYY-MM-DD` and the calendar button beside it with room to
 * spare, and lets `Starts` and `Ends` sit on one row without either resizing when the other
 * appears. `DATE_FIELD_HEIGHT` mirrors the picker's own `FIELD_HEIGHT` so the multi-day switch
 * bottom-aligns with the inputs rather than floating against their labels.
 */
const DATE_FIELD_WIDTH = 190;
const DATE_FIELD_HEIGHT = 44;

export default function SetupBasics() {
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();
  const isDark = useActiveTheme() === 'dark';
  /* 768px — the breakpoint `selection.tsx` uses and `UI-11` names as this repo's precedent. */
  const { width } = useWindowDimensions();
  const isWideLayout = width >= 768;
  const isConnected = useWsStore((state: any) => state.isConnected);
  const user = useAuthStore((state: any) => state.user);

  const {
    step,
    event,
    eventRoom,
    canEdit,
    isLoadingCapabilities,
    accessDenied,
    isProcessing,
    setIsProcessing,
    dismissedSteps,
    goBackToChecklist,
    nextStep,
    finishSave,
  } = useSetupStepScreen('basics');

  const { items: sites } = useLiveRoom<Site>(orgId ? `org:${orgId}:sites` : null, {
    reduce: (message) => {
      switch (message.type) {
        case 'SITES_SYNC':
          return { kind: 'replace', items: message.data || [] };
        case 'SITE_ADDED':
        case 'SITE_UPDATED':
          return { kind: 'upsert', item: message.data };
        case 'SITE_DELETED':
          return { kind: 'remove', id: message.data?.id };
        default:
          return { kind: 'ignore' };
      }
    },
  });

  const { items: facilities } = useLiveRoom<Facility>(orgId ? `org:${orgId}:facilities` : null, {
    reduce: (message) => {
      switch (message.type) {
        case 'FACILITIES_SYNC':
          return { kind: 'replace', items: message.data || [] };
        case 'FACILITY_ADDED':
        case 'FACILITY_UPDATED':
          return { kind: 'upsert', item: message.data };
        case 'FACILITY_DELETED':
          return { kind: 'remove', id: message.data?.id };
        default:
          return { kind: 'ignore' };
      }
    },
  });

  /**
   * The facilities in play (U47) — a set, and the base site beside it is not a filter on it.
   *
   * Held as `{ id }` rows because that is the shape `useLiveRoom` addresses items by; the ids are
   * what every consumer wants, which is what `savedFacilityIds` unwraps.
   *
   * **`event:{id}:facilities`, not `event:{id}`.** This listened on the event's own room until
   * 2026-09-15, which is where `EVENT_FACILITIES_SYNC` used to be published — the rooms were split
   * on 2026-09-11 and this screen was not moved with them. The message therefore never arrived:
   * saved facilities never loaded, and picking one left the form permanently dirty, because
   * `facilitiesDirty` compares against a baseline that could never be refreshed. Same shape as the
   * multi-day bug this screen already had — **a dirty flag must be clearable by the save it
   * triggers**, and one derived from a room nothing publishes to never is.
   */
  const { items: eventFacilityRows } = useLiveRoom<{ id: string }>(
    eventId ? `event:${eventId}:facilities` : null,
    {
      reduce: (message) =>
        message.type === 'EVENT_FACILITIES_SYNC'
          ? { kind: 'replace', items: (message.data?.facilityIds || []).map((id: string) => ({ id })) }
          : { kind: 'ignore' },
    }
  );

  const [editName, setEditName] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [editEndDate, setEditEndDate] = useState('');
  /** Where the tournament is *based* (U47). Shown on the listing, and the first venue the facility
   *  picker offers — never a limit on which facilities may be used. */
  const [editSiteId, setEditSiteId] = useState('');
  const [editFacilityIds, setEditFacilityIds] = useState<string[]>([]);
  const [organizers, setOrganizers] = useState<TournamentOrganizer[]>([]);

  useEffect(() => {
    if (!event) return;
    setEditName(event.name);
    setEditStartDate(event.startDate?.split('T')[0] || '');
    setIsMultiDay(!!event.endDate);
    setEditEndDate(event.endDate?.split('T')[0] || '');
    setEditSiteId(event.siteId || '');
  }, [event?.id, event?.name, event?.startDate, event?.endDate, event?.siteId]);

  /**
   * The facilities come from their own room message rather than from the event, so they seed on
   * their own — keyed on the ids themselves, so a re-publish that changes nothing does not stamp
   * on an organiser's unsaved selection.
   */
  const savedFacilityIds = useMemo(() => eventFacilityRows.map(row => row.id), [eventFacilityRows]);
  const savedFacilityKey = [...savedFacilityIds].sort().join();
  useEffect(() => {
    setEditFacilityIds(savedFacilityIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, savedFacilityKey]);

  useEffect(() => {
    if (!isConnected || !eventId || !canEdit) return;
    let active = true;
    wsService.emit('get_data', { type: 'event_organizers', eventId }, (res: any) => {
      if (active && Array.isArray(res)) setOrganizers(res);
    });
    return () => {
      active = false;
    };
  }, [isConnected, eventId, canEdit]);

  /**
   * An end date is **required** once the tournament runs over more than one day, and that is a
   * correctness rule rather than a preference (U49).
   *
   * Multi-day with no end date is a state that cannot be saved, because there is nothing to write:
   * `handleSave` sends `endDate: null`, the column was already null, so no field changes — and the
   * effect that re-seeds this form is keyed on the event's fields, so it never re-runs and
   * `isMultiDay` stays true. `identityDirty` then reports dirty forever and the save bar never goes
   * away however many times it is pressed. The state is meaningless *and* unreachable-from, so the
   * fix is to make it unreachable: Save is blocked while it holds, and the toggle seeds a date so
   * it almost never holds in the first place.
   *
   * The end must be strictly **after** the start, because that is what the switch beside it claims.
   * A zero-padded `YYYY-MM-DD` compares chronologically as a plain string, so no parsing is needed
   * once both are known to be complete dates.
   */
  const dateError = !isMultiDay
    ? null
    : !isCompleteDateString(editEndDate)
    ? 'Pick the day it ends.'
    : isCompleteDateString(editStartDate) && editEndDate <= editStartDate
    ? 'The last day must be after the first.'
    : null;

  /**
   * Turning the switch on offers a range rather than an empty required field.
   *
   * "Runs over more than one day" almost always means "and ends the next one", so the day after the
   * start is the answer far more often than not, and an organiser who wants a different one is
   * changing a date rather than finding one. It also means the form is never in the unsaveable
   * state above by simply having been toggled.
   */
  const handleMultiDayChange = (next: boolean) => {
    setIsMultiDay(next);
    if (next && (!isCompleteDateString(editEndDate) || editEndDate <= editStartDate)) {
      setEditEndDate(addDaysToDateString(editStartDate, 1) || '');
    }
  };

  const identityDirty =
    !!event &&
    (editName !== event.name ||
      editStartDate !== (event.startDate?.split('T')[0] || '') ||
      isMultiDay !== !!event.endDate ||
      (isMultiDay && editEndDate !== (event.endDate?.split('T')[0] || '')) ||
      editSiteId !== (event.siteId || ''));
  /** Its own flag, because it saves through its own action against its own table. */
  const facilitiesDirty = [...editFacilityIds].sort().join() !== savedFacilityKey;
  const isDirty = canEdit && (identityDirty || facilitiesDirty);

  const handleCancel = useCallback(() => {
    if (!event) return;
    setEditName(event.name);
    setEditStartDate(event.startDate?.split('T')[0] || '');
    setIsMultiDay(!!event.endDate);
    setEditEndDate(event.endDate?.split('T')[0] || '');
    setEditSiteId(event.siteId || '');
    setEditFacilityIds(savedFacilityIds);
  }, [event, savedFacilityIds]);

  const { confirmThenNavigate } = useUnsavedChanges(isDirty && !isProcessing, handleCancel);

  /**
   * `UPDATE_EVENT` carries only this screen's fields — it is a patch, so the sports and the invite
   * list edited on their own screens are not touched by a save here.
   *
   * The facilities are a second write, and deliberately so: `event_facilities` is a different
   * table with an action of its own, and folding it into `UPDATE_EVENT` would mean teaching that
   * action about a join table to save one round trip.
   */
  const handleSave = useCallback(
    (onDone?: () => void) => {
      if (!event || !editName.trim() || dateError) return;

      setIsProcessing(true);
      wsService.emit(
        'action',
        {
          type: SocketAction.UPDATE_EVENT,
          payload: {
            id: eventId,
            userId: user?.id,
            orgId,
            data: {
              name: editName.trim(),
              startDate: `${editStartDate}T12:00:00.000Z`,
              endDate: isMultiDay && editEndDate ? `${editEndDate}T12:00:00.000Z` : null,
              siteId: editSiteId || null,
            },
          },
        },
        (response: any) => finishSave(response, onDone)
      );

      /* The second write of this save, and the one that has to report for itself: it had no ack
         handler at all, so a refused facility change was silent and left the bar up with nothing
         said. It does not call `finishSave` — the event write owns the dirty state and the
         navigation — it only speaks up when it fails. */
      if (facilitiesDirty) {
        wsService.emit(
          'action',
          {
            type: SocketAction.SET_EVENT_FACILITIES,
            payload: { eventId, orgId, facilityIds: editFacilityIds },
          },
          (response: any) =>
            reportActionError(response, 'Those facilities could not be saved.')
        );
      }
    },
    [
      event,
      editName,
      editStartDate,
      isMultiDay,
      editEndDate,
      dateError,
      editSiteId,
      editFacilityIds,
      facilitiesDirty,
      eventId,
      orgId,
      user?.id,
      setIsProcessing,
      finishSave,
    ]
  );

  const handleBack = useCallback(
    () => confirmThenNavigate(() => goBackToChecklist()),
    [confirmThenNavigate, goBackToChecklist]
  );

  /** Next writes first when there is something to write, so nobody is asked to discard the step
   *  they have just filled in. */
  const handleNext = useCallback(() => {
    const go = () => goBackToChecklist(nextStep);
    if (isDirty) handleSave(go);
    else go();
  }, [isDirty, handleSave, goBackToChecklist, nextStep]);

  // Gated on `!isLoadingCapabilities`, or the screen shows Access Restricted for a beat on every
  // load while the capability read is still in flight.
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
        <ScrollView
          className="flex-1 px-6 py-6"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: isDirty ? FLOATING_SAVE_BAR_PADDING : 60 }}
        >
          <View className="space-y-6">
            <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl">
              <View className="p-5 space-y-4">
                <View className="space-y-1.5">
                  <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Name
                  </Text>
                  <TextInput
                    value={editName}
                    onChangeText={setEditName}
                    placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white"
                  />
                </View>

                {/* ------------------------------------------------------------------ when ---
                    **One question, not three fields** (U49). A date range is a single value, so
                    its two ends sit side by side, and the switch that decides whether there *is*
                    a second end governs the pair rather than sitting between them — which is
                    where it used to be, severing the range it relates.

                    **The fields are date-width, not container-width.** A field's size is a
                    promise about its content: a date input stretched across a desktop card
                    promises a paragraph and takes eight characters. Fixing the width also keeps
                    `Ends` from resizing `Starts` when it appears — two `flex-1` fields would
                    halve the one the organiser just filled in.

                    Below 768px (the breakpoint `UI-11` names as this repo's) the row stacks and
                    the fields go full width, where thumb targets matter more than proportion. */}
                <View className={isWideLayout ? 'flex-row items-end gap-4' : 'gap-4'}>
                  <View className="gap-1.5" style={isWideLayout ? { width: DATE_FIELD_WIDTH } : undefined}>
                    <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Starts
                    </Text>
                    <DatePicker value={editStartDate} onChange={setEditStartDate} />
                  </View>

                  {isMultiDay && (
                    <View className="gap-1.5" style={isWideLayout ? { width: DATE_FIELD_WIDTH } : undefined}>
                      <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Ends
                      </Text>
                      <DatePicker value={editEndDate} onChange={setEditEndDate} />
                    </View>
                  )}

                  {/* `items-end` on the row plus the field height here bottom-aligns the switch
                      with the inputs rather than with the labels above them. */}
                  <View
                    className={`flex-row items-center gap-3 ${
                      isWideLayout ? 'flex-1 justify-end' : 'justify-between'
                    }`}
                    style={isWideLayout ? { height: DATE_FIELD_HEIGHT } : undefined}
                  >
                    <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
                      Runs over more than one day
                    </Text>
                    <Switch
                      value={isMultiDay}
                      onValueChange={handleMultiDayChange}
                      trackColor={{ true: COLORS.brand.orange }}
                    />
                  </View>
                </View>

                {/* Under the row rather than under the field, so showing it cannot disturb the
                    alignment of the inputs beside it. */}
                {!!dateError && (
                  <Text className="font-inter text-[11px] text-brand-red">{dateError}</Text>
                )}

              </View>

              {/* --------------------------------------------------------------------- where ---
                  The site and the facilities are one question — *where does this happen* — so they
                  share a section (U49). They were split across the divider, with `Based at` sitting
                  among the name and the dates and the facilities alone below it, which put the
                  container and its contents in different groups.

                  They remain two **fields**, because they answer different halves: the site is
                  where the tournament *is* — what the listing shows and what the picker opens on —
                  and the facilities are what it *uses*, which may include the fields next door
                  (U47). Choosing a site restricts nothing. */}
              <View className="p-5 gap-4 border-t border-slate-200 dark:border-white/5">
                <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Where
                </Text>

                {/* No `zIndex` here: it used to lift this field over the one below for an inline
                    dropdown, and `CustomSelect` has since moved its list into a modal. All the
                    leftover value did was create a stacking context that trapped neighbouring
                    overlays — the field help bubble rendered behind this input because of it. */}
                <View className="gap-1.5">
                  <FieldLabel
                    label="Based at"
                    help="Where the tournament is based — what the listing shows and where the facility picker opens. It does not restrict anything: a tournament based at the school can still use the courts next door."
                  />
                  <CustomSelect
                    options={sites.map(s => ({ label: s.name, value: s.id }))}
                    value={editSiteId}
                    onChange={setEditSiteId}
                    placeholder="Select a site..."
                    clearable
                  />
                </View>

                <View className="gap-1.5">
                  {/* Not "fields": a facility is anything at a site worth putting a pin on — the
                      categories include tuck shops, parking and toilets — so half of what belongs
                      here is never played on. The guidance lives in `help` and nowhere else; the
                      picker's `emptyLabel` used to repeat it a line further down. */}
                  <FieldLabel
                    label="Tournament Facilities"
                    help="Pick every facility this tournament uses — the courts and fields it plays on, and the tuck shop, parking and toilets people will look for. These become the pins on the tournament map."
                  />
                  <FacilityPicker
                    sites={sites}
                    facilities={facilities}
                    value={editFacilityIds}
                    onChange={setEditFacilityIds}
                    baseSiteId={editSiteId || undefined}
                  />
                </View>
              </View>

              {/* Appointing an organiser (D33). Who runs it is known with the name and the dates,
                  which is why it sits in Basic Info; a division's own convenor is appointed on the
                  division screen. */}
              <View className="p-5 border-t border-slate-200 dark:border-white/5">
                <OrganizerPicker
                  eventId={eventId}
                  hostOrgId={(event as Event).orgId}
                  actingOrgId={orgId}
                  organizers={organizers}
                  onChange={setOrganizers}
                  canManage={canEdit}
                  label="Tournament organisers"
                />
              </View>
            </View>

            <SetupStepFooter
              label={step.label}
              nextStep={nextStep}
              onNext={handleNext}
              onBackToChecklist={handleBack}
              isDirty={isDirty}
              isProcessing={isProcessing}
              nextDisabled={!editName.trim()}
            />
          </View>
        </ScrollView>
      )}

      <FloatingSaveBar
        visible={isDirty}
        description="You have modified this tournament's basics."
        onSave={() => handleSave()}
        onCancel={handleCancel}
        isProcessing={isProcessing}
        saveDisabled={!editName.trim() || !!dateError}
      />
    </SafeAreaView>
  );
}
