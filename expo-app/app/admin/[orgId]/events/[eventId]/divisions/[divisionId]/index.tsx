import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Event,
  Facility,
  Site,
  SocketAction,
  Sport,
  TournamentDivision,
  TournamentOrganizer,
  divisionAutoName,
  findTakenDivisionName,
  isAutomaticDivisionName,
  reseedDecision,
} from '@sk/shared';
import { FieldLabel } from '../../../../../../components/FieldLabel';
import { ConfirmationModal } from '../../../../../../components/ConfirmationModal';
import CustomSelect from '../../../../../../components/CustomSelect';
import { AgeGroupPicker } from '../../../../../../components/AgeGroupPicker';
import { GlassCard } from '../../../../../../components/GlassCard';
import { ScreenHeader } from '../../../../../../components/ScreenHeader';
import { DivisionPanel } from '../../../../../../components/tournament/DivisionPanel';
import { enteredTeamCount, useDivisionEntrants } from '../../../../../../hooks/useDivisionEntrants';
import { DivisionStandings } from '../../../../../../components/tournament/DivisionStandings';
import { OrganizerPicker } from '../../../../../../components/OrganizerPicker';
import { FacilityPicker } from '../../../../../../components/tournament/FacilityPicker';
import { useLiveRoom } from '../../../../../../hooks/useLiveRoom';
import { useEventCapabilities } from '../../../../../../hooks/useEventCapabilities';
import { useSafeBack } from '../../../../../../hooks/useSafeBack';
import { useUnsavedChanges } from '../../../../../../hooks/useUnsavedChanges';
import { wsService } from '../../../../../../services/websocket';
import { sendAction } from '../../../../../../services/actions';
import { useWsStore } from '../../../../../../store/wsStore';
import { useActiveTheme } from '../../../../../../store/settingsStore';
import { COLORS, getThemeColor } from '../../../../../../constants/Colors';

/** The fields the details form edits, plus the division they belong to. */
interface DivisionDraft {
  divisionId: string;
  customName: string | null;
  sportId: string;
  ageGroupId: string | null;
}

/** Equality over what the form edits — the division id is identity, not a field. */
const same = (a: DivisionDraft, b: DivisionDraft) =>
  a.customName === b.customName && a.sportId === b.sportId && a.ageGroupId === b.ageGroupId;

/**
 * A division's own screen (U13).
 *
 * A division is in effect a tournament within a tournament — its own format, venues, entrants and
 * table — which on its own justifies a screen. It is also the unit of delegation (D22/D31/D33), so
 * a convenor needs a link that can be sent to them, and this is that link.
 *
 * **Every division has one, the only division included (U50).** It used to exist only for a
 * tournament with several, because the collapse rule (U15) hid a lone division altogether. Setup now
 * always lists the division and opens it here, since this is where it is given a sport and an age
 * group. The Schedule tab still shows a lone division's fixtures inline, through the same panel
 * this screen mounts, so the two cannot drift.
 */
