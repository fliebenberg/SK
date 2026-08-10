import React, { createContext, useContext, useState, useEffect } from 'react';
import { Game, GameEvent, GameDispute, Sport, getPeriodLabel, SocketAction, ActionStepType } from '@sk/types';
import { wsService } from '../../../services/websocket';
import { getSystemSettingsOnce, getCachedSystemSettings } from '../../../services/systemSettings';
import { getLiveElapsedMS } from '../../../hooks/useGameTimer';
import { useAuthStore } from '../../../store/authStore';
import { useSportStore } from '../../../store/sportStore';
import { ConfirmationModal } from '../../ConfirmationModal';

const resolveOrgProfileId = (game: Game): string | null => {
  const user = useAuthStore.getState().user;
  const orgMemberships = useAuthStore.getState().orgMemberships || [];
  if (!user) return null;

  // 1. If global admin, look for System Admin org profile
  if (user.globalRole === 'admin') {
    const adminMem = orgMemberships.find((m: any) => m.orgId === 'org-system-admins');
    if (adminMem?.orgProfileId) return adminMem.orgProfileId;
  }

  // 2. Look for official assignment in game_officials
  if (game?.id) {
    const matchedOfficial = (game as any).officials?.find((o: any) => 
      orgMemberships.some((m: any) => m.orgProfileId === o.orgProfileId)
    );
    if (matchedOfficial?.orgProfileId) return matchedOfficial.orgProfileId;
  }

  // 3. Look for membership in user's orgs
  if (orgMemberships.length > 0) {
    return orgMemberships[0].orgProfileId || null;
  }

  return null;
};

export interface EventTemplateItem {
  id: string;
  name: string;
  mobileLabel?: string;
  section: 'Scoring' | 'Game Events' | 'General Play';
  points?: number;
  steps?: any[];
  triggerEventId?: string;
  pendingOutcomeLabel?: string;
}

