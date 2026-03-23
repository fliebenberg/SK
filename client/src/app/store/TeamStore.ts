import { Team, TeamMembership, SocketAction, OrgProfile } from "@sk/types";
import { socket } from "../../lib/socketService";
import { OrganizationStore } from "./OrganizationStore";

export class TeamStore extends OrganizationStore {
    // --- Subscriptions ---
    subscribeToTeamData(teamId: string) {
        const key = `team:${teamId}`;
        if (this.cancelUnsubscribe(key)) return;
        if (this.activeTeamSubscriptions.has(teamId)) return;
        
        console.log(`Store: Subscribing to team ${teamId}`);
        this.activeTeamSubscriptions.add(teamId);
        socket.emit('join_room', `team:${teamId}`);
    }
    
    unsubscribeFromTeamData(teamId: string) {
        const key = `team:${teamId}`;
        this.scheduleUnsubscribe(key, () => {
            if (!this.activeTeamSubscriptions.has(teamId)) return;
            console.log(`Store: Unsubscribing from team ${teamId}`);
            this.activeTeamSubscriptions.delete(teamId);
            socket.emit('leave_room', `team:${teamId}`);
        });
    }

    // --- Actions ---
    fetchTeam(id: string) {
        socket.emit('get_data', { type: 'team', id }, (data: Team) => {
            if (data) {
                this.mergeTeam(data, false);
                if (!this.getOrganization(data.orgId)) {
                    this.fetchOrganization(data.orgId);
                }
                this.notifyListeners();
            }
        });
    }

    addTeam = (team: Omit<Team, "id">) => {
        return new Promise<Team>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.ADD_TEAM, payload: team }, (response: any) => {
                if (response.status === 'ok') {
                    this.mergeTeam(response.data);
                    resolve(response.data);
                } else reject(new Error(response.message || 'Failed to add team'));
            });
        });
    };
    
    updateTeam = (id: string, data: Partial<Team>) => {
        const index = this.teams.findIndex(t => t.id === id);
        if (index > -1) {
            this.teams[index] = { ...this.teams[index], ...data };
            this.notifyListeners();

            return new Promise<Team>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.UPDATE_TEAM, payload: { id, data } }, (response: any) => {
                    if (response.status === 'ok') resolve(response.data);
                    else reject(new Error(response.message || 'Failed to update team'));
                });
            });
        }
        return Promise.reject(new Error('Team not found'));
    };

    deleteTeam = (id: string) => { 
        this.teams = this.teams.filter(t => t.id !== id);
        this.notifyListeners();

        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.DELETE_TEAM, payload: { id } }, (response: any) => {
                if (response.status === 'ok') resolve();
                else reject(new Error(response.message || 'Failed to delete team'));
            });
        });
    }; 

    // --- Membership Logic ---
    getTeamMembers = (teamId: string) => {
        const memberships = this.teamMemberships.filter(m => m.teamId === teamId && !m.endDate);
        return memberships.map(m => {
          const profile = this.orgProfiles.find(p => p.id === m.orgProfileId);
          return {
            ...profile!,
            roleId: m.roleId,
            roleName: this.getTeamRole(m.roleId)?.name,
            membershipId: m.id
          };
        }).filter(p => (p as any).id);
    };

    addTeamMember = (orgProfileId: string, teamId: string, roleId: string) => {
        const payload = { orgProfileId, teamId, roleId, startDate: new Date().toISOString() };
        return new Promise<TeamMembership>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.ADD_TEAM_MEMBER, payload }, (response: any) => {
                if (response.status === 'ok') resolve(response.data);
                else reject(new Error(response.message || 'Failed to add team member'));
            });
        });
    };

    updateTeamMember = (id: string, data: Partial<TeamMembership>) => {
        const index = this.teamMemberships.findIndex(m => m.id === id);
        if (index > -1) {
            this.teamMemberships[index] = { ...this.teamMemberships[index], ...data };
            this.notifyListeners();
            return new Promise<TeamMembership>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.UPDATE_TEAM_MEMBER, payload: { id, data } }, (response: any) => {
                    if (response.status === 'ok') resolve(response.data);
                    else reject(new Error(response.message || 'Failed to update team member'));
                });
            });
        }
        return Promise.reject(new Error('Membership not found'));
    };

    removeTeamMember = (membershipId: string) => {
        const index = this.teamMemberships.findIndex(m => m.id === membershipId);
        if (index > -1) {
            this.teamMemberships[index].endDate = new Date().toISOString(); 
            this.notifyListeners();
            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.REMOVE_TEAM_MEMBER, payload: { id: membershipId } }, (response: any) => {
                    if (response.status === 'ok') resolve();
                    else reject(new Error(response.message || 'Failed to remove team member'));
                });
            });
        }
        return Promise.reject(new Error('Membership not found'));
    };

    // --- Getters ---
    getTeams = (orgId?: string) => orgId ? this.teams.filter(t => t.orgId === orgId) : this.teams;
    getTeam = (id: string) => this.teams.find((t) => t.id === id);

    // --- Helpers ---
    protected mergeTeam(team: Team, notify = true) {
        const index = this.teams.findIndex(t => t.id === team.id);
        if (index > -1) this.teams[index] = { ...this.teams[index], ...team };
        else this.teams.push(team);
        this.subscribeToTeamData(team.id);
        if (notify) this.notifyListeners();
    }

    protected mergeTeamMembership(membership: TeamMembership) {
        if (!membership.teamId && !membership.id) return;
        const index = this.teamMemberships.findIndex(m => m.id === membership.id);
        if (index > -1) this.teamMemberships[index] = { ...this.teamMemberships[index], ...membership };
        else this.teamMemberships.push(membership);
        this.notifyListeners();
    }

    protected findTeamIdForMembership(membershipId: string): string | undefined {
        const membership = this.teamMemberships.find(m => m.id === membershipId);
        return membership?.teamId;
    }

    protected mergeOrgProfile(profile: Partial<OrgProfile>) {
        if (!profile.id) return;
        const index = this.orgProfiles.findIndex(p => p.id === profile.id);
        if (index > -1) this.orgProfiles[index] = { ...this.orgProfiles[index], ...profile } as OrgProfile;
        else this.orgProfiles.push(profile as OrgProfile);
        this.notifyListeners();
    }
}
