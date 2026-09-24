import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  CandidateTeam,
  EntrantRow,
  Event,
  OrgBadge,
  Organization,
  SocketAction,
  Sport,
  Team,
  TournamentDivision,
  TournamentEntrant,
  buildEntrantRows,
  divisionsForTeam,
} from '@sk/shared';
import { GlassCard } from '../../../../../components/GlassCard';
import { OrgLogo } from '../../../../../components/OrgLogo';
import { ConfirmationModal } from '../../../../../components/ConfirmationModal';
import { FieldLabel } from '../../../../../components/FieldLabel';
import CustomSelect from '../../../../../components/CustomSelect';
import { ScreenHeader } from '../../../../../components/ScreenHeader';
import { SetupStepFooter } from '../../../../../components/tournament/SetupStepFooter';
import { nextStepAfter, stepByKey } from '../../../../../components/tournament/setupSteps';
import { AccessDenied } from '../../../../../components/AccessDenied';
import { EntrantTable } from '../../../../../components/tournament/EntrantTable';
import { AddEntrantModal } from '../../../../../components/tournament/AddEntrantModal';
import { ReplaceEntrantModal } from '../../../../../components/tournament/ReplaceEntrantModal';
import { RegisterOrgModal } from '../../../../../components/RegisterOrgModal';
import { useLiveRoom } from '../../../../../hooks/useLiveRoom';
import { useEventEntrants } from '../../../../../hooks/useEventEntrants';
import { useDivisionEntrants } from '../../../../../hooks/useDivisionEntrants';
import { candidateFromTeam } from '../../../../../components/tournament/candidateTeam';
import { useEventCapabilities } from '../../../../../hooks/useEventCapabilities';
import { useSafeBack } from '../../../../../hooks/useSafeBack';
import { useAuthStore } from '../../../../../store/authStore';
import { wsService } from '../../../../../services/websocket';
import { sendAction } from '../../../../../services/actions';
import { useWsStore } from '../../../../../store/wsStore';
import { useActiveTheme } from '../../../../../store/settingsStore';
import { COLORS, getThemeColor } from '../../../../../constants/Colors';

/**
 * Getting entrants in, on both axes, over one dataset (U21).
 *
 * The feature spec describes entry *per division* — for a division of sport S and age group A,
 * offer each participating org's matching teams. That is the right operation and it makes a good
 * screen, but it is only one axis. A sports day has fifteen divisions and five schools, and the
 * organiser's real task usually arrives the other way round: *Northcliff have confirmed — put their
 * teams in.* Done per division that is fifteen visits to fifteen screens, which is the kind of
 * friction that gets a feature abandoned during its first real use.
 *
 * So: two axes, one room. Both read `event:{id}:entrants`, which carries every division's roster,
 * and both write the same `SET_DIVISION_ENTRANTS` batch. The organisation axis is also where
 * **inline team creation** belongs, because that is exactly the moment you discover Northcliff has
 * no u16 netball team on the system.
 *
 * A **placeholder** (D7) is an entrant with no team and a label — schedulable and printable like
 * any other, and resolved later by naming the team, at which point every fixture generated against
 * it updates at once because they all point at this one row.
 *
 * **This screen is the Entrants step of the setup checklist (U48)**, which is why it carries the
 * invite list and a `Next` footer. The invite list moved here from the event screen's accordion:
 * an organisation in `event_organizations` is one that is *competing*, which is an entrants
 * question, and keeping it beside the roster makes the gap between the two visible — eight invited
 * and five entered is the number an organiser chases in April. An organisation *running* the
 * tournament is a different thing entirely and is appointed in Basic Info.
 *
 * **The invite list writes immediately, and deliberately has no save bar** — the one place the
 * save-per-step rule (U48) does not apply. Every other control on this screen writes on press, and
 * inviting or uninviting an organisation is a discrete act rather than a form: a save bar here
 * would arm itself for one control out of a dozen and leave the organiser wondering why entering a
 * team did not need saving but ticking a school did.
 */

