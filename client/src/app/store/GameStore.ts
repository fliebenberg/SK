import { Event, Game, SocketAction, GameClockState } from "@sk/types";
import { getPeriodLabel } from "@sk/types";
import { socket } from "../../lib/socketService";
import { SiteStore } from "./SiteStore";
import { GameEvent } from "@sk/types";

export class GameStore extends SiteStore {
    gameEvents: GameEvent[] = [];
    private lastSequence: number = 0;
    private isSyncing: boolean = false;

    // --- Subscriptions ---
    subscribeToEvent(eventId: string) {
        if (!eventId || this.activeEventSubscriptions.has(eventId)) return;
        this.activeEventSubscriptions.add(eventId);
        socket.emit('join_room', `event:${eventId}`);
    }

    unsubscribeFromEvent(eventId: string) {
        if (!this.activeEventSubscriptions.has(eventId)) return;
        this.activeEventSubscriptions.delete(eventId);
        socket.emit('leave_room', `event:${eventId}`);
    }

    subscribeToGame(gameId: string) {
        if (!gameId) return;
        
        // If switching games, clear the previous events
        // Note: In a larger app we might keep a map of gameId -> events[]
        if (this.gameEvents.length > 0 && this.gameEvents[0].gameId !== gameId) {
            this.gameEvents = [];
            this.lastSequence = 0;
        }

        if (this.activeGameSubscriptions.has(gameId)) {
            // Even if already in the set, we might need a re-sync if the component just mounted
            // and we want the server-pushed state.
            socket.emit('join_room', `game:${gameId}`);
            return;
        }

        this.activeGameSubscriptions.add(gameId);
        socket.emit('join_room', `game:${gameId}`);
    }

    unsubscribeFromGame(gameId: string) {
        if (!this.activeGameSubscriptions.has(gameId)) return;
        this.activeGameSubscriptions.delete(gameId);
        socket.emit('leave_room', `game:${gameId}`);
    }

    subscribeToLiveGames() {
        const key = 'view:live_games';
        if (this.cancelUnsubscribe(key)) return;
        console.log("Store: Subscribing to Live Games View");
        this.fetchLiveGames();
    }

    unsubscribeFromLiveGames() {
        const key = 'view:live_games';
        this.scheduleUnsubscribe(key, () => {
             console.log("Store: Unsubscribing from Live Games View");
             this.games.forEach(g => {
                 socket.emit('leave_room', `game:${g.id}`);
                 this.activeGameSubscriptions.delete(g.id);
             });
        });
    }

    // --- Actions ---
    fetchLiveGames() {
        socket.emit('get_live_games', {}, (games: Game[]) => {
            if (games) {
                this.games = games;
                games.forEach(g => {
                    this.mergeGame(g, false);
                    if (!this.activeGameSubscriptions.has(g.id)) {
                        this.activeGameSubscriptions.add(g.id);
                        socket.emit('join_room', `game:${g.id}`);
                    }
                });
                this.notifyListeners();
            }
        });
    }

    fetchEvent(id: string) {
        return new Promise<Event | null>((resolve) => {
            socket.emit('get_data', { type: 'event', id }, (data: Event) => {
                if (data) {
                    this.mergeEvent(data, false);
                    this.notifyListeners();
                }
                resolve(data || null);
            });
        });
    }

    fetchGameEvents(gameId: string, fromSequence?: number) {
        return new Promise<GameEvent[]>((resolve) => {
            this.isSyncing = true;
            socket.emit('get_data', { type: 'game_events', id: gameId, fromSequence }, (data: GameEvent[]) => {
                if (data) {
                    this.mergeEvents(data);
                }
                this.isSyncing = false;
                resolve(data || []);
            });
        });
    }

    // --- System Settings ---
    systemSettings: Record<string, any> = {};

    fetchSystemSettings() {
        return new Promise<void>((resolve) => {
            socket.emit('action', { type: SocketAction.GET_SYSTEM_SETTINGS, payload: {} }, (settings: any) => {
                if (settings) {
                    this.systemSettings = settings;
                    this.notifyListeners();
                }
                resolve();
            });
        });
    }

    get undoDelay() {
        return this.systemSettings.undo_delay_ms || 15000;
    }

