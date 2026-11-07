import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Game, GameEvent, GameDispute, Sport, getPeriodLabel, SocketAction, captureEventLabels, findOutcome, getTriggerFor, hasOutcomes, isScoringTemplate, reasonRequiresPlayer, TriggerTeam } from '@sk/shared';
import { wsService } from '../../../services/websocket';
import { useRoom } from '../../../hooks/useLiveRoom';
import { RoomFailure } from '../../RoomFailure';
import { readData, ReadResult } from '../../../services/reads';
import { newRequestId, requestKeyFor, sendAction } from '../../../services/actions';
import { getLiveElapsedMS } from '../../../hooks/useGameTimer';
import { useAuthStore } from '../../../store/authStore';
import { useSportStore } from '../../../store/sportStore';
import { useWsStore } from '../../../store/wsStore';
import { ConfirmationModal } from '../../ConfirmationModal';
import { ReadFailure } from '../../ReadFailure';
import { getUndoExpiryMs, getUndoNowMs } from '../../../utils/undoWindow';
import { actingProfileId } from '../../../utils/actingProfile';

const resolveOrgProfileId = (game: Game): string | null => {
  const user = useAuthStore.getState().user;
  const orgMemberships = useAuthStore.getState().orgMemberships || [];
  if (!user) return null;

  // The caller's own profile for this game: system, official, team, organisation (`PERM-12`).
  return actingProfileId(game as any) || null;
};

/**
 * The `section` a template names, matching the `id` of one of the sport's `eventSections`.
 *
 * This was a fixed union of four panel names, with `Scoring` carrying the extra meaning "this
 * event changes the score". Both are per-sport data now: the sport declares its sections and
 * which of them affect the score, so a section is just an id here and
 * {@link isScoringTemplate} answers the scoring question.
 */
export type ScoringSection = string;

export interface EventTemplateItem {
  id: string;
  name: string;
  mobileLabel?: string;
  section: ScoringSection;
  points?: number;
  steps?: any[];
  triggerEventId?: string;
  pendingOutcomeLabel?: string;
}

/** The screen's reads that can fail, in the order a note names them, and what each is called there. */
type ScoringRead = 'sport' | 'events' | 'rosters' | 'disputes' | 'teams';
const SCORING_READS: ScoringRead[] = ['sport', 'events', 'rosters', 'disputes', 'teams'];
const SCORING_READ_NAMES: Record<ScoringRead, string> = {
  sport: 'The scoring options',
  events: 'Match events',
  rosters: 'The team sheets',
  disputes: 'Open disputes',
  teams: 'The team names',
};

/** "Match events", "Match events and the team sheets": the start of one sentence. */
const namesOf = (reads: ScoringRead[]) => {
  const names = reads.map((read, i) => {
    const name = SCORING_READ_NAMES[read];
    return i ? name[0].toLowerCase() + name.slice(1) : name;
  });
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
};

/** The server always answers a team sheet with a list, and with `null` only when reading it threw. */
const UNREADABLE_SHEET = 'The server could not read the team sheet.';

interface DynamicScoringContextType {
  /** What did not load and why, as one note: `null` when everything on screen is what the server said. */
  readFailure: { what: string; reason: string } | null;
  /** The match's live rooms, for `ScoringReadNote` to say when they do not arrive (`LIVE-25`). */
  liveRooms: (string | null)[];
  /** Each read's own failure, so that a list can say it did not load rather than that it is empty. */
  eventsError: string | null;
  rostersError: string | null;
  /** Asks again for whatever failed, and only that. */
  retryReads: () => void;
  game: Game;
  homeTeam?: any;
  awayTeam?: any;
  homeRoster: any[];
  awayRoster: any[];
  isLoadingRosters: boolean;
  events: GameEvent[];
  isLoadingEvents: boolean;
  disputes: GameDispute[];
  sport?: Sport;
  profileMap: { [profileId: string]: string };
  templates: EventTemplateItem[];
  scoringState: {
    status: 'IDLE' | 'ACTIVE';
    templateId?: string;
    side?: 'home' | 'away';
    editingId?: string;
    initialData?: any;
  };
  startDynamicFlow: (templateId: string, side: 'home' | 'away', initialData?: any) => void;
  cancelDynamicFlow: () => void;
  submitEvent: (eventPayload: any) => void;
  removeGameEvent: (eventId: string) => void;
  initiateUndoVote: (eventId: string) => void;
  updateFinalScore: (scores: { [participantId: string]: number }) => Promise<void>;
}

const DynamicScoringContext = createContext<DynamicScoringContextType | null>(null);

