import { TeamEventsCard } from '../../../../components/tournament/TeamInvitations';
import { useTeamEntries } from '../../../../hooks/useTeamEntries';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GameSummary, OrgMember, SocketAction, Sport, TeamMember } from '@sk/shared';
import { ScreenHeader } from '../../../../components/ScreenHeader';
import { EditLink } from '../../../../components/ReadCard';
import { OverflowMenu, OverflowMenuItem } from '../../../../components/OverflowMenu';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { InviteModal, isOnScoreKeeper, useInviteCooldownHours } from '../../../../components/InviteToScoreKeeper';
import { AddPersonDialog } from '../../../../components/people/AddPersonDialog';
import { OrgRole } from '../../../../components/people/PersonDialogs';
import { guardianshipOf } from '../../../../components/people/PersonBits';
import { PLAYER_ROLE, TeamCrest, isUpcoming, staffRank, teamStatistics } from '../../../../components/teams/TeamBits';
import { CardNote, FormChips, GameList, RecordStrip, RosterRow, SectionCard, ShowMore } from '../../../../components/teams/TeamCards';
import { Tabs } from '../../../../components/Tabs';
import CustomSelect from '../../../../components/CustomSelect';
import { useOrgSites } from '../../../../hooks/useOrgSites';
import { useTeamSeasonStats } from '../../../../hooks/useTeamSeasonStats';
import { useTeamCompetitions, useTeamOrgId, useTeamSquad } from '../../../../hooks/usePublicTeam';
import { useTournamentLinks } from '../../../../components/tournament/tournamentLinks';
import { currentSeason, seasonOf, whenMs } from '../../../../utils/dates';
import { AddPlayersDialog, AddStaffDialog, ChangeRoleDialog, TeamDetailsDialog, TeamRole } from '../../../../components/teams/TeamDialogs';
import { useOrgTeams } from '../../../../hooks/useOrgTeams';
import { useTeamRoster } from '../../../../hooks/useTeamRoster';
import { useTeamGames } from '../../../../hooks/useTeamGames';
import { useOrgSummary } from '../../../../hooks/useOrgSummary';
import { useOrgMembers } from '../../../../hooks/useOrgMembers';
import { useOrgGuardians } from '../../../../hooks/useOrgGuardians';
import { useOrgMinorsSettings } from '../../../../hooks/useOrgMinorsSettings';
import { useSocketQuery } from '../../../../hooks/useSocketQuery';
import { useSafeBack } from '../../../../hooks/useSafeBack';
import { useAuthStore } from '../../../../store/authStore';
import { sendAction } from '../../../../services/actions';
import { useActiveTheme } from '../../../../store/settingsStore';
import { themeColor } from '../../../../constants/Colors';
import { PageBody } from '../../../../components/PageBody';

type Dialog = 'edit' | 'players' | 'staff' | 'deactivate' | 'delete' | null;
type Tab = 'overview' | 'games' | 'results' | 'players' | 'competitions';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'games', label: 'Games' },
  { key: 'results', label: 'Results' },
  { key: 'players', label: 'Players' },
  { key: 'competitions', label: 'Competitions' },
];

/** Players shown before "Show all", while no search is on. */
const PLAYERS_SHOWN = 15;

/**
 * One team (docs/teams.md), in tabs since 2026-10-22 (`mockups/team-tabs.html`; the tournament and
 * division pages have them too): **Overview** (live now and next, the last result, the season's
 * record and form, the squad in short, its competitions), **Games** (still to play, every
 * competition), **Results** (the season's statistics and results — on a phone a Statistics |
 * Results switch, statistics first), **Players** (the squad with each player's season, then the
 * staff) and **Competitions**. A **season** — for now the calendar year — is chosen in the banner
 * and the page follows it; Games is always what is still to play.
 *
 * Read-first (design_system.md, *Read-first record pages*): it replaced a read-only view screen and
 * a five-tab edit screen with a save bar on 2026-10-03. The banner carries the team's identity and
 * its Edit; Players, Staff and Games are cards. A roster row opens the person's page, where their
 * details are edited; the row's ⋯ menu holds only what belongs to the team — change role, invite,
 * remove. Deactivating and deleting the team are in the header's ⋯ menu.
 *
 * One search covers players, staff and games. Wide, it sits above the two columns; on a phone it
 * is pinned under the header with buttons that jump to each card, since everything there is one
 * long column. A viewer who cannot edit (anyone but Admin or Staff) gets the same page with no
 * Edit, no Add, no menus and no Pick team.
 *
 * **The public page** (`/teams/[teamId]`, 2026-10-22) is this page under the public layout, which
 * makes `useTournamentLinks().isPublic` true: read-only whoever is looking, its links on the public
 * side, and in place of the members' reads the squad by name and role and the tournaments it has
 * a place in (hooks/usePublicTeam.ts). Its organisation comes from the team, since the address
 * names only the team.
 */