    // --- Interaction Actions ---
    undoGameEvent(gameId: string, eventId: string, initiatorId: string | null) {
        return new Promise<{ success: boolean; error?: string }>((resolve) => {
            socket.emit('action', { 
                type: SocketAction.UNDO_GAME_EVENT, 
                payload: { gameId, eventId, initiatorId } 
            }, (response: any) => {
                if (response.status === 'ok' && response.data) {
                    resolve(response.data);
                } else {
                    resolve({ success: false, error: response.message || 'Unknown server error.' });
                }
            });
        });
    }

    initiateUndoVote(gameId: string, eventIdToUndo: string, initiatorId: string) {
        return new Promise<void>((resolve) => {
            socket.emit('action', { 
                type: SocketAction.INITIATE_UNDO_VOTE, 
                payload: { gameId, eventIdToUndo, initiatorId } 
            }, (response: any) => {
                resolve();
            });
        });
    }

    getOrgProfileId(orgId: string) {
        // Find the org profile for the current user in this organization
        const membership = this.userOrgMemberships.find(m => m.orgId === orgId);
        return membership?.orgProfileId;
    }

    isMyOrgProfileId(profileId: string) {
        if (!profileId) return false;
        return this.myOrgProfileIds.has(profileId);
    }

    addEvent = (event: Omit<Event, "id">) => {
        return new Promise<Event>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.ADD_EVENT, payload: event }, (response: any) => {
                if (response.status === 'ok') {
                    this.mergeEvent(response.data);
                    resolve(response.data);
                } else reject(new Error(response.message || 'Failed to add event'));
            });
        });
    };

    updateEvent = (id: string, data: Partial<Event>) => {
        const index = this.events.findIndex(e => e.id === id);
        if (index > -1) {
            this.events[index] = { ...this.events[index], ...data };
            this.notifyListeners();
        }
        return new Promise<Event>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.UPDATE_EVENT, payload: { id, data } }, (response: any) => {
                if (response.status === 'ok') resolve(response.data);
                else reject(new Error(response.message || 'Failed to update event'));
            });
        });
    };

    deleteEvent = (id: string) => {
        const event = this.events.find(e => e.id === id);
        if (event) {
            this.events = this.events.filter(e => e.id !== id);
            this.notifyListeners();
            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.DELETE_EVENT, payload: { id } }, (response: any) => {
                    if (response.status === 'ok') resolve();
                    else reject(new Error(response.message || 'Failed to delete event'));
                });
            });
        }
        return Promise.reject(new Error('Event not found'));
    };

    addGame = (game: Omit<Game, "id" | "status" | "finalScoreData" | "liveState">) => {
        return new Promise<Game>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.ADD_GAME, payload: game }, (response: any) => {
                if (response.status === 'ok') {
                    this.mergeGame(response.data);
                    resolve(response.data);
                } else reject(new Error(response.message || 'Failed to add game'));
            });
        });
    };

    updateGame = (id: string, data: Partial<Game>) => {
        const index = this.games.findIndex(g => g.id === id);
        if (index > -1) {
            this.games[index] = { ...this.games[index], ...data };
            this.notifyListeners();
        }
        return new Promise<Game>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.UPDATE_GAME, payload: { id, data } }, (response: any) => {
                if (response.status === 'ok') resolve(response.data);
                else reject(new Error(response.message || 'Failed to update game'));
            });
        });
    };

    deleteGame = (id: string) => {
        const game = this.games.find(g => g.id === id);
        if (game) {
            this.games = this.games.filter(g => g.id !== id);
            this.notifyListeners();
            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.DELETE_GAME, payload: { id } }, (response: any) => {
                    if (response.status === 'ok') resolve();
                    else reject(new Error(response.message || 'Failed to delete game'));
                });
            });
        }
        return Promise.reject(new Error('Game not found'));
    };

    updateGameStatus = (id: string, status: Game['status']) => {
        const game = this.games.find(g => g.id === id);
        if (game) {
            const now = new Date().toISOString();
            let startTime = game.startTime;
            let finishTime = game.finishTime;

            if (status === 'Finished') {
                finishTime = now;
            } else if (status === 'Live' && !startTime) {
                startTime = now;
            }

            const promise = this.updateGame(id, { status, startTime, finishTime });
            socket.emit('action', { type: SocketAction.UPDATE_GAME_STATUS, payload: { id, status } });
            return promise;
        }
        return Promise.resolve(null);
    };

    resetGame(id: string) {
        socket.emit('action', { type: SocketAction.RESET_GAME, payload: { id } });
    }

    saveGameRoster(gameId: string, participantId: string, items: any[]) {
        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.SAVE_GAME_ROSTER, payload: { gameId, participantId, items } }, (response: any) => {
                if (response.status === 'ok') resolve();
                else reject(new Error(response.message || 'Failed to save roster'));
            });
        });
    }

    fetchGameRoster(participantId: string) {
        return new Promise<any[]>((resolve) => {
            socket.emit('get_data', { type: 'game_roster', id: participantId }, (data: any[]) => {
                resolve(data || []);
            });
        });
    }

    updateGameClock = (id: string, action: 'START' | 'PAUSE' | 'RESUME' | 'RESET' | 'SET_PERIOD' | 'END_PERIOD' | 'START_PERIOD') => {
        const game = this.games.find(g => g.id === id);
        if (!game) return;

        const event = this.events.find(e => e.id === game.eventId);
        const sport = this.sports.find(s => s.id === event?.sportIds?.[0]);

        // Resolve Configuration (Game > Event > Sport > Default)
        const periodLengthMS = game.customSettings?.periodLengthMS 
            || (event as any)?.settings?.periodLengthMS 
            || sport?.defaultSettings?.periodLengthMS 
            || 40 * 60 * 1000;
            
        const scheduledPeriods = game.customSettings?.scheduledPeriods 
            || (event as any)?.settings?.scheduledPeriods 
            || sport?.defaultSettings?.periods 
            || 2;

        const clock: GameClockState = {
            isRunning: false,
            elapsedMS: 0,
            periodLengthMS,
            isPeriodActive: false,
            lastStartedAt: undefined,
            periodIndex: 0,
            scheduledPeriods,
            totalActualElapsedMS: 0,
            ...(game.liveState?.clock || {})
        };

        const now = new Date().toISOString();
        const nowMS = new Date(now).getTime();
        let startTime = game.startTime;
        switch (action) {
            case 'START':
                if (!startTime) startTime = now;
                if (!clock.isRunning) {
                    clock.isRunning = true;
                    clock.lastStartedAt = now;
                }
                clock.isPeriodActive = true;
                clock.periodIndex = 0;
                clock.elapsedMS = 0;
                clock.totalActualElapsedMS = 0;
                break;
            case 'START_PERIOD':
                if (!clock.isRunning) {
                    clock.periodIndex = (clock.periodIndex ?? 0) + 1;
                    clock.elapsedMS = (clock.periodIndex ?? 0) * clock.periodLengthMS;
                    clock.isRunning = true;
                    clock.lastStartedAt = now;
                    clock.isPeriodActive = true;
                }
                break;
            case 'RESUME':
                if (!clock.isRunning) {
                    clock.isRunning = true;
                    clock.lastStartedAt = now;
                }
                clock.isPeriodActive = true;
                break;
            case 'PAUSE':
            case 'END_PERIOD':
                if (clock.isRunning && clock.lastStartedAt) {
                    const startedAtMS = new Date(clock.lastStartedAt).getTime();
                    const delta = (nowMS - startedAtMS);
                    clock.elapsedMS += delta;
                    clock.totalActualElapsedMS = (clock.totalActualElapsedMS ?? 0) + delta;
                    clock.isRunning = false;
                    clock.lastStartedAt = undefined;
                }
                if (action === 'END_PERIOD') {
                    clock.isPeriodActive = false;
                }
                break;
            case 'RESET':
                clock.isRunning = false;
                clock.elapsedMS = 0;
                clock.lastStartedAt = undefined;
                clock.isPeriodActive = false;
                clock.periodIndex = 0;
                clock.totalActualElapsedMS = 0;
                break;
        }

      // Update periodLabel in liveState
      const periodTerm = sport?.periodTerm || 'Period';
      const periodLabel = getPeriodLabel(clock.periodIndex ?? 0, periodTerm);

      const updatePromise = this.updateGame(id, { 
          liveState: { 
              ...(game.liveState || {}), 
              clock,
              periodLabel
          }, 
          startTime 
      });
      socket.emit('action', { type: SocketAction.UPDATE_GAME_CLOCK, payload: { id, action } });
      return updatePromise;
    };

    updateScore = (id: string, scores: { [participantId: string]: number }) => {
        const game = this.games.find(g => g.id === id);
        if (game) {
          const promise = this.updateGame(id, { 
              liveState: { ...(game.liveState || {}), scores } 
          });
          socket.emit('action', { type: SocketAction.UPDATE_GAME_SCORE, payload: { id, scores } });
          return promise;
        }
        return Promise.resolve(null);
    };

    addGameEvent = (payload: { 
        gameId: string, 
        initiatorOrgProfileId?: string, 
        type: string, 
        subType?: string, 
        eventData?: any, 
        actorOrgProfileId?: string, 
        gameParticipantId?: string 
    }) => {
        // Automatically inject current game clock info if not provided
        const liveInfo = this.getLiveClockInfo(payload.gameId);
        if (liveInfo) {
            payload.eventData = {
                elapsedMS: liveInfo.elapsedMS,
                period: liveInfo.period,
                ...payload.eventData
            };
        }

        // Fallback: Ensure we attach an identity even if the prior lookup failed
        if (!payload.initiatorOrgProfileId && this.myOrgProfileIds.size > 0) {
            payload.initiatorOrgProfileId = Array.from(this.myOrgProfileIds)[0];
        }

        return new Promise<any>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.ADD_GAME_EVENT, payload }, (response: any) => {
                if (response.status === 'ok') resolve(response.data);
                else reject(new Error(response.message || 'Failed to add game event'));
            });
        });
    };

    getLiveClockInfo(gameId: string) {
        // Direct access to games array to avoid any 'this' context issues with getters
        const game = this.games.find(g => g.id === gameId);
        if (!game || !game.liveState?.clock) return null;
        
        const clock = game.liveState.clock;
        const periodLabel = game.liveState.periodLabel || '1st Period';
        
        let elapsedMS = clock.elapsedMS || 0;
        
        if (clock.isRunning && clock.lastStartedAt) {
            const startedAtMS = new Date(clock.lastStartedAt).getTime();
            const nowMS = Date.now();
            elapsedMS += (nowMS - startedAtMS);
        }
        
        return {
            elapsedMS,
            period: periodLabel
        };
    }

    // --- Getters ---
    getEvents = (orgId?: string) => orgId 
        ? this.events.filter(e => e.orgId === orgId || e.participatingOrgIds?.includes(orgId)) 
        : this.events;
    getEvent = (id: string) => this.events.find(e => e.id === id);
    getGames = (orgId?: string) => {
        if (!orgId) return this.games;
        return this.games.filter(g => {
            if (!g.participants) return false;
            return g.participants.some(p => {
                if (p.teamId) {
                    const team = this.getTeam(p.teamId);
                    return team?.orgId === orgId;
                }
                return false;
            });
        });
    }; 
    getGame = (id: string) => this.games.find((g) => g.id === id);

    canScoreGame(gameId: string) {
        if (!this.currentUserId) return false;
        if (this.globalRole === 'admin') return true;
        const game = this.games.find(g => g.id === gameId);
        if (!game) return false;
        const teamIds = game.participants?.map(p => p.teamId).filter(Boolean) as string[] || [];
        const orgIds = new Set<string>();
        teamIds.forEach(tid => {
            const team = this.getTeam(tid);
            if (team) orgIds.add(team.orgId);
        });
        const isOrgAdmin = this.userOrgMemberships.some(m => 
            m.roleId === 'role-org-admin' && orgIds.has(m.orgId)
        );
        if (isOrgAdmin) return true;
        const isTeamOfficial = this.userTeamMemberships.some(m => 
            (m.roleId === 'role-coach' || m.roleId === 'role-scorer') && teamIds.includes(m.teamId)
        );
        return isTeamOfficial;
    }

    canSelectTeam(gameId: string) {
        if (!this.currentUserId) return false;
        if (this.globalRole === 'admin') return true;
        const game = this.games.find(g => g.id === gameId);
        if (!game) return false;
        const teamIds = game.participants?.map(p => p.teamId).filter(Boolean) as string[] || [];
        const orgIds = new Set<string>();
        teamIds.forEach(tid => {
            const team = this.getTeam(tid);
            if (team) orgIds.add(team.orgId);
        });
        const isOrgAdmin = this.userOrgMemberships.some(m => 
            m.roleId === 'role-org-admin' && orgIds.has(m.orgId)
        );
        if (isOrgAdmin) return true;
        const isTeamOfficial = this.userTeamMemberships.some(m => 
            (m.roleId === 'role-coach' || m.roleId === 'role-assistant-coach' || m.roleId === 'role-manager') && teamIds.includes(m.teamId)
        );
        return isTeamOfficial;
    }

    // --- Helpers ---
    protected mergeEvent(event: Event, notify = true) {
        const index = this.events.findIndex(e => e.id === event.id);
        if (index > -1) this.events[index] = event;
        else this.events.push(event);
        const orgIds = [event.orgId, ...(event.participatingOrgIds || [])];
        orgIds.forEach(orgId => {
            if (!this.getOrganization(orgId)) this.fetchOrganization(orgId);
        });
        if (notify) this.notifyListeners();
    }

    protected mergeGame(game: Game, notify = true) {
        const index = this.games.findIndex(g => g.id === game.id);
        let mergedGame: Game;
        
        if (index > -1) {
            const existing = this.games[index];
            // Deep merge liveState to prevent partial updates from wiping out clock
            const mergedLiveState = {
                ...(existing.liveState || {}),
                ...(game.liveState || {}),
                scores: game.liveState?.scores ?? existing.liveState?.scores,
                periodLabel: game.liveState?.periodLabel || existing.liveState?.periodLabel || getPeriodLabel(game.liveState?.clock?.periodIndex ?? existing.liveState?.clock?.periodIndex ?? 0, 'Period'),
                clock: game.liveState?.clock ?? (game.status === 'Scheduled' ? undefined : existing.liveState?.clock)
            };

            mergedGame = { 
                ...existing, 
                ...game,
                liveState: mergedLiveState
            };
            this.games[index] = mergedGame;
        } else {
            mergedGame = game;
            this.games.push(game);
        }
                
        if (mergedGame.participants) {
            mergedGame.participants.forEach(p => {
                if (p.teamId && !this.getTeam(p.teamId)) this.fetchTeam(p.teamId);
            });
        }

        if (notify) this.notifyListeners();
    }

    protected mergeGameEvent(event: GameEvent) {
        // Gap Detection
        const seq = event.sequence || 0;
        if (seq > this.lastSequence + 1 && this.lastSequence !== 0 && !this.isSyncing) {
            console.warn(`Gap detected in game events sequence (last: ${this.lastSequence}, received: ${seq}). Triggering re-sync.`);
            this.fetchGameEvents(event.gameId, this.lastSequence + 1);
        }

        const index = this.gameEvents.findIndex(e => e.id === event.id);
        if (index > -1) {
            this.gameEvents[index] = event;
        } else {
            // Insert and sort by sequence (preferred) or timestamp
            this.gameEvents.push(event);
            this.gameEvents.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        }

        if (seq > this.lastSequence) {
            this.lastSequence = seq;
        }

        this.notifyListeners();
    }

    protected mergeEvents(events: GameEvent[]) {
        if (!events) return;
        
        if (events.length === 0) {
            this.gameEvents = [];
            this.lastSequence = 0;
            this.notifyListeners();
            return;
        }
        
        events.forEach(evt => {
            const index = this.gameEvents.findIndex(e => e.id === evt.id);
            if (index > -1) {
                this.gameEvents[index] = evt;
            } else {
                this.gameEvents.push(evt);
            }
            if ((evt.sequence || 0) > this.lastSequence) {
                this.lastSequence = evt.sequence || 0;
            }
        });
        
        this.gameEvents.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        this.notifyListeners();
    }

    protected removeGameEvent(eventId: string) {
        this.gameEvents = this.gameEvents.filter(e => e.id !== eventId);
        this.notifyListeners();
    }

    protected handleGameReset(gameId: string) {
        if (this.gameEvents.length > 0 && this.gameEvents[0].gameId === gameId) {
            this.gameEvents = [];
            this.lastSequence = 0;
        }

        // Explicitly clear scores for the game in the store
        const game = this.getGame(gameId);
        if (game) {
            game.liveState = {
                ...game.liveState,
                scores: {},
                clock: {
                    ...(game.liveState?.clock || {
                        periodLengthMS: 40 * 60 * 1000,
                        scheduledPeriods: 2
                    }),
                    isRunning: false,
                    elapsedMS: 0,
                    isPeriodActive: false,
                    periodIndex: 0,
                    totalActualElapsedMS: 0
                }
            };
        }
        this.notifyListeners();
    }
}
