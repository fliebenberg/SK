import { Organization, OrgProfile, OrgMembership, SocketAction, levenshtein } from "@sk/types";
import { socket } from "../../lib/socketService";
import { SubscriptionStore } from "./SubscriptionStore";

export class OrganizationStore extends SubscriptionStore {
    // --- Subscriptions ---
    subscribeToOrganization(orgId: string) {
        const key = `org:${orgId}:members`;
        if (this.cancelUnsubscribe(key)) return;

        if (this.activeOrgSubscriptions.has(orgId)) return;

        console.log(`Store: Subscribing to organization ${orgId} members`);
        this.activeOrgSubscriptions.add(orgId);
        socket.emit('join_room', `org:${orgId}:members`);
    }

    unsubscribeFromOrganization(orgId: string) {
        const key = `org:${orgId}:members`;
        this.scheduleUnsubscribe(key, () => {
            if (!this.activeOrgSubscriptions.has(orgId)) return;

            console.log(`Store: Unsubscribing from organization ${orgId} members`);
            this.activeOrgSubscriptions.delete(orgId);
            socket.emit('leave_room', `org:${orgId}:members`);
        });
    }

    subscribeToOrganizationData(orgId: string) {
        if (!orgId) return;
        const key = `org:${orgId}:data`;
        if (this.cancelUnsubscribe(key)) return;
        if (this.activeOrgDataSubscriptions.has(orgId)) return;

        console.log(`Store: Subscribing to organization ${orgId} data (teams/sites)`);
        this.activeOrgDataSubscriptions.add(orgId);
        socket.emit('join_room', `org:${orgId}:teams`);
        socket.emit('join_room', `org:${orgId}:sites`);
        socket.emit('join_room', `org:${orgId}:facilities`);
        socket.emit('join_room', `org:${orgId}:events`);
        socket.emit('join_room', `org:${orgId}:games`);
    }

    unsubscribeFromOrganizationData(orgId: string) {
        if (!orgId) return;
        const key = `org:${orgId}:data`;
        this.scheduleUnsubscribe(key, () => {
            if (!this.activeOrgDataSubscriptions.has(orgId)) return;

            console.log(`Store: Unsubscribing from organization ${orgId} data`);
            this.activeOrgDataSubscriptions.delete(orgId);
            socket.emit('leave_room', `org:${orgId}:teams`);
            socket.emit('leave_room', `org:${orgId}:sites`);
            socket.emit('leave_room', `org:${orgId}:facilities`);
            socket.emit('leave_room', `org:${orgId}:events`);
            socket.emit('leave_room', `org:${orgId}:games`);
        });
    }

    subscribeToOrganizationSummary(orgId: string) {
        if (!orgId) return;
        const key = `org:${orgId}:summary`;
        if (this.cancelUnsubscribe(key)) return;
        if (this.activeOrgSummarySubscriptions.has(orgId)) return;

        console.log(`Store: Subscribing to organization ${orgId} summary (lightweight)`);
        this.activeOrgSummarySubscriptions.add(orgId);
        socket.emit('join_room', `org:${orgId}:summary`);
    }

    subscribeToOrganizationSummaries(orgIds: string[]) {
        if (!orgIds || orgIds.length === 0) return;
        console.log(`Store: Batch subscribing to ${orgIds.length} organization summaries`);
        const newIds = orgIds.filter(id => !this.activeOrgSummarySubscriptions.has(id));
        if (newIds.length === 0) return;

        newIds.forEach(id => {
            this.activeOrgSummarySubscriptions.add(id);
            socket.emit('join_room', `org:${id}:summary`);
        });
    }

    unsubscribeFromOrganizationSummary(orgId: string) {
        if (!orgId) return;
        const key = `org:${orgId}:summary`;
        this.scheduleUnsubscribe(key, () => {
            if (!this.activeOrgSummarySubscriptions.has(orgId)) return;
            this.activeOrgSummarySubscriptions.delete(orgId);
            socket.emit('leave_room', `org:${orgId}:summary`);
        });
    }

