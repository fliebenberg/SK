import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEventCapabilities } from '../../../../../../../hooks/useEventCapabilities';
import { getMatchPermissions } from '../../../../../../../utils/matchPermissions';
import { useAuthStore } from '../../../../../../../store/authStore';
import { useUnsavedChanges } from '../../../../../../../hooks/useUnsavedChanges';
import { useSafeBack } from '../../../../../../../hooks/useSafeBack';
import { useUnsavedChangesStore } from '../../../../../../../store/unsavedChangesStore';
import { useWsStore } from '../../../../../../../store/wsStore';
import { wsService } from '../../../../../../../services/websocket';
import { useRoom } from '../../../../../../../hooks/useLiveRoom';
import { sendAction } from '../../../../../../../services/actions';
import { useToastStore } from '../../../../../../../store/toastStore';
import { readData } from '../../../../../../../services/reads';
import { ReadFailure } from '../../../../../../../components/ReadFailure';
import { RoomFailure } from '../../../../../../../components/RoomFailure';
import { ScreenHeader } from '../../../../../../../components/ScreenHeader';
import { useIncomingRecord, CHANGED_ELSEWHERE_CHECKED_NOTICE } from '../../../../../../../hooks/useIncomingRecord';

import { EditConflict, SocketAction, TeamSheetItem, teamSheetChanges } from '@sk/shared';
import { EditConflictModal, EditConflictRow } from '../../../../../../../components/EditConflictModal';
import { useActiveTheme } from '../../../../../../../store/settingsStore';
import { themeColor } from '../../../../../../../constants/Colors';

interface RosterItem {
  orgProfileId: string;
  position?: string;
  jerseyNumber?: string;
  isReserve: boolean;
}

const toRosterItems = (rows: any[]): RosterItem[] => (rows || []).map((r) => ({
  orgProfileId: r.orgProfileId,
  position: r.position || undefined,
  jerseyNumber: r.jerseyNumber || undefined,
  isReserve: !!r.isReserve,
}));

const byProfile = (rows: RosterItem[]) => [...rows].sort((a, b) => a.orgProfileId.localeCompare(b.orgProfileId));
/** The same sheet, whatever order it was picked in. */
const sameRoster = (a: RosterItem[], b: RosterItem[]) =>
  a.length === b.length && JSON.stringify(byProfile(a)) === JSON.stringify(byProfile(b));

/**
 * **Nothing here may be saved on a read that failed (`SYNC-9`).** Saving replaces the side's whole team
 * sheet, so a sheet that did not load must never become an empty one to save over the real one: a failed
 * read leaves the sheet, its baseline and the proposal as they were, and Save is unavailable, saying why,
 * until the read is answered. `rosterLoadedFor` and `membersLoadedFor` say whose sheet and players are
 * held, since a side changed to and not yet read still has the other side's in state.
 */
