import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  CandidateTeam,
  Event,
  Organization,
  SocketAction,
  Sport,
  Team,
  TournamentDivision,
  TournamentEntrant,
  isCollapsed,
} from '@sk/shared';
import { GlassCard } from '../../../../../components/GlassCard';
import { ScreenHeader } from '../../../../../components/ScreenHeader';
import { SetupStepFooter } from '../../../../../components/tournament/SetupStepFooter';
import { nextStepAfter, stepByKey } from '../../../../../components/tournament/setupSteps';
import { SegmentedControl } from '../../../../../components/SegmentedControl';
import { Tabs, TabItem } from '../../../../../components/Tabs';
import { AccessDenied } from '../../../../../components/AccessDenied';
import { DivisionEntrantsEditor } from '../../../../../components/tournament/DivisionEntrantsEditor';
import { NewTeamModal } from '../../../../../components/tournament/NewTeamModal';
import { useLiveRoom } from '../../../../../hooks/useLiveRoom';
import { useEventEntrants, teamQualifies } from '../../../../../hooks/useEventEntrants';
import { DivisionTeamChoices } from '../../../../../components/tournament/DivisionTeamChoices';
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

  const { byDivision, isLoading: isLoadingEntrants, accessDenied } = useEventEntrants(eventId);

  /**
   * The teams that could be entered — a one-shot read, because no room owns "teams that could
   * enter". The same reasoning that keeps the invite picker a search rather than a bulk list
   * (`FIX-2`): a room's contents have to be a set somebody publishes changes to, and this is a
   * question rather than a set.
   */
  const [candidateTeams, setCandidateTeams] = useState<CandidateTeam[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);

  useEffect(() => {
    if (!isConnected || !eventId || !canEdit) return;
    let active = true;
    wsService.emit('get_data', { type: 'event_candidate_teams', eventId }, (res: any) => {
      if (active && Array.isArray(res)) setCandidateTeams(res);
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

  /** The host runs the day and usually enters teams as well, so it belongs in the list. */
  const orgs = useMemo(() => {
    const map = new Map<string, { id: string; name: string; shortName?: string }>();
    for (const team of candidateTeams) {
      if (!map.has(team.orgId)) {
        map.set(team.orgId, { id: team.orgId, name: team.orgName, shortName: team.orgShortName });
      }
    }
    for (const participating of event?.participatingOrgs || []) {
      if (!map.has(participating.id)) map.set(participating.id, participating);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [candidateTeams, event?.participatingOrgs]);

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
  const saveInvites = (next: Array<{ id: string; name: string; shortName?: string }>) => {
    if (!event) return;
    void sendAction(SocketAction.UPDATE_EVENT, {
      id: eventId,
      orgId,
      data: { participatingOrgIds: next.map(o => o.id) },
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
  const [activeDivisionId, setActiveDivisionId] = useState<string | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [newTeamFor, setNewTeamFor] = useState<{ division: TournamentDivision; orgId: string } | null>(
    null
  );
  // Keyed by `${divisionId}:${teamId}` so two cells of the grid can never share a spinner.
  const [busyKeys, setBusyKeys] = useState<Record<string, boolean>>({});

  const divisionsCollapsed = isCollapsed(orderedDivisions.length);
  const activeDivision =
    orderedDivisions.find(d => d.id === activeDivisionId) || orderedDivisions[0] || null;
  const activeOrg = orgs.find(o => o.id === activeOrgId) || orgs[0] || null;

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
    setCandidateTeams(prev => [
      ...prev,
      {
        id: team.id,
        name: team.name,
        shortName: team.shortName,
        orgId: team.orgId,
        orgName: orgs.find(o => o.id === team.orgId)?.name || team.orgId,
        orgShortName: orgs.find(o => o.id === team.orgId)?.shortName,
        sportId: team.sportId,
        ageGroupId: team.ageGroupId,
        ageGroup: team.ageGroup,
      },
    ]);
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
        {/* One division renders inline and shows no picker: the concept arrives with the second. */}
        {!divisionsCollapsed && (
          <Tabs
            items={orderedDivisions.map<TabItem>(division => ({
              key: division.id,
              label: divisionLabel(division),
              sublabel: `${rosterOf(division.id).length} entered`,
            }))}
            activeKey={activeDivision.id}
            onChange={setActiveDivisionId}
            scrollable={orderedDivisions.length > 3}
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
        {orgs.length > 1 && (
          <Tabs
            items={orgs.map<TabItem>(org => ({
              key: org.id,
              label: org.shortName || org.name,
            }))}
            activeKey={activeOrg.id}
            onChange={setActiveOrgId}
            scrollable={orgs.length > 3}
          />
        )}

        <GlassCard className="border border-slate-200 dark:border-white/5 p-5">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white" numberOfLines={1}>
              {activeOrg.name}
            </Text>
            <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {totalEntered} entered
            </Text>
          </View>

          {orderedDivisions.map(division => {
            const qualifying = candidateTeams.filter(
              team => team.orgId === activeOrg.id && teamQualifies(team, division)
            );
            return (
              <View key={division.id} className="mb-4">
                <View className="flex-row items-center justify-between mb-1.5">
                  <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    {divisionLabel(division)}
                  </Text>
                  {!qualifying.length && (
                    <TouchableOpacity
                      onPress={() => setNewTeamFor({ division, orgId: activeOrg.id })}
                      className="flex-row items-center gap-1 active:opacity-80"
                    >
                      <Ionicons name="add" size={13} color={COLORS.brand.orange} />
                      <Text className="font-inter-bold text-[9px] text-brand-orange uppercase tracking-wider">
                        Create a team
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                {/* Qualifying teams, age-group overrides already entered, and the rest of the
                    sport behind "Other age groups" — the same component the division axis uses. */}
                <DivisionTeamChoices
                  teams={candidateTeams.filter(team => team.orgId === activeOrg.id)}
                  division={division}
                  enteredTeamIds={
                    new Set(
                      rosterOf(division.id).map(entrant => entrant.teamId).filter(Boolean) as string[]
                    )
                  }
                  isBusy={team => !!busyKeys[`${division.id}:${team.id}`]}
                  onToggle={team => toggleTeam(division, team)}
                  emptyText={`Nothing qualifying — ${activeOrg.shortName || activeOrg.name} has no ${[
                    division.ageGroup,
                    sportName(division.sportId),
                  ]
                    .filter(Boolean)
                    .join(' ')} team.`}
                />
              </View>
            );
          })}
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
                <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Organisations invited
                </Text>
                {invitedOrgs.length > 0 && (
                  <View className="flex-row flex-wrap gap-2 mb-2">
                    {invitedOrgs.map(o => (
                      <View
                        key={o.id}
                        className="flex-row items-center bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200/50 dark:border-white/5"
                      >
                        <Text className="font-inter text-xs text-slate-700 dark:text-slate-300 mr-1.5">
                          {o.name}
                        </Text>
                        <TouchableOpacity
                          onPress={() => saveInvites(invitedOrgs.filter(p => p.id !== o.id))}
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
                      saveInvites([
                        ...invitedOrgs,
                        { id: o.id, name: o.name, shortName: o.shortName },
                      ]);
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
    </SafeAreaView>
  );
}