    unsubscribeFromOrganizationSummaries(orgIds: string[]) {
        if (!orgIds || orgIds.length === 0) return;
        orgIds.forEach(id => {
            const key = `org:${id}:summary`;
            this.scheduleUnsubscribe(key, () => {
                if (!this.activeOrgSummarySubscriptions.has(id)) return;
                this.activeOrgSummarySubscriptions.delete(id);
                socket.emit('leave_room', `org:${id}:summary`);
            });
        });
    }

    unsubscribeFromAllOrganizationSummaries() {
        console.log("Store: Unsubscribing from all organization summaries");
        this.unsubscribeFromOrganizationSummaries(Array.from(this.activeOrgSummarySubscriptions));
    }

    // --- Actions ---
    fetchOrganization(id: string) {
        return new Promise<Organization | null>((resolve) => {
            socket.emit('get_data', { type: 'organization', id }, (data: Organization) => {
                if (data) {
                    this.mergeOrganization(data, false);
                    this.notifyListeners();
                }
                resolve(data || null);
            });
        });
    }

    fetchOrganizations(page = 1, limit = 10, search = '', isClaimed?: boolean) {
        socket.emit('get_data', { type: 'organizations', page, limit, search, isClaimed }, (res: any) => { 
            if(res && res.items) {
                const currentIds = new Set(this.organizations.map(o => o.id));
                const nextIds = new Set(res.items.map((o: any) => o.id));
                const toLeave = Array.from(currentIds).filter(id => !nextIds.has(id));
                this.unsubscribeFromOrganizationSummaries(toLeave);

                this.organizations = res.items;
                this.totalOrganizations = res.total;
                this.subscribeToOrganizationSummaries(res.items.map((org: any) => org.id));
                this.notifyListeners();
            }
        });
    }

