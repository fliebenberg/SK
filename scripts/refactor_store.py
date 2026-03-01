import re
import sys

def process(content):
    # Imports
    content = content.replace(' Venue,', ' Site, Facility,')
    
    # Class Properties
    content = content.replace('venues: Venue[] = []', 'sites: Site[] = [];\n    facilities: Facility[] = []')
    
    # Active Subscriptions
    content = content.replace('activeVenueSubscriptions: Set<string> = new Set();', 'activeSiteSubscriptions: Set<string> = new Set();\n    activeFacilitySubscriptions: Set<string> = new Set();')
    
    # subscribeToOrganizationData
    content = content.replace("socket.emit('join_room', `org:${orgId}:venues`);", "socket.emit('join_room', `org:${orgId}:sites`);\n        socket.emit('join_room', `org:${orgId}:facilities`);")
    
    # unsubscribeFromOrganizationData
    content = content.replace("socket.emit('leave_room', `org:${orgId}:venues`);", "socket.emit('leave_room', `org:${orgId}:sites`);\n            socket.emit('leave_room', `org:${orgId}:facilities`);")
    
    # subscribeToVenue -> subscribeToSite & subscribeToFacility
    content = content.replace("""    subscribeToVenue(venueId: string) {
        if (!venueId || venueId === 'default' || this.activeVenueSubscriptions.has(venueId)) return;
        this.activeVenueSubscriptions.add(venueId);
        socket.emit('join_room', `venue:${venueId}`);
    }""", """    subscribeToSite(siteId: string) {
        if (!siteId || siteId === 'default' || this.activeSiteSubscriptions.has(siteId)) return;
        this.activeSiteSubscriptions.add(siteId);
        socket.emit('join_room', `site:${siteId}`);
    }
    subscribeToFacility(facilityId: string) {
        if (!facilityId || facilityId === 'default' || this.activeFacilitySubscriptions.has(facilityId)) return;
        this.activeFacilitySubscriptions.add(facilityId);
        socket.emit('join_room', `facility:${facilityId}`);
    }""")
    
    # unsubscribeFromVenue
    content = content.replace("""    unsubscribeFromVenue(venueId: string) {
        if (!this.activeVenueSubscriptions.has(venueId)) return;
        this.activeVenueSubscriptions.delete(venueId);
        socket.emit('leave_room', `venue:${venueId}`);
    }""", """    unsubscribeFromSite(siteId: string) {
        if (!this.activeSiteSubscriptions.has(siteId)) return;
        this.activeSiteSubscriptions.delete(siteId);
        socket.emit('leave_room', `site:${siteId}`);
    }
    unsubscribeFromFacility(facilityId: string) {
        if (!this.activeFacilitySubscriptions.has(facilityId)) return;
        this.activeFacilitySubscriptions.delete(facilityId);
        socket.emit('leave_room', `facility:${facilityId}`);
    }""")
    
    # setupListeners connect
    content = content.replace("this.activeVenueSubscriptions.forEach(id => socket.emit('join_room', `venue:${id}`));", "this.activeSiteSubscriptions.forEach(id => socket.emit('join_room', `site:${id}`));\n            this.activeFacilitySubscriptions.forEach(id => socket.emit('join_room', `facility:${id}`));")
    
    # handleUpdate
    content = content.replace("""            case 'VENUE_ADDED':
                this.mergeVenue(event.data as Venue);
                break;""", """            case 'SITE_ADDED':
                this.mergeSite(event.data as Site);
                break;
            case 'FACILITY_ADDED':
                this.mergeFacility(event.data as Facility);
                break;""")
                
    content = content.replace("""            case 'VENUES_UPDATED': // Keep for compatibility if needed, using mergeVenue
            case 'VENUE_UPDATED': // If we add this logic later
                this.mergeVenue(event.data as Venue);
                break;
            case 'VENUE_DELETED':
                this.venues = this.venues.filter(v => v.id !== event.data.id);
                break;""", """            case 'SITE_UPDATED':
                this.mergeSite(event.data as Site);
                break;
            case 'SITE_DELETED':
                this.sites = this.sites.filter(s => s.id !== event.data.id);
                break;
            case 'FACILITY_UPDATED':
                this.mergeFacility(event.data as Facility);
                break;
            case 'FACILITY_DELETED':
                this.facilities = this.facilities.filter(f => f.id !== event.data.id);
                break;""")

    content = content.replace("""            case 'VENUES_SYNC':
                console.log(`Store: Received VENUES_SYNC with ${event.data.length} venues`);
                event.data.forEach((v: Venue) => this.mergeVenue(v));
                break;""", """            case 'SITES_SYNC':
                console.log(`Store: Received SITES_SYNC with ${event.data.length} sites`);
                event.data.forEach((s: Site) => this.mergeSite(s));
                break;
            case 'FACILITIES_SYNC':
                console.log(`Store: Received FACILITIES_SYNC with ${event.data.length} facilities`);
                event.data.forEach((f: Facility) => this.mergeFacility(f));
                break;""")
                
    # mergeVenue
    content = content.replace("""    private mergeVenue(venue: Venue) {
        const index = this.venues.findIndex(v => v.id === venue.id);
        if (index > -1) this.venues[index] = { ...this.venues[index], ...venue };
        else this.venues.push(venue);

        this.notifyListeners();
    }""", """    private mergeSite(site: Site) {
        const index = this.sites.findIndex(s => s.id === site.id);
        if (index > -1) this.sites[index] = { ...this.sites[index], ...site };
        else this.sites.push(site);
        this.notifyListeners();
    }
    private mergeFacility(facility: Facility) {
        const index = this.facilities.findIndex(f => f.id === facility.id);
        if (index > -1) this.facilities[index] = { ...this.facilities[index], ...facility };
        else this.facilities.push(facility);
        this.notifyListeners();
    }""")
    
    # getters
    content = content.replace("""    getVenues = (orgId?: string) => orgId ? this.venues.filter(v => v.orgId === orgId) : this.venues;
    getVenue = (id: string) => this.venues.find(v => v.id === id);""", """    getSites = (orgId?: string) => orgId ? this.sites.filter(s => s.orgId === orgId) : this.sites;
    getSite = (id: string) => this.sites.find(s => s.id === id);
    getFacilities = (siteId?: string) => siteId ? this.facilities.filter(f => f.siteId === siteId) : this.facilities;
    getFacility = (id: string) => this.facilities.find(f => f.id === id);""")
    
    # updateVenue, deleteVenue, addVenue
    content = content.replace("""    addVenue = (venue: Omit<Venue, "id">) => {
         return new Promise<Venue>((resolve, reject) => {
             socket.emit('action', { type: SocketAction.ADD_VENUE, payload: venue }, (response: any) => {
                 if (response.status === 'ok') {
                     this.mergeVenue(response.data);
                     resolve(response.data);
                 } else {
                     reject(new Error(response.message || 'Failed to add venue'));
                 }
             });
         });
    };""", """    addSite = (site: Omit<Site, "id">) => {
         return new Promise<Site>((resolve, reject) => {
             socket.emit('action', { type: SocketAction.ADD_SITE, payload: site }, (response: any) => {
                 if (response.status === 'ok') {
                     this.mergeSite(response.data);
                     resolve(response.data);
                 } else {
                     reject(new Error(response.message || 'Failed to add site'));
                 }
             });
         });
    };
    addFacility = (facility: Omit<Facility, "id">) => {
         return new Promise<Facility>((resolve, reject) => {
             socket.emit('action', { type: SocketAction.ADD_FACILITY, payload: facility }, (response: any) => {
                 if (response.status === 'ok') {
                     this.mergeFacility(response.data);
                     resolve(response.data);
                 } else {
                     reject(new Error(response.message || 'Failed to add facility'));
                 }
             });
         });
    };""")
    
    content = content.replace("""    updateVenue = (id: string, data: Partial<Venue>) => {
        const index = this.venues.findIndex(v => v.id === id);
        if (index > -1) {
            const updated = { ...this.venues[index], ...data };
            this.venues[index] = updated;
            this.notifyListeners();

            return new Promise<Venue>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.UPDATE_VENUE, payload: { id, data } }, (response: any) => {
                    if (response.status === 'ok') {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.message || 'Failed to update venue'));
                    }
                });
            });
        }
        return Promise.reject(new Error('Venue not found'));
    };""", """    updateSite = (id: string, data: Partial<Site>) => {
        const index = this.sites.findIndex(s => s.id === id);
        if (index > -1) {
            const updated = { ...this.sites[index], ...data };
            this.sites[index] = updated;
            this.notifyListeners();

            return new Promise<Site>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.UPDATE_SITE, payload: { id, data } }, (response: any) => {
                    if (response.status === 'ok') {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.message || 'Failed to update site'));
                    }
                });
            });
        }
        return Promise.reject(new Error('Site not found'));
    };
    updateFacility = (id: string, data: Partial<Facility>) => {
        const index = this.facilities.findIndex(f => f.id === id);
        if (index > -1) {
            const updated = { ...this.facilities[index], ...data };
            this.facilities[index] = updated;
            this.notifyListeners();

            return new Promise<Facility>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.UPDATE_FACILITY, payload: { id, data } }, (response: any) => {
                    if (response.status === 'ok') {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.message || 'Failed to update facility'));
                    }
                });
            });
        }
        return Promise.reject(new Error('Facility not found'));
    };""")
    
    content = content.replace("""    deleteVenue = (id: string) => {
        const venue = this.venues.find(v => v.id === id);
        if (venue) {
            this.venues = this.venues.filter(v => v.id !== id);
            this.notifyListeners();

            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.DELETE_VENUE, payload: { id } }, (response: any) => {
                    if (response.status === 'ok') {
                        resolve();
                    } else {
                        reject(new Error(response.message || 'Failed to delete venue'));
                    }
                });
            });
        }
        return Promise.reject(new Error('Venue not found'));
    };""", """    deleteSite = (id: string) => {
        const site = this.sites.find(s => s.id === id);
        if (site) {
            this.sites = this.sites.filter(s => s.id !== id);
            this.notifyListeners();

            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.DELETE_SITE, payload: { id } }, (response: any) => {
                    if (response.status === 'ok') resolve();
                    else reject(new Error(response.message || 'Failed to delete site'));
                });
            });
        }
        return Promise.reject(new Error('Site not found'));
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
    };""")

    # Events referencing venue
    content = content.replace('// if (event.venueId) this.subscribeToVenue(event.venueId);', '// if (event.siteId) this.subscribeToSite(event.siteId);')
    
    return content


if __name__ == '__main__':
    with open('c:/Fred/Coding/SK/client/src/app/store/store.ts', 'r', encoding='utf-8') as f:
        content = f.read()
    content = process(content)
    with open('c:/Fred/Coding/SK/client/src/app/store/store.ts', 'w', encoding='utf-8') as f:
        f.write(content)
