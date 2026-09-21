import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, Modal, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../../store/settingsStore';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { wsService } from '../../../../services/websocket';
import { requestKeyFor, sendAction } from '../../../../services/actions';
import { useRequestScope } from '../../../../hooks/useRequestScope';
import { useWsStore } from '../../../../store/wsStore';
import { SocketAction, Team, Sport, Organization, TeamMember, GameSummary, participantLabel, reseedDecision, isScoreNotProvided } from '@sk/shared';
import { PersonnelAutocomplete } from '../../../../components/PersonnelAutocomplete';
import { useUnsavedChanges } from '../../../../hooks/useUnsavedChanges';
import { useUnsavedChangesStore } from '../../../../store/unsavedChangesStore';
import { ImageEditor, ImageConfig } from '../../../../components/ImageEditor';
import { getAvatarUrl } from '../../../../services/api';
import { COLORS, getThemeColor } from '../../../../constants/Colors';
import { PaginatedList } from '../../../../components/PaginatedList';
import { AgeGroupPicker } from '../../../../components/AgeGroupPicker';

const parseImageConfig = (config: any): ImageConfig => {
  if (!config) return { scale: 1, x: 0, y: 0 };
  if (typeof config === 'string') {
    try {
      return JSON.parse(config);
    } catch (e) {
      return { scale: 1, x: 0, y: 0 };
    }
  }
  return {
    scale: config.scale ?? 1,
    x: config.x ?? 0,
    y: config.y ?? 0
  };
};

interface TeamRole {
  id: string;
  name: string;
}

/** The team details form — the fields its Save bar covers. */
interface TeamDetailsForm {
  name: string;
  shortName: string;
  sportId: string;
  ageGroupId: string | null;
  isActive: boolean;
}

const sameTeamDetails = (a: TeamDetailsForm, b: TeamDetailsForm) =>
  a.name.trim() === b.name.trim() &&
  a.shortName.trim() === b.shortName.trim() &&
  a.sportId === b.sportId &&
  a.ageGroupId === b.ageGroupId &&
  a.isActive === b.isActive;