interface DynamicScoringContextType {
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
  undoDelayMs: number;
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

export function DynamicScoringProvider({ game, children }: { game: Game; children: React.ReactNode }) {
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
  const [undoDelayMs, setUndoDelayMs] = useState<number>(() => {
    const cached = getCachedSystemSettings();
    if (cached && cached.undo_delay_ms) {
      const val = Number(cached.undo_delay_ms);
      if (!isNaN(val) && val > 0) return val;
    }
    return 60000;
  });
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

  // 1. Fetch system settings once per session (in-memory cached)
  useEffect(() => {
    getSystemSettingsOnce().then((res) => {
      if (res && res.undo_delay_ms) {
        const val = Number(res.undo_delay_ms);
        if (!isNaN(val) && val > 0) {
          setUndoDelayMs(val);
        }
      }
    });
  }, []);

  // 1. WebSocket room subscriptions
  useEffect(() => {
    if (!game.id) return;
    const unsubscribeRoom = wsService.subscribeToRoom(`game:${game.id}`);
    const unsubscribeEventsRoom = wsService.subscribeToRoom(`game:${game.id}:events`);

    return () => {
      unsubscribeRoom();
      unsubscribeEventsRoom();
    };
  }, [game.id]);

  // 2. Fetch general team objects
  useEffect(() => {
    if (homeTeamId) {
      wsService.emit('get_data', { type: 'team', id: homeTeamId }, (t: any) => {
        if (t) setHomeTeam(t);
      });
    }
    if (awayTeamId) {
      wsService.emit('get_data', { type: 'team', id: awayTeamId }, (t: any) => {
        if (t) setAwayTeam(t);
      });
    }
  }, [homeTeamId, awayTeamId]);

  // 3. Fetch sport definition
  useEffect(() => {
    let resolvedSportId = (game.sportId || game.customSettings?.sportId || '').replace(/^sport-/, '');

    if (resolvedSportId) {
      wsService.emit('get_data', { type: 'sport', id: resolvedSportId }, (resSport: Sport) => {
        if (resSport) {
          setSport(resSport);
          useSportStore.getState().setCachedSport(resSport);
        } else {
          setErrorMessage(`Failed to load sport definition for sport ID "${resolvedSportId}". Please ensure the sport configuration is properly seeded.`);
        }
      });
    } else if (game.eventId) {
      wsService.emit('get_data', { type: 'event', id: game.eventId }, (resEvent: any) => {
        const eventSportId = (resEvent?.sportIds?.[0] || '').replace(/^sport-/, '');
        if (eventSportId) {
          wsService.emit('get_data', { type: 'sport', id: eventSportId }, (resSport: Sport) => {
            if (resSport) {
              setSport(resSport);
              useSportStore.getState().setCachedSport(resSport);
            } else {
              setErrorMessage(`Failed to load sport definition for event sport ID "${eventSportId}".`);
            }
          });
        } else {
          setErrorMessage(`Game ${game.id} has no associated sportId or parent event sport configuration.`);
        }
      });
    } else {
      setErrorMessage(`Game ${game.id} has no sportId configured.`);
    }
  }, [game.sportId, game.customSettings?.sportId, game.eventId]);

  // 4. Fetch active disputes
  useEffect(() => {
    wsService.emit('get_data', { type: 'active_disputes', id: game.id }, (disputeData: GameDispute[]) => {
      if (Array.isArray(disputeData)) {
        setDisputes(disputeData.filter((d: any) => !d.status || d.status === 'OPEN'));
      }
    });
  }, [game.id]);

  // 5. Fetch game events
  useEffect(() => {
    setIsLoadingEvents(true);
    wsService.emit('get_data', { type: 'game_events', id: game.id }, (data: GameEvent[]) => {
      if (data && Array.isArray(data)) {
        const sorted = [...data].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setEvents(sorted);
      }
      setIsLoadingEvents(false);
    });
  }, [game.id]);

  // 6. Fetch Roster and Member data
  useEffect(() => {
    let activeFetches = 0;
    
    if (homeParticipantId) {
      activeFetches++;
      setIsLoadingRosters(true);
      wsService.emit('get_data', { type: 'game_roster', id: homeParticipantId }, (data: any[]) => {
        const hasGameRoster = Array.isArray(data) && data.length > 0;
        if (hasGameRoster) {
          const sorted = [...data].sort((a, b) => (parseInt(a.position) || 999) - (parseInt(b.position) || 999));
          setHomeRoster(sorted);
          activeFetches--;
          if (activeFetches === 0) setIsLoadingRosters(false);
          
          if (homeTeamId) {
            wsService.emit('get_data', { type: 'team_members', teamId: homeTeamId }, (members: any[]) => {
              if (Array.isArray(members) && members.length > 0) {
                const memberMap = new Map(
                  members.map((m: any) => [m.orgProfileId || m.id, m.name || m.orgProfileName])
                );
                const enriched = sorted.map((item: any) => ({
                  ...item,
                  name: item.name || item.orgProfileName || memberMap.get(item.orgProfileId) || item.name,
                }));
                setHomeRoster(enriched);
              }
            });
          }
        } else if (homeTeamId) {
          wsService.emit('get_data', { type: 'team_members', teamId: homeTeamId }, (members: any[]) => {
            if (Array.isArray(members) && members.length > 0) {
              const fallback = members.map((m: any) => ({
                id: m.orgProfileId || m.id,
                orgProfileId: m.orgProfileId || m.id,
                name: m.name || m.orgProfileName,
                position: m.position,
                isReserve: false,
              }));
              setHomeRoster(fallback);
            } else {
              setHomeRoster([]);
            }
            activeFetches--;
            if (activeFetches === 0) setIsLoadingRosters(false);
          });
        } else {
          setHomeRoster([]);
          activeFetches--;
          if (activeFetches === 0) setIsLoadingRosters(false);
        }
      });
    }

    if (awayParticipantId) {
      activeFetches++;
      setIsLoadingRosters(true);
      wsService.emit('get_data', { type: 'game_roster', id: awayParticipantId }, (data: any[]) => {
        const hasGameRoster = Array.isArray(data) && data.length > 0;
        if (hasGameRoster) {
          const sorted = [...data].sort((a, b) => (parseInt(a.position) || 999) - (parseInt(b.position) || 999));
          setAwayRoster(sorted);
          activeFetches--;
          if (activeFetches === 0) setIsLoadingRosters(false);

          if (awayTeamId) {
            wsService.emit('get_data', { type: 'team_members', teamId: awayTeamId }, (members: any[]) => {
              if (Array.isArray(members) && members.length > 0) {
                const memberMap = new Map(
                  members.map((m: any) => [m.orgProfileId || m.id, m.name || m.orgProfileName])
                );
                const enriched = sorted.map((item: any) => ({
                  ...item,
                  name: item.name || item.orgProfileName || memberMap.get(item.orgProfileId) || item.name,
                }));
                setAwayRoster(enriched);
              }
            });
          }
        } else if (awayTeamId) {
          wsService.emit('get_data', { type: 'team_members', teamId: awayTeamId }, (members: any[]) => {
            if (Array.isArray(members) && members.length > 0) {
              const fallback = members.map((m: any) => ({
                id: m.orgProfileId || m.id,
                orgProfileId: m.orgProfileId || m.id,
                name: m.name || m.orgProfileName,
                position: m.position,
                isReserve: false,
              }));
              setAwayRoster(fallback);
            } else {
              setAwayRoster([]);
            }
            activeFetches--;
            if (activeFetches === 0) setIsLoadingRosters(false);
          });
        } else {
          setAwayRoster([]);
          activeFetches--;
          if (activeFetches === 0) setIsLoadingRosters(false);
        }
      });
    }
  }, [homeParticipantId, awayParticipantId, homeTeamId, awayTeamId]);

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

  const startDynamicFlow = (templateId: string, side: 'home' | 'away', initialData: any = {}) => {
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

      wsService.emitAction(SocketAction.ADD_GAME_EVENT, payload, (res: any) => {
        if (res && res.error) {
          console.error('Failed to add penalty try event:', res.error);
          setErrorMessage(res.error);
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

    // Dynamically resolve steps and outcome definitions from template.steps
    const flatSteps = template?.steps
      ? template.steps.flatMap((s: any) => (s.type === ActionStepType.GROUP || s.type === 'GROUP' ? s.steps || [] : [s]))
      : [];
    const outcomeStep = flatSteps.find((s: any) => s.type === ActionStepType.OUTCOME_SELECTION || s.type === 'OUTCOME_SELECTION');
    const hasOutcomeStep = !!outcomeStep;
    const selectedOutcomeObj = outcomeStep?.outcomes?.find((o: any) => o.id === eventPayload?.outcome);

    let points = template?.points || 0;
    if (selectedOutcomeObj && selectedOutcomeObj.points !== undefined) {
      points = selectedOutcomeObj.points;
    } else if (hasOutcomeStep && (!eventPayload?.outcome || eventPayload?.outcome === 'missed')) {
      if (template?.section === 'Scoring' || (template?.points && template.points > 0)) {
        points = 0;
      }
    }

    const isScoring = template?.section === 'Scoring' || (template?.points && template.points > 0);
    const isPending = isScoring && hasOutcomeStep && !eventPayload?.outcome;

    const currentPeriodLabel =
      game.liveState?.periodLabel ||
      getPeriodLabel(game.liveState?.clock?.periodIndex ?? 0, game.customSettings?.periodTerm || 'Period');

    const initialData = scoringState.initialData || {};

    const actorOrgProfileId =
      eventPayload?.playerId !== undefined
        ? eventPayload.playerId
        : (initialData.actorOrgProfileId || initialData.playerId);

    const { playerId: _, ...cleanEventPayload } = eventPayload || {};

    const eventData = {
      elapsedMS: getLiveElapsedMS(game.liveState?.clock),
      period: currentPeriodLabel,
      ...initialData,
      ...cleanEventPayload,
      templateId: scoringState.templateId,
      points,
      pointsDelta: points,
      pending: isPending,
    };

    if (scoringState.editingId) {
      // EDIT EXISTING EVENT
      const originalEvt = events.find((e) => e.id === scoringState.editingId);
      const originalData = originalEvt?.eventData || (originalEvt as any)?.event_data || {};
      const evtTime = originalEvt?.timestamp ? new Date(originalEvt.timestamp).getTime() : Date.now();
      const age = Date.now() - evtTime;
      const inUndoWindow = age >= 0 && age < undoDelayMs;
      const isCreator = originalEvt?.initiatorOrgProfileId ? originalEvt.initiatorOrgProfileId === initiatorId : true;
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
        initiatorOrgProfileId: initiatorId,
        eventData,
      };

      wsService.emitAction(SocketAction.UPDATE_GAME_EVENT, payload, (res: any) => {
        if (res && res.error) {
          console.error('Failed to update game event:', res.error);
          setErrorMessage(res.error);
        } else {
          const updatedEventId = res?.id || res?.data?.id || scoringState.editingId;
          if (eventPayload?.triggerEventId) {
            const targetSide = (scoringState.templateId === 'penalty_awarded' || scoringState.templateId === 'free_kick')
              ? (side === 'home' ? 'away' : 'home')
              : side;
            startDynamicFlow(eventPayload.triggerEventId, targetSide, {
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
        type: template?.section === 'Scoring' ? 'SCORE' : 'GAME_EVENT',
        subType: scoringState.templateId,
        actorOrgProfileId,
        initiatorOrgProfileId: initiatorId,
        eventData,
      };

      wsService.emitAction(SocketAction.ADD_GAME_EVENT, payload, (res: any) => {
        if (res && res.error) {
          console.error('Failed to add game event:', res.error);
          setErrorMessage(res.error);
          return;
        }
        const addedEventId = res?.id || res?.data?.id || res?.eventId;
        // AUTOMATED CHAINED FLOW: Scoring a Try automatically triggers Conversion dialog!
        if (scoringState.templateId === 'try') {
          startDynamicFlow('conversion', side, { linkedEventId: addedEventId });
        } else if (eventPayload?.triggerEventId) {
          const targetSide = (scoringState.templateId === 'penalty_awarded' || scoringState.templateId === 'free_kick')
            ? (side === 'home' ? 'away' : 'home')
            : side;
          startDynamicFlow(eventPayload.triggerEventId, targetSide, { linkedEventId: addedEventId });
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
    wsService.emitAction(
      SocketAction.INITIATE_UPDATE_VOTE,
      {
        gameId: target.gameId,
        eventId: target.eventId,
        initiatorId: target.initiatorId,
        updateData: target.updateData,
      },
      (res: any) => {
        if (res && res.error) {
          console.error('Failed to initiate dispute for event update:', res.error);
          setErrorMessage(res.error);
        }
      }
    );
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
    wsService.emitAction(
      SocketAction.INITIATE_UNDO_VOTE,
      { gameId: game.id, eventIdToUndo: eventId, initiatorId },
      (res: any) => {
        if (res && res.error) {
          console.error('Failed to initiate dispute:', res.error);
          setErrorMessage(res.error);
        } else {
          setScoringState({ status: 'IDLE' });
        }
      }
    );
  };

  const removeGameEvent = (eventId: string) => {
    const initiatorId = resolveOrgProfileId(game);
    if (!initiatorId) {
      setErrorMessage('User session required: Initiator ID is missing to undo event.');
      return;
    }
    wsService.emitAction(SocketAction.UNDO_GAME_EVENT, { gameId: game.id, eventId, initiatorId }, (res: any) => {
      if (res && res.error) {
        console.error('Failed to undo event:', res.error);
        if (typeof res.error === 'string' && res.error.toLowerCase().includes('expired')) {
          const targetEvt = events.find((e) => e.id === eventId);
          const evtName = targetEvt?.subType ? targetEvt.subType.toUpperCase() : 'Event';
          setScoringState({ status: 'IDLE' });
          setUndoDisputeTarget({ eventId, eventName: evtName });
        } else {
          setErrorMessage(res.error);
        }
      } else {
        setScoringState({ status: 'IDLE' });
      }
    });
  };

  const updateFinalScore = async (scores: { [participantId: string]: number }) => {
    return new Promise<void>((resolve) => {
      wsService.emitAction(
        SocketAction.UPDATE_GAME_SCORE,
        {
          id: game.id,
          scores,
        },
        (res: any) => {
          if (res && res.error) {
            console.error('Failed to update final score:', res.error);
            setErrorMessage(res.error);
          }
          resolve();
        }
      );
    });
  };

  return (
    <DynamicScoringContext.Provider
      value={{
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
        undoDelayMs,
        scoringState,
        startDynamicFlow,
        cancelDynamicFlow,
        submitEvent,
        removeGameEvent,
        initiateUndoVote,
        updateFinalScore,
      }}
    >
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

export function useOptionalSharedDynamicScoring(): DynamicScoringContextType | null {
  return useContext(DynamicScoringContext);
}

export function useSharedDynamicScoring(): DynamicScoringContextType {
  const ctx = useContext(DynamicScoringContext);
  if (!ctx) throw new Error('useSharedDynamicScoring must be used within DynamicScoringProvider');
  return ctx;
}