export default function TeamPage() {
  const isDark = useActiveTheme() === 'dark';
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId: orgParam, teamId, tab: tabParam } = useLocalSearchParams<{ orgId: string; teamId: string; tab?: string }>();
  const links = useTournamentLinks(orgParam);
  const isPublic = links.isPublic;
  const publicOrgId = useTeamOrgId(isPublic ? teamId : null);
  const orgId = orgParam || publicOrgId || undefined;
  const [tab, setTab] = useState<Tab>(() => (TABS.some(t => t.key === tabParam) ? (tabParam as Tab) : 'overview'));
  const [season, setSeason] = useState<number>(currentSeason());
  const [resultsView, setResultsView] = useState<'stats' | 'list'>('stats');
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isNarrow = width < 640;

  const user = useAuthStore(state => state.user);
  const viewerRole = useAuthStore(state => state.orgMemberships.find((m: any) => m.orgId === orgId && !m.restrictedReason)?.roleId);
  const canEdit = !isPublic && (user?.globalRole === 'admin' || viewerRole === 'role-org-admin' || viewerRole === 'role-org-staff');

  const { teams, isLoading: isTeamsLoading } = useOrgTeams(orgId);
  const { roster: workspaceRoster } = useTeamRoster(isPublic ? null : teamId);
  const squad = useTeamSquad(isPublic ? teamId : null);
  const roster = isPublic ? squad : workspaceRoster;
  const { games, eventNames } = useTeamGames(orgId, teamId);
  // Its places in tournaments, and invitations to answer (`FIX-31`): its coach, or an admin, answers.
  const { entries: workspaceEntries, refresh: refreshEntries } = useTeamEntries({ teamId: isPublic ? null : teamId });
  const publicEntries = useTeamCompetitions(isPublic ? teamId : null);
  const teamEntries = isPublic ? publicEntries : workspaceEntries;
  const teamMemberships = useAuthStore((state: any) => state.teamMemberships) || [];
  const coachesThis = teamMemberships.some((m: any) => m.teamId === teamId && (m.roleId === 'role-coach' || m.roleId === 'role-assistant-coach'));
  const canAnswer = !isPublic && (user?.globalRole === 'admin' || viewerRole === 'role-org-admin' || coachesThis);
  const { org } = useOrgSummary(orgId);
  // The organisation's people are its members' business: the public page has the squad alone.
  const { members } = useOrgMembers(isPublic ? null : orgId);
  const { byPlayer: guardiansByPlayer } = useOrgGuardians(isPublic ? null : orgId);
  const { settings: minorsSettings } = useOrgMinorsSettings(isPublic ? null : orgId);
  const { data: sportsData } = useSocketQuery<Sport[]>('sports');
  const { data: rolesData } = useSocketQuery<any>('roles');
  const inviteCooldownHours = useInviteCooldownHours();
  const sports = sportsData || [];
  const teamRoles: TeamRole[] = rolesData?.team || [];
  const orgRoles: OrgRole[] = rolesData?.org || [];

  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [newPersonRole, setNewPersonRole] = useState<string | null>(null);
  const [roleTarget, setRoleTarget] = useState<TeamMember | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [inviteTarget, setInviteTarget] = useState<TeamMember | null>(null);
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [busyError, setBusyError] = useState<string | null>(null);

  const { sites } = useOrgSites(orgId);
  const seasonStats = useTeamSeasonStats(teamId, season);

  const team = teams.find(t => t.id === teamId) || null;
  const back = () => safeBack(isPublic ? (orgId ? `/organizations/${orgId}?tab=teams` : '/organizations') : `/admin/${orgId}/teams`);
  const q = query.trim().toLowerCase();

  // Names, photos and org IDs come from the org's members, which update the moment a person page
  // saves; the roster row is the fallback for anyone no longer a member.
  const memberOf = useMemo(() => new Map((members || []).map(m => [m.id, m] as [string, OrgMember])), [members]);
  const nameOf = (m: TeamMember) => memberOf.get(m.id)?.name || m.name;
  const roleName = (roleId: string) => teamRoles.find(r => r.id === roleId)?.name || 'Staff';

  const players = useMemo(
    () => roster.filter(m => m.roleId === PLAYER_ROLE).sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roster, memberOf]
  );
  const staff = useMemo(
    () => roster.filter(m => m.roleId !== PLAYER_ROLE).sort((a, b) => staffRank(a.roleId) - staffRank(b.roleId) || nameOf(a).localeCompare(nameOf(b))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roster, memberOf]
  );
  const matchingPlayers = q ? players.filter(m => nameOf(m).toLowerCase().includes(q) || (memberOf.get(m.id)?.personOrgId || '').toLowerCase().includes(q)) : players;
  const matchingStaff = q ? staff.filter(m => nameOf(m).toLowerCase().includes(q) || roleName(m.roleId).toLowerCase().includes(q)) : staff;

  if (isTeamsLoading || !team) {
    const loading = isTeamsLoading || (isPublic && !orgId);
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Team" backLabel="Teams" onBack={back} />
        <View className="flex-1 items-center justify-center px-6">
          {loading ? <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} /> : (
            <Text className="font-inter text-sm text-ink-muted text-center">This team does not exist any more.</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const inactive = team.isActive === false;
  const sportName = sports.find(s => s.id === team.sportId)?.name;
  const close = () => setDialog(null);

  const openPerson = (m: TeamMember) => {
    const membership = memberOf.get(m.id)?.membershipId;
    return membership
      ? () => router.push({ pathname: '/admin/[orgId]/people/[membershipId]', params: { orgId: orgId!, membershipId: membership } })
      : undefined;
  };
  const openGame = (g: GameSummary) => router.push(links.event(g.eventId!, `/games/${g.id}`));
  const pickTeam = (g: GameSummary) => router.push(`/admin/${orgId}/events/${g.eventId}/games/${g.id}/selection?teamId=${teamId}`);

  const rowMenu = (m: TeamMember): OverflowMenuItem[] | undefined => {
    if (!canEdit) return undefined;
    const items: OverflowMenuItem[] = [];
    if (m.roleId !== PLAYER_ROLE) {
      items.push({ label: 'Change role', description: `${roleName(m.roleId)} now.`, icon: 'swap-horizontal-outline', onPress: () => setRoleTarget(m) });
    }
    if (!isOnScoreKeeper(m)) {
      items.push({ label: 'Invite to ScoreKeeper', description: 'They are not on ScoreKeeper yet.', icon: 'mail-outline', onPress: () => setInviteTarget(m) });
    }
    items.push({
      label: 'Remove from team',
      description: 'Takes them off this team only. They stay in the organisation.',
      icon: 'person-remove-outline',
      destructive: true,
      onPress: () => { setBusyError(null); setRemoveTarget(m); },
    });
    return items;
  };

  /** Deactivating asks first; reactivating is harmless, so it simply happens. */
  const setActive = async (isActive: boolean) => {
    setIsBusy(true);
    setBusyError(null);
    const result = await sendAction(SocketAction.UPDATE_TEAM, { id: team.id, data: { isActive } }, { suppressToast: !isActive });
    setIsBusy(false);
    if (!result.ok) return setBusyError(result.message || 'The team was not deactivated.');
    close();
  };
  const deleteTeam = async () => {
    setIsBusy(true);
    setBusyError(null);
    const result = await sendAction(SocketAction.DELETE_TEAM, { id: team.id }, { suppressToast: true });
    setIsBusy(false);
    if (!result.ok) return setBusyError(result.message || 'The team was not deleted.');
    close();
    router.replace(`/admin/${orgId}/teams`);
  };
  const removeMember = async () => {
    if (!removeTarget) return;
    setIsBusy(true);
    setBusyError(null);
    const result = await sendAction(SocketAction.REMOVE_TEAM_MEMBER, { id: removeTarget.membershipId }, { suppressToast: true });
    setIsBusy(false);
    if (!result.ok) return setBusyError(result.message || 'They were not removed.');
    setRemoveTarget(null);
  };

  const menu: OverflowMenuItem[] = [
    inactive
      ? { label: 'Reactivate team', description: 'It can be picked for new games, leagues and tournaments again.', icon: 'refresh-outline', onPress: () => setActive(true) }
      : {
          label: 'Deactivate team',
          description: 'Stop it being picked for new games, leagues and tournaments. Its games, results and roster are kept, and you can reactivate it.',
          icon: 'pause-circle-outline',
          onPress: () => { setBusyError(null); setDialog('deactivate'); },
        },
    games.length
      ? { label: 'Delete team', description: `Not available: this team has ${games.length === 1 ? 'a game' : `${games.length} games`}. Deactivate it instead.`, icon: 'trash-outline', destructive: true, disabled: true, onPress: () => {} }
      : { label: 'Delete team', description: 'Deletes the team and its roster. This cannot be undone.', icon: 'trash-outline', destructive: true, onPress: () => { setBusyError(null); setDialog('delete'); } },
  ];

  /* ---------------- cards ---------------- */

  const banner = (seasonChoice: React.ReactNode) => (
    <View className="rounded-2xl border p-4 bg-card border-line gap-3">
    <View className="flex-row items-center gap-4">
      <TeamCrest team={team} org={org} size={isNarrow ? 54 : 68} />
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center flex-wrap gap-2">
          <Text className={`font-inter-bold ${isNarrow ? 'text-lg' : 'text-2xl'} leading-tight text-ink`}>{team.name}</Text>
          {inactive ? (
            <View className="rounded-full border px-2.5 py-0.5 bg-sunken border-line">
              <Text className="font-inter-semibold text-xs text-ink-soft">Inactive</Text>
            </View>
          ) : null}
        </View>
        <Text className="font-inter text-sm text-ink-soft mt-1">{[sportName, team.ageGroup].filter(Boolean).join(' · ')}</Text>
      </View>
      {isNarrow ? null : <View>{seasonChoice}</View>}
      {canEdit ? <View className="self-start"><EditLink onPress={() => setDialog('edit')} /></View> : null}
    </View>
    {isNarrow ? <View className="self-start">{seasonChoice}</View> : null}
    </View>
  );

  const inactiveNote = inactive ? (
    <View className="flex-row items-center gap-3 rounded-xl px-4 py-2.5 bg-warning-soft">
      <Text className="flex-1 font-inter text-sm text-warning-ink">
        This team is inactive. It cannot be picked for new games, leagues or tournaments.
      </Text>
      {canEdit ? (
        <TouchableOpacity onPress={() => setActive(true)} disabled={isBusy} accessibilityRole="button">
          <Text className="font-inter-bold text-sm text-primary-ink">Reactivate</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  ) : null;

  const shownPlayers = q || showAllPlayers ? matchingPlayers : matchingPlayers.slice(0, PLAYERS_SHOWN);
  /** A player's season under their name: games played, then what they scored and their cards. */
  /** "try" → "tries", "conversion" → "conversions". */
  const plural = (w: string) => /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`;
  const seasonLine = (profileId: string) => {
    const p = seasonStats.players.find(x => x.orgProfileId === profileId);
    if (!p) return undefined;
    const scored = Object.entries(p.scores).filter(([, n]) => n).map(([k, n]) => `${n} ${n === 1 ? k.toLowerCase() : plural(k.toLowerCase())}`);
    // Number and position from their latest team sheet, then the season.
    return [p.jerseyNumber != null ? `#${p.jerseyNumber}` : '', p.position || '', p.played ? `${p.played} ${p.played === 1 ? 'game' : 'games'}` : '', ...scored, p.cards ? `${p.cards} ${p.cards === 1 ? 'card' : 'cards'}` : ''].filter(Boolean).join(' · ') || undefined;
  };
  const playersCard = (
    <SectionCard
      label="Players"
      count={q ? `${matchingPlayers.length} of ${players.length}` : players.length ? String(players.length) : undefined}
      action={canEdit && players.length ? 'Add' : undefined}
      onAction={() => setDialog('players')}
    >
      {!players.length ? (
        <CardNote text="No players yet." action={canEdit ? '＋ Add players' : undefined} onAction={() => setDialog('players')} />
      ) : !matchingPlayers.length ? (
        <CardNote text={`No players match “${query.trim()}”.`} />
      ) : (
        <View>
          {shownPlayers.map((m, i) => {
            const person = memberOf.get(m.id);
            return (
              <RosterRow
                key={m.membershipId}
                name={nameOf(m)}
                image={person ? person.image : m.image}
                imageConfig={person ? person.imageConfig : m.imageConfig}
                guardianship={guardianshipOf(person?.birthdate ?? m.birthdate, minorsSettings, !!guardiansByPlayer.get(m.id)?.length)}
                orgPersonId={person?.personOrgId}
                role={seasonLine(m.id)}
                first={i === 0}
                onPress={openPerson(m)}
                menu={rowMenu(m)}
              />
            );
          })}
        </View>
      )}
      {!q && matchingPlayers.length > PLAYERS_SHOWN ? (
        <ShowMore label={showAllPlayers ? 'Show fewer players' : `Show all ${players.length} players`} onPress={() => setShowAllPlayers(v => !v)} />
      ) : null}
    </SectionCard>
  );

  const staffCard = (
    <SectionCard
      label="Staff"
      count={q ? `${matchingStaff.length} of ${staff.length}` : staff.length ? String(staff.length) : undefined}
      action={canEdit && staff.length ? 'Add' : undefined}
      onAction={() => setDialog('staff')}
    >
      {!staff.length ? (
        <CardNote text="No coach or manager yet." action={canEdit ? '＋ Add staff' : undefined} onAction={() => setDialog('staff')} />
      ) : !matchingStaff.length ? (
        <CardNote text={`No staff match “${query.trim()}”.`} />
      ) : (
        <View>
          {matchingStaff.map((m, i) => {
            const person = memberOf.get(m.id);
            return (
              <RosterRow
                key={m.membershipId}
                name={nameOf(m)}
                image={person ? person.image : m.image}
                imageConfig={person ? person.imageConfig : m.imageConfig}
                role={roleName(m.roleId)}
                first={i === 0}
                onPress={openPerson(m)}
                menu={rowMenu(m)}
              />
            );
          })}
        </View>
      )}
    </SectionCard>
  );

  const toAnswer = canAnswer
    ? teamEntries.filter(e => e.status === 'invited' && !e.entriesLocked && e.orgInvitation !== 'declined' && e.orgInvitation !== 'withdrawn').length
    : 0;
  const eventsCard = (
    <TeamEventsCard
      entries={teamEntries}
      canAnswer={canAnswer}
      orgId={orgId!}
      onAnswered={refreshEntries}
      onOpenEvent={eventId => router.push(links.event(eventId))}
    />
  );
  // While anything waits: one strip under the banner that takes the reader to the Events card.
  const invitationStrip = toAnswer ? (
    <TouchableOpacity
      onPress={() => setTab('competitions')}
      accessibilityRole="button"
      className="rounded-xl border border-warning-line bg-warning-soft px-3.5 py-2.5 flex-row items-center gap-3"
    >
      <Text className="flex-1 font-inter-bold text-sm text-warning-ink">{toAnswer} {toAnswer === 1 ? 'invitation' : 'invitations'} to answer</Text>
      <Text className="font-inter-bold text-[13px] text-warning-ink">Competitions ›</Text>
    </TouchableOpacity>
  ) : null;

  const searchBox = (
    <View className="flex-row items-center gap-2 bg-card border border-line rounded-xl px-3">
      <Ionicons name="search-outline" size={16} color={themeColor(isDark, 'ink-muted')} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search players and staff"
        placeholderTextColor={themeColor(isDark, 'ink-muted')}
        accessibilityLabel="Search players and staff"
        className={`flex-1 font-inter text-base text-ink outline-none ${isWide ? 'py-2.5' : 'py-2'}`}
      />
      {query ? (
        <TouchableOpacity onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear the search">
          <Ionicons name="close-circle" size={18} color={themeColor(isDark, 'ink-muted')} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  /* ---------------- the season ---------------- */
  const seasonsOn = [...new Set([currentSeason(), ...games.map(g => seasonOf(g.scheduledStartTime || g.startTime)).filter((y): y is number => !!y)])].sort((a, b) => b - a);
  const inSeason = (g: GameSummary) => seasonOf(g.scheduledStartTime || g.startTime) === season;
  const isCurrent = season === currentSeason();
  const byTime = (a: GameSummary, b: GameSummary) => whenMs(a.scheduledStartTime || a.startTime) - whenMs(b.scheduledStartTime || b.startTime);
  const upcoming = games.filter(isUpcoming).sort(byTime);
  const results = games.filter(g => inSeason(g) && g.status === 'Finished').sort((a, b) => byTime(b, a));
  const live = upcoming.filter(g => g.status === 'Live');
  const homeSiteIds = new Set(sites.map(s => s.id));
  const competitionOf = (g: GameSummary) => (g.divisionId ? eventNames.get(g.eventId) || 'Tournament' : 'Matches');
  const stats = teamStatistics(results, team.id, g => !!g.siteId && homeSiteIds.has(g.siteId), competitionOf);
  const statsOf = new Map(seasonStats.players.map(p => [p.orgProfileId, p]));
  const mainScore = seasonStats.mainScore;
  const top = mainScore ? [...seasonStats.players].filter(p => p.scores[mainScore]).sort((a, b) => (b.scores[mainScore] || 0) - (a.scores[mainScore] || 0))[0] : undefined;
  const coach = staff.find(m => m.roleId === 'role-coach');
  const seasonEntries = teamEntries.filter(e => seasonOf(e.eventStartDate) === season || e.status === 'invited');

  const seasonSelect = (
    <CustomSelect
      compact
      accessibilityLabel="Season"
      placeholder="Season"
      value={String(season)}
      onChange={v => setSeason(Number(v))}
      options={seasonsOn.map(y => ({ value: String(y), label: `${y} season` }))}
    />
  );
  const see = (label: string, to: Tab) => <EditLink label={label} icon={null} onPress={() => setTab(to)} />;
  const pick = { teamId: team.id, eventNames, canEdit, onOpen: openGame, onPickTeam: pickTeam };

  /* ---------------- Overview ---------------- */
  const nowNext = isCurrent && upcoming.length ? (
    <TournamentCardLike title={live.length ? 'Live now' : 'Next'} right={see('Games ›', 'games')}>
      <GameList games={[...live, ...upcoming.filter(g => g.status !== 'Live').slice(0, 1)]} {...pick} />
    </TournamentCardLike>
  ) : null;
  const lastResult = results[0] ? (
    <TournamentCardLike title="Last result" right={see('Results ›', 'results')}><GameList games={[results[0]]} {...pick} /></TournamentCardLike>
  ) : null;
  const seasonCard = (
    <TournamentCardLike title={`${season} season`} right={results.length ? see('Results ›', 'results') : undefined}>
      {results.length ? (
        <>
          <RecordStrip record={stats.record} />
          {stats.form.length ? <View className="flex-row items-center justify-between pt-1"><Text className="font-inter text-sm text-ink-muted">Form</Text><FormChips form={stats.form} /></View> : null}
        </>
      ) : <CardNote text={`No results in ${season} yet.`} />}
    </TournamentCardLike>
  );
  const squadCard = (
    <TournamentCardLike title="Squad" right={see('Players ›', 'players')}>
      <Line label="Players" value={String(players.length)} />
      {top && mainScore ? <Line label={`Top ${mainScore.toLowerCase()} scorer`} value={`${top.name} · ${top.scores[mainScore]}`} /> : null}
      <Line label="Coach" value={coach ? nameOf(coach) : 'None yet'} />
    </TournamentCardLike>
  );
  const competitionsCard = seasonEntries.length ? (
    <TournamentCardLike title="Competitions" right={see('All ›', 'competitions')}>
      {seasonEntries.slice(0, 3).map((e, i) => (
        <TouchableOpacity key={e.id} onPress={() => router.push(links.event(e.eventId))} accessibilityRole="link" className={`py-2 ${i ? 'border-t border-line-soft' : ''}`}>
          <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>{e.eventName}</Text>
          <Text className="font-inter text-xs text-ink-muted" numberOfLines={1}>{e.divisionName}</Text>
        </TouchableOpacity>
      ))}
    </TournamentCardLike>
  ) : null;
  const overview = isWide ? (
    <View className="flex-row gap-4 items-start">
      <View className="gap-4 min-w-0" style={{ flex: 1.2 }}>{nowNext}{lastResult}{seasonCard}</View>
      <View className="gap-4 min-w-0" style={{ flex: 1 }}>{squadCard}{competitionsCard}</View>
    </View>
  ) : <View className="gap-3">{nowNext}{lastResult}{seasonCard}{squadCard}{competitionsCard}</View>;

  /* ---------------- Games: still to play, every competition ---------------- */
  const gamesTab = (
    <SectionCard label="Games" count={upcoming.length ? String(upcoming.length) : undefined}>
      <GameList games={upcoming} {...pick} empty="Nothing still to play. A game shows here once this team is in one." />
    </SectionCard>
  );

  /* ---------------- Results: the season's statistics, then its results ---------------- */
  const pct = (r: { won: number; drawn: number; lost: number }) => `W${r.won} D${r.drawn} L${r.lost}`;
  const statsCard = (
    <TournamentCardLike title="Statistics">
      {results.length ? (
        <>
          <RecordStrip record={stats.record} />
          {stats.form.length ? <View className="flex-row items-center justify-between py-1"><Text className="font-inter text-sm text-ink">Form</Text><FormChips form={stats.form} /></View> : null}
          <Line label="Points for · against" value={`${stats.record.pointsFor} · ${stats.record.pointsAgainst}`} />
          <Line label="Home · Away" value={`${pct(stats.home)} · ${pct(stats.away)}`} />
          {stats.biggestWin ? <Line label="Biggest win" value={`${stats.biggestWin.mine}–${stats.biggestWin.theirs}`} /> : null}
          {top && mainScore ? <Line label={`Top ${mainScore.toLowerCase()} scorer`} value={`${top.name} · ${top.scores[mainScore]}`} /> : null}
          {stats.byCompetition.length > 1 ? (
            <View className="pt-2">
              <Text className="font-orbitron-bold text-[9px] text-ink-muted uppercase tracking-widest pb-1">By competition</Text>
              {stats.byCompetition.map(c => <Line key={c.name} label={c.name} value={`P${c.record.played} ${pct(c.record)}`} />)}
            </View>
          ) : null}
          {seasonStats.gamesCounted ? (
            <Text className="font-inter text-xs text-ink-muted">
              {seasonStats.gamesWithEvents === seasonStats.gamesCounted
                ? 'Scorers from every game, from its match events.'
                : `Scorers from ${seasonStats.gamesWithEvents} of ${seasonStats.gamesCounted} games with match events; the rest have a final score only.`}
            </Text>
          ) : null}
        </>
      ) : <CardNote text={`No results in ${season} yet.`} />}
    </TournamentCardLike>
  );
  const resultsList = (
    <SectionCard label="Results" count={results.length ? String(results.length) : undefined}>
      <GameList games={results} {...pick} empty={`No results in ${season} yet.`} />
    </SectionCard>
  );
  const resultsTab = isWide ? (
    <View className="flex-row gap-4 items-start">
      <View className="min-w-0" style={{ flex: 1 }}>{statsCard}</View>
      <View className="min-w-0" style={{ flex: 1 }}>{resultsList}</View>
    </View>
  ) : (
    <View className="gap-3">
      <View className="self-start">
        <Tabs variant="pill" items={[{ key: 'stats', label: 'Statistics' }, { key: 'list', label: `Results ${results.length}` }]} activeKey={resultsView} onChange={k => setResultsView(k as 'stats' | 'list')} />
      </View>
      {resultsView === 'stats' ? statsCard : resultsList}
    </View>
  );

  /* ---------------- Players and Competitions ---------------- */
  const playersTab = (
    <View className="gap-3">
      {players.length || staff.length ? searchBox : null}
      {playersCard}
      {staffCard}
    </View>
  );
  const competitionsTab = teamEntries.length ? eventsCard : (
    <SectionCard label="Competitions"><CardNote text="Not in any tournament yet." /></SectionCard>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="Team"
        backLabel="Teams"
        onBack={back}
        right={canEdit ? <OverflowMenu items={menu} accessibilityLabel="Team actions" title={team.name} /> : undefined}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ padding: isWide ? 24 : 12, paddingBottom: 0 }}>
          <PageBody className="gap-3">
            {banner(seasonSelect)}
            {invitationStrip}
            {inactiveNote}
          </PageBody>
        </View>
        <View className="bg-card mt-3 border-y border-line">
          <PageBody><Tabs items={TABS} activeKey={tab} onChange={k => setTab(k as Tab)} scrollable={isNarrow} /></PageBody>
        </View>
        <View style={{ padding: isWide ? 24 : 12 }}>
          <PageBody className="gap-4">
            {tab === 'overview' ? overview : null}
            {tab === 'games' ? gamesTab : null}
            {tab === 'results' ? resultsTab : null}
            {tab === 'players' ? playersTab : null}
            {tab === 'competitions' ? competitionsTab : null}
          </PageBody>
        </View>
      </ScrollView>

      {canEdit ? (
        <>
          <TeamDetailsDialog
            visible={dialog === 'edit'}
            onClose={close}
            orgId={orgId!}
            supportedSportIds={org?.supportedSportIds}
            sports={sports}
            team={team}
          />
          <AddPlayersDialog
            visible={dialog === 'players'}
            onClose={close}
            teamId={team.id}
            members={members || []}
            playerProfileIds={new Set(players.map(m => m.id))}
            minorsSettings={minorsSettings}
            guardiansByPlayer={guardiansByPlayer}
            onAddNew={() => { close(); setNewPersonRole(PLAYER_ROLE); }}
          />
          <AddStaffDialog
            visible={dialog === 'staff'}
            onClose={close}
            teamId={team.id}
            members={members || []}
            staffProfileIds={new Set(staff.map(m => m.id))}
            roles={teamRoles}
            onAddNew={roleId => { close(); setNewPersonRole(roleId); }}
          />
          <AddPersonDialog
            orgId={orgId!}
            roles={orgRoles}
            visible={!!newPersonRole}
            onClose={() => setNewPersonRole(null)}
            team={newPersonRole ? { id: team.id, name: team.name, roleId: newPersonRole, roleName: newPersonRole === PLAYER_ROLE ? 'Player' : roleName(newPersonRole) } : undefined}
          />
          <ChangeRoleDialog member={roleTarget} roles={teamRoles} onClose={() => setRoleTarget(null)} />
          <InviteModal
            person={inviteTarget}
            guardians={inviteTarget ? guardiansByPlayer.get(inviteTarget.id) : undefined}
            minorsSettings={minorsSettings}
            cooldownHours={inviteCooldownHours}
            onClose={() => setInviteTarget(null)}
          />
          <ConfirmationModal
            isOpen={dialog === 'deactivate'}
            onClose={close}
            title="Deactivate team?"
            description={`${team.name} will not be offered when picking teams for new games, leagues or tournaments. Its games, results and roster are kept, and you can reactivate it at any time.${busyError ? `\n\n${busyError}` : ''}`}
            onConfirm={() => setActive(false)}
            confirmText={isBusy ? 'Deactivating…' : 'Deactivate'}
            isProcessing={isBusy}
          />
          <ConfirmationModal
            isOpen={dialog === 'delete'}
            onClose={close}
            title="Delete team?"
            description={`${team.name} and its roster will be deleted. This cannot be undone.${busyError ? `\n\n${busyError}` : ''}`}
            onConfirm={deleteTeam}
            confirmText={isBusy ? 'Deleting…' : 'Delete'}
            variant="danger"
            isProcessing={isBusy}
          />
          <ConfirmationModal
            isOpen={!!removeTarget}
            onClose={() => setRemoveTarget(null)}
            title="Remove from team?"
            description={removeTarget ? `${nameOf(removeTarget)} will be taken off ${team.name}. They stay in the organisation.${busyError ? `\n\n${busyError}` : ''}` : ''}
            onConfirm={removeMember}
            confirmText={isBusy ? 'Removing…' : 'Remove'}
            variant="danger"
            isProcessing={isBusy}
          />
        </>
      ) : null}
    </SafeAreaView>
  );
}

/** A card with a title, a count-less heading and a link on the right — as on the tournament page. */
function TournamentCardLike({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View className="rounded-2xl border p-4 gap-2 bg-card border-line">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="font-inter-bold text-[18px] text-ink">{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

/** One fact on a line: its label, and its value at the end. */
function Line({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3 py-1.5 border-t border-line-soft">
      <Text className="font-inter text-sm text-ink flex-shrink" numberOfLines={1}>{label}</Text>
      <Text className="font-inter text-sm text-ink-muted text-right flex-shrink" numberOfLines={1}>{value}</Text>
    </View>
  );
}