export default function TeamDetailsScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, teamId } = useLocalSearchParams<{ orgId: string; teamId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'details' | 'players' | 'staff' | 'events' | 'stats'>('details');

  // Loading States
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // Data States
  const [team, setTeam] = useState<Team | null>(null);
  const [teams, setTeams] = useState<Team[]>([]); // for opponent names
  const [sports, setSports] = useState<Sport[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [roster, setRoster] = useState<TeamMember[]>([]);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [availableRoles, setAvailableRoles] = useState<TeamRole[]>([]);

  // Form Details State
  const [detailsForm, setDetailsForm] = useState<TeamDetailsForm>({
    name: '',
    shortName: '',
    sportId: '',
    ageGroupId: null,
    isActive: true
  });
  const [originalDetails, setOriginalDetails] = useState<TeamDetailsForm | null>(null);

  /*
    Read by the room subscription below, which is registered once and so closes over the state as
    it was on that render. Refs are what let it ask "is anything typed *now*" rather than
    "was anything typed when I was set up" — the difference between protecting an edit and
    protecting the absence of one.
  */
  const detailsFormRef = React.useRef(detailsForm);
  const originalDetailsRef = React.useRef(originalDetails);
  detailsFormRef.current = detailsForm;
  originalDetailsRef.current = originalDetails;

  // Add/Edit Player Modal State
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);
  const [playerSearchVal, setPlayerSearchVal] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const [editingPlayer, setEditingPlayer] = useState<any>(null); // profile id
  const [isCreatingNewPlayer, setIsCreatingNewPlayer] = useState(false);

  // Add/Edit Staff Modal State
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [staffSearchVal, setStaffSearchVal] = useState('');
  const [selectedStaffPerson, setSelectedStaffPerson] = useState<any>(null);
  const [staffRoleVal, setStaffRoleVal] = useState('role-coach');
  const [editingStaff, setEditingStaff] = useState<any>(null); // membership id
  const [isCreatingNewStaff, setIsCreatingNewStaff] = useState(false);

  // Delete team confirmation state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Deactivate team with games warning state
  const [deactivateWarningOpen, setDeactivateWarningOpen] = useState(false);

  // Roster remove member state
  const [rosterMemberToRemove, setRosterMemberToRemove] = useState<{ membershipId: string; name: string; isPlayer: boolean } | null>(null);
  const [rosterRemoveError, setRosterRemoveError] = useState<string | null>(null);

  // Detailed profile creation state (shared by player & staff modal)
  const [memberEmail, setMemberEmail] = useState('');
  const [memberCellphone, setMemberCellphone] = useState('');
  const [memberBirthdate, setMemberBirthdate] = useState('');
  const [memberOrgId, setMemberOrgId] = useState('');
  const [memberImage, setMemberImage] = useState('');
  const [memberImageConfig, setMemberImageConfig] = useState<ImageConfig>({ scale: 1, x: 0, y: 0 });
  const [cooldownHours, setCooldownHours] = useState(168);
  const [imageEditorTarget, setImageEditorTarget] = useState<'player' | 'staff' | null>(null);

  // One scope per roster addition, kept across retries (SYNC-3) — see handleAddRosterMember.
  const addRequestScope = useRequestScope();

  const resetMemberForm = () => {
    addRequestScope.renew();
    setMemberEmail('');
    setMemberCellphone('');
    setMemberBirthdate('');
    setMemberOrgId('');
    setMemberImage('');
    setMemberImageConfig({ scale: 1, x: 0, y: 0 });
    setIsCreatingNewPlayer(false);
    setIsCreatingNewStaff(false);
  };

  // Load Data and Set Subscriptions
  useEffect(() => {
    if (!isConnected || !orgId || !teamId) return;

    let active = true;
    setIsLoading(true);

    const loadWorkspaceData = () => {
      // Get org
      wsService.emit('get_data', { type: 'organization', id: orgId }, (res: any) => {
        if (!active) return;
        if (res) setOrg(res);
      });

      // Get system settings for invite cooldown
      wsService.emit('get_data', { type: 'system_settings' }, (res: any) => {
        if (!active) return;
        if (res && res.org_admin_invite_cooldown_hours) {
          setCooldownHours(parseInt(res.org_admin_invite_cooldown_hours));
        }
      });

      // Get sports
      wsService.emit('get_data', { type: 'sports' }, (res: any) => {
        if (!active) return;
        if (Array.isArray(res)) setSports(res);
      });

      // Get teams (needed for dropdown + opponent names)
      wsService.emit('get_data', { type: 'teams', orgId }, (res: any) => {
        if (!active) return;
        if (Array.isArray(res)) {
          setTeams(res);
          const t = res.find(item => item.id === teamId);
          if (t) {
            setTeam(t);
            setDetailsForm({
              name: t.name,
              shortName: t.shortName || '',
              sportId: t.sportId,
              ageGroupId: t.ageGroupId || null,
              isActive: t.isActive !== false
            });
            setOriginalDetails({
              name: t.name,
              shortName: t.shortName || '',
              sportId: t.sportId,
              ageGroupId: t.ageGroupId || null,
              isActive: t.isActive !== false
            });
          }
        }
      });

      // Get roster members
      wsService.emit('get_data', { type: 'team_members', teamId }, (res: any) => {
        if (!active) return;
        if (Array.isArray(res)) setRoster(res);
      });

      // Games are not fetched: joining the fixtures room pushes them.
      setIsLoading(false);

      // Get roles
      wsService.emit('get_data', { type: 'roles' }, (res: any) => {
        if (!active) return;
        if (res && Array.isArray(res.team)) {
          setAvailableRoles(res.team);
        }
      });
    };

    loadWorkspaceData();

    // Rooms Subscriptions — one per dataset (rule 4).
    const teamRoom = `team:${teamId}`;
    const rosterRoom = `team:${teamId}:members`;
    const teamsRoom = `org:${orgId}:teams`;
    // Game summaries are `org:{id}:fixtures`; `org:{id}:events` is the `Event` records only.
    const fixturesRoom = `org:${orgId}:fixtures`;

    const handleUpdate = (event: any) => {
      if (!active) return;
      if (!event) return;

      // The roster arrives whole, on join and on every change, so this is a merge rather than a
      // nudge to re-read it (live-data rule 1). The server used to publish `TEAM_MEMBER_UPDATED`
      // carrying a bare `TeamMembership`, which could not be merged into a list of `TeamMember`
      // rows — hence the `get_data team_members` that used to sit here.
      if (event.topic === rosterRoom && event.type === 'TEAM_MEMBERS_SYNC' && Array.isArray(event.data)) {
        setRoster(event.data);
      }

      if (event.type === 'TEAM_UPDATED' && event.data?.id === teamId) {
        const updated = event.data;
        setTeam(updated);
        /*
          `UI-19`. This used to re-seed the form and its baseline on every `TEAM_UPDATED`, so a
          colleague renaming the team discarded a half-typed name here without a word. It never
          flashed the Save bar — the two moved together — which is what kept it hidden.
        */
        const incoming: TeamDetailsForm = {
          name: updated.name,
          shortName: updated.shortName || '',
          sportId: updated.sportId,
          ageGroupId: updated.ageGroupId || null,
          isActive: updated.isActive !== false,
        };
        if (
          reseedDecision({
            baseline: originalDetailsRef.current,
            drafts: detailsFormRef.current,
            incoming,
            same: sameTeamDetails,
          }) === 'adopt'
        ) {
          setDetailsForm(incoming);
          setOriginalDetails(incoming);
        }
      }

      // Fixture updates carry their own data, so merge rather than re-reading
      // the org's whole game list on every change.
      if (event.topic === fixturesRoom) {
        if (event.type === 'GAME_SUMMARIES_SYNC') {
          setGames(Array.isArray(event.data) ? event.data : []);
        } else if (event.type === 'GAME_SUMMARY_UPDATED' && event.data?.id) {
          setGames(prev => {
            const idx = prev.findIndex((g: any) => g.id === event.data.id);
            if (idx === -1) return [...prev, event.data];
            const next = prev.slice();
            next[idx] = event.data;
            return next;
          });
        } else if (event.type === 'GAME_SUMMARY_REMOVED' && event.data?.id) {
          setGames(prev => prev.filter((g: any) => g.id !== event.data.id));
        }
      }
    };

    // Listen first, then hold each room with the reducer as its replay handler (`LIVE-9`).
    wsService.on('update', handleUpdate);
    const unsubscribeTeam = wsService.subscribeToRoom(teamRoom, handleUpdate);
    const unsubscribeRoster = wsService.subscribeToRoom(rosterRoom, handleUpdate);
    const unsubscribeTeams = wsService.subscribeToRoom(teamsRoom, handleUpdate);
    const unsubscribeGames = wsService.subscribeToRoom(fixturesRoom, handleUpdate);

    return () => {
      active = false;
      unsubscribeTeam();
      unsubscribeRoster();
      unsubscribeTeams();
      unsubscribeGames();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId, teamId]);

  // Derived state values
  const hasDetailsChanges = useMemo(() => {
    return originalDetails ? (
      detailsForm.name.trim() !== originalDetails.name ||
      detailsForm.shortName.trim() !== originalDetails.shortName ||
      detailsForm.sportId !== originalDetails.sportId ||
      detailsForm.ageGroupId !== originalDetails.ageGroupId ||
      detailsForm.isActive !== originalDetails.isActive
    ) : false;
  }, [detailsForm, originalDetails]);

  const safeGoBack = useCallback(() => {
    safeBack(`/admin/${orgId}/teams`);
  }, [safeBack, orgId]);

  const handleDiscardDetails = useCallback(() => {
    if (!originalDetails) return;
    setDetailsForm({
      name: originalDetails.name,
      shortName: originalDetails.shortName,
      sportId: originalDetails.sportId,
      ageGroupId: originalDetails.ageGroupId,
      isActive: originalDetails.isActive,
    });
  }, [originalDetails]);

  useUnsavedChanges(hasDetailsChanges && !isProcessing, handleDiscardDetails);

  if (isLoading || !team) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FF3E00" />
          <Text className="font-orbitron text-xs text-slate-500 dark:text-slate-400 mt-3">Loading team workspace...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const teamGames = games.filter(g => g.participants?.some(p => p.teamId === teamId));

  /**
   * This team's score and its opponent's, from the summary's participant-keyed
   * `scores`. The screen previously read `liveState.home` / `finalScoreData.home`,
   * neither of which anything ever writes - so every game rendered 0-0 and every
   * finished game counted as a draw.
   */
  const scoresFor = (game: GameSummary): { mine: number; theirs: number } => {
    const mineP = game.participants?.find(p => p.teamId === teamId);
    const theirsP = game.participants?.find(p => p.teamId !== teamId);
    return {
      mine: mineP ? (game.scores?.[mineP.id] ?? 0) : 0,
      theirs: theirsP ? (game.scores?.[theirsP.id] ?? 0) : 0,
    };
  };
  const hasGames = teamGames.length > 0;

  const players = roster.filter(m => m.roleId === 'role-player');
  const staff = roster.filter(m => m.roleId !== 'role-player');

  const getSportName = (sportId: string) => {
    return sports.find(s => s.id === sportId)?.name || 'Unknown Sport';
  };

  const getOpponentName = (game: GameSummary) => {
    const opp = game.participants?.find(p => p.teamId !== teamId);
    if (!opp) return 'TBD';
    // The summary already names the team and its org, so a visiting side reads
    // correctly without this org's team list having to contain it.
    return participantLabel(opp) || teams.find(t => t.id === opp.teamId)?.name || 'Opponent';
  };

  // ---------------- DETAILS TAB ACTIONS ----------------
  const handleSaveDetails = () => {
    if (!detailsForm.name.trim()) {
      Alert.alert('Validation Error', 'Team Name is required');
      return;
    }
    if (!detailsForm.ageGroupId) {
      Alert.alert('Validation Error', 'Please choose an age group');
      return;
    }

    setIsProcessing(true);
    sendAction(SocketAction.UPDATE_TEAM, {
      id: teamId,
      data: {
        name: detailsForm.name.trim(),
        // null clears the column; undefined would be dropped from the JSON and leave it as it was.
        shortName: detailsForm.shortName.trim() || null,
        sportId: detailsForm.sportId,
        ageGroupId: detailsForm.ageGroupId,
        isActive: detailsForm.isActive
      }
    }).then(result => {
      setIsProcessing(false);
      if (result.ok) {
        setOriginalDetails({
          name: detailsForm.name.trim(),
          shortName: detailsForm.shortName.trim(),
          sportId: detailsForm.sportId,
          ageGroupId: detailsForm.ageGroupId,
          isActive: detailsForm.isActive
        });
        useUnsavedChangesStore.getState().clear();
      } else {
        Alert.alert('Save Failed', result.message || 'Could not update details');
      }
    });
  };

  const handleDeactivateToggle = (nextValue: boolean) => {
    if (!nextValue && hasGames) {
      // Trigger user warning dialog when deactivating with games
      setDeactivateWarningOpen(true);
    } else {
      setDetailsForm(prev => ({ ...prev, isActive: nextValue }));
    }
  };

  const handleDeleteTeam = () => {
    setIsProcessing(true);
    setDeleteError(null);
    // Shown inline in the confirmation modal, so no toast.
    sendAction(SocketAction.DELETE_TEAM, { id: teamId }, { suppressToast: true }).then(result => {
      setIsProcessing(false);
      if (result.ok) {
        setIsDeleteModalOpen(false);
        router.replace(`/admin/${orgId}/teams`);
      } else {
        setDeleteError(result.message || 'Could not delete team');
      }
    });
  };

  // ---------------- ROSTER / ROLES FLOW HELPERS ----------------
  const handleSendInvite = (member: any) => {
    if (!member.email) return;

    sendAction(SocketAction.SEND_MEMBER_INVITE, { memberId: member.id }).then(result => {
      if (!result.ok) {
        Alert.alert('Invite Error', result.message);
      } else {
        Alert.alert('Success', `Invitation sent to ${member.name}`);
        wsService.emit('get_data', { type: 'team_members', teamId }, (resData: any) => {
          if (Array.isArray(resData)) setRoster(resData);
        });
      }
    });
  };

  const getInviteButtonStatus = (member: any) => {
    if (member.userId) return null; // already linked
    if (!member.email) return null;

    if (member.lastInviteSentAt) {
      const lastSent = new Date(member.lastInviteSentAt);
      const diffMs = Date.now() - lastSent.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours < cooldownHours) {
        const remainingHours = Math.ceil(cooldownHours - diffHours);
        const remainingDays = Math.ceil(remainingHours / 24);
        const text = remainingDays > 1 ? `Invited (${remainingDays}d)` : `Invited (${remainingHours}h)`;
        return { disabled: true, text };
      }
    }

    return { disabled: false, text: 'Invite' };
  };

  const handleAddRosterMember = async (name: string, roleId: string, searchPerson: any, closeFn: () => void) => {
    if (!name.trim()) return;
    setIsProcessing(true);

    try {
      let profileId = searchPerson?.id;

      if (!profileId) {
        // 1. Search matching user to prevent duplication
        const matchingUser: any = await new Promise((resolve) => {
          wsService.emit('get_data', {
            type: 'find_matching_user',
            email: memberEmail || undefined,
            name: name.trim(),
            birthdate: memberBirthdate || undefined
          }, (res: any) => resolve(res));
        });

        // 2. Add organization profile. Its id comes from this addition's request scope, not the
        //    clock, so a retry after step 3 fails sends the same profile and the server returns the
        //    one it already created rather than a duplicate (SYNC-3).
        const profilePayload = {
          id: matchingUser?.id || `profile-${addRequestScope.current()}`,
          name: name.trim(),
          email: memberEmail || undefined,
          cellphone: memberCellphone || undefined,
          birthdate: memberBirthdate || undefined,
          identifier: memberOrgId || undefined,
          image: memberImage || undefined,
          imageConfig: memberImageConfig,
          orgId
        };
        const profileResult = await sendAction(SocketAction.ADD_ORG_PROFILE, profilePayload, {
          requestId: requestKeyFor(addRequestScope.current(), SocketAction.ADD_ORG_PROFILE, profilePayload),
        });
        if (!profileResult.ok) throw new Error(`Failed to create profile: ${profileResult.message}`);
        profileId = profileResult.data.id;
      }

      // 3. Link team membership (server handles organization role-org-member automatically on background)
      if (profileId) {
        const memberPayload = { orgProfileId: profileId, teamId, roleId };
        const memberResult = await sendAction(SocketAction.ADD_TEAM_MEMBER, memberPayload, {
          requestId: requestKeyFor(addRequestScope.current(), SocketAction.ADD_TEAM_MEMBER, memberPayload),
        });
        if (!memberResult.ok) throw new Error(`Failed to add team member: ${memberResult.message}`);
      }

      closeFn();
      resetMemberForm();
      // Re-fetch local data just in case
      wsService.emit('get_data', { type: 'team_members', teamId }, (res: any) => {
        if (Array.isArray(res)) setRoster(res);
      });
    } catch (e: any) {
      Alert.alert('Roster Action Failed', e.message || 'An error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveRosterMember = (membershipId: string, name: string, isPlayer: boolean) => {
    setRosterMemberToRemove({ membershipId, name, isPlayer });
    setRosterRemoveError(null);
  };

  const confirmRemoveRosterMember = () => {
    if (!rosterMemberToRemove) return;
    setIsProcessing(true);
    setRosterRemoveError(null);
    // Shown inline in the confirmation modal, so no toast.
    sendAction(
      SocketAction.REMOVE_TEAM_MEMBER,
      { id: rosterMemberToRemove.membershipId },
      { suppressToast: true }
    ).then(result => {
      setIsProcessing(false);
      if (!result.ok) {
        setRosterRemoveError(result.message || 'Could not remove member');
      } else {
        setRosterMemberToRemove(null);
        // Refresh list
        wsService.emit('get_data', { type: 'team_members', teamId }, (resData: any) => {
          if (Array.isArray(resData)) setRoster(resData);
        });
      }
    });
  };

  const handleEditRosterName = async (profileId: string, newName: string, membershipId?: string, newRole?: string) => {
    if (!newName.trim()) return;
    setIsProcessing(true);

    try {
      // 1. Save updated profile name
      const nameResult = await sendAction(SocketAction.UPDATE_ORG_PROFILE, {
        id: profileId,
        data: { name: newName.trim() }
      });
      if (!nameResult.ok) throw new Error(`Failed to update profile name: ${nameResult.message}`);

      // 2. Save updated role if provided (staff view)
      if (membershipId && newRole) {
        const roleResult = await sendAction(SocketAction.UPDATE_TEAM_MEMBER, {
          id: membershipId,
          data: { roleId: newRole }
        });
        if (!roleResult.ok) throw new Error(`Failed to update team role: ${roleResult.message}`);
      }

      // Refresh data
      wsService.emit('get_data', { type: 'team_members', teamId }, (res: any) => {
        if (Array.isArray(res)) setRoster(res);
      });
    } catch (e: any) {
      Alert.alert('Edit Failed', e.message || 'An error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  // ---------------- STATS CALCULATOR ----------------
  const calculateStats = () => {
    // A match whose score was recorded as not provided is left out, as the standings leave it out:
    // counting it would make it a 0–0 draw nobody reported.
    const finished = teamGames.filter(g => g.status === 'Finished' && !isScoreNotProvided(g));
    let won = 0, lost = 0, drawn = 0, goalsFor = 0, goalsAgainst = 0;

    finished.forEach(g => {
      const { mine: myScore, theirs: oppScore } = scoresFor(g);

      goalsFor += myScore;
      goalsAgainst += oppScore;

      if (myScore > oppScore) won += 1;
      else if (myScore < oppScore) lost += 1;
      else drawn += 1;
    });

    return {
      played: finished.length,
      won,
      lost,
      drawn,
      goalsFor,
      goalsAgainst
    };
  };

  const stats = calculateStats();

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={safeGoBack}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Teams
          </Text>
        </TouchableOpacity>
        <View className="items-center">
          <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase truncate max-w-[180px]">
            {team.name}
          </Text>
          <Text className="font-inter-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            {team.ageGroup} • {getSportName(team.sportId)}
          </Text>
        </View>
        <View className="w-10" />
      </View>

      {/* HORIZONTAL TAB BAR */}
      <View className="border-b border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }} className="flex-row py-1">
          {(['details', 'players', 'staff', 'events', 'stats'] as const).map(tab => {
            const isSelected = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                className="px-4 py-3 mr-2 border-b-2"
                style={{
                  borderBottomColor: isSelected ? COLORS.brand.orange : 'transparent',
                }}
              >
                <Text
                  className="font-orbitron-bold text-[10px] uppercase tracking-widest"
                  style={{
                    color: isSelected ? COLORS.brand.orange : getThemeColor(isDark, 'textSecondary'),
                  }}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* SUB-VIEW RENDERING CONTAINER */}
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: (activeTab === 'details' && hasDetailsChanges) ? 140 : 60 }} keyboardShouldPersistTaps="handled">
        {isProcessing && (
          <View className="flex-row items-center justify-center bg-brand-orange/10 border border-brand-orange/30 rounded-xl p-3 mb-4">
            <ActivityIndicator size="small" color="#FF3E00" className="mr-2" />
            <Text className="font-inter text-xs text-brand-orange">Processing server changes...</Text>
          </View>
        )}

        {/* 1. DETAILS VIEW */}
        {activeTab === 'details' && (
          <View>
            <GlassCard className="border border-slate-200 dark:border-white/5 p-6 mb-6">
              <Text className="font-orbitron-bold text-[10px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-4">Edit Team Information</Text>

              {/* NAME */}
              <View className="mb-4">
                <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Team Name</Text>
                <TextInput
                  value={detailsForm.name}
                  onChangeText={val => setDetailsForm(prev => ({ ...prev, name: val }))}
                  className="font-inter text-sm text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5"
                />
              </View>

              {/* SHORT NAME */}
              <View className="mb-4">
                <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Short Name / Abbreviation</Text>
                <TextInput
                  value={detailsForm.shortName}
                  onChangeText={val => setDetailsForm(prev => ({ ...prev, shortName: val }))}
                  placeholder="e.g. 1ST, U19A"
                  placeholderTextColor="#94A3B8"
                  className="font-inter text-sm text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5"
                />
              </View>

              {/* SPORT */}
              <View className="mb-6">
                <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Sport</Text>
                <View className="flex-row flex-wrap gap-2">
                  {sports.filter(s => org?.supportedSportIds?.includes(s.id)).map(s => {
                    const isSelected = detailsForm.sportId === s.id;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => setDetailsForm(prev => (
                          // An age group belongs to one sport, so choosing another clears it.
                          prev.sportId === s.id ? prev : { ...prev, sportId: s.id, ageGroupId: null }
                        ))}
                        className={`px-3 py-2 rounded-lg border ${
                          isSelected ? 'bg-brand-orange border-brand-orange' : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/5'
                        }`}
                      >
                        <Text className={`font-inter-bold text-[11px] ${isSelected ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                          {s.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* AGE GROUP — after the sport, whose list it chooses from */}
              <View className="mb-6">
                <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Age Group</Text>
                <AgeGroupPicker
                  sportId={detailsForm.sportId}
                  ageGroups={sports.find(s => s.id === detailsForm.sportId)?.ageGroups}
                  value={detailsForm.ageGroupId}
                  onChange={ageGroupId => setDetailsForm(prev => ({ ...prev, ageGroupId }))}
                  orgId={orgId}
                />
              </View>

              {/* STATUS TOGGLE */}
              <View className="flex-row items-center justify-between border-t border-slate-200/50 dark:border-white/5 pt-4 mb-6">
                <View>
                  <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Active Status</Text>
                  <Text className="font-inter text-xs text-slate-400 dark:text-slate-500">Deactivated teams are hidden from schedules</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDeactivateToggle(!detailsForm.isActive)}
                  className={`w-12 h-6 rounded-full px-1 justify-center ${
                    detailsForm.isActive ? 'bg-brand-orange items-end' : 'bg-slate-300 dark:bg-slate-800 items-start'
                  }`}
                >
                  <View className="w-4.5 h-4.5 rounded-full bg-white shadow-sm" />
                </TouchableOpacity>
              </View>


            </GlassCard>

            {/* DELETE SECTION */}
            {!hasGames && (
              <GlassCard className="border border-red-500/20 dark:border-red-500/10 bg-red-500/5 dark:bg-red-500/5 p-6 mb-6">
                <Text className="font-orbitron-bold text-[10px] text-red-500 uppercase tracking-widest mb-1.5">Danger zone</Text>
                <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Permanently delete this team. Since this team has no matches recorded, it can be deleted safely.
                </Text>
                <Button
                  title="Delete Team"
                  onPress={() => { setIsDeleteModalOpen(true); setDeleteError(null); }}
                  className="bg-red-500 border-red-500 py-3 rounded-xl"
                />
              </GlassCard>
            )}

            {hasGames && (
              <Text className="font-inter text-[11px] text-center text-slate-400 dark:text-slate-500 mt-2 px-6">
                * Note: Teams cannot be deleted once they are assigned to game events. However, they can be deactivated above.
              </Text>
            )}
          </View>
        )}

        {/* 2. PLAYERS VIEW */}
        {activeTab === 'players' && (
          <View>
            <View className="flex-row justify-between items-center mb-4">
              <Text className="font-orbitron-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Athletes ({players.length})
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setEditingPlayer(null);
                  setPlayerSearchVal('');
                  setSelectedPerson(null);
                  setIsPlayerModalOpen(true);
                }}
                className="flex-row items-center gap-1 bg-brand-orange/10 border border-brand-orange/20 px-3 py-1.5 rounded-lg active:opacity-85"
              >
                <Ionicons name="person-add" size={14} color="#FF3E00" />
                <Text className="font-inter-bold text-[11px] text-brand-orange uppercase">Add Player</Text>
              </TouchableOpacity>
            </View>

            <PaginatedList
              data={players}
              pageSize={50}
              maxColumns={2}
              keyExtractor={(item) => item.membershipId}
              emptyState={
                <View className="items-center justify-center py-12 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
                  <Ionicons name="people-outline" size={40} color="#94A3B8" className="opacity-40 mb-2" />
                  <Text className="font-orbitron-bold text-xs text-slate-600 dark:text-slate-400">Roster is Empty</Text>
                  <Text className="font-inter text-[11px] text-slate-400 dark:text-slate-500 text-center mt-0.5">
                    Click "Add Player" to add athletes to the team.
                  </Text>
                </View>
              }
              renderItem={(item) => {
                const inviteStatus = getInviteButtonStatus(item);
                const avatarSource = item.image ? { uri: getAvatarUrl(item.image, 'thumb') } : null;
                const logoConf = parseImageConfig(item.imageConfig);
                const contactInfo = [item.email, item.cellphone].filter(Boolean).join('  |  ');

                return (
                  <GlassCard key={item.membershipId} className="border border-slate-200 dark:border-white/5 py-1.5 px-3 flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2.5 flex-1 mr-3 overflow-hidden">
                      <View className="w-7 h-7 rounded-full bg-brand-orange/10 overflow-hidden items-center justify-center flex-shrink-0">
                        {avatarSource ? (
                          <View style={{ width: 28, height: 28, overflow: 'hidden' }}>
                            <View
                              style={{
                                width: '100%',
                                height: '100%',
                                transform: [
                                  { scale: logoConf.scale },
                                  { translateX: logoConf.x * 28 },
                                  { translateY: logoConf.y * 28 },
                                ],
                              }}
                            >
                              <Image
                                source={avatarSource}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="cover"
                              />
                            </View>
                          </View>
                        ) : (
                          <Text className="font-orbitron-bold text-[11px] text-brand-orange">
                            {item.name.charAt(0).toUpperCase()}
                          </Text>
                        )}
                      </View>

                      <View className="flex-1 flex-row items-center gap-2 flex-wrap min-w-0">
                        <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white" numberOfLines={1}>
                          {item.name}
                        </Text>
                        <View className="px-1.5 py-0.5 rounded-full border border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-800">
                          <Text className="font-inter-bold text-[7px] uppercase tracking-wider text-slate-600 dark:text-slate-400">
                            Athlete
                          </Text>
                        </View>
                        {contactInfo ? (
                          <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500" numberOfLines={1}>
                            · {contactInfo}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <View className="flex-row items-center gap-1.5 flex-shrink-0">
                      {inviteStatus && (
                        <TouchableOpacity
                          disabled={inviteStatus.disabled}
                          onPress={() => handleSendInvite(item)}
                          className={`px-2 py-1 rounded-lg active:scale-95 ${
                            inviteStatus.disabled
                              ? 'bg-slate-200 dark:bg-slate-800 opacity-60'
                              : 'bg-brand-orange'
                          }`}
                        >
                          <Text className={`font-orbitron-bold text-[7px] uppercase tracking-widest ${
                            inviteStatus.disabled ? 'text-slate-500 dark:text-slate-400' : 'text-white'
                          }`}>
                            {inviteStatus.text}
                          </Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => {
                          setEditingPlayer({ id: item.id, name: item.name });
                          setPlayerSearchVal(item.name);
                          setIsPlayerModalOpen(true);
                        }}
                        className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/5 items-center justify-center border border-slate-200 dark:border-white/5 active:opacity-85"
                      >
                        <Ionicons name="pencil" size={13} color={isDark ? '#94A3B8' : '#475569'} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleRemoveRosterMember(item.membershipId, item.name, true)}
                        className="w-7 h-7 rounded-lg bg-red-500/10 items-center justify-center border border-red-500/20 active:opacity-85"
                      >
                        <Ionicons name="trash" size={13} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </GlassCard>
                );
              }}
            />
          </View>
        )}

        {/* 3. STAFF VIEW */}
        {activeTab === 'staff' && (
          <View>
            <View className="flex-row justify-between items-center mb-4">
              <Text className="font-orbitron-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Staff Members ({staff.length})
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setEditingStaff(null);
                  setStaffSearchVal('');
                  setSelectedStaffPerson(null);
                  setStaffRoleVal('role-coach');
                  setIsStaffModalOpen(true);
                }}
                className="flex-row items-center gap-1 bg-brand-orange/10 border border-brand-orange/20 px-3 py-1.5 rounded-lg active:opacity-85"
              >
                <Ionicons name="person-add" size={14} color="#FF3E00" />
                <Text className="font-inter-bold text-[11px] text-brand-orange uppercase">Add Staff</Text>
              </TouchableOpacity>
            </View>

            <PaginatedList
              data={staff}
              pageSize={50}
              maxColumns={2}
              keyExtractor={(item) => item.membershipId}
              emptyState={
                <View className="items-center justify-center py-12 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
                  <Ionicons name="briefcase-outline" size={40} color="#94A3B8" className="opacity-40 mb-2" />
                  <Text className="font-orbitron-bold text-xs text-slate-600 dark:text-slate-400">No Staff Assigned</Text>
                  <Text className="font-inter text-[11px] text-slate-400 dark:text-slate-500 text-center mt-0.5">
                    Click "Add Staff" to configure managers or coaches.
                  </Text>
                </View>
              }
              renderItem={(item) => {
                const inviteStatus = getInviteButtonStatus(item);
                const avatarSource = item.image ? { uri: getAvatarUrl(item.image, 'thumb') } : null;
                const logoConf = parseImageConfig(item.imageConfig);
                const roleName = availableRoles.find(r => r.id === item.roleId)?.name || 'Staff';
                const contactInfo = [item.email, item.cellphone].filter(Boolean).join('  |  ');

                return (
                  <GlassCard key={item.membershipId} className="border border-slate-200 dark:border-white/5 py-1.5 px-3 flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2.5 flex-1 mr-3 overflow-hidden">
                      <View className="w-7 h-7 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden items-center justify-center flex-shrink-0">
                        {avatarSource ? (
                          <View style={{ width: 28, height: 28, overflow: 'hidden' }}>
                            <View
                              style={{
                                width: '100%',
                                height: '100%',
                                transform: [
                                  { scale: logoConf.scale },
                                  { translateX: logoConf.x * 28 },
                                  { translateY: logoConf.y * 28 },
                                ],
                              }}
                            >
                              <Image
                                source={avatarSource}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="cover"
                              />
                            </View>
                          </View>
                        ) : (
                          <Text className="font-orbitron-bold text-[11px] text-slate-500 dark:text-slate-400">
                            {item.name.charAt(0).toUpperCase()}
                          </Text>
                        )}
                      </View>

                      <View className="flex-1 flex-row items-center gap-2 flex-wrap min-w-0">
                        <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white" numberOfLines={1}>
                          {item.name}
                        </Text>
                        <View className="px-1.5 py-0.5 rounded-full border border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-800">
                          <Text className="font-inter-bold text-[7px] uppercase tracking-wider text-slate-600 dark:text-slate-400">
                            {roleName}
                          </Text>
                        </View>
                        {contactInfo ? (
                          <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500" numberOfLines={1}>
                            · {contactInfo}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <View className="flex-row items-center gap-1.5 flex-shrink-0">
                      {inviteStatus && (
                        <TouchableOpacity
                          disabled={inviteStatus.disabled}
                          onPress={() => handleSendInvite(item)}
                          className={`px-2 py-1 rounded-lg active:scale-95 ${
                            inviteStatus.disabled
                              ? 'bg-slate-200 dark:bg-slate-800 opacity-60'
                              : 'bg-brand-orange'
                          }`}
                        >
                          <Text className={`font-orbitron-bold text-[7px] uppercase tracking-widest ${
                            inviteStatus.disabled ? 'text-slate-500 dark:text-slate-400' : 'text-white'
                          }`}>
                            {inviteStatus.text}
                          </Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => {
                          setEditingStaff({ membershipId: item.membershipId, id: item.id, name: item.name, roleId: item.roleId });
                          setStaffSearchVal(item.name);
                          setStaffRoleVal(item.roleId);
                          setIsStaffModalOpen(true);
                        }}
                        className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/5 items-center justify-center border border-slate-200 dark:border-white/5 active:opacity-85"
                      >
                        <Ionicons name="pencil" size={13} color={isDark ? '#94A3B8' : '#475569'} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleRemoveRosterMember(item.membershipId, item.name, false)}
                        className="w-7 h-7 rounded-lg bg-red-500/10 items-center justify-center border border-red-500/20 active:opacity-85"
                      >
                        <Ionicons name="trash" size={13} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </GlassCard>
                );
              }}
            />
          </View>
        )}

        {/* 4. EVENTS VIEW */}
        {activeTab === 'events' && (
          <View>
            <Text className="font-orbitron-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
              Allocated Games ({teamGames.length})
            </Text>

            <View className="space-y-4">
              {teamGames.map(game => {
                const isFinished = game.status === 'Finished';
                const { mine: myScore, theirs: oppScore } = scoresFor(game);
                const noScore = isScoreNotProvided(game);
                let gameOutcome = '-';
                if (isFinished && !noScore) {
                  if (myScore > oppScore) gameOutcome = 'W';
                  else if (myScore < oppScore) gameOutcome = 'L';
                  else gameOutcome = 'D';
                }
                const targetEventId = game.eventId;

                return (
                  <GlassCard key={game.id} className="border border-slate-200 dark:border-white/5 p-4">
                    <View className="flex-row justify-between items-center mb-2">
                      <Text className="font-inter text-xs text-slate-400 dark:text-slate-500">
                        {(game.scheduledStartTime || game.startTime) ? new Date(game.scheduledStartTime || game.startTime || '').toLocaleDateString() : 'Date TBD'}
                      </Text>
                      <View className={`px-2 py-0.5 rounded ${
                        game.status === 'Live' ? 'bg-red-500' : 'bg-slate-200 dark:bg-white/10'
                      }`}>
                        <Text className={`font-inter-bold text-[9px] uppercase tracking-wide ${
                          game.status === 'Live' ? 'text-white animate-pulse' : 'text-slate-600 dark:text-slate-400'
                        }`}>
                          {game.status}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row justify-between items-center">
                      <View className="flex-1 mr-3">
                        <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white">vs. {getOpponentName(game)}</Text>
                        <Text className="font-inter text-[11px] text-slate-400 dark:text-slate-500">
                          {(game as any).stageName || 'Standard Stage'}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-2">
                        {isFinished && !noScore && (
                          <View className={`w-6 h-6 rounded-full items-center justify-center ${
                            gameOutcome === 'W' ? 'bg-green-500/20' : gameOutcome === 'L' ? 'bg-red-500/20' : 'bg-yellow-500/20'
                          }`}>
                            <Text className={`font-inter-bold text-xs ${
                              gameOutcome === 'W' ? 'text-green-500' : gameOutcome === 'L' ? 'text-red-500' : 'text-yellow-600'
                            }`}>
                              {gameOutcome}
                            </Text>
                          </View>
                        )}
                        {noScore ? (
                          <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 mr-1">No score</Text>
                        ) : (
                          <Text className="font-mono-bold text-lg text-slate-800 dark:text-white mr-1">
                            {myScore} - {oppScore}
                          </Text>
                        )}
                        {targetEventId && (
                          <View className="flex-row items-center gap-1.5 ml-1">
                            <TouchableOpacity
                              activeOpacity={0.8}
                              onPress={() => router.push(`/admin/${orgId}/events/${targetEventId}/games/${game.id}/selection?teamId=${teamId}`)}
                              className="w-7 h-7 bg-brand-orange/10 border border-brand-orange/30 rounded-lg items-center justify-center"
                            >
                              <Ionicons name="people-outline" size={13} color={COLORS.brand.orange} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              activeOpacity={0.8}
                              onPress={() => router.push(`/admin/${orgId}/events/${targetEventId}/games/${game.id}/score`)}
                              className="w-7 h-7 bg-brand-orange/10 border border-brand-orange/30 rounded-lg items-center justify-center"
                            >
                              <Ionicons name="trophy-outline" size={13} color={COLORS.brand.orange} />
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </View>
                  </GlassCard>
                );
              })}

              {teamGames.length === 0 && (
                <View className="items-center justify-center py-12 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
                  <Ionicons name="calendar-outline" size={40} color="#94A3B8" className="opacity-40 mb-2" />
                  <Text className="font-orbitron-bold text-xs text-slate-600 dark:text-slate-400">No Scheduled Games</Text>
                  <Text className="font-inter text-[11px] text-slate-400 dark:text-slate-500 text-center mt-0.5">
                    This team is not allocated to any match events.
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* 5. STATS VIEW */}
        {activeTab === 'stats' && (
          <View>
            {/* GRID OF CARDS */}
            <View className="flex-row flex-wrap gap-3 mb-6">
              <GlassCard className="flex-[1_1_45%] border border-slate-200 dark:border-white/5 p-4">
                <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-1">Played</Text>
                <Text className="font-orbitron-bold text-2xl text-slate-800 dark:text-white">{stats.played}</Text>
              </GlassCard>
              <GlassCard className="flex-[1_1_45%] border border-slate-200 dark:border-white/5 p-4">
                <Text className="font-inter text-[10px] text-green-500 uppercase mb-1">Wins</Text>
                <Text className="font-orbitron-bold text-2xl text-green-500">{stats.won}</Text>
              </GlassCard>
              <GlassCard className="flex-[1_1_45%] border border-slate-200 dark:border-white/5 p-4">
                <Text className="font-inter text-[10px] text-red-500 uppercase mb-1">Losses</Text>
                <Text className="font-orbitron-bold text-2xl text-red-500">{stats.lost}</Text>
              </GlassCard>
              <GlassCard className="flex-[1_1_45%] border border-slate-200 dark:border-white/5 p-4">
                <Text className="font-inter text-[10px] text-amber-500 uppercase mb-1">Draws</Text>
                <Text className="font-orbitron-bold text-2xl text-amber-500">{stats.drawn}</Text>
              </GlassCard>
            </View>

            {/* SECONDARY STATS */}
            <GlassCard className="border border-slate-200 dark:border-white/5 p-4 mb-6 flex-row justify-around">
              <View className="items-center">
                <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-0.5">Points For</Text>
                <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white">{stats.goalsFor}</Text>
              </View>
              <View className="w-[1px] bg-slate-200 dark:bg-white/10" />
              <View className="items-center">
                <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-0.5">Points Against</Text>
                <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white">{stats.goalsAgainst}</Text>
              </View>
            </GlassCard>

            {/* RECENT MATCHES SUMMARY */}
            <Text className="font-orbitron-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Recent games</Text>
            <View className="space-y-2">
              {teamGames.filter(g => g.status === 'Finished' && !isScoreNotProvided(g)).slice(0, 5).map(game => {
                const { mine: myScore, theirs: oppScore } = scoresFor(game);
                const outcome = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'D';

                return (
                  <View key={game.id} className="flex-row justify-between items-center bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-white/5 rounded-xl px-4 py-3">
                    <View className="flex-row items-center gap-3">
                      <View className={`w-5 h-5 rounded-full items-center justify-center ${
                        outcome === 'W' ? 'bg-green-500' : outcome === 'L' ? 'bg-red-500' : 'bg-yellow-500'
                      }`}>
                        <Text className="font-inter-bold text-[10px] text-white">{outcome}</Text>
                      </View>
                      <Text className="font-inter text-sm text-slate-700 dark:text-slate-300">vs. {getOpponentName(game)}</Text>
                    </View>
                    <Text className="font-mono-bold text-slate-800 dark:text-white">{myScore} - {oppScore}</Text>
                  </View>
                );
              })}

              {teamGames.filter(g => g.status === 'Finished').length === 0 && (
                <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 text-center py-6">No finished matches to display stats.</Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ==================== ADD/EDIT PLAYER MODAL ==================== */}
      <Modal visible={isPlayerModalOpen} transparent animationType="slide">
        <View className="flex-1 bg-black/60 justify-end md:justify-center md:items-center md:p-4">
          <GlassCard
            className="w-full md:max-w-md border-t md:border border-slate-200 dark:border-white/5 rounded-t-3xl md:rounded-2xl p-6 bg-white dark:bg-slate-900 min-h-[400px] md:min-h-[460px]"
            style={{ overflow: 'visible' }}
          >
            <View className="flex-row justify-between items-center mb-6">
              <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white uppercase tracking-wider">
                {editingPlayer ? 'Edit Player' : 'Add Player to Roster'}
              </Text>
              <TouchableOpacity onPress={() => {
                setIsPlayerModalOpen(false);
                resetMemberForm();
              }}>
                <Ionicons name="close" size={24} color={isDark ? '#94A3B8' : '#475569'} />
              </TouchableOpacity>
            </View>

            <View className="space-y-4 mb-4" style={{ zIndex: 50 }}>
              <View style={{ zIndex: 10 }}>
                <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase mb-2">Player Name</Text>
                {editingPlayer ? (
                  <TextInput
                    value={playerSearchVal}
                    onChangeText={setPlayerSearchVal}
                    className="font-inter text-sm text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3"
                  />
                ) : (
                  <PersonnelAutocomplete
                    orgId={orgId}
                    value={playerSearchVal}
                    onChangeText={(text) => {
                      setPlayerSearchVal(text);
                      setIsCreatingNewPlayer(false);
                      setSelectedPerson(null);
                    }}
                    onSelectPerson={(person) => {
                      setSelectedPerson(person);
                      if (person) {
                        setMemberEmail(person.email || '');
                        setMemberCellphone(person.cellphone || '');
                        setMemberBirthdate(person.birthdate || '');
                        setMemberOrgId(person.identifier || '');
                        setMemberImage(person.image || '');
                        setMemberImageConfig(parseImageConfig(person.imageConfig));
                      } else {
                        resetMemberForm();
                      }
                    }}
                    onSelectNewPerson={() => setIsCreatingNewPlayer(true)}
                    placeholder="Search or enter new player name..."
                  />
                )}
              </View>
            </View>

            {/* Conditional extra fields for new player creation */}
            {!editingPlayer && isCreatingNewPlayer && (
              <ScrollView 
                showsVerticalScrollIndicator={false} 
                className="space-y-4 mb-4 max-h-[220px]"
                keyboardShouldPersistTaps="handled"
              >
                {/* Avatar Display & Edit button */}
                <View className="flex-row items-center gap-4 mb-2 pt-2">
                  <TouchableOpacity
                    onPress={() => setImageEditorTarget('player')}
                    className="w-14 h-14 rounded-full overflow-hidden items-center justify-center bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                  >
                    {memberImage ? (
                      <View style={{ width: 56, height: 56, overflow: 'hidden' }}>
                        <View
                          style={{
                            width: '100%',
                            height: '100%',
                            transform: [
                              { scale: memberImageConfig.scale },
                              { translateX: memberImageConfig.x * 56 },
                              { translateY: memberImageConfig.y * 56 },
                            ],
                          }}
                        >
                          <Image
                            source={{ uri: memberImage }}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="cover"
                          />
                        </View>
                      </View>
                    ) : (
                      <Ionicons name="camera-outline" size={18} color="#94A3B8" />
                    )}
                  </TouchableOpacity>
                  <View>
                    <Text className="font-orbitron-bold text-[8px] text-slate-600 dark:text-slate-400 uppercase tracking-widest">Avatar Photo</Text>
                    <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Tap circle to edit/upload image</Text>
                  </View>
                </View>

                {/* Email Address & Cell Number */}
                <View className="flex-row gap-3 mb-2">
                  <View className="flex-1">
                    <Text className="font-orbitron-bold text-[8px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">Email Address</Text>
                    <TextInput
                      placeholder="email@example.com"
                      placeholderTextColor="#94A3B8"
                      value={memberEmail}
                      onChangeText={setMemberEmail}
                      className="font-inter text-xs text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 outline-none"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="font-orbitron-bold text-[8px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">Cell Number</Text>
                    <TextInput
                      placeholder="+1 234..."
                      placeholderTextColor="#94A3B8"
                      value={memberCellphone}
                      onChangeText={setMemberCellphone}
                      className="font-inter text-xs text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 outline-none"
                    />
                  </View>
                </View>

                {/* Org ID & Birthdate */}
                <View className="flex-row gap-3 mb-2">
                  <View className="flex-1">
                    <Text className="font-orbitron-bold text-[8px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">Org ID / Student #</Text>
                    <TextInput
                      placeholder="Identifier"
                      placeholderTextColor="#94A3B8"
                      value={memberOrgId}
                      onChangeText={setMemberOrgId}
                      className="font-inter text-xs text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 outline-none"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="font-orbitron-bold text-[8px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">Birthdate</Text>
                    <TextInput
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#94A3B8"
                      value={memberBirthdate}
                      onChangeText={setMemberBirthdate}
                      className="font-inter text-xs text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 outline-none"
                    />
                  </View>
                </View>
              </ScrollView>
            )}

            <View className="flex-row gap-3 mt-2">
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => {
                  setIsPlayerModalOpen(false);
                  resetMemberForm();
                }}
                className="flex-1 py-3"
              />
              <Button
                title={editingPlayer ? "Save Changes" : "Add Player"}
                disabled={!playerSearchVal.trim() || isProcessing}
                onPress={() => {
                  if (editingPlayer) {
                    handleEditRosterName(editingPlayer.id, playerSearchVal);
                    setIsPlayerModalOpen(false);
                    resetMemberForm();
                  } else {
                    handleAddRosterMember(playerSearchVal, 'role-player', selectedPerson, () => {
                      setIsPlayerModalOpen(false);
                    });
                  }
                }}
                className="flex-1 py-3"
              />
            </View>
          </GlassCard>
        </View>
      </Modal>

      {/* ==================== ADD/EDIT STAFF MODAL ==================== */}
      <Modal visible={isStaffModalOpen} transparent animationType="slide">
        <View className="flex-1 bg-black/60 justify-end md:justify-center md:items-center md:p-4">
          <GlassCard
            className="w-full md:max-w-md border-t md:border border-slate-200 dark:border-white/5 rounded-t-3xl md:rounded-2xl p-6 bg-white dark:bg-slate-900 min-h-[460px] md:min-h-[520px]"
            style={{ overflow: 'visible' }}
          >
            <View className="flex-row justify-between items-center mb-6">
              <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white uppercase tracking-wider">
                {editingStaff ? 'Edit Staff Member' : 'Add Staff to Roster'}
              </Text>
              <TouchableOpacity onPress={() => {
                setIsStaffModalOpen(false);
                resetMemberForm();
              }}>
                <Ionicons name="close" size={24} color={isDark ? '#94A3B8' : '#475569'} />
              </TouchableOpacity>
            </View>

            <View className="space-y-4 mb-4" style={{ zIndex: 50 }}>
              <View style={{ zIndex: 10 }}>
                <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase mb-2">Staff Name</Text>
                {editingStaff ? (
                  <TextInput
                    value={staffSearchVal}
                    onChangeText={setStaffSearchVal}
                    className="font-inter text-sm text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3"
                  />
                ) : (
                  <PersonnelAutocomplete
                    orgId={orgId}
                    value={staffSearchVal}
                    onChangeText={(text) => {
                      setStaffSearchVal(text);
                      setIsCreatingNewStaff(false);
                      setSelectedStaffPerson(null);
                    }}
                    onSelectPerson={(person) => {
                      setSelectedStaffPerson(person);
                      if (person) {
                        setMemberEmail(person.email || '');
                        setMemberCellphone(person.cellphone || '');
                        setMemberBirthdate(person.birthdate || '');
                        setMemberOrgId(person.identifier || '');
                        setMemberImage(person.image || '');
                        setMemberImageConfig(parseImageConfig(person.imageConfig));
                      } else {
                        resetMemberForm();
                      }
                    }}
                    onSelectNewPerson={() => setIsCreatingNewStaff(true)}
                    placeholder="Search or enter staff name..."
                  />
                )}
              </View>

              <View>
                <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase mb-2">Role</Text>
                <View className="flex-row flex-wrap gap-2">
                  {availableRoles.filter(r => r.id !== 'role-player').map(role => {
                    const isRoleSelected = staffRoleVal === role.id;
                    return (
                      <TouchableOpacity
                        key={role.id}
                        onPress={() => setStaffRoleVal(role.id)}
                        className={`px-3 py-2 rounded-lg border ${
                          isRoleSelected ? 'bg-brand-orange border-brand-orange' : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/5'
                        }`}
                      >
                        <Text className={`font-inter-bold text-[11px] ${isRoleSelected ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                          {role.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* Conditional extra fields for new staff creation */}
            {!editingStaff && isCreatingNewStaff && (
              <ScrollView 
                showsVerticalScrollIndicator={false} 
                className="space-y-4 mb-4 max-h-[160px]"
                keyboardShouldPersistTaps="handled"
              >
                {/* Avatar Display & Edit button */}
                <View className="flex-row items-center gap-4 mb-2 pt-2">
                  <TouchableOpacity
                    onPress={() => setImageEditorTarget('staff')}
                    className="w-14 h-14 rounded-full overflow-hidden items-center justify-center bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                  >
                    {memberImage ? (
                      <View style={{ width: 56, height: 56, overflow: 'hidden' }}>
                        <View
                          style={{
                            width: '100%',
                            height: '100%',
                            transform: [
                              { scale: memberImageConfig.scale },
                              { translateX: memberImageConfig.x * 56 },
                              { translateY: memberImageConfig.y * 56 },
                            ],
                          }}
                        >
                          <Image
                            source={{ uri: memberImage }}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="cover"
                          />
                        </View>
                      </View>
                    ) : (
                      <Ionicons name="camera-outline" size={18} color="#94A3B8" />
                    )}
                  </TouchableOpacity>
                  <View>
                    <Text className="font-orbitron-bold text-[8px] text-slate-600 dark:text-slate-400 uppercase tracking-widest">Avatar Photo</Text>
                    <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Tap circle to edit/upload image</Text>
                  </View>
                </View>

                {/* Email Address & Cell Number */}
                <View className="flex-row gap-3 mb-2">
                  <View className="flex-1">
                    <Text className="font-orbitron-bold text-[8px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">Email Address</Text>
                    <TextInput
                      placeholder="email@example.com"
                      placeholderTextColor="#94A3B8"
                      value={memberEmail}
                      onChangeText={setMemberEmail}
                      className="font-inter text-xs text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 outline-none"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="font-orbitron-bold text-[8px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">Cell Number</Text>
                    <TextInput
                      placeholder="+1 234..."
                      placeholderTextColor="#94A3B8"
                      value={memberCellphone}
                      onChangeText={setMemberCellphone}
                      className="font-inter text-xs text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 outline-none"
                    />
                  </View>
                </View>

                {/* Org ID & Birthdate */}
                <View className="flex-row gap-3 mb-2">
                  <View className="flex-1">
                    <Text className="font-orbitron-bold text-[8px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">Org ID / Student #</Text>
                    <TextInput
                      placeholder="Identifier"
                      placeholderTextColor="#94A3B8"
                      value={memberOrgId}
                      onChangeText={setMemberOrgId}
                      className="font-inter text-xs text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 outline-none"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="font-orbitron-bold text-[8px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">Birthdate</Text>
                    <TextInput
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#94A3B8"
                      value={memberBirthdate}
                      onChangeText={setMemberBirthdate}
                      className="font-inter text-xs text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 outline-none"
                    />
                  </View>
                </View>
              </ScrollView>
            )}

            <View className="flex-row gap-3 mt-2">
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => {
                  setIsStaffModalOpen(false);
                  resetMemberForm();
                }}
                className="flex-1 py-3"
              />
              <Button
                title={editingStaff ? "Save Changes" : "Add Staff"}
                disabled={!staffSearchVal.trim() || isProcessing}
                onPress={() => {
                  if (editingStaff) {
                    handleEditRosterName(editingStaff.id, staffSearchVal, editingStaff.membershipId, staffRoleVal);
                    setIsStaffModalOpen(false);
                    resetMemberForm();
                  } else {
                    handleAddRosterMember(staffSearchVal, staffRoleVal, selectedStaffPerson, () => {
                      setIsStaffModalOpen(false);
                    });
                  }
                }}
                className="flex-1 py-3"
              />
            </View>
          </GlassCard>
        </View>
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Team?"
        description={`Are you sure you want to permanently delete the team "${team?.name}"? This action cannot be undone.${deleteError ? '\n\nError: ' + deleteError : ''}`}
        onConfirm={handleDeleteTeam}
        confirmText={isProcessing ? "Deleting..." : "Delete"}
        variant="danger"
        isProcessing={isProcessing}
      />

      {/* DEACTIVATE WARNING MODAL */}
      <ConfirmationModal
        isOpen={deactivateWarningOpen}
        onClose={() => setDeactivateWarningOpen(false)}
        title="Warning: Team has Games"
        description={`This team is associated with ${teamGames.length} existing games. Deactivating it will prevent it from being selected for new schedules, but won't delete past game history. Are you sure you want to deactivate ${team?.name}?`}
        onConfirm={() => {
          setDetailsForm(prev => ({ ...prev, isActive: false }));
          setDeactivateWarningOpen(false);
        }}
        confirmText="Deactivate"
        variant="danger"
      />

      {/* ROSTER REMOVE MEMBER CONFIRMATION MODAL */}
      <ConfirmationModal
        isOpen={rosterMemberToRemove !== null}
        onClose={() => setRosterMemberToRemove(null)}
        title={rosterMemberToRemove?.isPlayer ? 'Remove Player' : 'Remove Staff'}
        description={
          rosterMemberToRemove 
            ? `Are you sure you want to remove ${rosterMemberToRemove.name} from this team's roster?${rosterRemoveError ? '\n\nError: ' + rosterRemoveError : ''}` 
            : ''
        }
        onConfirm={confirmRemoveRosterMember}
        confirmText={isProcessing ? "Removing..." : "Remove"}
        variant="danger"
        isProcessing={isProcessing}
      />

      {/* Resolve the image URI to pass to ImageEditor */}
      <ImageEditor
        visible={imageEditorTarget !== null}
        imageUri={memberImage}
        config={memberImageConfig}
        title="Edit Avatar"
        allowRemove
        onApply={(uri, config) => {
          setMemberImage(uri);
          setMemberImageConfig(config);
          setImageEditorTarget(null);
        }}
        onCancel={() => setImageEditorTarget(null)}
      />
      {/* FLOATING SAVE CHANGES BAR */}
      {activeTab === 'details' && hasDetailsChanges && (
        <View className="absolute bottom-6 left-6 right-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-4 rounded-2xl flex-row items-center justify-between shadow-xl z-40">
          <View className="flex-1 mr-4">
            <Text className="font-orbitron-bold text-[10px] text-slate-800 dark:text-white uppercase tracking-wider">
              Unsaved Changes
            </Text>
            <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
              You have modified this team's details.
            </Text>
          </View>
          <View className="flex-row items-center gap-2.5">
            <TouchableOpacity
              onPress={handleDiscardDetails}
              disabled={isProcessing}
              className="bg-slate-100 dark:bg-slate-800 px-4 py-2.5 rounded-xl active:scale-95 border border-slate-200 dark:border-white/5"
            >
              <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-300 uppercase tracking-widest">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSaveDetails}
              disabled={isProcessing || !detailsForm.name.trim() || !detailsForm.ageGroupId}
              className="bg-brand-orange px-5 py-2.5 rounded-xl flex-row items-center gap-2 active:scale-95 shadow-md shadow-brand-orange/30"
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={14} color="white" />
                  <Text className="font-orbitron-bold text-[9px] text-white uppercase tracking-widest mt-0.5">
                    Save
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
