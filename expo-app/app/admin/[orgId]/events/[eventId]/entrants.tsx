import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  CandidateTeam,
  Event,
  OrgBadge,
  Organization,
  SocketAction,
  Sport,
  Team,
  TournamentDivision,
  TournamentEntrant,
  divisionSiblingLabels,
  isCollapsed,
} from '@sk/shared';
import { GlassCard } from '../../../../../components/GlassCard';
import { OrgLogo } from '../../../../../components/OrgLogo';
import { ConfirmationModal } from '../../../../../components/ConfirmationModal';
import { FieldLabel } from '../../../../../components/FieldLabel';
import { EntrantGrid } from '../../../../../components/tournament/EntrantGrid';
import { ScreenHeader } from '../../../../../components/ScreenHeader';
import { SetupStepFooter } from '../../../../../components/tournament/SetupStepFooter';
import { nextStepAfter, stepByKey } from '../../../../../components/tournament/setupSteps';
import { SegmentedControl } from '../../../../../components/SegmentedControl';
import { Tabs, TabItem } from '../../../../../components/Tabs';
import { AccessDenied } from '../../../../../components/AccessDenied';
import { DivisionEntrantsEditor } from '../../../../../components/tournament/DivisionEntrantsEditor';
import { NewTeamModal } from '../../../../../components/tournament/NewTeamModal';
import { useLiveRoom } from '../../../../../hooks/useLiveRoom';
import { useEventEntrants, divisionByTeamId, divisionTeamOptions } from '../../../../../hooks/useEventEntrants';
import { DivisionTeamChoices } from '../../../../../components/tournament/DivisionTeamChoices';
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

type Axis = 'division' | 'organisation';

