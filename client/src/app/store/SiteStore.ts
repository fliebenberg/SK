import { Site, Facility, SocketAction } from "@sk/types";
import { socket } from "../../lib/socketService";
import { TeamStore } from "./TeamStore";

export class SiteStore extends TeamStore {
    // --- Subscriptions ---
    subscribeToSite(siteId: string) {
        if (!siteId || siteId === 'default' || this.activeSiteSubscriptions.has(siteId)) return;
        this.activeSiteSubscriptions.add(siteId);
        socket.emit('join_room', `site:${siteId}`);
    }

    unsubscribeFromSite(siteId: string) {
        if (!this.activeSiteSubscriptions.has(siteId)) return;
        this.activeSiteSubscriptions.delete(siteId);
        socket.emit('leave_room', `site:${siteId}`);
    }

    subscribeToFacility(facilityId: string) {
        if (!facilityId || facilityId === 'default' || this.activeFacilitySubscriptions.has(facilityId)) return;
        this.activeFacilitySubscriptions.add(facilityId);
        socket.emit('join_room', `facility:${facilityId}`);
    }

    unsubscribeFromFacility(facilityId: string) {
        if (!this.activeFacilitySubscriptions.has(facilityId)) return;
        this.activeFacilitySubscriptions.delete(facilityId);
        socket.emit('leave_room', `facility:${facilityId}`);
    }

    // --- Actions ---
    addSite = (site: Omit<Site, "id">) => {
         return new Promise<Site>((resolve, reject) => {
             socket.emit('action', { type: SocketAction.ADD_SITE, payload: site }, (response: any) => {
                 if (response.status === 'ok') {
                     this.mergeSite(response.data);
                     resolve(response.data);
                 } else reject(new Error(response.message || 'Failed to add site'));
             });
         });
    };

    updateSite = (id: string, data: Partial<Site>) => {
        const index = this.sites.findIndex(s => s.id === id);
        if (index > -1) {
            this.sites[index] = { ...this.sites[index], ...data };
            this.notifyListeners();
            return new Promise<Site>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.UPDATE_SITE, payload: { id, data } }, (response: any) => {
                    if (response.status === 'ok') resolve(response.data);
                    else reject(new Error(response.message || 'Failed to update site'));
                });
            });
        }
        return Promise.reject(new Error('Site not found'));
    };

    deleteSite = (id: string) => {
        const site = this.sites.find(s => s.id === id);
        if (site) {
            const prev = [...this.sites];
            this.sites = this.sites.filter(s => s.id !== id);
            this.notifyListeners();
            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.DELETE_SITE, payload: { id } }, (response: any) => {
                    if (response.status === 'ok') resolve();
                    else {
                        this.sites = prev;
                        this.notifyListeners();
                        reject(new Error(response.message || 'Failed to delete site'));
                    }
                });
            });
        }
        return Promise.reject(new Error('Site not found'));
    };

    addFacility = (facility: Omit<Facility, "id">) => {
         return new Promise<Facility>((resolve, reject) => {
             socket.emit('action', { type: SocketAction.ADD_FACILITY, payload: facility }, (response: any) => {
                 if (response.status === 'ok') {
                     this.mergeFacility(response.data);
                     resolve(response.data);
                 } else reject(new Error(response.message || 'Failed to add facility'));
             });
         });
    };

    updateFacility = (id: string, data: Partial<Facility>) => {
        const index = this.facilities.findIndex(f => f.id === id);
        if (index > -1) {
            this.facilities[index] = { ...this.facilities[index], ...data };
            this.notifyListeners();
            return new Promise<Facility>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.UPDATE_FACILITY, payload: { id, data } }, (response: any) => {
                    if (response.status === 'ok') resolve(response.data);
                    else reject(new Error(response.message || 'Failed to update facility'));
                });
            });
        }
        return Promise.reject(new Error('Facility not found'));
    };

    deleteFacility = (id: string) => {
        const facility = this.facilities.find(f => f.id === id);
        if (facility) {
            this.facilities = this.facilities.filter(f => f.id !== id);
            this.notifyListeners();
            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.DELETE_FACILITY, payload: { id } }, (response: any) => {
                    if (response.status === 'ok') resolve();
                    else reject(new Error(response.message || 'Failed to delete facility'));
                });
            });
        }
        return Promise.reject(new Error('Facility not found'));
    };

    fetchFacilitiesForSite(siteId: string) {
        socket.emit('get_data', { type: 'facilities', siteId }, (data: Facility[]) => {
            if (data && Array.isArray(data)) data.forEach(f => this.mergeFacility(f));
        });
    }

    // --- Getters ---
    getSites = (orgId?: string) => orgId ? this.sites.filter(s => s.orgId === orgId) : this.sites;
    getSite = (id: string) => this.sites.find(s => s.id === id);
    getFacilities = (siteId?: string) => siteId ? this.facilities.filter(f => f.siteId === siteId) : this.facilities;
    getFacility = (id: string) => this.facilities.find(f => f.id === id);

    // --- Helpers ---
    protected mergeSite(site: Site) {
        const index = this.sites.findIndex(s => s.id === site.id);
        if (index > -1) this.sites[index] = { ...this.sites[index], ...site };
        else this.sites.push(site);
        this.notifyListeners();
    }

    protected mergeFacility(facility: Facility) {
        const index = this.facilities.findIndex(f => f.id === facility.id);
        if (index > -1) this.facilities[index] = { ...this.facilities[index], ...facility };
        else this.facilities.push(facility);
        this.notifyListeners();
    }
}