    addOrganization = (org: Omit<Organization, "id"> & { creatorId?: string }) => {
        return new Promise<Organization>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.ADD_ORG, payload: org }, (response: any) => {
                if (response.status === 'ok') resolve(response.data);
                else reject(new Error(response.message || 'Failed to add organization'));
            });
        });
    };

    updateOrganization = (id: string, data: Partial<Organization>) => {
        const orgIndex = this.organizations.findIndex(o => o.id === id);
        if (orgIndex > -1) {
             this.organizations[orgIndex] = { ...this.organizations[orgIndex], ...data };
             this.notifyListeners();

             return new Promise<Organization>((resolve, reject) => {
                 socket.emit('action', { type: SocketAction.UPDATE_ORG, payload: { id, data } }, (response: any) => {
                     if (response.status === 'ok') resolve(response.data);
                     else reject(new Error(response.message || 'Failed to update organization'));
                 });
             });
        }
        return Promise.reject(new Error('Organization not found'));
    };

    deleteOrganization = (id: string) => {
        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.DELETE_ORG, payload: { id } }, (response: any) => {
                if (response.status === 'ok') {
                    this.organizations = this.organizations.filter(o => o.id !== id);
                    this.notifyListeners();
                    resolve();
                } else reject(new Error(response.message || 'Failed to delete organization'));
            });
        });
    };

    // --- Getters ---
    getOrganizations = () => this.organizations;
    getOrganization = (id?: string) => id ? this.organizations.find(o => o.id === id) : this.organizations[0];

    // --- Helpers ---
    protected mergeOrganization(org: Organization, notify = true) {
        const index = this.organizations.findIndex(o => o.id === org.id);
        if (index > -1) this.organizations[index] = { ...this.organizations[index], ...org };
        else this.organizations.push(org);

        const cacheIndex = this.localOrganizationCache.findIndex(o => o.id === org.id);
        if (cacheIndex > -1) this.localOrganizationCache[cacheIndex] = org;
        else {
            this.localOrganizationCache.unshift(org);
            if (this.localOrganizationCache.length > this.MAX_LOCAL_ORGS) this.localOrganizationCache.pop();
        }
        if (notify) this.notifyListeners();
    }

    // --- Search ---
    searchSimilarOrganizations = (name: string): Promise<Organization[]> => {
        const query = name.trim().toLowerCase();
        if (!query) return Promise.resolve([]);
        const localResults = this.searchOrganizationsLocal(query);

        return new Promise((resolve) => {
            socket.emit('get_data', { type: 'search_similar_orgs', name }, (backendData: Organization[]) => {
                if (backendData) backendData.forEach(org => this.mergeOrganization(org));
                resolve(this.searchOrganizationsLocal(query));
            });
            setTimeout(() => resolve(localResults), 50); 
        });
    };

    searchOrganizationsLocal = (query: string): Organization[] => {
        const queryParts = query.split(/\s+/).filter(p => p.length > 0);
        const scored = this.localOrganizationCache.map(org => {
            const orgName = org.name.toLowerCase();
            const shortName = (org.shortName || "").toLowerCase();
            const orgParts = orgName.split(/\s+/).concat(shortName ? [shortName] : []);
            let score = 0;
            if (orgName === query) score += 100;
            else if (orgName.startsWith(query)) score += 20;
            if (shortName === query) score += 50;
            queryParts.forEach(qPart => {
                let bestWordScore = 0;
                for (const oPart of orgParts) {
                    if (oPart === qPart) { bestWordScore = 10; break; }
                    if (oPart.startsWith(qPart)) bestWordScore = Math.max(bestWordScore, 5);
                    if (qPart.length > 2 && oPart.length > 2) {
                         const dist = levenshtein(qPart, oPart);
                         const maxErrors = qPart.length > 5 ? 2 : 1;
                         if (dist <= maxErrors) bestWordScore = Math.max(bestWordScore, 3);
                    }
                }
                score += bestWordScore;
            });
            return { org, score };
        });
        return scored.filter(item => item.score > 0).sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.org.name.length - b.org.name.length;
        }).map(item => item.org).slice(0, 10); 
    }

    // --- Membership Logic ---
    getOrganizationMembers = (orgId: string) => {
         const memberships = this.organizationMemberships.filter(m => m.orgId === orgId && !m.endDate);
         return memberships.map(m => {
            // NOTE: Using a cast here because the full profile might not be in cache yet
            // This logic relies on profiles being merged via handleUpdate/SYNC
            const profile = this.orgProfiles.find(p => p.id === m.orgProfileId);
            return {
              ...profile!,
              roleId: m.roleId,
              roleName: this.getOrganizationRole(m.roleId)?.name,
              membershipId: m.id,
              startDate: m.startDate,
              endDate: m.endDate
            };
          }).filter(p => p && p.id);
    };

    addOrganizationMember = (orgProfileId: string, orgId: string, roleId: string) => {
        const payload = { orgProfileId, orgId, roleId, startDate: new Date().toISOString() };
        return new Promise<OrgMembership>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.ADD_ORG_MEMBER, payload }, (response: any) => {
                if (response.status === 'ok') resolve(response.data);
                else reject(new Error(response.message || 'Failed to add organization member'));
            });
        });
    };

    removeOrganizationMember = (membershipId: string) => {
        const index = this.organizationMemberships.findIndex(m => m.id === membershipId);
        if (index > -1) {
            this.organizationMemberships[index].endDate = new Date().toISOString(); 
            this.notifyListeners();
            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.REMOVE_ORG_MEMBER, payload: { id: membershipId } }, (response: any) => {
                    if (response.status === 'ok') resolve();
                    else reject(new Error(response.message || 'Failed to remove organization member'));
                });
            });
        }
        return Promise.reject(new Error('Membership not found'));
    };

    updateOrganizationMember = (membershipId: string, roleId: string) => {
        const index = this.organizationMemberships.findIndex(m => m.id === membershipId);
        if (index > -1) {
            this.organizationMemberships[index] = { ...this.organizationMemberships[index], roleId };
            this.notifyListeners();
            return new Promise<OrgMembership>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.UPDATE_ORG_MEMBER, payload: { id: membershipId, roleId } }, (response: any) => {
                    if (response.status === 'ok') resolve(response.data);
                    else reject(new Error(response.message || 'Failed to update organization member'));
                });
            });
        }
        return Promise.reject(new Error('Membership not found'));
    };

    protected mergeOrgMembership(membership: OrgMembership, notify = true) {
        const index = this.organizationMemberships.findIndex(m => m.id === membership.id);
        if (index > -1) this.organizationMemberships[index] = { ...this.organizationMemberships[index], ...membership };
        else this.organizationMemberships.push(membership);
        if (notify) this.notifyListeners();
    }
}
