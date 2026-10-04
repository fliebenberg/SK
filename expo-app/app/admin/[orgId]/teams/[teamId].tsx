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
import { JumpBar, useJumpSections } from '../../../../components/JumpBar';
import { InviteModal, isOnScoreKeeper, useInviteCooldownHours } from '../../../../components/InviteToScoreKeeper';
import { AddPersonDialog } from '../../../../components/people/AddPersonDialog';
import { OrgRole } from '../../../../components/people/PersonDialogs';
import { guardianshipOf } from '../../../../components/people/PersonBits';
import { PLAYER_ROLE, TeamCrest, opponentOf, staffRank } from '../../../../components/teams/TeamBits';
import { CardNote, GamesCard, RosterRow, SectionCard, ShowMore } from '../../../../components/teams/TeamCards';
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

type Dialog = 'edit' | 'players' | 'staff' | 'deactivate' | 'delete' | null;
type Section = 'players' | 'staff' | 'games';

/** Players shown before "Show all", while no search is on. */
const PLAYERS_SHOWN = 15;

/**
 * One team (docs/teams.md).
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
 */
export default function TeamPage() {
  const isDark = useActiveTheme() === 'dark';
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, teamId } = useLocalSearchParams<{ orgId: string; teamId: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isNarrow = width < 640;

  const user = useAuthStore(state => state.user);
  const viewerRole = useAuthStore(state => state.orgMemberships.find((m: any) => m.orgId === orgId && !m.restrictedReason)?.roleId);
  const canEdit = user?.globalRole === 'admin' || viewerRole === 'role-org-admin' || viewerRole === 'role-org-staff';

  const { teams, isLoading: isTeamsLoading } = useOrgTeams(orgId);
  const { roster } = useTeamRoster(teamId);
  const { games, eventNames } = useTeamGames(orgId, teamId);
  const { org } = useOrgSummary(orgId);
  const { members } = useOrgMembers(orgId);
  const { byPlayer: guardiansByPlayer } = useOrgGuardians(orgId);
  const { settings: minorsSettings } = useOrgMinorsSettings(orgId);
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

  // The phone's jump buttons: where each card starts, and which one is in view.
  const jump = useJumpSections<Section>(['players', 'staff', 'games'], isWide ? 24 : 12);

  const team = teams.find(t => t.id === teamId) || null;
  const back = () => safeBack(`/admin/${orgId}/teams`);
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
  const matchingGames = q
    ? games.filter(g => `${opponentOf(g, teamId!)} ${eventNames.get(g.eventId) || ''}`.toLowerCase().includes(q))
    : games;

  if (isTeamsLoading || !team) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Team" backLabel="Teams" onBack={back} />
        <View className="flex-1 items-center justify-center px-6">
          {isTeamsLoading ? <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} /> : (
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
  const openGame = (g: GameSummary) => router.push(`/admin/${orgId}/events/${g.eventId}/games/${g.id}/view`);
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

  const banner = (
    <View className="flex-row items-center gap-4 rounded-2xl border p-4 bg-card border-line">
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
      {canEdit ? <View className="self-start"><EditLink onPress={() => setDialog('edit')} /></View> : null}
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

  const gamesCard = (
    <GamesCard
      games={matchingGames}
      total={games.length}
      teamId={team.id}
      eventNames={eventNames}
      query={query}
      canEdit={canEdit}
      onOpenGame={openGame}
      onPickTeam={pickTeam}
    />
  );

  const searchBox = (
    <View className="flex-row items-center gap-2 bg-card border border-line rounded-xl px-3">
      <Ionicons name="search-outline" size={16} color={themeColor(isDark, 'ink-muted')} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search players, staff and games"
        placeholderTextColor={themeColor(isDark, 'ink-muted')}
        accessibilityLabel="Search players, staff and games"
        className={`flex-1 font-inter text-base text-ink outline-none ${isWide ? 'py-2.5' : 'py-2'}`}
      />
      {query ? (
        <TouchableOpacity onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear the search">
          <Ionicons name="close-circle" size={18} color={themeColor(isDark, 'ink-muted')} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  /* ---------------- phone: pinned search and jump buttons ---------------- */

  const pinned = (
    <View className="gap-2 px-3 py-2 bg-card border-b border-line">
      {searchBox}
      <JumpBar
        sections={[
          { key: 'players', label: 'Players', count: q ? matchingPlayers.length : players.length },
          { key: 'staff', label: 'Staff', count: q ? matchingStaff.length : staff.length },
          { key: 'games', label: 'Games', count: q ? matchingGames.length : games.length },
        ]}
        inView={jump.inView}
        onJump={jump.jumpTo}
      />
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="Team"
        backLabel="Teams"
        onBack={back}
        right={canEdit ? <OverflowMenu items={menu} accessibilityLabel="Team actions" title={team.name} /> : undefined}
      />
      {/* A team with nobody and no games has nothing to search or jump to. */}
      {isWide || !(players.length || staff.length || games.length) ? null : pinned}
      <ScrollView
        ref={jump.scrollRef}
        onScroll={isWide ? undefined : jump.onScroll}
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 60 }}
      >
        <View className="w-full self-center gap-4" style={{ maxWidth: 960 }}>
          {banner}
          {inactiveNote}
          {isWide ? (
            <>
              {players.length || staff.length || games.length ? searchBox : null}
              <View className="flex-row gap-4 items-start">
                <View className="gap-4" style={{ flex: 1.35 }}>{playersCard}</View>
                <View className="gap-4" style={{ flex: 1 }}>{staffCard}{gamesCard}</View>
              </View>
            </>
          ) : (
            <View className="gap-3" onLayout={jump.onColumnLayout}>
              <View onLayout={jump.track('players')}>{playersCard}</View>
              <View onLayout={jump.track('staff')}>{staffCard}</View>
              <View onLayout={jump.track('games')}>{gamesCard}</View>
            </View>
          )}
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