export default function EntrantsScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const { width } = useWindowDimensions();
  /** 768px, the same break `ResponsivePageLayout` and `ResponsiveHeader` use. */
  const isLargeScreen = width >= 768;
  const secondary = getThemeColor(isDark, 'textSecondary');
  const isConnected = useWsStore((state: any) => state.isConnected);

  const { capabilities, isLoading: isLoadingCapabilities } = useEventCapabilities(eventId);
  const canEdit = !!capabilities?.canEditEvent;

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

  const { entrants, byDivision, isLoading: isLoadingEntrants, accessDenied } = useEventEntrants(eventId);

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
    wsService.emit('get_data', { type: 'event_candidate_teams', eventId }, (res: any) => {
      if (!active || !res) return;
      setCandidateTeams(res.teams || []);
      setOrgs(res.orgs || []);
    });
    wsService.emit('get_data', { type: 'sports' }, (res: any) => {
      if (active && Array.isArray(res)) setSports(res);
    });
    return () => {
      active = false;
    };
  }, [isConnected, eventId, canEdit]);

  // ------------------------------------------------------------------------------------------
  // Derived
  // ------------------------------------------------------------------------------------------

  const orderedDivisions = useMemo(
    () => [...divisions].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [divisions]
  );

  /* The org list used to be assembled here, by deduplicating the candidate teams and patching in
     `participatingOrgs` for the ones with none. It produced no logo, and it had a hole the patch
     could not cover: the **host** is not in `participatingOrgs`, so a host that had entered nothing
     appeared nowhere. `event_candidate_teams` now answers both questions at once. */

  const sportName = (sportId?: string) => sports.find(s => s.id === sportId)?.name;

  // ------------------------------------------------------------------------------------------
  // The invite list (U48)
  // ------------------------------------------------------------------------------------------

  const user = useAuthStore((state: any) => state.user);
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
          setSearchedOrgs(
            res.filter(o => o.id !== orgId && !invitedOrgs.some(p => p.id === o.id))
          );
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
    safeBack(`/admin/${orgId}/events/${eventId}?tab=setup`);


  const divisionLabel = (division: TournamentDivision) =>
    division.name || [division.ageGroup, sportName(division.sportId)].filter(Boolean).join(' ');

  const [axis, setAxis] = useState<Axis>('division');
  const [activeSportId, setActiveSportId] = useState<string | null>(null);
  const [activeDivisionId, setActiveDivisionId] = useState<string | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    team: CandidateTeam;
    from: TournamentDivision;
    to: TournamentDivision;
  } | null>(null);
  const [newTeamFor, setNewTeamFor] = useState<{ division: TournamentDivision; orgId: string } | null>(
    null
  );
  // Keyed by `${divisionId}:${teamId}` so two cells of the grid can never share a spinner.
  const [busyKeys, setBusyKeys] = useState<Record<string, boolean>>({});

  const activeOrg = orgs.find(o => o.id === activeOrgId) || orgs[0] || null;

  /**
   * The division axis navigates **sport, then age group** — not one flat list of divisions.
   *
   * Fifteen divisions in a strip is fifteen tabs nobody can scan, and fifteen items in a dropdown
   * is no better. But they are not fifteen unrelated things: they are three sports of five ages,
   * which is how the tournament was built and how an organiser holds it in their head. Split that
   * way it is a strip of three and a row of five, both of which fit on a phone.
   *
   * Each level collapses on its own (U15). One sport shows no sport strip; a sport with one
   * division shows no age row; a tournament with one division shows neither.
   */
  const sportsInPlay = useMemo(() => {
    const seen: string[] = [];
    for (const division of orderedDivisions) {
      const key = division.sportId || '';
      if (!seen.includes(key)) seen.push(key);
    }
    return seen;
  }, [orderedDivisions]);

  const activeSport = sportsInPlay.includes(activeSportId || '')
    ? (activeSportId as string)
    : sportsInPlay[0] ?? '';
  const divisionsOfSport = orderedDivisions.filter(d => (d.sportId || '') === activeSport);
  const activeDivision =
    divisionsOfSport.find(d => d.id === activeDivisionId) || divisionsOfSport[0] || null;

  const sportsCollapsed = isCollapsed(sportsInPlay.length);
  const agesCollapsed = isCollapsed(divisionsOfSport.length);

  /**
   * What each pill says — whatever tells one division of this sport from the others.
   *
   * Not simply the age group. A tournament with two ageless rugby divisions showed a Rugby tab
   * over two pills both reading `All ages`, naming neither; an A/B split at one age reduces to
   * `U14` twice by a different route. Computed for the sport's divisions **together**, because
   * that is the only level at which a clash can be seen. The rule and its reasoning are in
   * `divisionSiblingLabels`.
   */
  const ageLabels = useMemo(
    () =>
      divisionSiblingLabels(divisionsOfSport, {
        sportName: sportName(activeSport),
        eventName: event?.name,
      }),
    [divisionsOfSport, activeSport, sports, event?.name]
  );
  const ageLabel = (division: TournamentDivision) => ageLabels.get(division.id) || 'All ages';

  // ------------------------------------------------------------------------------------------
  // Writes
  // ------------------------------------------------------------------------------------------

  const rosterOf = (divisionId: string) => byDivision.get(divisionId) || [];

  /**
   * One division's roster, sent whole (D13) — the organisation axis's write.
   *
   * The division axis writes through {@link DivisionEntrantsEditor}, which owns the same call. Both
   * end in one `SET_DIVISION_ENTRANTS` per division, which is what makes the two axes two views of
   * one dataset rather than two features.
   */
  const writeRoster = (divisionId: string, next: Array<Partial<TournamentEntrant>>, busyKey?: string) => {
    if (busyKey) setBusyKeys(prev => ({ ...prev, [busyKey]: true }));
    // The roster follows the division room, so success needs nothing; a refusal is toasted.
    sendAction(SocketAction.SET_DIVISION_ENTRANTS, {
      divisionId,
      orgId,
      entrants: next.map(entrant => ({
        id: entrant.id || undefined,
        teamId: entrant.teamId,
        orgProfileId: entrant.orgProfileId,
        label: entrant.label,
        seed: entrant.seed,
        status: entrant.status || 'active',
      })),
    }).then(() => {
      if (busyKey) setBusyKeys(prev => ({ ...prev, [busyKey]: false }));
    });
  };

  const toggleTeam = (division: TournamentDivision, team: CandidateTeam) => {
    const current = rosterOf(division.id);
    const existing = current.find(entrant => entrant.teamId === team.id);
    writeRoster(
      division.id,
      existing
        ? current.filter(entrant => entrant.id !== existing.id)
        : [...current, { divisionId: division.id, teamId: team.id, status: 'active' }],
      `${division.id}:${team.id}`
    );
  };

  const appendCandidate = (team: Team) => {
    // `event_candidate_teams` was a one-shot read, so nothing would otherwise tell this screen the
    // team now exists.
    setCandidateTeams(prev => [...prev, candidateFromTeam(team, orgs)]);
  };

  /**
   * Which division of this tournament holds each entered team — the input to the "already in…"
   * chip, and to the one-division rule the server enforces.
   */
  const divisionByTeam = useMemo(() => divisionByTeamId(entrants), [entrants]);
  const divisionNameOf = (divisionId: string) => {
    const division = orderedDivisions.find(d => d.id === divisionId);
    return division ? divisionLabel(division) : 'another division';
  };

  /**
   * **Move here** — one write, not a remove and an add.
   *
   * `takeFromOtherDivisions` lets the server do both halves in one transaction, so the team cannot
   * end up in neither division if the second call fails. Confirmed first because it edits a
   * division the organiser is not looking at.
   */
  const confirmMove = (team: CandidateTeam, fromDivisionId: string, to: TournamentDivision) => {
    const from = orderedDivisions.find(d => d.id === fromDivisionId);
    if (from) setPendingMove({ team, from, to });
  };

  const runMove = () => {
    if (!pendingMove) return;
    const { team, to } = pendingMove;
    setPendingMove(null);
    const busyKey = `${to.id}:${team.id}`;
    setBusyKeys(prev => ({ ...prev, [busyKey]: true }));
    sendAction(SocketAction.SET_DIVISION_ENTRANTS, {
      divisionId: to.id,
      orgId,
      takeFromOtherDivisions: true,
      entrants: [
        ...rosterOf(to.id).map(entrant => ({
          id: entrant.id,
          teamId: entrant.teamId,
          orgProfileId: entrant.orgProfileId,
          label: entrant.label,
          seed: entrant.seed,
          status: entrant.status || 'active',
        })),
        { teamId: team.id, status: 'active' as const },
      ],
    }).then(() => setBusyKeys(prev => ({ ...prev, [busyKey]: false })));
  };

  const handleTeamCreated = (division: TournamentDivision, team: Team) => {
    appendCandidate(team);
    writeRoster(division.id, [
      ...rosterOf(division.id),
      { divisionId: division.id, teamId: team.id, status: 'active' },
    ]);
  };

  // ------------------------------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------------------------------

  /** *Who is in the u14 rugby?* — one division, every organisation's qualifying teams. */
  const renderDivisionAxis = () => {
    if (!activeDivision) {
      return (
        <GlassCard className="border border-dashed border-slate-200 dark:border-white/10 p-5">
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
            This tournament has nothing to enter teams into yet.
          </Text>
        </GlassCard>
      );
    }

    return (
      <View className="space-y-4">
        {/* Sport, then age group. Each level appears only when there is a second one to choose
            between, so a one-division tournament still shows neither. */}
        {!sportsCollapsed && (
          <Tabs
            items={sportsInPlay.map<TabItem>(sportId => ({
              key: sportId,
              label: sportName(sportId) || 'No sport',
              sublabel: `${orderedDivisions
                .filter(d => (d.sportId || '') === sportId)
                .reduce((sum, d) => sum + rosterOf(d.id).length, 0)} entered`,
            }))}
            activeKey={activeSport}
            onChange={(sportId) => {
              setActiveSportId(sportId);
              // The age row below is about to be a different set, so the division follows the
              // sport rather than keeping a selection that is no longer in the row.
              setActiveDivisionId(null);
            }}
            scrollable={sportsInPlay.length > 3}
          />
        )}

        {!agesCollapsed && (
          <Tabs
            variant="pill"
            items={divisionsOfSport.map<TabItem>(division => ({
              key: division.id,
              label: ageLabel(division),
              sublabel: `${rosterOf(division.id).length} entered`,
            }))}
            activeKey={activeDivision.id}
            onChange={setActiveDivisionId}
            scrollable={divisionsOfSport.length > 3}
          />
        )}

        <GlassCard className="border border-slate-200 dark:border-white/5 p-5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white" numberOfLines={1}>
              {divisionLabel(activeDivision)}
            </Text>
            <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {rosterOf(activeDivision.id).length} entered
            </Text>
          </View>

          {/* The same editor the division screen mounts, so there is one rendering of "who is in
              this division" rather than two that drift. */}
          <DivisionEntrantsEditor
            orgId={orgId}
            division={activeDivision}
            entrants={rosterOf(activeDivision.id)}
            candidateTeams={candidateTeams}
            orgs={orgs}
            sportName={sportName(activeDivision.sportId)}
            onTeamCreated={appendCandidate}
            divisionByTeam={divisionByTeam}
            divisionName={divisionNameOf}
            onMoveTeam={(team, from) => confirmMove(team, from, activeDivision)}
          />
        </GlassCard>
      </View>
    );
  };

  /** *What is Northcliff entering?* — one organisation, against every division at once. */
  const renderOrganisationAxis = () => {
    if (!activeOrg) {
      return (
        <GlassCard className="border border-dashed border-slate-200 dark:border-white/10 p-5">
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
            No organisations are taking part yet. Invite them from the event's settings and they
            will appear here.
          </Text>
        </GlassCard>
      );
    }

    const totalEntered = orderedDivisions.reduce(
      (sum, division) =>
        sum + rosterOf(division.id).filter(entrant => entrant.orgId === activeOrg.id).length,
      0
    );

    return (
      <View className="space-y-4">
        {/* Crest and code, because a strip of school names does not fit and a strip of crests
            alone does not identify — most organisations have no logo at all. */}
        {orgs.length > 1 && (
          <Tabs
            items={orgs.map<TabItem>(org => ({
              key: org.id,
              label: org.shortName,
              leading: (
                <OrgLogo
                  logo={org.logo}
                  settings={org.logoConfig ? { logoConfig: org.logoConfig } : undefined}
                  primaryColor={org.primaryColor}
                  size={20}
                  className="rounded-full"
                />
              ),
            }))}
            activeKey={activeOrg.id}
            onChange={setActiveOrgId}
            scrollable={orgs.length > 3}
          />
        )}

        <GlassCard className="border border-slate-200 dark:border-white/5 p-5">
          <View className="flex-row items-center gap-2 mb-4">
            <OrgLogo
              logo={activeOrg.logo}
              settings={activeOrg.logoConfig ? { logoConfig: activeOrg.logoConfig } : undefined}
              primaryColor={activeOrg.primaryColor}
              size={28}
              className="rounded-full"
            />
            <Text
              className="font-orbitron-bold text-sm text-slate-800 dark:text-white flex-1"
              numberOfLines={1}
            >
              {isLargeScreen ? `${activeOrg.name} (${activeOrg.shortName})` : activeOrg.shortName}
            </Text>
            <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {totalEntered} entered
            </Text>
          </View>

          {/*
            The mirror image of the division axis: the same grid, with a division where that one
            has an organisation. One school against every division at once is the view that makes
            "Northcliff have confirmed" a single sitting rather than fifteen screen visits.
          */}
          <EntrantGrid
            groups={orderedDivisions.map(division => {
              const teams = candidateTeams.filter(team => team.orgId === activeOrg.id);
              const enteredTeamIds = new Set(
                rosterOf(division.id).map(entrant => entrant.teamId).filter(Boolean) as string[]
              );
              const { listed, others } = divisionTeamOptions(
                teams,
                division,
                enteredTeamIds,
                divisionByTeam
              );
              return {
                key: division.id,
                isEmpty: listed.length === 0 && others.length === 0,
                header: (
                  <Text
                    numberOfLines={1}
                    className="font-orbitron-bold text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-widest"
                  >
                    {divisionLabel(division)}
                  </Text>
                ),
                body: (
                  <DivisionTeamChoices
                    teams={teams}
                    division={division}
                    enteredTeamIds={enteredTeamIds}
                    divisionByTeam={divisionByTeam}
                    divisionName={divisionNameOf}
                    isBusy={team => !!busyKeys[`${division.id}:${team.id}`]}
                    onToggle={team => toggleTeam(division, team)}
                    onMove={(team, from) => confirmMove(team, from, division)}
                    emptyText="Nothing qualifying."
                  />
                ),
              };
            })}
            emptyText="This tournament has nothing to enter teams into yet."
            /*
              The divisions this school has no team for, at the foot rather than as nine empty
              columns between the organiser and the six that matter. Each is still a button,
              because discovering that Northcliff have no u16 netball team is exactly the moment
              the team gets created — the reason this axis exists at all.
            */
            renderEmpty={empties => (
              <View className="border-t border-slate-100 dark:border-white/5 pt-3 mt-1">
                <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                  {activeOrg.shortName} has no team for
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {empties.map(group => {
                    const division = orderedDivisions.find(d => d.id === group.key)!;
                    return (
                      <TouchableOpacity
                        key={group.key}
                        onPress={() => setNewTeamFor({ division, orgId: activeOrg.id })}
                        accessibilityLabel={`Create a ${divisionLabel(division)} team for ${activeOrg.name}`}
                        className="flex-row items-center gap-1.5 rounded-full border border-dashed border-slate-300 dark:border-white/10 px-2.5 py-1.5 active:opacity-80"
                      >
                        <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400">
                          {divisionLabel(division)}
                        </Text>
                        <Ionicons name="add-circle-outline" size={13} color={COLORS.brand.orange} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          />
        </GlassCard>
      </View>
    );
  };

  // ------------------------------------------------------------------------------------------

  if (!isLoadingCapabilities && !canEdit) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
        <AccessDenied
          message="Entering teams is the tournament organiser's job. If you convene a division, its own screen has its entrants."
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

      {isLoadingEntrants ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.brand.orange} />
        </View>
      ) : (
        <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 60 }}>
          <View className="space-y-5">
            {/* Who was asked, before which of their teams are in. Writes on press — see the note
                at the top of this file for why this one list has no save bar. */}
            {canEdit && (
              <GlassCard className="border border-slate-200 dark:border-white/5 p-5 space-y-1.5">
                {/*
                  `UI-16`. The one field on this screen with something non-obvious to say: the
                  distinction between an organisation *competing* and one *running* the tournament
                  is the confusion this screen was built to make visible, and it is precisely what
                  a permanent paragraph would stop being read about after the second tournament.
                  Nothing else here gets an icon — a sport tab and a team chip say what they are,
                  and an icon on those would turn the mark into furniture.
                */}
                <FieldLabel
                  label="Organisations invited"
                  help="The schools and clubs competing in this tournament. Inviting one offers its teams for entry below; it does not give anyone permission to run anything. An organisation that helps run the tournament is appointed under Basic Info instead."
                />
                {invitedOrgs.length > 0 && (
                  <View className="flex-row flex-wrap gap-2 mb-2">
                    {/*
                      The flag carries the crest, and as much text as the screen has room for: the
                      full name with the code in brackets on a wide screen, the code alone on a
                      phone. Both say the same thing — the code is the name, abbreviated — so the
                      narrow one loses no information a reader of the wide one had, which is what
                      makes dropping the name at 768px safe rather than merely tidy.
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
                <TextInput
                  value={orgSearchText}
                  onChangeText={setOrgSearchText}
                  placeholder="Search for an organization to invite..."
                  placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white"
                />
                {isSearchingOrgs && (
                  <Text className="font-inter text-[10px] text-slate-400 mt-1">Searching...</Text>
                )}
                {searchedOrgs.map(o => (
                  <TouchableOpacity
                    key={o.id}
                    onPress={() => {
                      saveInvites([...invitedOrgs.map(p => p.id), o.id]);
                      setOrgSearchText('');
                    }}
                    className="px-4 py-2.5 border-b border-slate-100 dark:border-white/5 active:opacity-80"
                  >
                    <Text className="font-inter text-sm text-slate-800 dark:text-white">
                      {o.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </GlassCard>
            )}

            {/* Two views of one dataset, not two screens — which is what makes switching free. */}
            <SegmentedControl<Axis>
              options={[
                { key: 'division', label: 'By division', icon: 'trophy-outline' },
                { key: 'organisation', label: 'By organisation', icon: 'school-outline' },
              ]}
              value={axis}
              onChange={setAxis}
            />

            {axis === 'division' ? renderDivisionAxis() : renderOrganisationAxis()}

            <SetupStepFooter
              label={step.label}
              nextStep={nextStep}
              onNext={() =>
                nextStep
                  ? router.replace(nextStep.href(orgId, eventId) as any)
                  : goBackToChecklist()
              }
              onBackToChecklist={goBackToChecklist}
            />
          </View>
        </ScrollView>
      )}

      <NewTeamModal
        isOpen={!!newTeamFor}
        onClose={() => setNewTeamFor(null)}
        orgId={newTeamFor?.orgId || ''}
        orgName={orgs.find(o => o.id === newTeamFor?.orgId)?.name || ''}
        sportId={newTeamFor?.division.sportId}
        ageGroupId={newTeamFor?.division.ageGroupId}
        ageGroup={newTeamFor?.division.ageGroup}
        sportName={sportName(newTeamFor?.division.sportId)}
        onCreated={(team) => {
          if (newTeamFor) handleTeamCreated(newTeamFor.division, team);
        }}
      />

      {/*
        A team plays in one division, so entering one that is already elsewhere is a move. Asked
        rather than done, because it edits a division the organiser is not looking at — and because
        the team may already have been drawn into fixtures there. The wording is conditional on
        purpose: this screen does not read fixtures and must not claim there are any.
      */}
      <ConfirmationModal
        isOpen={!!pendingMove}
        title={`Move ${pendingMove?.team.name || 'this team'}?`}
        description={
          `${pendingMove?.team.name || 'It'} is entered in ${
            pendingMove ? divisionLabel(pendingMove.from) : 'another division'
          }. Moving it to ${
            pendingMove ? divisionLabel(pendingMove.to) : 'this division'
          } takes it out of the first — a team plays in one division of a tournament. If ${
            pendingMove ? divisionLabel(pendingMove.from) : 'that division'
          } has already drawn its fixtures, they will need redoing.`
        }
        confirmText="Move it here"
        cancelText="Leave it"
        onConfirm={runMove}
        onClose={() => setPendingMove(null)}
      />
    </SafeAreaView>
  );
}