export default function EntrantsScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, eventId, divisionId: divisionParam } = useLocalSearchParams<{
    orgId: string;
    eventId: string;
    /** Opened from a division's screen: start filtered to it. */
    divisionId?: string;
  }>();
  const isDark = useActiveTheme() === 'dark';
  const { width } = useWindowDimensions();
  /** 768px, the same break `ResponsivePageLayout` and `ResponsiveHeader` use. */
  const isLargeScreen = width >= 768;
  /**
   * On a phone the cards run edge to edge: the page's side padding and the cards' own would
   * otherwise spend a fifth of the width on margins, and the team rows need it to fit the division
   * beside the name. Square corners, because a rounded card cut off by the screen edge looks broken.
   */
  const cardClass = isLargeScreen ? 'p-5' : 'p-4';
  const cardStyle = isLargeScreen ? undefined : { borderRadius: 0, borderLeftWidth: 0, borderRightWidth: 0 };
  const secondary = getThemeColor(isDark, 'textSecondary');
  const isConnected = useWsStore((state: any) => state.isConnected);

  const { capabilities, isLoading: isLoadingCapabilities } = useEventCapabilities(eventId);
  /**
   * Who may enter teams here (2026-09-24, `UI-20`): the tournament's organisers for every
   * division, and a convenor or a sport's organiser for the divisions they run. The server has
   * always allowed the second — a convenor's grant covers their division's entrants — and the
   * screen now does too, instead of sending them to a second copy of this editor on the division's
   * own screen.
   */
  const canEditEvent = !!capabilities?.canEditEvent;
  const isConvenor =
    !canEditEvent &&
    ((capabilities?.convenesDivisionIds.length || 0) > 0 || (capabilities?.convenesSportIds.length || 0) > 0);
  const canEdit = canEditEvent || isConvenor;

  // ------------------------------------------------------------------------------------------
  // Data
  // ------------------------------------------------------------------------------------------

  // Two rooms, and this screen is the reason the split was worth doing (rule 4): it wants the event
  // record and the division list, and `event:{id}` used to hand it the fixture list, the facilities
  // and the standings table as well — three server queries per join for data nothing here reads.
  const eventRoom = eventId ? `event:${eventId}` : null;
  const eventDivisionsRoom = eventId ? `event:${eventId}:divisions` : null;

  const { items: eventRecords } = useLiveRoom<Event>(eventRoom, {
    reduce: (message) =>
      message.type === 'EVENT_UPDATED' ? { kind: 'upsert', item: message.data } : { kind: 'ignore' },
  });
  const event = eventRecords.find(e => e.id === eventId);

  const { items: divisions } = useLiveRoom<TournamentDivision>(eventDivisionsRoom, {
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
  });

  /**
   * The divisions this viewer enters teams into — every one for an organiser, their own for a
   * convenor. Everything below reads this list, so a convenor never sees a division they cannot
   * write to: not in the filter, not as a row's destination, not in the Add dialog.
   */
  const orderedDivisions = useMemo(
    () =>
      [...divisions]
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .filter(
          division =>
            canEditEvent ||
            !!capabilities?.convenesDivisionIds.includes(division.id) ||
            (!!division.sportId && !!capabilities?.convenesSportIds.includes(division.sportId))
        ),
    [divisions, canEditEvent, capabilities]
  );
  const myDivisionIdsKey = orderedDivisions.map(division => division.id).join(',');

  /* The whole tournament's roster lives in `event:{id}:entrants`, which a convenor cannot join —
     it is every division's, and a room cannot be filtered per viewer. A convenor reads each of
     their divisions' own rooms instead (see `ConvenorRosters` below), and the rest of the screen
     sees one roster either way. */
  const eventRoster = useEventEntrants(eventId, canEditEvent);
  const [convenorRosters, setConvenorRosters] = useState<Record<string, TournamentEntrant[]>>({});
  const entrants = useMemo(
    () => (canEditEvent ? eventRoster.entrants : Object.values(convenorRosters).flat()),
    [canEditEvent, eventRoster.entrants, convenorRosters]
  );
  const byDivision = useMemo(() => {
    if (canEditEvent) return eventRoster.byDivision;
    return new Map(Object.entries(convenorRosters));
  }, [canEditEvent, eventRoster.byDivision, convenorRosters]);
  const isLoadingEntrants = canEditEvent && eventRoster.isLoading;
  const accessDenied = canEditEvent && eventRoster.accessDenied;

  /**
   * The teams that could be entered — a one-shot read, because no room owns "teams that could
   * enter". The same reasoning that keeps the invite picker a search rather than a bulk list
   * (`FIX-2`): a room's contents have to be a set somebody publishes changes to, and this is a
   * question rather than a set.
   */
  const [candidateTeams, setCandidateTeams] = useState<CandidateTeam[]>([]);
  /**
   * The organisations that may enter — the host and the invited schools, whether or not they have
   * a team yet. It arrives beside the teams rather than being derived from them, because the org
   * with nothing entered is precisely the one whose column has to be there to create a team in.
   */
  const [orgs, setOrgs] = useState<OrgBadge[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);

  useEffect(() => {
    if (!isConnected || !eventId || !canEdit) return;
    let active = true;
    if (canEditEvent) {
      wsService.emit('get_data', { type: 'event_candidate_teams', eventId }, (res: any) => {
        if (!active || !res) return;
        setCandidateTeams(res.teams || []);
        setOrgs(res.orgs || []);
      });
    } else {
      // A convenor is answered per division — the narrower check the read already supports — and
      // the answers are merged, since two of their divisions share most of the same schools.
      const seenTeams = new Map<string, CandidateTeam>();
      const seenOrgs = new Map<string, OrgBadge>();
      for (const division of myDivisionIdsKey ? myDivisionIdsKey.split(',') : []) {
        wsService.emit('get_data', { type: 'event_candidate_teams', eventId, divisionId: division }, (res: any) => {
          if (!active || !res) return;
          (res.teams || []).forEach((team: CandidateTeam) => seenTeams.set(team.id, team));
          (res.orgs || []).forEach((org: OrgBadge) => seenOrgs.set(org.id, org));
          setCandidateTeams([...seenTeams.values()]);
          setOrgs([...seenOrgs.values()].sort((a, b) => a.name.localeCompare(b.name)));
        });
      }
    }
    wsService.emit('get_data', { type: 'sports' }, (res: any) => {
      if (active && Array.isArray(res)) setSports(res);
    });
    return () => {
      active = false;
    };
    // `myDivisionIdsKey` rather than the array, so a re-render with the same divisions does not
    // read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, eventId, canEdit, canEditEvent, myDivisionIdsKey]);

  // ------------------------------------------------------------------------------------------
  // Derived
  // ------------------------------------------------------------------------------------------


  /* The org list used to be assembled here, by deduplicating the candidate teams and patching in
     `participatingOrgs` for the ones with none. It produced no logo, and it had a hole the patch
     could not cover: the **host** is not in `participatingOrgs`, so a host that had entered nothing
     appeared nowhere. `event_candidate_teams` now answers both questions at once. */

  const sportName = (sportId?: string) => sports.find(s => s.id === sportId)?.name;

  // ------------------------------------------------------------------------------------------
  // The invite list (U48)
  // ------------------------------------------------------------------------------------------

  const user = useAuthStore((state: any) => state.user);
  /** Whether the add-an-organisation search is open. Closed by default: see the card below. */
  const [isAddingOrg, setIsAddingOrg] = useState(false);
  /** The register dialog, for a school the search did not find. */
  const [isRegisteringOrg, setIsRegisteringOrg] = useState(false);
  const [orgSearchText, setOrgSearchText] = useState('');
  const [searchedOrgs, setSearchedOrgs] = useState<Organization[]>([]);
  const [isSearchingOrgs, setIsSearchingOrgs] = useState(false);

  const invitedOrgs = event?.participatingOrgs || [];

  /**
   * The invite picker: a search, not a list of every organisation.
   *
   * "Orgs not yet related to this event" is a set no room owns, so this is a legitimate one-shot
   * read — the other half of `FIX-2`, and the same shape as `PersonnelAutocomplete`.
   */
  useEffect(() => {
    const query = orgSearchText.trim();
    if (!query) {
      setSearchedOrgs([]);
      return;
    }

    setIsSearchingOrgs(true);
    const timer = setTimeout(() => {
      wsService.emit('get_data', { type: 'search_similar_orgs', name: query }, (res: any) => {
        setIsSearchingOrgs(false);
        if (Array.isArray(res)) {
          /* Only what is already listed is filtered out. The host used to be excluded here as
             well, which was right while it was always taking part and is wrong now that it can be
             removed — a host taken off the list by mistake has to be findable again. */
          setSearchedOrgs(res.filter(o => !invitedOrgs.some(p => p.id === o.id)));
        }
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [orgSearchText, invitedOrgs, orgId]);

  /**
   * Write the list straight out. `participatingOrgIds` is the whole set every time, because that
   * is what `UPDATE_EVENT` expects — there is no add-one action.
   */
  const saveInvites = (nextIds: string[]) => {
    if (!event) return;
    void sendAction(SocketAction.UPDATE_EVENT, {
      id: eventId,
      orgId,
      data: { participatingOrgIds: nextIds },
    });
  };

  /* This screen predates `useSetupStepScreen` (it has had its own route since U21), so it reads
     the step from the source directly rather than through the hook. */
  const step = stepByKey('entrants');
  const nextStep = nextStepAfter('entrants', event?.settings?.dismissedSetupSteps || []);

  /** Back is the checklist, never the previous step (U48). */
  const goBackToChecklist = () =>
    safeBack(
      canEditEvent
        ? `/admin/${orgId}/events/${eventId}?tab=setup`
        : divisionParam
          ? `/admin/${orgId}/events/${eventId}/divisions/${divisionParam}/schedule`
          : `/admin/${orgId}/events/${eventId}`
    );


  const divisionLabel = (division: TournamentDivision) =>
    division.name || [division.ageGroup, sportName(division.sportId)].filter(Boolean).join(' ');

  // ------------------------------------------------------------------------------------------
  // Filters — the two axes, demoted from modes to a narrowing of one list
  // ------------------------------------------------------------------------------------------

  const [filterDivisionId, setFilterDivisionId] = useState(divisionParam || '');
  const [filterOrgId, setFilterOrgId] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  /** Keyed by row, so two rows can never share a spinner. */
  const [busyKeys, setBusyKeys] = useState<Record<string, boolean>>({});

  const rosterOf = (divisionId: string) => byDivision.get(divisionId) || [];

  /** The entrant the Replace dialog is open for. */
  const [replacing, setReplacing] = useState<TournamentEntrant | null>(null);
  /** A playing row being taken out that has results — confirmed first, because it will be withdrawn. */
  const [confirmingRemoval, setConfirmingRemoval] = useState<EntrantRow | null>(null);

  /** The tournament's own sports, which bound what the Add dialog may create. */
  const tournamentSports = sports.filter(sport => (event?.sportIds || []).includes(sport.id));

  /**
   * Every candidate team, plus every entrant that is not one of them — see `buildEntrantRows`.
   * One list, sorted by organisation then name; the filters below narrow it and nothing else does.
   */
  const rows = useMemo(
    () => buildEntrantRows(candidateTeams, entrants, orgs),
    [candidateTeams, entrants, orgs]
  );

  const filterDivision = orderedDivisions.find(d => d.id === filterDivisionId) || null;

  const visibleRows = useMemo(
    () =>
      rows.filter(row => {
        if (filterOrgId && row.orgId !== filterOrgId) return false;
        // A convenor's list is what their divisions hold or could hold. Every other team of every
        // participating school would be a row they can do nothing with.
        if (
          !canEditEvent &&
          !row.entrant &&
          !row.withdrawn &&
          divisionsForTeam(row.team, orderedDivisions).qualifying.length === 0
        ) {
          return false;
        }
        if (!filterDivision) return true;
        // Filtering by division shows what *could* be in it as well as what is, because this is
        // where entering happens — a list of only what is already in would have nothing to tick.
        if (row.entrant?.divisionId === filterDivision.id) return true;
        return divisionsForTeam(row.team, [filterDivision]).qualifying.length > 0;
      }),
    [rows, filterOrgId, filterDivision, canEditEvent, orderedDivisions]
  );

  const enteredCount = rows.filter(row => !!row.entrant).length;

  /** An individual sport has entrants rather than teams, and the button should say so. */
  const filterSport = sports.find(s => s.id === filterDivision?.sportId);
  const addLabel = filterSport?.participantType === 'INDIVIDUAL' ? 'Add entrant' : 'Add team';

  // ------------------------------------------------------------------------------------------
  // Writes
  // ------------------------------------------------------------------------------------------

  /** A roster, sent whole (D13). The room carries the result back, so success needs nothing. */
  const writeRoster = (
    divisionId: string,
    next: Array<Partial<TournamentEntrant>>,
    options: { busyKey?: string; takeFromOtherDivisions?: boolean; removeEntrantIds?: string[] } = {}
  ) => {
    const { busyKey, ...rest } = options;
    if (busyKey) setBusyKeys(prev => ({ ...prev, [busyKey]: true }));
    return sendAction(SocketAction.SET_DIVISION_ENTRANTS, {
      divisionId,
      orgId,
      ...rest,
      entrants: next.map(entrant => ({
        id: entrant.id || undefined,
        teamId: entrant.teamId,
        orgProfileId: entrant.orgProfileId,
        // Only a placeholder's is read by the server; a team or a person carries its own.
        orgId: entrant.teamId || entrant.orgProfileId ? undefined : entrant.orgId,
        label: entrant.label,
        seed: entrant.seed,
        status: entrant.status || 'active',
      })),
    }).then(result => {
      if (busyKey) setBusyKeys(prev => ({ ...prev, [busyKey]: false }));
      return result;
    });
  };

  /**
   * The table's only write: put this competitor in that division, or in none.
   *
   * Every act on this screen is this one call, which is what the table bought. Moving is not a
   * special case — the server takes the competitor out of wherever else it was in the same
   * transaction, so it cannot end up in both divisions or in neither. `takeFromOtherDivisions`
   * does that for a team, which clashes on its team id; `removeEntrantIds` for a placeholder or a
   * person, which has no team and is identified by its row.
   */
  const setRowDivision = (row: EntrantRow, divisionId: string | null) => {
    const from = row.entrant?.divisionId;
    if (from === divisionId) return;

    if (!divisionId) {
      if (!from || !row.entrant) return;
      // Taking out a team that has played withdraws it rather than deleting it (the server's
      // "Keep" rule), which is not what a tap on a row suggests — so it is said first.
      if ((row.entrant.playedCount || 0) > 0 && confirmingRemoval?.key !== row.key) {
        setConfirmingRemoval(row);
        return;
      }
      const entrantId = row.entrant.id;
      writeRoster(from, rosterOf(from).filter(e => e.id !== entrantId), { busyKey: row.key });
      return;
    }

    const asEntrant: Partial<TournamentEntrant> = row.team
      ? { teamId: row.team.id, status: 'active' }
      : {
          teamId: row.entrant?.teamId,
          orgProfileId: row.entrant?.orgProfileId,
          orgId: row.entrant?.orgId,
          label: row.entrant?.label,
          status: 'active',
        };

    writeRoster(divisionId, [...rosterOf(divisionId), asEntrant], {
      busyKey: row.key,
      // A convenor may move a team only between divisions they run — the ones whose entrants they
      // can see. A team in somebody else's division gets the server's "already entered in …"
      // refusal, which names where it is, rather than an authorisation error.
      takeFromOtherDivisions: canEditEvent || !!from,
      removeEntrantIds: !row.team && row.entrant ? [row.entrant.id] : undefined,
    });
  };

  /** A team created from the Add dialog, appended because the candidate read is one-shot. */
  const handleTeamCreated = (team: Team, divisionId: string | null) => {
    setCandidateTeams(prev => [...prev, candidateFromTeam(team, orgs)]);
    if (divisionId) {
      writeRoster(divisionId, [...rosterOf(divisionId), { teamId: team.id, status: 'active' }], {
        busyKey: team.id,
      });
    }
  };

  /** A placeholder or a person from the Add dialog. */
  /**
   * A person or a placeholder from the Add dialog.
   *
   * `orgId` is carried through, and until 2026-09-21 it was not: an org-linked placeholder arrived
   * here with its school and left without it, so it was stored exactly like a generic one — no
   * crest, missing from its school's filter, uncounted in its school's roll-up.
   */
  const handleEntrantCreated = (
    made: { label?: string; orgProfileId?: string; orgId?: string; name: string },
    divisionId: string
  ) => {
    writeRoster(divisionId, [
      ...rosterOf(divisionId),
      { label: made.label, orgProfileId: made.orgProfileId, orgId: made.orgId, status: 'active' },
    ]);
  };

  // ------------------------------------------------------------------------------------------

  if (!isLoadingCapabilities && !canEdit) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
        <AccessDenied
          message="Entering teams is for the tournament's organisers, and for whoever runs a division — in their own divisions."
          actionLabel="Back to the event"
          onAction={() => safeBack(`/admin/${orgId}/events/${eventId}`)}
        />
      </SafeAreaView>
    );
  }

  if (accessDenied) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
        <AccessDenied
          message="You do not have permission to see who has entered this tournament."
          actionLabel="Back to the event"
          onAction={() => safeBack(`/admin/${orgId}/events/${eventId}`)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      <ScreenHeader context={event?.name} title={step.label} onBack={goBackToChecklist} />

      {/* A convenor's roster, one room per division they run — rendered, not looped in a hook,
          because the number of rooms is data. */}
      {!canEditEvent &&
        orderedDivisions.map(division => (
          <DivisionRosterFeed
            key={division.id}
            divisionId={division.id}
            onRoster={(divisionId, roster) =>
              setConvenorRosters(prev => (prev[divisionId] === roster ? prev : { ...prev, [divisionId]: roster }))
            }
          />
        ))}

      {isLoadingEntrants ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.brand.orange} />
        </View>
      ) : (
        <ScrollView className={`flex-1 ${isLargeScreen ? 'px-6 py-6' : 'py-3'}`} contentContainerStyle={{ paddingBottom: 60 }}>
          <View className="space-y-5">
            {/* Who is taking part, before which of their teams are in. Writes on press — see the
                note at the top of this file for why this one list has no save bar. */}
            {canEditEvent && (
              <GlassCard className={`border border-slate-200 dark:border-white/5 ${cardClass} space-y-1.5`} style={cardStyle}>
                <View className="flex-row items-center justify-between gap-3">
                  {/*
                    `UI-16`. The one field on this screen with something non-obvious to say: the
                    difference between an organisation *competing* and one *running* the tournament
                    is the confusion this screen was built to make visible. Nothing else here gets
                    an icon — a filter and a tick-box say what they are, and an icon on those would
                    turn the mark into furniture.
                  */}
                  <FieldLabel
                    label="Organisations"
                    help="The schools and clubs taking part in this tournament. Listing one offers its teams for entry below; it does not give anyone permission to run anything. The host is here like any other — remove it if it is running the day without competing. An organisation that helps run the tournament is appointed under Basic Info instead."
                  />
                  <TouchableOpacity
                    onPress={() => {
                      if (isAddingOrg) setOrgSearchText('');
                      setIsAddingOrg(open => !open);
                    }}
                    accessibilityLabel={isAddingOrg ? 'Stop adding an organisation' : 'Add an organisation'}
                    className="flex-row items-center gap-1 px-2 py-1 active:opacity-80"
                  >
                    <Ionicons
                      name={isAddingOrg ? 'close' : 'add-circle-outline'}
                      size={15}
                      color={COLORS.brand.orange}
                    />
                    <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                      {isAddingOrg ? 'Cancel' : 'Add'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {invitedOrgs.length > 0 && (
                  <View className="flex-row flex-wrap gap-2 mb-2">
                    {/*
                      The flag carries the crest, and as much text as the screen has room for: the
                      full name with the code in brackets on a wide screen, the code alone on a
                      phone. Both say the same thing, so the narrow one loses nothing.
                    */}
                    {invitedOrgs.map(o => (
                      <View
                        key={o.id}
                        className="flex-row items-center gap-2 bg-slate-100 dark:bg-slate-800 pl-1.5 pr-3 py-1.5 rounded-full border border-slate-200/50 dark:border-white/5"
                      >
                        <OrgLogo
                          logo={o.logo}
                          settings={o.logoConfig ? { logoConfig: o.logoConfig } : undefined}
                          primaryColor={o.primaryColor}
                          size={22}
                          className="rounded-full"
                        />
                        <Text className="font-inter text-xs text-slate-700 dark:text-slate-300">
                          {isLargeScreen ? `${o.name} (${o.shortName})` : o.shortName}
                        </Text>
                        <TouchableOpacity
                          onPress={() => saveInvites(invitedOrgs.filter(p => p.id !== o.id).map(p => p.id))}
                          accessibilityLabel={`Remove ${o.name}`}
                        >
                          <Ionicons name="close-circle" size={14} color={COLORS.brand.red} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {isAddingOrg && (
                  <TextInput
                    value={orgSearchText}
                    onChangeText={setOrgSearchText}
                    autoFocus
                    placeholder="Search for an organisation..."
                    placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white"
                  />
                )}
                {isAddingOrg && isSearchingOrgs && (
                  <Text className="font-inter text-[10px] text-slate-400 mt-1">Searching...</Text>
                )}
                {isAddingOrg &&
                  searchedOrgs.map(o => (
                    <TouchableOpacity
                      key={o.id}
                      onPress={() => {
                        saveInvites([...invitedOrgs.map(p => p.id), o.id]);
                        setOrgSearchText('');
                        setIsAddingOrg(false);
                      }}
                      className="px-4 py-2.5 border-b border-slate-100 dark:border-white/5 active:opacity-80"
                    >
                      <Text className="font-inter text-sm text-slate-800 dark:text-white">{o.name}</Text>
                    </TouchableOpacity>
                  ))}
                {/*
                  The school that is not on the system yet. Offered once something has been typed,
                  whether or not the search found anything — "St John's" may well match a
                  different St John's, and the organiser is the one who knows which they mean.
                */}
                {isAddingOrg && !!orgSearchText.trim() && !isSearchingOrgs && (
                  <TouchableOpacity
                    onPress={() => setIsRegisteringOrg(true)}
                    className="flex-row items-center gap-2 px-4 py-2.5 active:opacity-80"
                  >
                    <Ionicons name="add-circle-outline" size={15} color={COLORS.brand.orange} />
                    <Text className="font-inter text-sm text-brand-orange">
                      Register “{orgSearchText.trim()}” — not on ScoreKeeper yet
                    </Text>
                  </TouchableOpacity>
                )}
              </GlassCard>
            )}

            {/*
              The teams, as one table.

              The two axes are still here and are now *filters* rather than modes: narrowing to a
              division or to a school shows a subset of the same rows, edited the same way, instead
              of two layouts with two sets of controls. Neither is applied to begin with — a filter
              you chose is easier to understand than one that was already on when you arrived.
            */}
            <GlassCard className={`border border-slate-200 dark:border-white/5 ${cardClass} space-y-3`} style={cardStyle}>
              <View className="flex-row items-center justify-between gap-3">
                <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Teams · {enteredCount} entered
                </Text>
                {canEdit && (
                  <TouchableOpacity
                    onPress={() => setIsAdding(true)}
                    accessibilityLabel="Add a team or entrant"
                    className="flex-row items-center gap-1 px-2 py-1 active:opacity-80"
                  >
                    <Ionicons name="add-circle-outline" size={15} color={COLORS.brand.orange} />
                    <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                      {addLabel}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View className={isLargeScreen ? 'flex-row gap-3' : 'space-y-2'}>
                <View className={isLargeScreen ? 'flex-1' : ''}>
                  <CustomSelect
                    value={filterDivisionId}
                    onChange={setFilterDivisionId}
                    options={orderedDivisions.map(division => ({
                      value: division.id,
                      label: divisionLabel(division),
                      description: sportName(division.sportId),
                    }))}
                    placeholder="All divisions"
                    clearable
                    showSearch={orderedDivisions.length > 8}
                  />
                </View>
                <View className={isLargeScreen ? 'flex-1' : ''}>
                  <CustomSelect
                    value={filterOrgId}
                    onChange={setFilterOrgId}
                    options={orgs.map(org => ({ value: org.id, label: `${org.name} (${org.shortName})` }))}
                    placeholder="All organisations"
                    clearable
                    showSearch={orgs.length > 8}
                  />
                </View>
              </View>

              <EntrantTable
                rows={visibleRows}
                divisions={orderedDivisions}
                orgs={orgs}
                divisionLabel={divisionLabel}
                sportName={sportName}
                isBusy={row => !!busyKeys[row.key]}
                onSetDivision={setRowDivision}
                onReplace={row => row.entrant && setReplacing(row.entrant)}
                canEdit={canEdit}
                emptyText={
                  rows.length
                    ? 'Nothing matches those filters.'
                    : orderedDivisions.length
                      ? 'No teams yet. Add one above, or list the organisations taking part.'
                      : 'This tournament has nothing to enter teams into yet.'
                }
              />
            </GlassCard>

            <View className={isLargeScreen ? '' : 'px-4'}>
              {/* The checklist is the organisers'; a convenor came from their division and goes back there. */}
              {canEditEvent && <SetupStepFooter
                label={step.label}
                nextStep={nextStep}
                onNext={() =>
                  nextStep ? router.replace(nextStep.href(orgId, eventId) as any) : goBackToChecklist()
                }
                onBackToChecklist={goBackToChecklist}
              />}
            </View>
          </View>
        </ScrollView>
      )}

      {/*
        A school registered from here is taking part as soon as it exists — adding it to this
        tournament is why it was registered — and its contact is invited straight away, since this
        screen writes on press rather than holding changes for a save.
      */}
      <RegisterOrgModal
        isOpen={isRegisteringOrg}
        onClose={() => setIsRegisteringOrg(false)}
        initialName={orgSearchText}
        sportId={event?.sportIds?.length === 1 ? event.sportIds[0] : undefined}
        onRegistered={(org, contactEmail) => {
          saveInvites([...invitedOrgs.map(p => p.id), org.id]);
          if (contactEmail && user?.id) {
            // A failed invitation is announced on its own and does not undo the organisation.
            void sendAction(SocketAction.REFER_ORG_CONTACT, {
              orgId: org.id,
              contactEmails: [contactEmail],
              referredByUserId: user.id,
            });
          }
          setOrgSearchText('');
          setIsAddingOrg(false);
        }}
      />

      <AddEntrantModal
        isOpen={isAdding}
        onClose={() => setIsAdding(false)}
        orgId={orgId}
        sports={tournamentSports}
        orgs={orgs}
        divisions={orderedDivisions}
        divisionLabel={divisionLabel}
        defaultSportId={filterDivision?.sportId}
        defaultOrgId={filterOrgId || undefined}
        defaultDivisionId={filterDivisionId || undefined}
        onTeamCreated={handleTeamCreated}
        onEntrantCreated={handleEntrantCreated}
      />

      {!!replacing && orderedDivisions.some(d => d.id === replacing.divisionId) && (
        <ReplaceEntrantModal
          isOpen
          onClose={() => setReplacing(null)}
          orgId={orgId}
          division={orderedDivisions.find(d => d.id === replacing.divisionId)!}
          entrant={replacing}
          candidateTeams={candidateTeams}
          tournamentEntrants={entrants}
        />
      )}

      <ConfirmationModal
        isOpen={!!confirmingRemoval}
        title="Withdraw this team?"
        description={(() => {
          const played = confirmingRemoval?.entrant?.playedCount || 0;
          const name = confirmingRemoval?.name || 'This team';
          return `${name} has played ${played === 1 ? 'a fixture' : `${played} fixtures`}. ${
            played === 1 ? 'Its result stays' : 'Its results stay'
          } in the table and it is marked withdrawn. Its remaining fixtures stay in the draw until you replace it or redraw — use Replace instead if another team is taking its place.`;
        })()}
        confirmText="Withdraw"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => {
          const row = confirmingRemoval;
          if (row) setRowDivision(row, null);
          setConfirmingRemoval(null);
        }}
        onClose={() => setConfirmingRemoval(null)}
      />
    </SafeAreaView>
  );
}

/**
 * Subscribes to one division's roster and hands it up. Renders nothing.
 *
 * A convenor's Entrants step needs a room per division they run, and hooks cannot be called in a
 * loop — so each room is a component, and the screen collects what they report.
 */
function DivisionRosterFeed({
  divisionId,
  onRoster,
}: {
  divisionId: string;
  onRoster: (divisionId: string, roster: TournamentEntrant[]) => void;
}) {
  const { entrants } = useDivisionEntrants(divisionId);
  useEffect(() => {
    onRoster(divisionId, entrants);
    // `onRoster` is a fresh closure per render of the parent; the roster is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionId, entrants]);
  return null;
}