/**
 * `spectator`: the public game page's match events (`FIX-39`, 2026-10-22). It reads only what is
 * public — the scoring feed and the team sheets — and leaves out the full record, the open disputes
 * and the team's members, which an anonymous socket is refused.
 *
 * **A failed read changes nothing and interrupts nobody (`SYNC-9`).** Scoring goes on at a ground on a
 * poor connection, so a failed read keeps what is held, is never cached, and adds to one quiet note
 * with a *Try again* — no dialog. The note sits above the children, unless `showReadNote` is false
 * because the screen places {@link ScoringReadNote} itself. A connection coming back asks again.
 */
export function DynamicScoringProvider({ game, spectator = false, showReadNote = true, children }: { game: Game; spectator?: boolean; showReadNote?: boolean; children: React.ReactNode }) {
  // A team's members fill names a team sheet lacks, or stand in for one: the members' read only.
  const readTeamMembers = (teamId: string, stillWanted: () => boolean): Promise<ReadResult<any[]>> =>
    spectator
      ? Promise.resolve({ ok: true, data: [] })
      : readData<any[]>('team_members', { teamId, gameId: game.id }, { suppressToast: true, stillWanted });
  const isConnected = useWsStore((state: any) => state.isConnected);
  const [failedReads, setFailedReads] = useState<Partial<Record<ScoringRead, string>>>({});
  const [attempts, setAttempts] = useState<Record<ScoringRead, number>>({ sport: 0, events: 0, rosters: 0, disputes: 0, teams: 0 });
  /** Records how a read ended: its failure, or `null` once it has been answered. */
  const noteRead = (read: ScoringRead, failure: string | null) => setFailedReads(prev => {
    if ((prev[read] ?? null) === failure) return prev;
    const next = { ...prev };
    if (failure) next[read] = failure; else delete next[read];
    return next;
  });
  const retryReads = () => {
    const failed = Object.keys(failedReads) as ScoringRead[];
    if (!failed.length) return;
    setAttempts(prev => {
      const next = { ...prev };
      failed.forEach(read => { next[read]++; });
      return next;
    });
  };
  // The request scope of the event being captured — see the ADD_GAME_EVENT send below.
  const addRequestScope = useRef(newRequestId());
  const [scoringState, setScoringState] = useState<DynamicScoringContextType['scoringState']>({
    status: 'IDLE',
  });
  const [homeTeam, setHomeTeam] = useState<any>(null);
  const [awayTeam, setAwayTeam] = useState<any>(null);
  const [homeRoster, setHomeRoster] = useState<any[]>([]);
  const [awayRoster, setAwayRoster] = useState<any[]>([]);
  const [isLoadingRosters, setIsLoadingRosters] = useState<boolean>(true);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(true);
  const [disputes, setDisputes] = useState<GameDispute[]>([]);
  const [sport, setSport] = useState<Sport | undefined>(() => {
    const resolvedSportId = (game.sportId || game.customSettings?.sportId || '').replace(/^sport-/, '');
    return resolvedSportId ? useSportStore.getState().getCachedSport(resolvedSportId) : undefined;
  });
  const [profileMap, setProfileMap] = useState<{ [profileId: string]: string }>({});
  const [updateDisputeTarget, setUpdateDisputeTarget] = useState<{
    gameId: string;
    eventId: string;
    initiatorId: string;
    updateData: any;
    eventName: string;
  } | null>(null);
  const [undoDisputeTarget, setUndoDisputeTarget] = useState<{
    eventId: string;
    eventName: string;
  } | null>(null);

  const homeParticipantId = game.participants?.[0]?.id;
  const awayParticipantId = game.participants?.[1]?.id;
  const homeTeamId = game.participants?.[0]?.teamId;
  const awayTeamId = game.participants?.[1]?.teamId;

  // 1. WebSocket room subscriptions — three datasets, three rooms (rule 4). Open disputes left
  // `game:{id}:events` on 2026-09-11; a screen wanting only the scoring feed no longer receives
  // them, and this one wants both so it holds both.
  // Held with their status (`LIVE-25`); `handleSocketUpdate` below reads their messages.
  // rooms-ok: said by ScoringReadNote, from `liveRooms`
  const eventsRoom = useRoom(game.id ? `game:${game.id}:events` : null);
  // rooms-ok: said by ScoringReadNote, from `liveRooms`
  const gameRoom = useRoom(game.id ? `game:${game.id}` : null, undefined, { enabled: !spectator });
  // rooms-ok: said by ScoringReadNote, from `liveRooms`
  const disputesRoom = useRoom(game.id ? `game:${game.id}:disputes` : null, undefined, { enabled: !spectator });
  const liveRooms = [eventsRoom.room, gameRoom.room, disputesRoom.room];

  // The connection coming back asks again for whatever failed while it was away.
  useEffect(() => {
    if (isConnected) retryReads();
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Fetch general team objects
  useEffect(() => {
    let active = true;
    const sides: [string | undefined, (team: any) => void][] = [[homeTeamId, setHomeTeam], [awayTeamId, setAwayTeam]];
    void Promise.all(sides.map(async ([id, setTeam]) => {
      if (!id) return null;
      const result = await readData<any>('team', { id }, { suppressToast: true, stillWanted: () => active });
      if (!result.ok) return result.message;
      if (active && result.data) setTeam(result.data);
      return null;
    })).then(failures => {
      if (active) noteRead('teams', failures.find(Boolean) || null);
    });
    return () => { active = false; };
  }, [homeTeamId, awayTeamId, attempts.teams]);

  // 3. Fetch sport definition
  useEffect(() => {
    let active = true;
    const options = { suppressToast: true, stillWanted: () => active };
    let resolvedSportId = (game.sportId || game.customSettings?.sportId || '').replace(/^sport-/, '');

    // Only an answer says the sport is missing; a failed read leaves the cache and the sport held.
    const readSport = async (id: string, missing: string) => {
      const result = await readData<Sport | null>('sport', { id }, options);
      if (!active) return;
      if (!result.ok) { noteRead('sport', result.message); return; }
      noteRead('sport', null);
      if (result.data) {
        setSport(result.data);
        useSportStore.getState().setCachedSport(result.data);
      } else {
        setErrorMessage(missing);
      }
    };

    if (resolvedSportId) {
      void readSport(resolvedSportId, `Failed to load sport definition for sport ID "${resolvedSportId}". Please ensure the sport configuration is properly seeded.`);
    } else if (game.eventId) {
      void readData<any>('event', { id: game.eventId }, options).then(result => {
        if (!active) return;
        if (!result.ok) { noteRead('sport', result.message); return; }
        const eventSportId = (result.data?.sportIds?.[0] || '').replace(/^sport-/, '');
        if (eventSportId) {
          void readSport(eventSportId, `Failed to load sport definition for event sport ID "${eventSportId}".`);
        } else {
          noteRead('sport', null);
          setErrorMessage(`Game ${game.id} has no associated sportId or parent event sport configuration.`);
        }
      });
    } else {
      setErrorMessage(`Game ${game.id} has no sportId configured.`);
    }
    return () => { active = false; };
  }, [game.sportId, game.customSettings?.sportId, game.eventId, attempts.sport]);

  // 4. Fetch active disputes
  useEffect(() => {
    if (spectator) return;
    let active = true;
    void readData<GameDispute[]>('active_disputes', { id: game.id }, { suppressToast: true, stillWanted: () => active }).then(result => {
      if (!active) return;
      noteRead('disputes', result.ok ? null : result.message);
      if (result.ok && Array.isArray(result.data)) {
        setDisputes(result.data.filter((d: any) => !d.status || d.status === 'OPEN'));
      }
    });
    return () => { active = false; };
  }, [game.id, attempts.disputes]);

  // 5. Fetch game events
  useEffect(() => {
    let active = true;
    // Trying again does not hide what has arrived from the room in the meantime.
    if (!attempts.events || !events.length) setIsLoadingEvents(true);
    void readData<GameEvent[]>('game_events', { id: game.id }, { suppressToast: true, stillWanted: () => active }).then(result => {
      if (!active) return;
      noteRead('events', result.ok ? null : result.message);
      if (result.ok && result.data && Array.isArray(result.data)) {
        const sorted = [...result.data].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setEvents(sorted);
      }
      setIsLoadingEvents(false);
    });
    return () => { active = false; };
  }, [game.id, attempts.events]);

  // 6. Fetch Roster and Member data
  useEffect(() => {
    let active = true;
    const stillWanted = () => active;
    let activeFetches = 0;
    let failure: string | null = null;

    const settled = () => {
      activeFetches--;
      if (activeFetches === 0) {
        setIsLoadingRosters(false);
        noteRead('rosters', failure);
      }
    };

    const readSide = async (teamId: string | undefined, participantId: string, setRoster: (roster: any[]) => void) => {
      const sheet = await readData<any[]>('game_roster', { id: participantId }, { suppressToast: true, stillWanted });
      if (!active) return;
      // Not knowing the sheet is not having none: the whole team must not stand in for it.
      if (!sheet.ok || !Array.isArray(sheet.data)) {
        failure = sheet.ok ? UNREADABLE_SHEET : sheet.message;
        settled();
        return;
      }

      if (sheet.data.length > 0) {
        const sorted = [...sheet.data].sort((a, b) => (parseInt(a.position) || 999) - (parseInt(b.position) || 999));
        setRoster(sorted);
        settled();

        if (teamId) {
          const members = await readTeamMembers(teamId, stillWanted);
          if (!active) return;
          if (!members.ok) {
            // The sheet stands. It only matters if it has names still to fill.
            if (sorted.some((item: any) => !item.name && !item.orgProfileName)) {
              failure = members.message;
              noteRead('rosters', failure);
            }
            return;
          }
          if (Array.isArray(members.data) && members.data.length > 0) {
            const memberMap = new Map(
              members.data.map((m: any) => [m.orgProfileId || m.id, m.name || m.orgProfileName])
            );
            const enriched = sorted.map((item: any) => ({
              ...item,
              name: item.name || item.orgProfileName || memberMap.get(item.orgProfileId) || item.name,
            }));
            setRoster(enriched);
          }
        }
      } else if (teamId) {
        const members = await readTeamMembers(teamId, stillWanted);
        if (!active) return;
        if (!members.ok) {
          failure = members.message;
        } else if (Array.isArray(members.data) && members.data.length > 0) {
          const fallback = members.data.map((m: any) => ({
            id: m.orgProfileId || m.id,
            orgProfileId: m.orgProfileId || m.id,
            name: m.name || m.orgProfileName,
            position: m.position,
            isReserve: false,
          }));
          setRoster(fallback);
        } else {
          setRoster([]);
        }
        settled();
      } else {
        setRoster([]);
        settled();
      }
    };

    if (homeParticipantId) activeFetches++;
    if (awayParticipantId) activeFetches++;
    // Trying again does not hide the sheets that are held.
    if (activeFetches && (!attempts.rosters || !homeRoster.length || !awayRoster.length)) setIsLoadingRosters(true);
    if (!activeFetches) setIsLoadingRosters(false);
    if (homeParticipantId) void readSide(homeTeamId, homeParticipantId, setHomeRoster);
    if (awayParticipantId) void readSide(awayTeamId, awayParticipantId, setAwayRoster);

    return () => { active = false; };
  }, [game.id, homeParticipantId, awayParticipantId, homeTeamId, awayTeamId, attempts.rosters]);

  // 7. Derive profileMap from rosters
  useEffect(() => {
    const nextMap: { [profileId: string]: string } = {};
    const processRoster = (r: any[]) => {
      r.forEach((item) => {
        const pid = item.orgProfileId || item.profileId || item.id;
        const name = item.name || item.profile?.name || item.displayName || item.orgProfileName;
        if (pid && name) {
          nextMap[pid] = name;
        }
      });
    };
    processRoster(homeRoster);
    processRoster(awayRoster);
    setProfileMap(nextMap);
  }, [homeRoster, awayRoster]);

  // 8. WebSocket updates handler
  useEffect(() => {
    const handleSocketUpdate = (evt: { type: string; data: any }) => {
      if (!evt) return;

      const targetGameId = evt.data?.gameId || evt.data?.id;

      // GAME_ROSTER_UPDATED
      if (evt.type === 'GAME_ROSTER_UPDATED' && evt.data?.participantId) {
        if (Array.isArray(evt.data.items)) {
          const sorted = [...evt.data.items].sort(
            (a, b) => (parseInt(a.position) || 999) - (parseInt(b.position) || 999)
          );
          if (evt.data.participantId === homeParticipantId) {
            setHomeRoster((prev) => {
              const memberMap = new Map(prev.map((item) => [item.orgProfileId || item.id, item.name]));
              return sorted.map((item) => ({
                ...item,
                name: item.name || memberMap.get(item.orgProfileId || item.id) || item.name,
              }));
            });
          } else if (evt.data.participantId === awayParticipantId) {
            setAwayRoster((prev) => {
              const memberMap = new Map(prev.map((item) => [item.orgProfileId || item.id, item.name]));
              return sorted.map((item) => ({
                ...item,
                name: item.name || memberMap.get(item.orgProfileId || item.id) || item.name,
              }));
            });
          }
        }
      }

      // GAME_EVENT_* updates
      if (evt.type === 'GAME_RESET' || evt.type === 'RESET_GAME') {
        if (!targetGameId || targetGameId === game.id) {
          setEvents([]);
        }
      } else if (evt.type === 'GAME_EVENTS_SYNC') {
        if (!targetGameId || targetGameId === game.id) {
          const syncEvents = Array.isArray(evt.data) ? evt.data : evt.data?.events;
          if (Array.isArray(syncEvents)) {
            // The room has handed over the whole feed, so a failed read of it no longer matters.
            noteRead('events', null);
            const sorted = [...syncEvents].sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
            setEvents(sorted);
          }
        }
      } else if (evt.type === 'GAME_EVENT_ADDED' && evt.data?.gameId === game.id) {
        setEvents((prev) => {
          if (!evt.data?.id) return prev;
          const exists = prev.some((e) => e.id === evt.data.id);
          if (exists) {
            return prev.map((e) => (e.id === evt.data.id ? evt.data : e));
          }
          return [evt.data, ...prev].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
        });
      } else if (evt.type === 'GAME_EVENT_UPDATED' && evt.data?.gameId === game.id) {
        setEvents((prev) =>
          prev.map((e) => (e.id === evt.data.id ? evt.data : e)).sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )
        );
      } else if ((evt.type === 'GAME_EVENT_REMOVED' || evt.type === 'UNDO_GAME_EVENT') && evt.data) {
        const targetId = evt.data.id || evt.data.eventId;
        setEvents((prev) => prev.filter((e) => e.id !== targetId));
      } else if (evt.type === 'GAME_EVENTS_BATCH_UPDATED' && Array.isArray(evt.data)) {
        setEvents((prev) => {
          let updated = [...prev];
          for (const item of evt.data) {
            if (!item || !item.id) continue;
            const itemStatus = item.eventData?.status || item.event_data?.status;
            if (itemStatus === 'REMOVED') {
              updated = updated.filter((e) => e.id !== item.id);
            } else {
              const idx = updated.findIndex((e) => e.id === item.id);
              if (idx > -1) {
                updated[idx] = item;
              } else {
                updated.push(item);
              }
            }
          }
          return updated.sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
        });
      }

      // DISPUTE_* updates
      if (evt.type === 'DISPUTE_STARTED' && evt.data?.dispute) {
        setDisputes((prev) => [evt.data.dispute, ...prev.filter((d) => d.id !== evt.data.dispute.id)]);
      } else if (evt.type === 'DISPUTE_VOTE_UPDATED' && evt.data?.dispute) {
        const dispute = evt.data.dispute;
        if (dispute.status && dispute.status !== 'OPEN') {
          setDisputes((prev) => prev.filter((d) => d.id !== dispute.id));
        } else {
          setDisputes((prev) => prev.map((d) => (d.id === dispute.id ? { ...d, ...dispute } : d)));
        }
      } else if (evt.type === 'DISPUTE_RESOLVED') {
        const resolvedId = evt.data?.disputeId || evt.data?.dispute?.id || evt.data?.id;
        if (resolvedId) {
          setDisputes((prev) => prev.filter((d) => d.id !== resolvedId));
        }
      } else if (evt.type === 'ACTIVE_DISPUTES_SYNC' && Array.isArray(evt.data)) {
        noteRead('disputes', null);
        setDisputes(evt.data.filter((d: any) => !d.status || d.status === 'OPEN'));
      }
    };

    wsService.on('update', handleSocketUpdate);
    return () => {
      wsService.off('update', handleSocketUpdate);
    };
  }, [game.id, homeParticipantId, awayParticipantId]);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const templates: EventTemplateItem[] = (sport?.eventTemplates || []) as EventTemplateItem[];

  // A sport or team that is held, as from the cache, is all the screen needs of a read that failed.
  const unread = SCORING_READS.filter(read => {
    if (!failedReads[read]) return false;
    if (read === 'sport') return !sport;
    if (read === 'teams') return (!!homeTeamId && !homeTeam) || (!!awayTeamId && !awayTeam);
    return true;
  });
  const readFailure = unread.length ? { what: namesOf(unread), reason: failedReads[unread[0]]! } : null;

  const startDynamicFlow = (templateId: string, side: 'home' | 'away', initialData: any = {}) => {
    // A new event being captured: a new request scope, so it can never be answered with the last one.
    addRequestScope.current = newRequestId();
    if (templateId === 'penalty_try' && !initialData?.eventId) {
      const initiatorId = resolveOrgProfileId(game);
      if (!initiatorId) {
        setErrorMessage('User session required: Initiator ID is missing.');
        return;
      }

      const participant = side === 'home' ? game.participants?.[0] : game.participants?.[1];
      const template = templates.find((t) => t.id === 'penalty_try');
      const points = template?.points || 7;
      const currentPeriodLabel =
        game.liveState?.periodLabel ||
        getPeriodLabel(game.liveState?.clock?.periodIndex ?? 0, game.customSettings?.periodTerm || 'Period');

      const eventData = {
        elapsedMS: getLiveElapsedMS(game.liveState?.clock),
        period: currentPeriodLabel,
        ...initialData,
        templateId: 'penalty_try',
        points,
        pointsDelta: points,
      };

      const payload = {
        gameId: game.id,
        gameParticipantId: participant?.id,
        type: 'SCORE',
        subType: 'penalty_try',
        actorOrgProfileId: undefined,
        initiatorOrgProfileId: initiatorId,
        eventData,
      };

      // Failures are shown in this screen's own error dialog, so no toast as well.
      sendAction(SocketAction.ADD_GAME_EVENT, payload, { suppressToast: true }).then((result) => {
        if (!result.ok) {
          setErrorMessage(result.message);
        } else {
          setScoringState({ status: 'IDLE' });
        }
      });
      return;
    }

    setScoringState({
      status: 'ACTIVE',
      templateId,
      side,
      editingId: initialData?.eventId,
      initialData,
    });
  };

  const cancelDynamicFlow = () => {
    setScoringState({ status: 'IDLE' });
  };

  const submitEvent = (eventPayload: any) => {
    const initiatorId = resolveOrgProfileId(game);
    if (!initiatorId) {
      setErrorMessage('User session required: Initiator ID is missing.');
      return;
    }

    const side = scoringState.side || 'home';
    const participant = side === 'home' ? game.participants?.[0] : game.participants?.[1];
    const template = templates.find((t) => t.id === scoringState.templateId);

    // Whether the event's value depends on an outcome is a question about the template's
    // `outcomes`, not about where its picker sits in the flow.
    const isOutcomeDriven = hasOutcomes(template);
    const selectedOutcomeObj = findOutcome(template, eventPayload?.outcome);

    let points = template?.points || 0;
    if (selectedOutcomeObj && selectedOutcomeObj.points !== undefined) {
      points = selectedOutcomeObj.points;
    } else if (isOutcomeDriven && (!eventPayload?.outcome || eventPayload?.outcome === 'missed')) {
      if (isScoringTemplate(sport, template)) {
        points = 0;
      }
    }

    const isScoring = isScoringTemplate(sport, template);
    const isPending = isScoring && isOutcomeDriven && !eventPayload?.outcome;

    // Whose event a triggered follow-up is belongs to the template: a try's conversion is taken
    // by the scoring team, a penalty's kick by the non-offending one. Never hardcode the list of
    // templates that flip — a sport spec we have never seen must be able to say so.
    const sideForTrigger = (team: TriggerTeam | undefined): 'home' | 'away' =>
      team === 'opponent' ? (side === 'home' ? 'away' : 'home') : side;

    const currentPeriodLabel =
      game.liveState?.periodLabel ||
      getPeriodLabel(game.liveState?.clock?.periodIndex ?? 0, game.customSettings?.periodTerm || 'Period');

    const initialData = scoringState.initialData || {};

    const collectedPlayerId =
      eventPayload?.playerId !== undefined
        ? eventPayload.playerId
        : (initialData.actorOrgProfileId || initialData.playerId);

    // Mirrors how `eventData` below resolves the reason: the payload wins, else what the dialog
    // was opened with.
    const effectiveReason = eventPayload?.reason !== undefined ? eventPayload.reason : initialData.reason;

    // A scorer can pick a player and then change the reason to one with no individual offender —
    // a free kick for "Too Many Players". The dialog hides the player screen at that point but
    // keeps the selection, so switching back restores it; what must not happen is the stale
    // player reaching the event. Resolved to null rather than simply omitted, because on an edit
    // an omitted actor means "unchanged" and would leave a previously saved player in place.
    const actorOrgProfileId = reasonRequiresPlayer(template, effectiveReason) ? collectedPlayerId : null;

    const { playerId: _, ...cleanEventPayload } = eventPayload || {};

    const capturedData = {
      elapsedMS: getLiveElapsedMS(game.liveState?.clock),
      period: currentPeriodLabel,
      ...initialData,
      ...cleanEventPayload,
      templateId: scoringState.templateId,
      points,
      pointsDelta: points,
      pending: isPending,
    };

    // The words the scorer saw are stored alongside the ids they chose, so this row reads the
    // same in a year's time whatever happens to the template afterwards. `templateName` and
    // friends are merged last so an edit that clears the outcome clears its label too, rather
    // than leaving the previous one behind.
    const eventData = {
      ...capturedData,
      ...captureEventLabels(template, capturedData),
    };

    if (scoringState.editingId) {
      // EDIT EXISTING EVENT
      const originalEvt = events.find((e) => e.id === scoringState.editingId);
      const originalData = originalEvt?.eventData || (originalEvt as any)?.event_data || {};
      const expiresAt = originalEvt ? getUndoExpiryMs(originalEvt) : null;
      const inUndoWindow = expiresAt !== null && getUndoNowMs() < expiresAt;
      // An event with no recorded initiator is owned by nobody, so nobody gets the
      // in-window bypass for it. Defaulting to true would hand that bypass to whoever
      // happened to open it.
      const isCreator = !!originalEvt?.initiatorOrgProfileId && originalEvt.initiatorOrgProfileId === initiatorId;
      const isBypassed = inUndoWindow && isCreator;
      const isOutcomeAlreadySet = originalData.outcome !== undefined && originalData.outcome !== null && originalData.outcome !== '';

      const outcomeChanged = eventPayload?.outcome !== undefined && eventPayload.outcome !== originalData.outcome;
      const pointsChanged = eventData.pointsDelta !== originalData.pointsDelta;

      if (!isBypassed && isScoring && isOutcomeAlreadySet && (outcomeChanged || pointsChanged)) {
        // Prompt user confirmation for consensus update when outside undo window or non-creator
        const eventName = template?.name || scoringState.templateId || 'Event';
        setScoringState({ status: 'IDLE' });
        setUpdateDisputeTarget({
          gameId: game.id,
          eventId: scoringState.editingId,
          initiatorId,
          updateData: {
            actorOrgProfileId,
            gameParticipantId: participant?.id,
            eventData,
          },
          eventName,
        });
        return;
      }

      const payload = {
        gameId: game.id,
        eventId: scoringState.editingId,
        gameParticipantId: participant?.id,
        actorOrgProfileId,
        eventData,
      };

      sendAction(SocketAction.UPDATE_GAME_EVENT, payload, { suppressToast: true }).then((result) => {
        if (!result.ok) {
          setErrorMessage(result.message);
        } else {
          const updatedEventId = result.data?.id || scoringState.editingId;
          // The dialog always reports the trigger for the currently selected outcome, so
          // editing an unrelated field (e.g. the reason) would otherwise re-open the linked
          // event dialog for a linked event that already exists. Only chain when the outcome
          // is being set for the first time or actually changing.
          const shouldChainLinkedEvent = !isOutcomeAlreadySet || outcomeChanged;
          // Gated on the outcome's own trigger, not on `getTriggerFor`: a template-level trigger
          // (try → conversion) fires once, when the event is created. Re-firing it here would
          // re-open the conversion dialog every time an unrelated field on the try was corrected.
          if (eventPayload?.triggerEventId && shouldChainLinkedEvent) {
            const trigger = getTriggerFor(template, eventPayload.outcome);
            startDynamicFlow(eventPayload.triggerEventId, sideForTrigger(trigger?.team), {
              ...(trigger?.eventData || {}),
              linkedEventId: updatedEventId,
              elapsedMS: originalData?.elapsedMS || eventData.elapsedMS,
            });
          } else {
            setScoringState({ status: 'IDLE' });
          }
        }
      });
    } else {
      // ADD NEW EVENT
      const payload = {
        gameId: game.id,
        gameParticipantId: participant?.id,
        type: isScoringTemplate(sport, template) ? 'SCORE' : 'GAME_EVENT',
        subType: scoringState.templateId,
        actorOrgProfileId,
        initiatorOrgProfileId: initiatorId,
        eventData,
      };

      /*
        Keyed to this capture and to what is being recorded, minus the clock reading and period,
        which move between attempts (SYNC-3). A scorer confirming again after "no answer" therefore
        gets the event the server may already hold, not a second try on the board; one who changes
        the player or outcome before retrying is recording something else, and gets a new write.
      */
      const { elapsedMS: _elapsed, period: _period, ...recordedData } = eventData as any;
      const requestId = requestKeyFor(addRequestScope.current, SocketAction.ADD_GAME_EVENT, { ...payload, eventData: recordedData });

      sendAction(SocketAction.ADD_GAME_EVENT, payload, { suppressToast: true, requestId }).then((result) => {
        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }
        addRequestScope.current = newRequestId();
        const addedEventId = result.data.id;
        // AUTOMATED CHAINED FLOW: the template says what a completed event spawns — a try always
        // spawns a conversion, a penalty spawns whatever its chosen outcome names — whose it is,
        // and what the follow-up already knows about itself. A scrum awarded from a free kick
        // opens with its reason set, so the scorer is not asked something the chain just answered.
        const trigger = getTriggerFor(template, eventPayload?.outcome);
        if (trigger) {
          startDynamicFlow(trigger.eventId, sideForTrigger(trigger.team), {
            ...trigger.eventData,
            linkedEventId: addedEventId,
          });
        } else {
          setScoringState({ status: 'IDLE' });
        }
      });
    }
  };

  const handleConfirmUpdateDispute = () => {
    if (!updateDisputeTarget) return;
    const target = updateDisputeTarget;
    setUpdateDisputeTarget(null);
    sendAction(
      SocketAction.INITIATE_UPDATE_VOTE,
      {
        gameId: target.gameId,
        eventId: target.eventId,
        initiatorId: target.initiatorId,
        updateData: target.updateData,
      },
      { suppressToast: true }
    ).then((result) => {
      if (!result.ok) setErrorMessage(result.message);
    });
  };

  const handleConfirmUndoDispute = () => {
    if (!undoDisputeTarget) return;
    const targetId = undoDisputeTarget.eventId;
    setUndoDisputeTarget(null);
    initiateUndoVote(targetId);
  };

  const initiateUndoVote = (eventId: string) => {
    const initiatorId = resolveOrgProfileId(game);
    if (!initiatorId) {
      setErrorMessage('User session required: Initiator ID is missing to initiate dispute.');
      return;
    }
    sendAction(
      SocketAction.INITIATE_UNDO_VOTE,
      { gameId: game.id, eventIdToUndo: eventId, initiatorId },
      { suppressToast: true }
    ).then((result) => {
      if (!result.ok) {
        setErrorMessage(result.message);
      } else {
        setScoringState({ status: 'IDLE' });
      }
    });
  };

  const removeGameEvent = (eventId: string) => {
    const initiatorId = resolveOrgProfileId(game);
    if (!initiatorId) {
      setErrorMessage('User session required: Initiator ID is missing to undo event.');
      return;
    }
    sendAction(SocketAction.UNDO_GAME_EVENT, { gameId: game.id, eventId, initiatorId }, { suppressToast: true }).then((result) => {
      // A refused undo (e.g. the window has expired) arrives as an error; the message says why.
      const refusal = result.ok ? null : result.message;
      if (refusal !== null) {
        console.error('Failed to undo event:', refusal);
        if (refusal.toLowerCase().includes('expired')) {
          const targetEvt = events.find((e) => e.id === eventId);
          const evtName = targetEvt?.subType ? targetEvt.subType.toUpperCase() : 'Event';
          setScoringState({ status: 'IDLE' });
          setUndoDisputeTarget({ eventId, eventName: evtName });
        } else {
          setErrorMessage(refusal);
        }
      } else {
        setScoringState({ status: 'IDLE' });
      }
    });
  };

  const updateFinalScore = async (scores: { [participantId: string]: number }) => {
    const result = await sendAction(
      SocketAction.UPDATE_GAME_SCORE,
      {
        id: game.id,
        scores,
      },
      { suppressToast: true }
    );
    if (!result.ok) setErrorMessage(result.message);
  };

  return (
    <DynamicScoringContext.Provider
      value={{
        readFailure,
        liveRooms,
        eventsError: failedReads.events ?? null,
        rostersError: failedReads.rosters ?? null,
        retryReads,
        game,
        homeTeam,
        awayTeam,
        homeRoster,
        awayRoster,
        isLoadingRosters,
        events,
        isLoadingEvents,
        disputes,
        sport,
        profileMap,
        templates,
        scoringState,
        startDynamicFlow,
        cancelDynamicFlow,
        submitEvent,
        removeGameEvent,
        initiateUndoVote,
        updateFinalScore,
      }}
    >
      {showReadNote ? <ScoringReadNote /> : null}
      {children}
      {updateDisputeTarget && (
        <ConfirmationModal
          isOpen={!!updateDisputeTarget}
          onClose={() => setUpdateDisputeTarget(null)}
          title="Request Event Change?"
          description={`To change "${updateDisputeTarget.eventName}", you need consensus from the other scorers. Proceed?`}
          confirmText="Request Change"
          cancelText="Cancel"
          onConfirm={handleConfirmUpdateDispute}
          variant="primary"
        />
      )}
      {undoDisputeTarget && (
        <ConfirmationModal
          isOpen={!!undoDisputeTarget}
          onClose={() => setUndoDisputeTarget(null)}
          title="Request Event Undo?"
          description={`To undo "${undoDisputeTarget.eventName}", you need consensus from the other scorers. Proceed?`}
          confirmText="Request Undo"
          cancelText="Cancel"
          onConfirm={handleConfirmUndoDispute}
          variant="primary"
        />
      )}
      {errorMessage && (
        <ConfirmationModal
          isOpen={!!errorMessage}
          onClose={() => setErrorMessage(null)}
          title="Operation Failed"
          description={errorMessage}
          confirmText="OK"
          onConfirm={() => setErrorMessage(null)}
          variant="danger"
        />
      )}
    </DynamicScoringContext.Provider>
  );
}

/**
 * What did not load on a scoring screen, once, with a way to ask again (`SYNC-9`). A read that failed
 * comes first; otherwise the match's live rooms, when one does not arrive — what is on screen is then
 * the last known state of the match, not a live one (`LIVE-25`).
 */
export function ScoringReadNote() {
  const ctx = useContext(DynamicScoringContext);
  if (!ctx) return null;
  if (ctx.readFailure) {
    return <ReadFailure title={`${ctx.readFailure.what} did not load.`} reason={ctx.readFailure.reason} onRetry={ctx.retryReads} className="mb-2" />;
  }
  return <RoomFailure rooms={ctx.liveRooms} what="The match" stale className="mb-2" />;
}

export function useOptionalSharedDynamicScoring(): DynamicScoringContextType | null {
  return useContext(DynamicScoringContext);
}

export function useSharedDynamicScoring(): DynamicScoringContextType {
  const ctx = useContext(DynamicScoringContext);
  if (!ctx) throw new Error('useSharedDynamicScoring must be used within DynamicScoringProvider');
  return ctx;
}