export default function DivisionScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, eventId, divisionId } = useLocalSearchParams<{
    orgId: string;
    eventId: string;
    divisionId: string;
  }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  /**
   * A division's permissions, derived rather than sent.
   *
   * Phase 4 deliberately keeps this off the division object: a `canEdit` there would be published
   * to a room, so one viewer's answer would reach every other viewer of the same division. The
   * flags themselves are computed below the division, because since 2026-09-20 one of them depends
   * on the sport it plays.
   */
  const { capabilities } = useEventCapabilities(eventId);

  // The division record, which is `division:{id}` now rather than a passenger on the fixtures room
  // (rule 4). The record is public — a spectator reading a draw needs the division's name — which
  // is why the tier moved with it.
  const { items: divisions, accessDenied } = useLiveRoom<TournamentDivision>(
    divisionId ? `division:${divisionId}` : null,
    {
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
    }
  );

  const division = divisions.find(d => d.id === divisionId);

  /**
   * Whether this viewer runs the *sport* this division plays (2026-09-20).
   *
   * Read off the division rather than the route — which is why these flags sit below the room
   * that loads it — so the answer follows the division if its sport changes. That is the whole
   * point of a sport grant being a rule and not a list.
   */
  const runsThisSport =
    !!division?.sportId && !!capabilities?.convenesSportIds.includes(division.sportId);
  const canEdit =
    !!capabilities &&
    (capabilities.canEditEvent || capabilities.convenesDivisionIds.includes(divisionId) || runsThisSport);
  /**
   * Who may change the division's own record and delete it.
   *
   * Appointing is no longer the event organisers' alone: since 2026-09-19 a convenor may add
   * co-convenors to their own division and remove the ones they added (D33, revised). The picker is
   * shown to anyone with `canEdit`, and the server marks which rows this viewer may remove.
   *
   * The record itself — name, sport, age group — was an event-level decision (D33, widened
   * 2026-09-03): a convenor runs what happens *inside* the division, not how it sits in the event.
   * A sport's organiser is the exception added on 2026-09-20: they may add and delete divisions of
   * their sport, so withholding *rename* from them would be a line with nothing behind it.
   */
  const canEditRecord = !!capabilities?.canEditEvent || runsThisSport;
  const canAppoint = canEditRecord;

  /*
    The tournament's name, for the header — `Fred's Test Tournament - Rugby U14`, the same shape the
    setup step screens use (U49). `event:{id}` is the event record and nothing else since the room
    split, and it is ref-counted, so a screen pushed over the tournament reuses the join it has.
  */
  const { items: events } = useLiveRoom<Event>(eventId ? `event:${eventId}` : null, {
    reduce: (message) => {
      switch (message.type) {
        case 'EVENT_ADDED':
        case 'EVENT_UPDATED':
          return { kind: 'upsert', item: message.data };
        case 'EVENT_DELETED':
          return { kind: 'remove', id: message.data?.id };
        default:
          return { kind: 'ignore' };
      }
    },
  });
  const event = events.find(e => e?.id === eventId);

  const [organizers, setOrganizers] = useState<TournamentOrganizer[]>([]);

  /*
    Where this division is played (U47).

    A division narrows the tournament's facilities to its own subset, or names none and inherits
    them — "u14 rugby is on Fields 3 and 4" against "wherever there is room". The event's set is the
    ceiling, so it is read here to bound the picker; the names come from the organisation's own
    rooms, which is where every other screen gets them.
  */
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
   * The event's facilities — a one-shot read, not a room.
   *
   * This screen has no reason to join the event room: it would then hold the whole tournament's
   * fixtures and divisions to render one ceiling. What it needs is a list that only an organiser
   * changes, on a screen a convenor opens for one division at a time.
   */
  const [eventFacilityIds, setEventFacilityIds] = useState<string[]>([]);
  useEffect(() => {
    if (!isConnected || !eventId) return;
    let active = true;
    wsService.emit('get_data', { type: 'event_facilities', eventId }, (res: any) => {
      if (active && Array.isArray(res)) setEventFacilityIds(res);
    });
    return () => {
      active = false;
    };
  }, [isConnected, eventId]);

  const [draftFacilityIds, setDraftFacilityIds] = useState<string[]>([]);
  const [isSavingFacilities, setIsSavingFacilities] = useState(false);
  const savedFacilityKey = [...(division?.facilityIds || [])].sort().join();

  /**
   * A baseline of its own, for the same reasons as the details above — the facilities are a
   * different subject, saved by a different action against a different table, so one combined
   * baseline would let a remote rename decide what happens to an unsaved venue choice.
   *
   * `null` means "not loaded"; `''` means "none chosen", which is an ordinary saved state.
   */
  const [facilityBaseline, setFacilityBaseline] = useState<{ divisionId: string; key: string } | null>(
    null
  );
  /**
   * Scoped to the division, and it has to be. The key alone would carry across a navigation
   * whenever two divisions happen to have the same venues — including the common case of both
   * having none, where an unsaved choice made on the first would follow you to the second.
   */
  const facilityBaselineKey =
    facilityBaseline?.divisionId === divisionId ? facilityBaseline.key : null;

  const seedFacilities = useCallback(
    (ids: string[], key: string, forDivisionId: string) => {
      setDraftFacilityIds(ids);
      setFacilityBaseline({ divisionId: forDivisionId, key });
    },
    []
  );

  useEffect(() => {
    if (!division) return;
    const decision = reseedDecision<string>({
      baseline: facilityBaselineKey,
      // Compared as a sorted key, so order is not a change.
      drafts: [...draftFacilityIds].sort().join(),
      incoming: savedFacilityKey,
      same: (a, b) => a === b,
    });
    if (decision === 'adopt') seedFacilities(division.facilityIds || [], savedFacilityKey, divisionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionId, savedFacilityKey]);

  const facilitiesDirty =
    facilityBaselineKey !== null && [...draftFacilityIds].sort().join() !== facilityBaselineKey;

  const handleSaveFacilities = () => {
    setIsSavingFacilities(true);
    // The saved list follows the division room, so success needs nothing; a refusal is toasted.
    sendAction(SocketAction.SET_DIVISION_FACILITIES, {
      divisionId,
      orgId,
      facilityIds: draftFacilityIds,
    }).then(() => setIsSavingFacilities(false));
  };

  /*
    What this division is: its name, its sport and its age group (U50).

    The name used to be edited behind a pencil in the header, on a card that appeared above
    everything else. It is an ordinary field now, first in the card, the way a tournament's name
    is the first field of Basic Info — one form, one save, rather than a second editing mode.

    Until 2026-09-19 neither could be set anywhere. The only control was the sport chips on the
    setup screen, which wrote to the division only while it was the only one — so a second division
    read "No sport set" with no way to change it. They live here because they are the division's
    own facts: they decide which teams qualify as entrants, and the tournament's list of sports is
    read off them (the server keeps `events.sportIds` in step on every save).
  */
  // Sports are global reference data that no room owns, so this stays a one-shot read.
  const [sports, setSports] = useState<Sport[]>([]);
  useEffect(() => {
    if (!isConnected) return;
    let active = true;
    wsService.emit('get_data', { type: 'sports' }, (res: any) => {
      if (active && Array.isArray(res)) setSports(res);
    });
    return () => {
      active = false;
    };
  }, [isConnected]);

  /*
    **The name can be left to the app (U50).** Most divisions are called what they are — "Rugby
    U14" — so a name nobody typed is derived from the sport and age group and follows them as
    they change. Typing takes it over; emptying the field hands it back, and the derived name then
    shows as the placeholder and is what gets saved.

    `customName` is `null` while the name is automatic, and the organiser's own text otherwise.
    Nothing is stored to say which a saved name was: a saved name is treated as automatic when it
    is what the app would have produced anyway — the derived name, the tournament's name the first
    division is created with, or the `Division 2` that *Add a division* hands out — and as the
    organiser's own otherwise. A hand-typed "Rugby U14" is indistinguishable from the automatic
    one, and that is fine: it is the same name, and it will follow the sport the same way.
  */
  const [customName, setCustomName] = useState<string | null>(null);
  const [draftSportId, setDraftSportId] = useState('');
  const [draftAgeGroupId, setDraftAgeGroupId] = useState<string | null>(null);
  // The name goes into the automatic division name; kept beside the id because a custom entry the
  // organiser has just added is not in `sports` until the list is next loaded.
  const [draftAgeGroupName, setDraftAgeGroupName] = useState('');
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  /**
   * The division as the drafts were last seeded from it — what "unsaved" is measured against.
   *
   * Comparing the drafts to the **live** `division` instead looks equivalent and is not, because
   * the live record changes under an open screen. A `DIVISION_UPDATED` from another device arrives
   * one render before the effect that re-seeds the drafts, so for that one frame the new record
   * sits beside the old drafts and the screen declares itself dirty: **the Save row flashes up on
   * every other viewer's screen each time somebody edits the division.** Measuring against a
   * baseline that only moves when the drafts move removes the window entirely rather than making
   * it shorter.
   *
   * `null` until the division has loaded, which is also what keeps an empty screen from reading as
   * an edit of a division it does not have yet.
   */
  const [baseline, setBaseline] = useState<DivisionDraft | null>(null);

  /*
    The tournament's other divisions, for two questions. Is this the last division of its sport? The
    server removes a sport when its last division is deleted or moved (U52), and both are warned
    about before they happen. And does another division already play this sport at this age group?
    That is allowed, but it is said, and the automatic name is numbered to tell them apart. The room
    is ref-counted, so a screen opened from Sports & Divisions reuses the join that screen holds.
  */
  const { items: eventDivisions } = useLiveRoom<TournamentDivision>(
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
  const siblingDivisions = eventDivisions.filter(d => d.id !== divisionId);
  const siblingNames = siblingDivisions.map(d => d.name);

  /* Numbered when another division already holds the name — `Rugby U14 - 2` — and a numbered name
     this division already has is kept while it is free (`divisionAutoName`). */
  const deriveName = useCallback(
    (sportId?: string, ageGroup?: string) =>
      divisionAutoName(
        sports.find(sport => sport.id === sportId)?.name,
        ageGroup,
        siblingNames,
        division?.name
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sports, siblingNames.join('\u0000'), division?.name]
  );

  const savedCustomName = useMemo(() => {
    const isAutomatic = isAutomaticDivisionName(division?.name, {
      sportName: sports.find(sport => sport.id === division?.sportId)?.name,
      ageGroup: division?.ageGroup,
      eventName: event?.name,
    });
    return isAutomatic ? null : division?.name || '';
  }, [division?.name, division?.sportId, division?.ageGroup, event?.name, sports]);

  /*
    The sports this division may play: the tournament's (U51). The server holds the same line, so
    this is the list it would accept. A division's current sport is kept as a choice even when the
    tournament no longer lists it — a division from before U51 should show what it plays rather than
    appear to play nothing — and it is marked so the organiser can see why it is odd.
  */
  const eventSportIds = event?.sportIds || [];
  const sportChoices = sports.filter(
    sport =>
      (eventSportIds.includes(sport.id) || sport.id === division?.sportId) &&
      // Moving a division between sports is the tournament's decision (2026-09-20): the gate
      // refuses it for a sport's own organiser, so their dropdown holds their current sport alone
      // rather than offering a choice that would be refused.
      (!!capabilities?.canEditEvent || sport.id === division?.sportId)
  );
  /* With a single sport there is nothing to choose: the server gives every division that sport, and
     a division that somehow has none is offered it here as the draft, to be saved like any edit. */
  const onlyEventSportId = eventSportIds.length === 1 ? eventSportIds[0] : undefined;

  /** The division's saved values, in the shape the drafts hold them. */
  const saved: DivisionDraft = {
    divisionId,
    customName: savedCustomName,
    sportId: division?.sportId || onlyEventSportId || '',
    ageGroupId: division?.ageGroupId || null,
  };

  const seedDetails = useCallback((from: DivisionDraft, ageGroupName: string) => {
    // One batch, so the drafts and the baseline they are measured against never disagree even for
    // a render — which is the whole point of having a baseline.
    setCustomName(from.customName);
    setDraftSportId(from.sportId);
    setDraftAgeGroupId(from.ageGroupId);
    setDraftAgeGroupName(ageGroupName);
    setBaseline(from);
  }, []);

  /**
   * Take the saved values, unless doing so would throw away an edit in progress.
   *
   * Three cases arrive down this path and only the third is a conflict:
   *
   * - **A different division** — always re-seed; these are not the same form.
   * - **Nothing typed here** (the drafts still match the baseline) — re-seed, so a change made on
   *   another device appears rather than being invisible until the next visit.
   * - **This device's own save landing back** — the drafts already equal what arrived, so
   *   re-seeding is a no-op for them and moves the baseline, which is what brings the Save row
   *   down.
   *
   * Otherwise somebody is part-way through an edit and the incoming values are somebody else's.
   * **Their typing is kept.** The old effect re-seeded unconditionally, so a remote change to *any*
   * field silently discarded a half-typed name on every other open screen — the exact loss
   * `useUnsavedChanges` exists to prevent, arriving through the back door.
   */
  useEffect(() => {
    if (!division) return;
    const decision = reseedDecision<DivisionDraft>({
      // A different division is a different form, so whatever was typed in the last does not carry
      // over. Expressed as "no baseline" rather than as an effect of its own, which would run
      // *after* this one and leave the drafts a render behind.
      baseline: baseline?.divisionId === divisionId ? baseline : null,
      drafts: { divisionId, customName, sportId: draftSportId, ageGroupId: draftAgeGroupId },
      incoming: saved,
      same,
    });
    if (decision === 'adopt') seedDetails(saved, division.ageGroup || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionId, savedCustomName, division?.sportId, division?.ageGroupId, division?.ageGroup, onlyEventSportId]);

  // An age group belongs to one sport, so choosing another clears it (the server does the same).
  const chooseSport = (sportId: string) => {
    if (sportId !== draftSportId) {
      setDraftAgeGroupId(null);
      setDraftAgeGroupName('');
    }
    setDraftSportId(sportId);
  };

  const derivedName = deriveName(draftSportId, draftAgeGroupName || undefined);
  const nameIsAutomatic = !customName?.trim();
  /* An automatic name with nothing to derive it from keeps what the division is already called,
     rather than saving a blank. */
  const effectiveName = customName?.trim() || derivedName || division?.name || '';
  /*
    Names are unique within a tournament, ignoring case (`findTakenDivisionName`, the rule the server
    enforces). Checked as it is typed, against the tournament's other divisions as they are right
    now, so the clash is shown before Save rather than refused after it. The automatic name is
    numbered to avoid one, so in practice this only fires on a name somebody typed.
  */
  const nameClash = findTakenDivisionName(effectiveName, siblingNames);
  /**
   * Measured against the **baseline**, and over the fields the organiser actually edits.
   *
   * Not `effectiveName`, which is derived: the automatic name is numbered against the division's
   * siblings, so renaming a *different* division can change it here without anybody touching this
   * form. Comparing the inputs instead means the Save row answers "have I changed anything", which
   * is the question it is asking.
   */
  const detailsDirty =
    !!division &&
    !!baseline &&
    (customName !== baseline.customName ||
      draftSportId !== baseline.sportId ||
      draftAgeGroupId !== baseline.ageGroupId);

  /** Cancel goes back to what is saved now, not to what was saved when the screen opened. */
  const resetDetails = useCallback(() => {
    seedDetails(saved, division?.ageGroup || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedDetails, savedCustomName, division?.sportId, division?.ageGroupId, division?.ageGroup, onlyEventSportId]);

  /**
   * `FIX-17` — the sport is fixed once teams are entered, and the age group is not.
   *
   * Both halves are the server's rule; these read the roster so the screen can say so in advance.
   * A control that explains itself beats one that is refused on save, especially here, where the
   * organiser's next move differs per case: a blocked sport means *make another division*, while a
   * changed age group means *swap these teams out*.
   *
   * Placeholders (D7) are excluded deliberately. An entrant with a label and no team contradicts
   * no sport, so a division holding only "Winner of the regional qualifier" is still free.
   */
  const { entrants: divisionEntrants } = useDivisionEntrants(divisionId, canEditRecord);
  const enteredTeams = enteredTeamCount(divisionEntrants);
  const sportLocked = enteredTeams > 0;

  /**
   * Entered teams that the *draft* age group would turn into overrides.
   *
   * Not a refusal — an override is a state the entry grid renders and tags, and swapping the teams
   * is the organiser's job afterwards. But it reclassifies entrants that were matching a moment
   * ago, which is too much to do without saying how many. Moving to "Any age" makes nothing an
   * override, because a division that names no age group admits every age.
   */
  const ageGroupOverrides = !draftAgeGroupId
    ? 0
    : divisionEntrants.filter(
        entrant => !!entrant.teamId && entrant.teamAgeGroupId !== draftAgeGroupId
      ).length;
  const ageGroupChanging = draftAgeGroupId !== (division?.ageGroupId || null);

  const savedSportName = sports.find(sport => sport.id === division?.sportId)?.name;
  const isLastOfSport =
    !!division?.sportId &&
    eventSportIds.includes(division.sportId) &&
    !eventDivisions.some(d => d.id !== divisionId && d.sportId === division.sportId);
  const sportChanging = !!draftSportId && draftSportId !== (division?.sportId || '');

  const [isConfirmingSportMove, setIsConfirmingSportMove] = useState(false);
  const [isConfirmingAgeGroup, setIsConfirmingAgeGroup] = useState(false);

  const writeDetails = () => {
    setIsSavingDetails(true);
    sendAction(SocketAction.UPDATE_DIVISION, {
      id: divisionId,
      orgId,
      data: {
        name: effectiveName,
        // A division always plays a sport (U52); an empty draft means "not chosen yet" on a
        // division from before that, and is left out rather than sent as a clear.
        ...(draftSportId ? { sportId: draftSportId } : {}),
        ageGroupId: draftAgeGroupId,
      },
    }).then(() => setIsSavingDetails(false));
  };

  const handleSaveDetails = () => {
    if (sportChanging && isLastOfSport) {
      setIsConfirmingSportMove(true);
      return;
    }
    // Asked second, so the sport dialog — which is about the *tournament* losing a sport — is not
    // stacked behind one about this division's entrants. The two cannot both apply in any case:
    // an entered team locks the sport, so `sportChanging` implies nothing is entered.
    if (ageGroupChanging && ageGroupOverrides > 0) {
      setIsConfirmingAgeGroup(true);
      return;
    }
    writeDetails();
  };

  /*
    Deleting a division (`FIX-16`). Event organisers only — a convenor runs a division but may not
    remove it (D33, and the gate says the same). Its fixtures survive (`games.stage_id` is
    `ON DELETE SET NULL`); its entrants, stages and table do not, and the dialog says so.
  */
  /*
    Deleting the last division of a sport removes the sport from the tournament (U52), which is the
    tournament's decision and not the sport organiser's — the server refuses it. So the button is
    withheld rather than offered and refused, and the line below says why it is not there.
  */
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const handleDelete = () => {
    setIsDeleting(true);
    sendAction(SocketAction.DELETE_DIVISION, { id: divisionId, orgId }).then(result => {
      setIsDeleting(false);
      setIsConfirmingDelete(false);
      // A failed delete leaves the organiser on the division; the refusal is already toasted.
      if (!result.ok) return;
      router.replace(`/admin/${orgId}/events/${eventId}/setup/playing`);
    });
  };

  /* Memoised, and it has to be: `useUnsavedChanges` re-registers whenever this function's identity
     changes, and registering writes to a store this screen subscribes to — an inline arrow here is
     a render loop ("Maximum update depth exceeded"), which is what the first cut of U50 shipped.
     `savedFacilityKey` stands in for `division.facilityIds`, which is a new array on every sync. */
  const handleDiscard = useCallback(() => {
    resetDetails();
    seedFacilities(division?.facilityIds || [], savedFacilityKey, divisionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetDetails, seedFacilities, savedFacilityKey, divisionId]);

  const { confirmThenNavigate } = useUnsavedChanges(
    ((canEditRecord && detailsDirty) || (canEdit && facilitiesDirty)) && !isSavingDetails && !isSavingFacilities,
    handleDiscard
  );

  useEffect(() => {
    if (!isConnected || !divisionId || !canEdit) return;
    let active = true;
    wsService.emit('get_data', { type: 'division_organizers', divisionId }, (res: any) => {
      if (active && Array.isArray(res)) setOrganizers(res);
    });
    return () => {
      active = false;
    };
  }, [isConnected, divisionId, canEdit]);

  if (accessDenied) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950 justify-center items-center px-8">
        <Ionicons name="lock-closed-outline" size={44} color={COLORS.dark.textSecondary} style={{ opacity: 0.3 }} />
        <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300 mt-4">
          No Access
        </Text>
        <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 text-center mt-1">
          You do not have permission to view this part of the tournament.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      <ScreenHeader
        context={event?.name}
        title={division?.name || 'Division'}
        onBack={() => confirmThenNavigate(() => safeBack(`/admin/${orgId}/events/${eventId}`))}
      />

      {!division ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.brand.orange} />
        </View>
      ) : (
        <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 60 }}>
          <View className="space-y-6">
            <GlassCard className="border border-slate-200 dark:border-white/5 p-5 space-y-4">
              {canEditRecord && (
                <View className="space-y-2">
                  <FieldLabel
                    label="Division Name"
                    help="Leave it to fill itself in from the sport and age group — Rugby U14 — and it follows them if they change. Or type your own, such as Girls' Open; clear it again to go back to the automatic name."
                  />
                  <TextInput
                    value={customName ?? derivedName}
                    onChangeText={setCustomName}
                    placeholder={
                      derivedName
                        ? `${derivedName} (automatic)`
                        : 'Filled in from the sport and age group, or type your own'
                    }
                    placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                    className={`bg-slate-50 dark:bg-slate-950 border rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white ${
                      nameClash ? 'border-red-500' : 'border-slate-200 dark:border-white/5'
                    }`}
                  />
                  {nameClash ? (
                    <Text
                      accessibilityLiveRegion="polite"
                      className="font-inter text-[11px] text-red-600 dark:text-red-400"
                    >
                      Another division is already called "{nameClash}". Division names must be
                      different — capitals do not count as a difference.
                    </Text>
                  ) : nameIsAutomatic && !!derivedName && (
                    <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
                      Automatic — follows the sport and age group.
                    </Text>
                  )}
                </View>
              )}

              {/* Sport and age group — the pair that says what the division *is*, and what its
                  automatic name is made of. Side by side: both are dropdowns, so neither needs the
                  full width, and reading them as one line matches how the division is named. */}
              <View className="flex-row gap-3">
                <View className="flex-1 space-y-2">
                  {/*
                    `FIX-17`'s explanation lives in the help rather than under the field.

                    It is guidance, not a property of the division: true only while teams are
                    entered, read once, and then permanent furniture on a screen an organiser
                    returns to. That is exactly what `<FieldLabel>` exists for — shown inline by
                    default, so nobody has to go looking for why the dropdown is a line of text,
                    and put away for good by anyone who has learned it.
                  */}
                  <FieldLabel
                    label="Sport"
                    help={
                      sportLocked
                        ? `The sport played in this division. Fixed now that ${enteredTeams} ${
                            enteredTeams === 1 ? 'team has' : 'teams have'
                          } been entered — remove them to change it, or add a division for the other sport.`
                        : 'The sport played in this division.'
                    }
                  />
                  {canEditRecord && sportLocked ? (
                    /* Plain text, like the read-only case below, because that is what it is now.
                       The server refuses the same change. */
                    <Text className="font-inter text-sm text-slate-800 dark:text-white">
                      {savedSportName || 'No sport set'}
                    </Text>
                  ) : canEditRecord && sportChoices.length === 0 ? (
                    <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
                      The tournament has no sports yet. Choose them under Sports & Divisions, then
                      come back to pick this division's.
                    </Text>
                  ) : canEditRecord ? (
                    /* A dropdown, not chips: a division plays exactly one sport, chosen when it is
                       created and almost never changed, so the choices do not need to be on show.
                       Not clearable — a division always plays a sport (U52). */
                    <CustomSelect
                      value={draftSportId}
                      onChange={chooseSport}
                      placeholder="Choose a sport"
                      options={sportChoices.map(sport => ({
                        value: sport.id,
                        label: eventSportIds.includes(sport.id)
                          ? sport.name
                          : `${sport.name} (not in the tournament)`,
                      }))}
                    />
                  ) : (
                    <Text className="font-inter text-sm text-slate-800 dark:text-white">
                      {sports.find(sport => sport.id === division.sportId)?.name || 'No sport set'}
                    </Text>
                  )}
                </View>

                <View className="flex-1 space-y-2">
                  <FieldLabel
                    label="Age group"
                    optional
                    help="The age group for this division, from the sport's list. Teams of that age group are the ones offered for entry. Choose Any age if the division is not limited to one, or Other… for one the list does not have."
                  />
                  {canEditRecord ? (
                    <AgeGroupPicker
                      sportId={draftSportId}
                      ageGroups={sports.find(sport => sport.id === draftSportId)?.ageGroups}
                      value={draftAgeGroupId}
                      onChange={(ageGroupId, group) => {
                        setDraftAgeGroupId(ageGroupId);
                        setDraftAgeGroupName(group?.name || '');
                      }}
                      noneLabel="Any age"
                      orgId={orgId}
                      variant="dropdown"
                    />
                  ) : (
                    <Text className="font-inter text-sm text-slate-800 dark:text-white">
                      {division.ageGroup || 'Any age'}
                    </Text>
                  )}
                </View>
              </View>

              {/* Who runs it (D33) — part of setting a division up, so it sits with what the
                  division is rather than at the foot of the screen. Event organisers and the
                  division's own convenors may add people; a convenor removes only whom they added.
                  It writes as each person is appointed, not through the Save below, which covers
                  the fields above. */}
              {canEdit && (
                <OrganizerPicker
                  eventId={eventId}
                  divisionId={divisionId}
                  hostOrgId={orgId}
                  actingOrgId={orgId}
                  organizers={organizers}
                  onChange={setOrganizers}
                  canManage={canEdit}
                  label="Division Organiser(s)"
                  help="People responsible for organising this division."
                  optional
                />
              )}

              {canEditRecord && detailsDirty && (
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={resetDetails}
                    className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 items-center active:opacity-80"
                  >
                    <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSaveDetails}
                    disabled={isSavingDetails || !effectiveName || !!nameClash}
                    className={`flex-1 py-2.5 rounded-lg bg-brand-orange items-center active:opacity-85 ${
                      isSavingDetails || !effectiveName || nameClash ? 'opacity-50' : ''
                    }`}
                  >
                    <Text className="font-inter-bold text-xs text-white uppercase">Save</Text>
                  </TouchableOpacity>
                </View>
              )}
            </GlassCard>

            <DivisionPanel
              orgId={orgId}
              eventId={eventId}
              divisionId={divisionId}
              canEdit={canEdit}
            />

            <GlassCard className="border border-slate-200 dark:border-white/5 p-5 space-y-3">
              <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Fields in play
              </Text>
              <FacilityPicker
                sites={sites}
                facilities={facilities}
                value={draftFacilityIds}
                onChange={setDraftFacilityIds}
                allowedFacilityIds={eventFacilityIds}
                disabled={!canEdit}
                emptyLabel={
                  eventFacilityIds.length > 0
                    ? "Any of the tournament's fields. Choose some to keep this division on them."
                    : 'The tournament has no fields in play yet.'
                }
              />
              {canEdit && facilitiesDirty && (
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setDraftFacilityIds(division.facilityIds || [])}
                    className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 items-center active:opacity-80"
                  >
                    <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSaveFacilities}
                    disabled={isSavingFacilities}
                    className={`flex-1 py-2.5 rounded-lg bg-brand-orange items-center active:opacity-85 ${
                      isSavingFacilities ? 'opacity-50' : ''
                    }`}
                  >
                    <Text className="font-inter-bold text-xs text-white uppercase">Save fields</Text>
                  </TouchableOpacity>
                </View>
              )}
            </GlassCard>

            {/*
              This division's table, ranking its **entrants** (U29) — so a school that entered u14A
              and u14B is two rows here, and one line in the event's roll-up. The same component
              the standings tab mounts when its scope selector names a division, so the two cannot
              drift. Entering teams and generating the draw are inside the panel above, where the
              fixtures they produce are.
            */}
            <View className="space-y-2">
              <Text className="font-orbitron-bold text-[10px] text-slate-500 uppercase tracking-widest pl-1">
                Standings
              </Text>
              <DivisionStandings divisionId={divisionId} canEdit={canEdit} />
            </View>

            {canAppoint && (capabilities?.canEditEvent || !isLastOfSport) && (
              <TouchableOpacity
                onPress={() => setIsConfirmingDelete(true)}
                activeOpacity={0.85}
                className="flex-row items-center justify-center gap-2 py-3 rounded-xl border border-red-500/30"
              >
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
                <Text className="font-inter-bold text-[10px] text-red-500 uppercase tracking-wider">
                  Delete division
                </Text>
              </TouchableOpacity>
            )}

            {canAppoint && !capabilities?.canEditEvent && isLastOfSport && (
              <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400 text-center">
                This is the last {savedSportName || 'sport'} division, so deleting it would take{' '}
                {savedSportName || 'the sport'} out of the tournament — which the tournament's
                organisers decide. Ask them to remove it.
              </Text>
            )}
          </View>
        </ScrollView>
      )}

      <ConfirmationModal
        isOpen={isConfirmingDelete}
        title={`Delete ${division?.name || 'this division'}?`}
        description={
          'Its entrants, stages and table are deleted. Fixtures already played are kept, but no ' +
          'longer belong to a division.' +
          (isLastOfSport
            ? `\n\nThis is the last ${savedSportName || ''} division, so ${
                savedSportName || 'its sport'
              } will also be removed from the tournament.`
            : '')
        }
        confirmText={isLastOfSport ? `Delete and remove ${savedSportName || 'the sport'}` : 'Delete division'}
        cancelText="Cancel"
        variant="danger"
        isProcessing={isDeleting}
        onConfirm={handleDelete}
        onClose={() => setIsConfirmingDelete(false)}
      />

      <ConfirmationModal
        isOpen={isConfirmingSportMove}
        title={`Remove ${savedSportName || 'the sport'} from the tournament?`}
        description={
          `This is the last ${savedSportName || ''} division. Moving it to ` +
          `${sports.find(sport => sport.id === draftSportId)?.name || 'another sport'} leaves ` +
          `${savedSportName || 'that sport'} with no divisions, so it will be removed from the tournament.`
        }
        confirmText="Save and remove"
        cancelText="Cancel"
        variant="danger"
        isProcessing={isSavingDetails}
        onConfirm={() => {
          setIsConfirmingSportMove(false);
          // The age-group question can still be outstanding behind this one.
          if (ageGroupChanging && ageGroupOverrides > 0) setIsConfirmingAgeGroup(true);
          else writeDetails();
        }}
        onClose={() => setIsConfirmingSportMove(false)}
      />

      {/*
        `FIX-17`, the half that is allowed. Changing the age group leaves entered teams where they
        are and reclassifies them as overrides — a real state the entry grid tags rather than a
        broken one, so this asks rather than refuses. It is not `danger`: nothing is destroyed and
        the change reverses by choosing the old age group again.
      */}
      <ConfirmationModal
        isOpen={isConfirmingAgeGroup}
        title={`Change the age group to ${draftAgeGroupName || 'another age group'}?`}
        description={
          `${ageGroupOverrides} entered ${
            ageGroupOverrides === 1 ? 'team is' : 'teams are'
          } not ${draftAgeGroupName || 'that age group'}. They stay in the division and will show ` +
          `as age-group overrides, so you can swap them for the right teams when you are ready.`
        }
        confirmText="Change age group"
        cancelText="Cancel"
        isProcessing={isSavingDetails}
        onConfirm={() => {
          setIsConfirmingAgeGroup(false);
          writeDetails();
        }}
        onClose={() => setIsConfirmingAgeGroup(false)}
      />
    </SafeAreaView>
  );
}