export default function GameSelectionScreen() {
  const isDark = useActiveTheme() === 'dark';
  const { orgId, eventId, gameId, teamId } = useLocalSearchParams<{
    orgId: string;
    eventId: string;
    gameId: string;
    teamId?: string;
  }>();
  // rooms-ok: capability updates only; the read is the load and its failure is shown with the page's read failures
  const { capabilities, error: capabilitiesError, retry: retryCapabilities } = useEventCapabilities(eventId, { suppressToast: true });
  const router = useRouter();
  const safeBack = useSafeBack();
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= 768;

  const user = useAuthStore((s) => s.user);
  const orgMemberships = useAuthStore((s) => s.orgMemberships);
  const teamMemberships = useAuthStore((s) => s.teamMemberships);
  const isConnected = useWsStore((s) => s.isConnected);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [game, setGame] = useState<any>(null);
  const [event, setEvent] = useState<any>(null);
  const [sport, setSport] = useState<any>(null);

  const [selectedParticipantIdx, setSelectedParticipantIdx] = useState<number>(0);
  const [availablePlayers, setAvailablePlayers] = useState<any[]>([]);
  const [positions, setPositions] = useState<Array<{ id: string; name: string }>>([]);
  const [teamsMap, setTeamsMap] = useState<Record<string, any>>({});

  const [roster, setRoster] = useState<RosterItem[]>([]);
  /** Whom the proposed team's game was against, while this side starts from a proposal (`FIX-32`). */
  const [proposedFrom, setProposedFrom] = useState<string | null>(null);
  const [originalRoster, setOriginalRoster] = useState<RosterItem[]>([]);
  /** The participant whose sheet `roster` is, once the server has said. */
  const [rosterLoadedFor, setRosterLoadedFor] = useState<string | null>(null);
  /**
   * A newer sheet that arrived — by a re-read, as on reconnecting, or from the room — while this one
   * had unsaved picks (`SYNC-10`): the picks stay, the bar says so, and Cancel shows it.
   */
  const incomingRoster = useIncomingRecord(sameRoster);
  /** The baseline and picks as they are now, for an answer that lands after more picking. */
  const sheetRef = useRef<{ baseline: RosterItem[]; drafts: RosterItem[]; loadedFor: string | null }>({ baseline: [], drafts: [], loadedFor: null });
  /** The team whose players `availablePlayers` are, once the server has said. */
  const [membersLoadedFor, setMembersLoadedFor] = useState<string | null>(null);

  // What did not load: the game, its tournament and sport; the sheet; the players; the proposed team; team names.
  const [setupError, setSetupError] = useState<string | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [rosterAttempt, setRosterAttempt] = useState(0);
  const [membersAttempt, setMembersAttempt] = useState(0);
  const [proposalAttempt, setProposalAttempt] = useState(0);
  const [teamsAttempt, setTeamsAttempt] = useState(0);

  // Selection Interaction States (Bi-directional desktop + mobile)
  const [activePositionId, setActivePositionId] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [activeIsReserve, setActiveIsReserve] = useState(false);

  // Web Drag Over States
  const [dragOverPosId, setDragOverPosId] = useState<string | null>(null);
  const [isDragOverReserves, setIsDragOverReserves] = useState(false);
  const [isDragOverAvailable, setIsDragOverAvailable] = useState(false);
  
  // Search Inputs
  const [rosterSearch, setRosterSearch] = useState('');
  const [pickerSearch, setPickerSearch] = useState('');

  // Mobile Bottom Sheet Modal State
  const [isMobilePickerOpen, setIsMobilePickerOpen] = useState(false);

  // Editing Jersey Number State
  const [editingJerseyForId, setEditingJerseyForId] = useState<string | null>(null);
  const [tempJerseyValue, setTempJerseyValue] = useState('');

  // Fetch Game, Event, Sport via WebSockets
  const loadRun = useRef(0);
  const loadData = useCallback(() => {
    if (!isConnected || !gameId) return;
    const run = ++loadRun.current;
    const stillWanted = () => loadRun.current === run;
    const options = { suppressToast: true, stillWanted };
    setIsLoading(true);
    setSetupError(null);

    const readGameAndSport = readData<any>('game', { id: gameId as string }, options).then(async (resGame) => ({
      resGame,
      resSport: resGame.ok && resGame.data?.sportId ? await readData<any>('sport', { id: resGame.data.sportId }, options) : null,
    }));
    const readEvent = eventId ? readData<any>('event', { id: eventId as string }, options) : Promise.resolve(null);

    void Promise.all([readGameAndSport, readEvent]).then(([{ resGame, resSport }, resEvent]) => {
      if (!stillWanted()) return;

      let failure: string | null = null;
      for (const res of [resGame, resEvent, resSport]) {
        if (res && !res.ok && !failure) failure = res.message;
      }
      const loadedGame = resGame.ok ? resGame.data : null;
      const loadedEvent = resEvent?.ok ? resEvent.data : null;
      const loadedSport = resSport?.ok ? resSport.data : null;
      if (loadedGame) setGame(loadedGame);
      if (loadedEvent) setEvent(loadedEvent);
      if (loadedSport) setSport(loadedSport);
      setSetupError(failure);

      if (loadedGame) {
        const gamePositions = loadedGame?.customSettings?.positions;
        const eventPositions = loadedEvent?.settings?.positions;
        // The game's own, the tournament's, the sport's: while a read that could overrule what is left
        // has failed, the positions are not known, and what is held stays.
        if (gamePositions || eventPositions || !failure) {
          setPositions(gamePositions || eventPositions || loadedSport?.defaultSettings?.positions || []);
        }
      }
      setIsLoading(false);
    });
  }, [isConnected, gameId, eventId]);

  useEffect(() => {
    loadData();
    return () => { loadRun.current++; };
  }, [loadData]);

  // Current selected participant
  const participants = game?.participants || [];
  const currentParticipant = participants[selectedParticipantIdx] || null;
  const currentTeamId = currentParticipant?.teamId;

  // Track if initial auto-selection has occurred to prevent re-select jumps on state re-renders
  const hasAutoSelectedRef = useRef(false);

  useEffect(() => {
    hasAutoSelectedRef.current = false;
  }, [gameId]);

  // Auto-select initial team participant index based on teamId param or user coaching membership
  useEffect(() => {
    if (hasAutoSelectedRef.current) return;
    if (!game?.participants || game.participants.length === 0) return;

    hasAutoSelectedRef.current = true;

    if (teamId) {
      const idx = game.participants.findIndex((p: any) => p.teamId === teamId);
      if (idx !== -1) {
        setSelectedParticipantIdx(idx);
        return;
      }
    }

    const homeTeamId = game.participants[0]?.teamId;
    const awayTeamId = game.participants[1]?.teamId;
    const isCoachOfHome = homeTeamId && teamMemberships?.some((m: any) => m.teamId === homeTeamId && (m.roleId === 'role-coach' || m.roleId === 'role-assistant-coach'));
    const isCoachOfAway = awayTeamId && teamMemberships?.some((m: any) => m.teamId === awayTeamId && (m.roleId === 'role-coach' || m.roleId === 'role-assistant-coach'));

    if (!isCoachOfHome && isCoachOfAway) {
      setSelectedParticipantIdx(1);
    }
  }, [game?.participants, teamId, teamMemberships]);

  // Fetch details for all teams in participants
  useEffect(() => {
    if (!isConnected || !game?.participants) return;
    let isMounted = true;
    setTeamsError(null);
    game.participants.forEach((p: any) => {
      if (p.teamId && !teamsMap[p.teamId]) {
        void readData<any>('team', { id: p.teamId }, { suppressToast: true, stillWanted: () => isMounted }).then((result) => {
          if (!isMounted) return;
          if (!result.ok) { setTeamsError(result.message); return; }
          const team = result.data;
          if (team?.id && team?.name) {
            setTeamsMap((prev) => ({ ...prev, [team.id]: team }));
          }
        });
      }
    });
    return () => {
      isMounted = false;
    };
  }, [isConnected, game?.participants, teamsMap, teamsAttempt]);

  const getParticipantName = useCallback(
    (p: any, idx: number) => {
      if (!p) return `Team ${idx + 1}`;
      if (p.name) return p.name;
      if (p.teamName) return p.teamName;
      if (p.teamId && teamsMap[p.teamId]?.name) return teamsMap[p.teamId].name;
      return `Team ${idx + 1}`;
    },
    [teamsMap]
  );

  // Calculate Match Permissions
  const permissions = useMemo(() => {
    return getMatchPermissions({
      game,
      event,
      currentOrgId: orgId as string,
      user,
      orgMemberships,
      teamMemberships,
      // Without this the screen would hide the controls from an appointed organiser or a
      // division convenor, neither of whom holds an org membership that says so (D33).
      capabilities,
      teamsMap,
    });
  }, [game, event, orgId, user, orgMemberships, teamMemberships, teamsMap, capabilities]);

  const canEditCurrentTeam =
    selectedParticipantIdx === 0
      ? permissions.canEditTeam1Lineup
      : permissions.canEditTeam2Lineup;

  // Fetch Team Members whenever selected participant changes
  useEffect(() => {
    if (!isConnected || !currentParticipant?.id || !currentTeamId) return;

    let isMounted = true;
    setMembersError(null);

    void readData<any[]>('team_members', { teamId: currentTeamId, gameId }, { suppressToast: true, stillWanted: () => isMounted }).then((result) => {
      if (!isMounted) return;
      if (!result.ok) { setMembersError(result.message); return; }
      setAvailablePlayers(Array.isArray(result.data) ? result.data : []);
      setMembersLoadedFor(currentTeamId);
    });

    return () => {
      isMounted = false;
    };
  }, [isConnected, currentParticipant?.id, currentTeamId, membersAttempt]);

  // The proposed team, for a side whose own sheet is known to be empty (`FIX-32`). Unsaved, so Save
  // confirms it as this game's. Nothing is lost if it fails: the side starts from an empty sheet, as it
  // really has one.
  const rosterRef = useRef(roster);
  rosterRef.current = roster;
  const loadProposal = useCallback((participantId: string, stillWanted: () => boolean) => {
    setProposalError(null);
    void readData<any>('game_roster_proposal', { id: participantId }, { suppressToast: true, stillWanted }).then((result) => {
      if (!stillWanted()) return;
      if (!result.ok) { setProposalError(result.message); return; }
      // Asked again after a failure, it does not replace what has been picked since.
      if (!result.data?.items?.length || rosterRef.current.length) return;
      setRoster(toRosterItems(result.data.items));
      setProposedFrom(result.data.opponent || 'the last game');
    });
  }, []);

  /** A sheet from the server: taken, unless it would overwrite unsaved picks for the same side. */
  const offerSheet = useCallback((participantId: string, incoming: RosterItem[]) => {
    const { baseline, drafts, loadedFor } = sheetRef.current;
    incomingRoster.offer({
      // Another side's sheet is another form: nothing typed there carries over.
      baseline: loadedFor === participantId ? baseline : null,
      drafts,
      incoming,
      seed: from => {
        setRoster(from);
        setOriginalRoster(from);
        setProposedFrom(null);
        useUnsavedChangesStore.getState().clear();
      },
    });
  }, [incomingRoster.offer]);

  // Fetch Saved Roster whenever selected participant changes
  useEffect(() => {
    if (!isConnected || !currentParticipant?.id || !currentTeamId) return;

    let isMounted = true;
    const stillWanted = () => isMounted;
    const participantId = currentParticipant.id;
    setRosterError(null);
    setProposalError(null);

    void readData<any[]>('game_roster', { id: participantId }, { suppressToast: true, stillWanted }).then((result) => {
      if (!isMounted) return;
      // No answer is no information: no change to the sheet or its baseline, and no proposal.
      if (!result.ok) { setRosterError(result.message); return; }
      // The server always answers this with a list, and with `null` only when reading it threw.
      if (!Array.isArray(result.data)) { setRosterError('The server could not read the team sheet.'); return; }
      const mapped = toRosterItems(result.data);
      offerSheet(participantId, mapped);
      setRosterLoadedFor(participantId);
      // No team of its own yet: start from the proposed one — the team of this team's latest
      // earlier game in the tournament (`FIX-32`).
      if (!mapped.length && canEditCurrentTeam) loadProposal(participantId, stillWanted);
    });

    return () => {
      isMounted = false;
    };
  }, [isConnected, currentParticipant?.id, currentTeamId, canEditCurrentTeam, rosterAttempt, loadProposal, offerSheet]);

  // Asking again for a proposal alone, which leaves what has been picked since alone too.
  useEffect(() => {
    if (!proposalAttempt || !currentParticipant?.id) return;
    let isMounted = true;
    loadProposal(currentParticipant.id, () => isMounted);
    return () => {
      isMounted = false;
    };
  }, [proposalAttempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // The game's room, held with its status (`LIVE-25`); the listener below reads its messages.
  const gameRoom = useRoom(gameId ? `game:${gameId}` : null);

  // Delta Update Listener
  useEffect(() => {
    if (!gameId) return;
    const room = `game:${gameId}`;

    const handleUpdate = (evt: { topic?: string; type: string; data: any }) => {
      if (!evt) return;
      if (evt.topic && evt.topic !== room) return;

      if (evt.type === 'GAME_ROSTER_UPDATED') {
        const { participantId, items } = evt.data || {};
        if (participantId && participantId === currentParticipant?.id && Array.isArray(items)) {
          // Our own save landing back is adopted; somebody else's keeps the picks in progress.
          offerSheet(participantId, toRosterItems(items));
          // It carries the whole sheet, so the sheet is known whatever a read made of it.
          setRosterLoadedFor(participantId);
          setRosterError(null);
        }
      } else if (evt.type === 'GAME_UPDATED') {
        if (evt.data && (evt.data.id === gameId || evt.data.gameId === gameId)) {
          setGame((prev: any) => ({ ...prev, ...evt.data }));
          if (evt.data.customSettings?.positions) {
            setPositions(evt.data.customSettings.positions);
          }
          setIsLoading(false);
        }
        // Deliberately does not re-read the roster. A roster change arrives as
        // GAME_ROSTER_UPDATED above, carrying its own items; refetching on every
        // GAME_UPDATED meant a clock start or a score re-read the roster and
        // called `clear()` on it, discarding whatever the selector had in
        // progress while the match was running.
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      wsService.off('update', handleUpdate);
    };
  }, [gameId, currentParticipant?.id, offerSheet]);

  sheetRef.current = { baseline: originalRoster, drafts: roster, loadedFor: rosterLoadedFor };

  // Check dirty state
  const isDirty = useMemo(() => !sameRoster(roster, originalRoster), [roster, originalRoster]);

  const handleCancel = useCallback(() => {
    // The newer sheet, when it changed while this was being picked: Cancel shows it.
    const to = incomingRoster.newer ?? originalRoster;
    setRoster(to);
    setOriginalRoster(to);
    setProposedFrom(null);
    incomingRoster.clear();
    setActivePositionId(null);
    setActivePlayerId(null);
    setActiveIsReserve(false);
    useUnsavedChangesStore.getState().clear();
  }, [originalRoster, incomingRoster.newer, incomingRoster.clear]);

  useUnsavedChanges(isDirty, handleCancel);

  const sheetKnown = !!currentParticipant?.id && rosterLoadedFor === currentParticipant.id;
  const membersKnown = !!currentTeamId && membersLoadedFor === currentTeamId;

  // A sheet is only saved on reads that were answered.
  const saveBlockedBy = rosterError || !sheetKnown
    ? 'the team sheet has not loaded'
    : membersError
    ? 'the team\'s players have not loaded'
    : setupError
    ? 'this game\'s details have not loaded'
    : null;

  // With neither the sheet, the players nor the positions there is nothing true to show or edit.
  const editorBlocked = (!!rosterError && !sheetKnown) || (!!membersError && !membersKnown) || (!!setupError && positions.length === 0);

  // One note, for the first thing that matters; *Try again* asks again for all that failed.
  const readProblem = rosterError
    ? { title: sheetKnown ? 'The team sheet did not update.' : 'The team sheet did not load.', reason: rosterError }
    : membersError
    ? { title: membersKnown ? 'The team\'s players did not update.' : 'The team\'s players did not load.', reason: membersError }
    : setupError
    ? { title: 'This game\'s details did not load.', reason: setupError }
    : capabilitiesError && !canEditCurrentTeam
    ? { title: 'Whether you can edit this team did not load.', reason: capabilitiesError }
    : teamsError
    ? { title: 'The team names did not load.', reason: teamsError }
    : proposalError
    ? { title: 'The proposed team did not load.', reason: proposalError }
    : null;
  // Rights may be wider than they look until these are answered, so "read-only" would not be known.
  const rightsUnknown = !!(setupError || capabilitiesError || teamsError);
  const retryFailedReads = () => {
    if (setupError) loadData();
    if (rosterError) setRosterAttempt((n) => n + 1);
    if (membersError) setMembersAttempt((n) => n + 1);
    if (proposalError) setProposalAttempt((n) => n + 1);
    if (capabilitiesError) retryCapabilities();
    if (teamsError) setTeamsAttempt((n) => n + 1);
  };

  // Sorted Available Players: Unassigned players first, assigned players second; sorted alphabetically within each group
  const sortedAvailablePlayers = useMemo(() => {
    return [...availablePlayers].sort((a, b) => {
      const aId = a.id || a.orgProfileId;
      const bId = b.id || b.orgProfileId;

      const aAssigned = roster.some((r) => r.orgProfileId === aId);
      const bAssigned = roster.some((r) => r.orgProfileId === bId);

      // Primary sort: Unassigned before assigned
      if (aAssigned !== bAssigned) {
        return aAssigned ? 1 : -1;
      }

      // Secondary sort: Alphabetical by name
      const aName = (a.name || a.orgProfileName || '').toLowerCase();
      const bName = (b.name || b.orgProfileName || '').toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [availablePlayers, roster]);

  /**
   * A save refused because the sheet was saved by someone else after it was opened (`SYNC-11`):
   * the refusal and the sheet saved now, for *Save mine anyway* and *Show theirs*.
   */
  const [sheetConflict, setSheetConflict] = useState<{ message: string; conflict: EditConflict; participantId: string } | null>(null);
  const theirSheet = (sheetConflict?.conflict.current.items ?? []) as TeamSheetItem[];

  // Save Roster Handler. `itemsWas` is the saved sheet this one was picked over (`[]` for a
  // proposed team, which is not saved): refused if the saved sheet has changed since.
  const handleSave = (itemsWas: TeamSheetItem[] = originalRoster) => {
    if (!currentParticipant?.id || !canEditCurrentTeam || !game?.id || saveBlockedBy) return;
    const participantId = currentParticipant.id;
    setIsSaving(true);
    sendAction(SocketAction.SAVE_GAME_ROSTER, {
      gameId: game.id,
      participantId,
      items: roster,
      itemsWas,
    }, { suppressToast: true }).then((result) => {
      setIsSaving(false);
      if (!result.ok) {
        // Saved by someone else meanwhile: the dialog says who, and offers the ways on.
        if (result.conflict) setSheetConflict({ message: result.message, conflict: result.conflict, participantId });
        else { setSheetConflict(null); useToastStore.getState().showError(result.message, 'Not saved'); }
        return;
      }
      setSheetConflict(null);
      setOriginalRoster(roster);
      setProposedFrom(null);
      incomingRoster.clear();
      useUnsavedChangesStore.getState().clear();
    });
  };

  /** A name for each player on either sheet, for the list *Save mine anyway* shows. */
  const playerLabel = (orgProfileId: string) => {
    const player = availablePlayers.find((p) => (p.id || p.orgProfileId) === orgProfileId);
    return player?.name || player?.orgProfileName || 'A player no longer in this team';
  };
  const placeText = (item: TeamSheetItem | null) => {
    if (!item) return 'Not picked';
    const place = item.isReserve
      ? 'Reserve'
      : item.position
        ? positions.find((p) => p.id === item.position)?.name || `Position ${item.position}`
        : 'Picked';
    return item.jerseyNumber ? `${place} · #${item.jerseyNumber}` : place;
  };
  /** Each player whose place differs between the saved sheet and this one. */
  const sheetConflictRows: EditConflictRow[] = sheetConflict
    ? teamSheetChanges(theirSheet, roster).map((change) => ({
        key: change.orgProfileId,
        label: playerLabel(change.orgProfileId),
        theirs: placeText(change.theirs),
        yours: placeText(change.yours),
      }))
    : [];

  /** *Show theirs*: drop these picks and show the sheet as it is saved now. */
  const handleShowTheirSheet = () => {
    if (sheetConflict?.participantId === currentParticipant?.id) {
      setRoster(theirSheet);
      setOriginalRoster(theirSheet);
      setProposedFrom(null);
      incomingRoster.clear();
      setActivePositionId(null);
      setActivePlayerId(null);
      setActiveIsReserve(false);
      useUnsavedChangesStore.getState().clear();
    }
    setSheetConflict(null);
  };

  // Reserve Limit
  const sportMaxReserves = sport?.defaultSettings?.maxReserves ?? 0;
  const gameMaxReserves = game?.customSettings?.maxReserves;
  const maxReserves =
    gameMaxReserves !== undefined ? gameMaxReserves : sportMaxReserves;
  const assignedReserves = roster.filter((r) => r.isReserve);
  const reservesUnknown = !!setupError && gameMaxReserves === undefined && !sport;

  // Core Allocation Logic
  const handleAssignPlayerToSlot = (
    profileId: string,
    targetPositionId?: string,
    isReserveSlot = false
  ) => {
    if (!canEditCurrentTeam) return;

    setRoster((prev) => {
      // Remove player from any existing position
      const filtered = prev.filter((item) => item.orgProfileId !== profileId);

      if (targetPositionId) {
        // Remove anyone currently occupying targetPositionId
        const finalRoster = filtered.filter(
          (item) => item.position !== targetPositionId
        );
        return [
          ...finalRoster,
          {
            orgProfileId: profileId,
            position: targetPositionId,
            jerseyNumber: targetPositionId, // Default jersey number to position ID
            isReserve: false,
          },
        ];
      } else if (isReserveSlot) {
        if (maxReserves > 0 && assignedReserves.length >= maxReserves) {
          return prev; // Reached reserve cap
        }
        return [
          ...filtered,
          {
            orgProfileId: profileId,
            position: undefined,
            jerseyNumber: undefined,
            isReserve: true,
          },
        ];
      }
      return filtered;
    });

    // Reset active selection states
    setActivePositionId(null);
    setActivePlayerId(null);
    setActiveIsReserve(false);
    setIsMobilePickerOpen(false);
    setPickerSearch('');
  };

  const handleRemoveFromRoster = (profileId: string) => {
    if (!canEditCurrentTeam) return;
    setRoster((prev) => prev.filter((item) => item.orgProfileId !== profileId));
  };

  const handleSaveJerseyNumber = (profileId: string, newJersey: string) => {
    setRoster((prev) =>
      prev.map((item) =>
        item.orgProfileId === profileId
          ? { ...item, jerseyNumber: newJersey.trim() || undefined }
          : item
      )
    );
    setEditingJerseyForId(null);
    setTempJerseyValue('');
  };

  // Click Handlers for Positions & Players (Bi-directional activation)
  const handlePositionSlotClick = (posId: string) => {
    if (!canEditCurrentTeam) return;

    if (!isDesktop) {
      // On mobile, tap position opens bottom sheet modal
      setActivePositionId(posId);
      setActiveIsReserve(false);
      setIsMobilePickerOpen(true);
      return;
    }

    // On desktop / tablet:
    if (activePlayerId) {
      // If a player card is already active, assign that player to this position!
      handleAssignPlayerToSlot(activePlayerId, posId, false);
    } else {
      // Else toggle active position
      if (activePositionId === posId) {
        setActivePositionId(null);
      } else {
        setActivePositionId(posId);
        setActiveIsReserve(false);
        setActivePlayerId(null);
      }
    }
  };

  const handleReserveSectionClick = () => {
    if (!canEditCurrentTeam) return;

    if (!isDesktop) {
      // On mobile, tap reserve opens bottom sheet modal
      setActivePositionId(null);
      setActiveIsReserve(true);
      setIsMobilePickerOpen(true);
      return;
    }

    // On desktop / tablet:
    if (activePlayerId) {
      handleAssignPlayerToSlot(activePlayerId, undefined, true);
    } else {
      if (activeIsReserve) {
        setActiveIsReserve(false);
      } else {
        setActiveIsReserve(true);
        setActivePositionId(null);
        setActivePlayerId(null);
      }
    }
  };

  const handleAvailablePlayerClick = (profileId: string, isAssigned: boolean) => {
    if (!canEditCurrentTeam) return;

    if (isAssigned) {
      // Tapping an allocated player clears them from lineup
      handleRemoveFromRoster(profileId);
      return;
    }

    if (activePositionId) {
      // If a position slot is active, assign player to that active position!
      handleAssignPlayerToSlot(profileId, activePositionId, false);
    } else if (activeIsReserve) {
      // If reserve area is active, assign player to reserve!
      handleAssignPlayerToSlot(profileId, undefined, true);
    } else {
      // Else toggle active player
      if (activePlayerId === profileId) {
        setActivePlayerId(null);
      } else {
        setActivePlayerId(profileId);
        setActivePositionId(null);
        setActiveIsReserve(false);
      }
    }
  };

  // Web HTML5 Drag & Drop Handlers
  const handleDragStartPlayer = (e: any, profileId: string) => {
    if (Platform.OS === 'web' && e?.dataTransfer) {
      e.dataTransfer.setData('profileId', profileId);
      e.dataTransfer.setData('text/plain', profileId);
      e.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDragEnterPosition = (e: any, posId: string) => {
    if (Platform.OS === 'web' && e?.preventDefault) {
      e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      setDragOverPosId(posId);
    }
  };

  const handleDragOverPosition = (e: any, posId: string) => {
    if (Platform.OS === 'web' && e?.preventDefault) {
      e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      if (dragOverPosId !== posId) setDragOverPosId(posId);
    }
  };

  const handleDragLeavePosition = (e: any) => {
    if (Platform.OS === 'web') {
      if (e.stopPropagation) e.stopPropagation();
      if (e.currentTarget && e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) {
        return;
      }
      setDragOverPosId(null);
    }
  };

  const handleDropOnPosition = (e: any, posId: string) => {
    if (Platform.OS === 'web' && e?.preventDefault) {
      e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      setDragOverPosId(null);
      const profileId =
        e.dataTransfer?.getData('profileId') || e.dataTransfer?.getData('text/plain');
      if (profileId) {
        handleAssignPlayerToSlot(profileId, posId, false);
      }
    }
  };

  const handleDragEnterReserves = (e: any) => {
    if (Platform.OS === 'web' && e?.preventDefault) {
      e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      setIsDragOverReserves(true);
    }
  };

  const handleDragOverReserves = (e: any) => {
    if (Platform.OS === 'web' && e?.preventDefault) {
      e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      if (!isDragOverReserves) setIsDragOverReserves(true);
    }
  };

  const handleDragLeaveReserves = (e: any) => {
    if (Platform.OS === 'web') {
      if (e.stopPropagation) e.stopPropagation();
      if (e.currentTarget && e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) {
        return;
      }
      setIsDragOverReserves(false);
    }
  };

  const handleDropOnReserves = (e: any) => {
    if (Platform.OS === 'web' && e?.preventDefault) {
      e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      setIsDragOverReserves(false);
      const profileId =
        e.dataTransfer?.getData('profileId') || e.dataTransfer?.getData('text/plain');
      if (profileId) {
        handleAssignPlayerToSlot(profileId, undefined, true);
      }
    }
  };

  const handleDragEnterAvailable = (e: any) => {
    if (Platform.OS === 'web' && e?.preventDefault) {
      e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      setIsDragOverAvailable(true);
    }
  };

  const handleDragOverAvailable = (e: any) => {
    if (Platform.OS === 'web' && e?.preventDefault) {
      e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      if (!isDragOverAvailable) setIsDragOverAvailable(true);
    }
  };

  const handleDragLeaveAvailable = (e: any) => {
    if (Platform.OS === 'web') {
      if (e.stopPropagation) e.stopPropagation();
      if (e.currentTarget && e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) {
        return;
      }
      setIsDragOverAvailable(false);
    }
  };

  const handleDropOnAvailable = (e: any) => {
    if (Platform.OS === 'web' && e?.preventDefault) {
      e.preventDefault();
      setIsDragOverAvailable(false);
      const profileId =
        e.dataTransfer?.getData('profileId') || e.dataTransfer?.getData('text/plain');
      if (profileId) {
        handleRemoveFromRoster(profileId);
      }
    }
  };

  // Allocated Count
  const totalPositions = positions.length;
  const allocatedCount = roster.filter(
    (r) => !!r.position && !r.isReserve
  ).length;
  const isFullyAllocated =
    totalPositions > 0 && allocatedCount === totalPositions;

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-canvas items-center justify-center">
        <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
        <Text className="font-orbitron text-xs text-ink-muted mt-3 uppercase tracking-widest">
          Loading Lineup...
        </Text>
      </SafeAreaView>
    );
  }

  if (!game && setupError) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Team Selection" onBack={() => safeBack(`/admin/${orgId}/events/${eventId}/games/${gameId}`)} />
        <View className="flex-1 items-center justify-center p-6">
          <ReadFailure what="This game" reason={setupError} onRetry={retryFailedReads} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      {/* STANDARD MATCH HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-line-soft bg-card z-10">
        <TouchableOpacity
          onPress={() => safeBack(`/admin/${orgId}/events/${eventId}/games/${gameId}`)}
          activeOpacity={0.7}
          className="flex-row items-center gap-1.5"
        >
          <Ionicons name="chevron-back" size={18} color={themeColor(isDark, 'primary')} />
          <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>

        <Text className="font-orbitron-bold text-sm tracking-widest text-ink uppercase flex-1 text-center px-4" numberOfLines={1}>
          Team Selection
        </Text>

        {/* Back to the game's page — there is no View / Lineup / Edit / Score switcher since stage 3. */}

        <View style={{ width: 60 }} />
      </View>

      {/* Participant Switcher Tabs (Team 1 vs Team 2) */}
      {participants.length > 0 && (
        <View className="px-6 py-2 bg-card border-b border-line">
          <View className="flex-row bg-sunken rounded-xl p-1 border border-line max-w-xl self-center w-full">
            {participants.map((p: any, idx: number) => {
              const isActive = selectedParticipantIdx === idx;
              const isEditable =
                idx === 0
                  ? permissions.canEditTeam1Lineup
                  : permissions.canEditTeam2Lineup;

              return (
                <TouchableOpacity
                  key={p.id || idx}
                  activeOpacity={0.8}
                  onPress={() => {
                    hasAutoSelectedRef.current = true;
                    setSelectedParticipantIdx(idx);
                    setActivePositionId(null);
                    setActivePlayerId(null);
                    setActiveIsReserve(false);
                  }}
                  className={`flex-1 py-2 rounded-lg items-center flex-row justify-center gap-1.5 ${
                    isActive ? 'bg-raised' : ''
                  }`}
                >
                  <Text
                    numberOfLines={1}
                    className={`font-orbitron-bold text-xs ${
                      isActive
                        ? 'text-ink'
                        : 'text-ink-muted'
                    }`}
                  >
                    {getParticipantName(p, idx)}
                  </Text>
                  {!isEditable && (
                    <Ionicons
                      name="eye-outline"
                      size={12}
                      color={themeColor(isDark, 'ink-muted')}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* MAIN CONTAINER: 2-COLUMN RESPONSIVE LAYOUT */}
      <ScrollView className="flex-1 px-3 py-3" contentContainerStyle={{ paddingBottom: 60 }}>
        {readProblem ? <ReadFailure title={readProblem.title} reason={readProblem.reason} onRetry={retryFailedReads} className="mb-3" /> : (
          // Saved sheets and kick-off changes arrive through this room; without it the sheet may be out of date.
          <RoomFailure rooms={[gameRoom.room]} what="The team sheet" stale className="mb-3" />
        )}
        {proposedFrom && canEditCurrentTeam ? (
          <View testID="proposed-note" className="bg-warning-soft border border-warning-line rounded-xl p-3 mb-3 flex-row items-center gap-2">
            <Ionicons name="information-circle-outline" size={18} color={themeColor(isDark, 'warning-ink')} />
            <Text className="font-inter text-xs text-warning-ink flex-1">
              Proposed: the team from v {proposedFrom}. Change it, or save it as it is to confirm it for this game.
            </Text>
          </View>
        ) : null}
        {/* Read-Only Notice Banner */}
        {!canEditCurrentTeam && !rightsUnknown && (
          <View className="bg-warning-soft border border-warning-line rounded-xl p-3 mb-3 flex-row items-center gap-2">
            <Ionicons name="information-circle-outline" size={18} color={themeColor(isDark, 'warning-ink')} />
            <Text className="font-inter text-xs text-warning-ink flex-1">
              You are viewing this team's lineup in read-only mode. Only assigned coaches or org admins can edit team selections.
            </Text>
          </View>
        )}

        {/* Header Metadata & Allocation Badge */}
        <View className="flex-row items-center justify-between mb-4 bg-card p-3 rounded-2xl border border-line shadow-sm">
          <View className="flex-1">
            <Text className="font-orbitron-bold text-base text-ink">
              {currentParticipant ? getParticipantName(currentParticipant, selectedParticipantIdx) : 'Team Selection'}
            </Text>
            <Text className="font-inter text-xs text-ink-muted">
              {totalPositions} Positions Available • Max Reserves:{' '}
              {reservesUnknown ? 'not loaded' : maxReserves > 0 ? maxReserves : 'Unlimited'}
            </Text>
          </View>

          {totalPositions > 0 && sheetKnown && (
            <View
              className={`px-3 py-1.5 rounded-full border ${
                isFullyAllocated
                  ? 'bg-success-soft border-success-line'
                  : 'bg-sunken border-line'
              }`}
            >
              <Text
                className={`font-orbitron-bold text-xs ${
                  isFullyAllocated
                    ? 'text-success-ink'
                    : 'text-ink-soft'
                }`}
              >
                {allocatedCount} / {totalPositions}
              </Text>
            </View>
          )}
        </View>

        {/* Active Selection Guidance Bar (Desktop/Tablet) */}
        {isDesktop && canEditCurrentTeam && (activePositionId || activePlayerId || activeIsReserve) && (
          <View className="bg-primary-soft border border-primary-line rounded-xl p-3 mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Ionicons name="sparkles" size={16} color={themeColor(isDark, 'primary')} />
              <Text className="font-orbitron-bold text-xs text-primary-ink">
                {activePositionId
                  ? `Position ${activePositionId} Selected: Click an available player on the right to assign!`
                  : activeIsReserve
                  ? `Reserves Selected: Click an available player on the right to add as reserve!`
                  : `Player Selected: Click any starting position or reserve area on the left to assign!`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setActivePositionId(null);
                setActivePlayerId(null);
                setActiveIsReserve(false);
              }}
              className="bg-primary-soft px-2 py-1 rounded"
            >
              <Text className="font-orbitron-bold text-[10px] text-primary-ink">Cancel Selection</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 2-COLUMN SIDE-BY-SIDE ON DESKTOP/TABLET (`flex-row`) */}
        {editorBlocked ? null : (
        <View className={`flex-1 ${isDesktop ? 'flex-row gap-6 items-stretch' : 'flex-col'}`}>
          
          {/* LEFT COLUMN: STARTING LINEUP & RESERVES */}
          <View className={`gap-6 ${isDesktop ? 'flex-1 min-w-0' : 'w-full'}`}>
            
            {/* STARTING LINEUP SECTION */}
            <View>
              <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-widest mb-2 px-1">
                Starting Lineup
              </Text>

              <View className="gap-1.5">
                {positions.map((pos) => {
                  const assignedItem = roster.find((r) => r.position === pos.id);
                  const player = assignedItem
                    ? availablePlayers.find(
                        (p) => p.id === assignedItem.orgProfileId || p.orgProfileId === assignedItem.orgProfileId
                      )
                    : null;

                  const isActivePos = activePositionId === pos.id;
                  const isDragOver = dragOverPosId === pos.id;

                  const slotInner = (
                    <>
                      {/* Position Badge */}
                      <TouchableOpacity
                        disabled={!canEditCurrentTeam}
                        onPress={() => handlePositionSlotClick(pos.id)}
                        style={Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : undefined}
                        className={`w-7 h-7 rounded-lg items-center justify-center border ${
                          isActivePos
                            ? 'bg-primary border-primary'
                            : 'bg-primary-soft border-primary-line'
                        }`}
                      >
                        <Text
                          className={`font-orbitron-bold text-xs ${
                            isActivePos ? 'text-on-primary' : 'text-primary-ink'
                          }`}
                        >
                          {pos.id}
                        </Text>
                      </TouchableOpacity>

                      {/* Position Name & Player Info */}
                      <TouchableOpacity
                        disabled={!canEditCurrentTeam}
                        onPress={() => handlePositionSlotClick(pos.id)}
                        style={Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : undefined}
                        className="flex-1 min-w-0"
                      >
                        <Text className="font-orbitron-bold text-[9px] text-ink-muted uppercase tracking-tight">
                          {pos.name}
                        </Text>
                        {player ? (
                          <Text
                            className="font-inter-bold text-xs text-ink"
                            numberOfLines={1}
                          >
                            {player.name || player.orgProfileName}
                          </Text>
                        ) : (
                          <Text className="font-inter text-xs text-ink-muted italic" numberOfLines={1}>
                            {isActivePos ? 'Select player on right...' : 'Empty Slot (Tap to assign)'}
                          </Text>
                        )}
                      </TouchableOpacity>

                      {/* Jersey Number & Slot Actions */}
                      {player ? (
                        <View className="flex-row items-center gap-1.5">
                          {/* Jersey Badge / Edit Input */}
                          {editingJerseyForId === player.id ? (
                            <View className="flex-row items-center bg-sunken rounded-md border border-line-strong px-1">
                              <TextInput
                                autoFocus
                                keyboardType="numeric"
                                value={tempJerseyValue}
                                onChangeText={setTempJerseyValue}
                                className="font-orbitron-bold text-xs text-ink w-8 text-center py-0.5"
                              />
                              <TouchableOpacity
                                onPress={() =>
                                  handleSaveJerseyNumber(player.id, tempJerseyValue)
                                }
                                className="p-0.5"
                              >
                                <Ionicons
                                  name="checkmark-circle"
                                  size={16}
                                  color={themeColor(isDark, 'success')}
                                />
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <TouchableOpacity
                              disabled={!canEditCurrentTeam}
                              onPress={() => {
                                setEditingJerseyForId(player.id);
                                setTempJerseyValue(
                                  assignedItem?.jerseyNumber || pos.id
                                );
                              }}
                              className="bg-sunken border border-line px-1.5 py-0.5 rounded-md flex-row items-center gap-1"
                            >
                              <Text className="font-orbitron-bold text-[11px] text-ink-soft">
                                #{assignedItem?.jerseyNumber || pos.id}
                              </Text>
                              {canEditCurrentTeam && (
                                <Ionicons
                                  name="pencil"
                                  size={9}
                                  color={themeColor(isDark, 'ink-muted')}
                                />
                              )}
                            </TouchableOpacity>
                          )}

                          {/* Remove Player Button */}
                          {canEditCurrentTeam && (
                            <TouchableOpacity
                              onPress={() => handleRemoveFromRoster(player.id)}
                              className="w-6 h-6 rounded-md bg-danger-soft border border-danger-line items-center justify-center"
                            >
                              <Ionicons name="trash-outline" size={12} color={themeColor(isDark, 'danger')} />
                            </TouchableOpacity>
                          )}
                        </View>
                      ) : (
                        canEditCurrentTeam && (
                          <TouchableOpacity
                            onPress={() => handlePositionSlotClick(pos.id)}
                            className="bg-primary px-2.5 py-1 rounded-lg"
                          >
                            <Text className="font-orbitron-bold text-[10px] text-on-primary">
                              {isActivePos ? 'Active' : 'Assign'}
                            </Text>
                          </TouchableOpacity>
                        )
                      )}
                    </>
                  );

                  const slotClassName = `flex flex-row items-center gap-2.5 bg-card border rounded-xl py-1.5 px-3 ${
                    isDragOver
                      ? 'border-2 border-primary bg-primary-soft'
                      : isActivePos
                      ? 'border-2 border-primary bg-primary-soft'
                      : player
                      ? 'border-primary-line bg-primary-soft'
                      : 'border-line border-dashed'
                  }`;

                  if (Platform.OS === 'web') {
                    return (
                      <div
                        key={pos.id}
                        onDragEnter={(e: any) => handleDragEnterPosition(e, pos.id)}
                        onDragOver={(e: any) => handleDragOverPosition(e, pos.id)}
                        onDragLeave={(e: any) => handleDragLeavePosition(e)}
                        onDrop={(e: any) => handleDropOnPosition(e, pos.id)}
                        onClick={() => handlePositionSlotClick(pos.id)}
                        className={slotClassName}
                        style={{
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'center',
                          cursor: canEditCurrentTeam ? 'pointer' : 'default',
                        }}
                      >
                        {slotInner}
                      </div>
                    );
                  }

                  return (
                    <View key={pos.id} className={slotClassName}>
                      {slotInner}
                    </View>
                  );
                })}
              </View>
            </View>

            {/* RESERVES SECTION */}
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-2 px-1">
                <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-widest">
                  Reserves ({assignedReserves.length}
                  {maxReserves > 0 ? ` / ${maxReserves}` : ''})
                </Text>
                {canEditCurrentTeam &&
                  (maxReserves === 0 || assignedReserves.length < maxReserves) && (
                    <TouchableOpacity
                      onPress={handleReserveSectionClick}
                      className={`flex-row items-center gap-1 px-2.5 py-1 rounded-lg border ${
                        activeIsReserve
                          ? 'bg-warning border-warning'
                          : 'bg-warning-soft border-warning-line'
                      }`}
                    >
                      <Ionicons
                        name="add-circle"
                        size={14}
                        color={themeColor(isDark, activeIsReserve ? 'on-warning' : 'warning-ink')}
                      />
                      <Text
                        className={`font-orbitron-bold text-xs ${
                          activeIsReserve
                            ? 'text-on-warning'
                            : 'text-warning-ink'
                        }`}
                      >
                        {activeIsReserve ? 'Active Zone' : 'Add Reserve'}
                      </Text>
                    </TouchableOpacity>
                  )}
              </View>

              {Platform.OS === 'web' ? (
                <div
                  onDragEnter={handleDragEnterReserves}
                  onDragOver={handleDragOverReserves}
                  onDragLeave={handleDragLeaveReserves}
                  onDrop={handleDropOnReserves}
                  onClick={handleReserveSectionClick}
                  className={`bg-card border rounded-2xl p-3 ${
                    isDragOverReserves
                      ? 'border-2 border-warning bg-warning-soft'
                      : activeIsReserve
                      ? 'border-2 border-warning bg-warning-soft'
                      : 'border-line'
                  }`}
                  style={{ cursor: canEditCurrentTeam ? 'pointer' : 'default' }}
                >
                  {assignedReserves.length === 0 ? (
                    <div className="py-4 items-center justify-center border border-dashed border-line rounded-xl text-center">
                      <Text className="font-inter text-xs text-ink-muted italic">
                        {activeIsReserve
                          ? 'Click player on right to add as reserve...'
                          : 'No reserves assigned. Drag player here or click to assign.'}
                      </Text>
                    </div>
                  ) : (
                    <View className="gap-1.5">
                      {assignedReserves.map((res) => {
                        const player = availablePlayers.find(
                          (p) => p.id === res.orgProfileId || p.orgProfileId === res.orgProfileId
                        );
                        if (!player) return null;

                        return (
                          <div
                            key={player.id || res.orgProfileId}
                            draggable={canEditCurrentTeam}
                            onDragStart={(e: any) =>
                              handleDragStartPlayer(e, player.id || res.orgProfileId)
                            }
                            className="bg-sunken border border-warning-line rounded-xl py-1.5 px-2.5 flex-row items-center gap-2.5"
                            style={{
                              display: 'flex',
                              flexDirection: 'row',
                              alignItems: 'center',
                              cursor: canEditCurrentTeam ? 'grab' : 'default',
                              WebkitUserDrag: canEditCurrentTeam ? 'element' : 'none',
                              userSelect: 'none',
                            } as any}
                          >
                            <View
                              style={{ pointerEvents: 'none' }}
                              className="w-7 h-7 rounded-lg bg-warning-soft border border-warning-line items-center justify-center mr-2.5"
                            >
                              <Text className="font-orbitron-bold text-[9px] text-warning-ink">
                                RES
                              </Text>
                            </View>

                            <View style={{ pointerEvents: 'none' }} className="flex-1 min-w-0">
                              <Text className="font-inter-bold text-xs text-ink" numberOfLines={1}>
                                {player.name || player.orgProfileName}
                              </Text>
                            </View>

                            {/* Reserve Jersey Number & Actions */}
                            <View className="flex-row items-center gap-1.5">
                              {editingJerseyForId === player.id ? (
                                <View className="flex-row items-center bg-card rounded-md border border-line-strong px-1">
                                  <TextInput
                                    autoFocus
                                    keyboardType="numeric"
                                    value={tempJerseyValue}
                                    onChangeText={setTempJerseyValue}
                                    className="font-orbitron-bold text-xs text-ink w-8 text-center py-0.5"
                                  />
                                  <TouchableOpacity
                                    onPress={() =>
                                      handleSaveJerseyNumber(player.id, tempJerseyValue)
                                    }
                                    className="p-0.5"
                                  >
                                    <Ionicons
                                      name="checkmark-circle"
                                      size={16}
                                      color={themeColor(isDark, 'success')}
                                    />
                                  </TouchableOpacity>
                                </View>
                              ) : (
                                <TouchableOpacity
                                  disabled={!canEditCurrentTeam}
                                  onPress={() => {
                                    setEditingJerseyForId(player.id);
                                    setTempJerseyValue(res.jerseyNumber || '');
                                  }}
                                  className="bg-card border border-line px-1.5 py-0.5 rounded-md flex-row items-center gap-1"
                                >
                                  <Text className="font-orbitron-bold text-[11px] text-ink-soft">
                                    #{res.jerseyNumber || '—'}
                                  </Text>
                                  {canEditCurrentTeam && (
                                    <Ionicons
                                      name="pencil"
                                      size={9}
                                      color={themeColor(isDark, 'ink-muted')}
                                    />
                                  )}
                                </TouchableOpacity>
                              )}

                              {canEditCurrentTeam && (
                                <TouchableOpacity
                                  onPress={() => handleRemoveFromRoster(player.id)}
                                  className="w-6 h-6 rounded-md bg-danger-soft border border-danger-line items-center justify-center"
                                >
                                  <Ionicons name="trash-outline" size={12} color={themeColor(isDark, 'danger')} />
                                </TouchableOpacity>
                              )}
                            </View>
                          </div>
                        );
                      })}
                    </View>
                  )}
                </div>
              ) : (
                <View
                  className={`bg-card border rounded-2xl p-3 border-line`}
                >
                  {assignedReserves.length === 0 ? (
                    <TouchableOpacity
                      disabled={!canEditCurrentTeam}
                      onPress={handleReserveSectionClick}
                      className="py-4 items-center justify-center border border-dashed border-line rounded-xl"
                    >
                      <Text className="font-inter text-xs text-ink-muted italic">
                        {activeIsReserve
                          ? 'Click player on right to add as reserve...'
                          : 'No reserves assigned. Drag player here or click to assign.'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View className="gap-1.5">
                      {assignedReserves.map((res) => {
                        const player = availablePlayers.find(
                          (p) => p.id === res.orgProfileId || p.orgProfileId === res.orgProfileId
                        );
                        if (!player) return null;

                        return (
                          <View
                            key={player.id || res.orgProfileId}
                            className="bg-sunken border border-warning-line rounded-xl py-1.5 px-2.5 flex-row items-center gap-2.5"
                          >
                            <View className="w-7 h-7 rounded-lg bg-warning-soft border border-warning-line items-center justify-center">
                              <Text className="font-orbitron-bold text-[9px] text-warning-ink">
                                RES
                              </Text>
                            </View>

                            <View className="flex-1 min-w-0">
                              <Text className="font-inter-bold text-xs text-ink" numberOfLines={1}>
                                {player.name || player.orgProfileName}
                              </Text>
                            </View>

                            <View className="flex-row items-center gap-1.5">
                              {editingJerseyForId === player.id ? (
                                <View className="flex-row items-center bg-card rounded-md border border-line-strong px-1">
                                  <TextInput
                                    autoFocus
                                    keyboardType="numeric"
                                    value={tempJerseyValue}
                                    onChangeText={setTempJerseyValue}
                                    className="font-orbitron-bold text-xs text-ink w-8 text-center py-0.5"
                                  />
                                  <TouchableOpacity
                                    onPress={() =>
                                      handleSaveJerseyNumber(player.id, tempJerseyValue)
                                    }
                                    className="p-0.5"
                                  >
                                    <Ionicons
                                      name="checkmark-circle"
                                      size={16}
                                      color={themeColor(isDark, 'success')}
                                    />
                                  </TouchableOpacity>
                                </View>
                              ) : (
                                <TouchableOpacity
                                  disabled={!canEditCurrentTeam}
                                  onPress={() => {
                                    setEditingJerseyForId(player.id);
                                    setTempJerseyValue(res.jerseyNumber || '');
                                  }}
                                  className="bg-card border border-line px-1.5 py-0.5 rounded-md flex-row items-center gap-1"
                                >
                                  <Text className="font-orbitron-bold text-[11px] text-ink-soft">
                                    #{res.jerseyNumber || '—'}
                                  </Text>
                                  {canEditCurrentTeam && (
                                    <Ionicons
                                      name="pencil"
                                      size={9}
                                      color={themeColor(isDark, 'ink-muted')}
                                    />
                                  )}
                                </TouchableOpacity>
                              )}

                              {canEditCurrentTeam && (
                                <TouchableOpacity
                                  onPress={() => handleRemoveFromRoster(player.id)}
                                  className="w-6 h-6 rounded-md bg-danger-soft border border-danger-line items-center justify-center"
                                >
                                  <Ionicons name="trash-outline" size={12} color={themeColor(isDark, 'danger')} />
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>

          {/* RIGHT COLUMN: AVAILABLE TEAM ROSTER (DESKTOP/TABLET ONLY) */}
          {isDesktop && (
            Platform.OS === 'web' ? (
              <div
                onDragEnter={handleDragEnterAvailable}
                onDragOver={handleDragOverAvailable}
                onDragLeave={handleDragLeaveAvailable}
                onDrop={handleDropOnAvailable}
                className={`w-80 lg:w-96 shrink-0 bg-card border rounded-2xl p-4 shadow-sm self-stretch ${
                  isDragOverAvailable
                    ? 'border-2 border-danger bg-danger-soft'
                    : 'border-line'
                }`}
                style={{ minHeight: Math.max(450, height - 240) }}
              >
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-widest">
                    Available Roster ({availablePlayers.length})
                  </Text>
                  {activePlayerId && (
                    <View className="bg-primary-soft px-2 py-0.5 rounded border border-primary-line">
                      <Text className="font-orbitron-bold text-[10px] text-primary-ink">1 Selected</Text>
                    </View>
                  )}
                </View>

                {/* Roster Search Input */}
                <View className="flex-row items-center bg-sunken rounded-xl px-3 py-2 border border-line mb-3">
                  <Ionicons name="search" size={14} color={themeColor(isDark, 'ink-muted')} />
                  <TextInput
                    placeholder="Search team members..."
                    placeholderTextColor={themeColor(isDark, 'ink-muted')}
                    value={rosterSearch}
                    onChangeText={setRosterSearch}
                    className="flex-1 font-inter text-xs text-ink ml-2"
                  />
                </View>

                {/* Available Player Cards List */}
                <View className="gap-1.5">
                  {sortedAvailablePlayers
                    .filter((p) =>
                      (p.name || p.orgProfileName || '')
                        .toLowerCase()
                        .includes(rosterSearch.toLowerCase())
                    )
                    .map((player) => {
                      const pId = player.id || player.orgProfileId;
                      const rosterItem = roster.find(
                        (r) => r.orgProfileId === pId
                      );
                      const isAssigned = !!rosterItem;
                      const isActiveCard = activePlayerId === pId;

                      const cardClassName = `flex-row items-center py-1.5 px-2.5 rounded-xl border ${
                        isActiveCard
                          ? 'bg-primary-soft border-2 border-primary'
                          : isAssigned
                          ? 'bg-sunken border-line opacity-60'
                          : 'bg-card border-line'
                      }`;

                      return (
                        <div
                          key={pId}
                          draggable={!isAssigned && canEditCurrentTeam}
                          onDragStart={(e: any) => handleDragStartPlayer(e, pId)}
                          onClick={() => handleAvailablePlayerClick(pId, isAssigned)}
                          className={cardClassName}
                          style={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            cursor: !isAssigned && canEditCurrentTeam ? 'grab' : 'default',
                            WebkitUserDrag: !isAssigned && canEditCurrentTeam ? 'element' : 'none',
                            userSelect: 'none',
                          } as any}
                        >
                          <View
                            style={{ pointerEvents: 'none' }}
                            className="w-7 h-7 rounded-full bg-sunken items-center justify-center border border-line mr-2"
                          >
                            <Ionicons name="person" size={12} color={themeColor(isDark, 'ink-muted')} />
                          </View>

                          <View
                            style={{ pointerEvents: 'none' }}
                            className="flex-1 min-w-0"
                          >
                            <Text
                              className={`font-inter-bold text-xs ${
                                isAssigned
                                  ? 'text-ink-muted'
                                  : 'text-ink'
                              }`}
                              numberOfLines={1}
                            >
                              {player.name || player.orgProfileName}
                            </Text>
                          </View>

                          {/* Allocation Status Badge */}
                          {isAssigned ? (
                            <View
                              className={`px-1.5 py-0.5 rounded ${
                                rosterItem?.isReserve
                                  ? 'bg-warning-soft border border-warning-line'
                                  : 'bg-primary-soft border border-primary-line'
                              }`}
                            >
                              <Text
                                className={`font-orbitron-bold text-[9px] ${
                                  rosterItem?.isReserve
                                    ? 'text-warning-ink'
                                    : 'text-primary-ink'
                                }`}
                              >
                                {rosterItem?.isReserve
                                  ? 'RES'
                                  : `POS ${rosterItem?.position}`}
                              </Text>
                            </View>
                          ) : (
                            <Ionicons
                              name={isActiveCard ? 'checkmark-circle' : 'add-circle-outline'}
                              size={16}
                              color={isActiveCard ? themeColor(isDark, 'primary') : themeColor(isDark, 'ink-muted')}
                            />
                          )}
                        </div>
                      );
                    })}
                </View>
              </div>
            ) : (
              <View
                className="w-80 lg:w-96 shrink-0 bg-card border border-line rounded-2xl p-4 shadow-sm self-stretch"
                style={{ minHeight: Math.max(450, height - 240) }}
              >
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-widest">
                    Available Roster ({availablePlayers.length})
                  </Text>
                  {activePlayerId && (
                    <View className="bg-primary-soft px-2 py-0.5 rounded border border-primary-line">
                      <Text className="font-orbitron-bold text-[10px] text-primary-ink">1 Selected</Text>
                    </View>
                  )}
                </View>

                {/* Roster Search Input */}
                <View className="flex-row items-center bg-sunken rounded-xl px-3 py-2 border border-line mb-3">
                  <Ionicons name="search" size={14} color={themeColor(isDark, 'ink-muted')} />
                  <TextInput
                    placeholder="Search team members..."
                    placeholderTextColor={themeColor(isDark, 'ink-muted')}
                    value={rosterSearch}
                    onChangeText={setRosterSearch}
                    className="flex-1 font-inter text-xs text-ink ml-2"
                  />
                </View>

                {/* Available Player Cards List */}
                <View className="gap-1.5">
                  {sortedAvailablePlayers
                    .filter((p) =>
                      (p.name || p.orgProfileName || '')
                        .toLowerCase()
                        .includes(rosterSearch.toLowerCase())
                    )
                    .map((player) => {
                      const pId = player.id || player.orgProfileId;
                      const rosterItem = roster.find(
                        (r) => r.orgProfileId === pId
                      );
                      const isAssigned = !!rosterItem;
                      const isActiveCard = activePlayerId === pId;

                      return (
                        <TouchableOpacity
                          key={pId}
                          disabled={!canEditCurrentTeam}
                          onPress={() => handleAvailablePlayerClick(pId, isAssigned)}
                          className={`flex-row items-center py-1.5 px-2.5 rounded-xl border ${
                            isActiveCard
                              ? 'bg-primary-soft border-2 border-primary'
                              : isAssigned
                              ? 'bg-sunken border-line opacity-60'
                              : 'bg-card border-line'
                          }`}
                        >
                          <View className="w-7 h-7 rounded-full bg-sunken items-center justify-center border border-line mr-2">
                            <Ionicons name="person" size={12} color={themeColor(isDark, 'ink-muted')} />
                          </View>

                          <View className="flex-1 min-w-0">
                            <Text
                              className={`font-inter-bold text-xs ${
                                isAssigned
                                  ? 'text-ink-muted'
                                  : 'text-ink'
                              }`}
                              numberOfLines={1}
                            >
                              {player.name || player.orgProfileName}
                            </Text>
                          </View>

                          {isAssigned ? (
                            <View
                              className={`px-1.5 py-0.5 rounded ${
                                rosterItem?.isReserve
                                  ? 'bg-warning-soft border border-warning-line'
                                  : 'bg-primary-soft border border-primary-line'
                              }`}
                            >
                              <Text
                                className={`font-orbitron-bold text-[9px] ${
                                  rosterItem?.isReserve
                                    ? 'text-warning-ink'
                                    : 'text-primary-ink'
                                }`}
                              >
                                {rosterItem?.isReserve
                                  ? 'RES'
                                  : `POS ${rosterItem?.position}`}
                              </Text>
                            </View>
                          ) : (
                            <Ionicons
                              name={isActiveCard ? 'checkmark-circle' : 'add-circle-outline'}
                              size={16}
                              color={isActiveCard ? themeColor(isDark, 'primary') : themeColor(isDark, 'ink-muted')}
                            />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                </View>
              </View>
            )
          )}

        </View>
        )}
      </ScrollView>

      {/* Sticky Bottom Action Bar */}
      {isDirty && canEditCurrentTeam && (
        <View className="bg-card border-t border-line p-3 gap-2">
          {saveBlockedBy ? (
            <Text testID="save-blocked" className="font-inter text-xs text-warning-ink text-center">
              Cannot save yet: {saveBlockedBy}.
            </Text>
          ) : incomingRoster.newer ? (
            <Text className="font-inter text-xs text-warning-ink text-center" accessibilityLiveRegion="polite">
              {CHANGED_ELSEWHERE_CHECKED_NOTICE}
            </Text>
          ) : null}
          <View className="flex-row gap-3">
          <TouchableOpacity
            disabled={isSaving}
            onPress={handleCancel}
            className="flex-1 py-3 rounded-xl border border-line-strong items-center"
          >
            <Text className="font-orbitron-bold text-xs text-ink-soft">
              Cancel
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={isSaving || !!saveBlockedBy}
            onPress={() => handleSave()}
            className={`flex-1 py-3 rounded-xl bg-primary items-center flex-row justify-center gap-2 ${saveBlockedBy ? 'opacity-50' : ''}`}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={themeColor(isDark, 'on-primary')} />
            ) : (
              <>
                <Ionicons name="save-outline" size={16} color={themeColor(isDark, 'on-primary')} />
                <Text className="font-orbitron-bold text-xs text-on-primary">
                  Save Lineup
                </Text>
              </>
            )}
          </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Saved by someone else after this sheet was opened (`SYNC-11`). */}
      <EditConflictModal
        isOpen={!!sheetConflict && sheetConflict.participantId === currentParticipant?.id}
        message={sheetConflict?.message ?? ''}
        rows={sheetConflictRows}
        onShowTheirs={handleShowTheirSheet}
        // The same sheet again, now picked over the one just reported as saved.
        onSaveAnyway={() => handleSave(theirSheet)}
        onClose={() => setSheetConflict(null)}
        isProcessing={isSaving}
      />

      {/* MOBILE PLAYER PICKER BOTTOM SHEET MODAL (FOR PHONES) */}
      <Modal
        visible={isMobilePickerOpen && !isDesktop}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setIsMobilePickerOpen(false);
          setActivePositionId(null);
          setActiveIsReserve(false);
        }}
      >
        <View className="flex-1 bg-overlay/60 justify-end">
          <View className="bg-card rounded-t-3xl p-4 shadow-lg" style={{ height: '75%', maxHeight: '85%' }}>
            {/* Modal Header */}
            <View className="flex-row items-center justify-between pb-3 border-b border-line">
              <View>
                <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-widest">
                  Assigning Player
                </Text>
                <Text className="font-orbitron-bold text-lg text-ink">
                  {activeIsReserve
                    ? 'Reserve Player'
                    : `Position ${activePositionId} • ${
                        positions.find((p) => p.id === activePositionId)?.name ||
                        ''
                      }`}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setIsMobilePickerOpen(false);
                  setActivePositionId(null);
                  setActiveIsReserve(false);
                }}
                className="w-8 h-8 rounded-full bg-sunken items-center justify-center"
              >
                <Ionicons name="close" size={18} color={themeColor(isDark, 'ink-muted')} />
              </TouchableOpacity>
            </View>

            {/* Instant Search Bar */}
            <View className="my-3 flex-row items-center bg-sunken rounded-xl px-3 py-2 border border-line">
              <Ionicons name="search" size={16} color={themeColor(isDark, 'ink-muted')} />
              <TextInput
                autoFocus
                placeholder="Search team players..."
                placeholderTextColor={themeColor(isDark, 'ink-muted')}
                value={pickerSearch}
                onChangeText={setPickerSearch}
                className="flex-1 font-inter text-sm text-ink ml-2"
              />
            </View>

            {/* Player List */}
            <ScrollView className="flex-1">
              {(() => {
                const filtered = sortedAvailablePlayers.filter((p) =>
                  (p.name || p.orgProfileName || '')
                    .toLowerCase()
                    .includes(pickerSearch.toLowerCase())
                );

                if (filtered.length === 0) {
                  return (
                    <View className="py-12 items-center justify-center">
                      <Ionicons name="people-outline" size={40} color={themeColor(isDark, 'ink-muted')} />
                      <Text className="font-inter-medium text-sm text-ink-muted mt-3 text-center">
                        {pickerSearch
                          ? 'No matching players found'
                          : 'No available players found in roster'}
                      </Text>
                    </View>
                  );
                }

                return filtered.map((player) => {
                  const pId = player.id || player.orgProfileId;
                  const rosterItem = roster.find(
                    (r) => r.orgProfileId === pId
                  );
                  const isAssigned = !!rosterItem;

                  return (
                    <TouchableOpacity
                      key={pId}
                      activeOpacity={0.8}
                      onPress={() =>
                        handleAssignPlayerToSlot(
                          pId,
                          activePositionId || undefined,
                          activeIsReserve
                        )
                      }
                      className={`flex-row items-center p-3 rounded-xl mb-1 border ${
                        isAssigned
                          ? 'bg-sunken border-line opacity-60'
                          : 'bg-card border-line-soft'
                      }`}
                    >
                      <View className="w-10 h-10 rounded-full bg-sunken items-center justify-center border border-line mr-3">
                        <Ionicons
                          name="person"
                          size={18}
                          color={themeColor(isDark, 'ink-muted')}
                        />
                      </View>

                      <View className="flex-1">
                        <Text className="font-inter-bold text-sm text-ink">
                          {player.name || player.orgProfileName}
                        </Text>
                      </View>

                      {isAssigned && (
                        <View className="bg-line px-2 py-1 rounded-lg">
                          <Text className="font-orbitron-bold text-[10px] text-ink-soft">
                            {rosterItem?.isReserve
                              ? 'RES'
                              : `POS ${rosterItem?.position}`}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                });
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
