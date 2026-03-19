import { Notification, SocketAction, OrgProfile, User, UserBadge, OrgMembership, Organization } from "@sk/types";
import { socket } from "../../lib/socketService";
import { GameStore } from "./GameStore";

export class UserStore extends GameStore {
    // --- Subscriptions ---
    subscribeToNotifications(userId: string) {
        if (!userId) return;
        const key = `user:${userId}:notifications`;
        if (this.cancelUnsubscribe(key)) return;
        console.log(`Store: Subscribing to notifications for user ${userId}`);
        socket.emit('join_room', `user:${userId}`);
    }

    unsubscribeFromNotifications(userId: string) {
        if (!userId) return;
        const key = `user:${userId}:notifications`;
        this.scheduleUnsubscribe(key, () => {
            console.log(`Store: Unsubscribing from notifications for user ${userId}`);
            socket.emit('leave_room', `user:${userId}`);
        });
    }

    subscribeToOrgReferrals(orgId: string) {
        if (!orgId) return;
        const key = `org:${orgId}:referrals`;
        if (this.cancelUnsubscribe(key)) return;
        if (this.activeOrgReferralSubscriptions.has(orgId)) return;
        console.log(`Store: Subscribing to organization ${orgId} referrals`);
        this.activeOrgReferralSubscriptions.add(orgId);
        socket.emit('join_room', `org:${orgId}:referrals`);
    }

    unsubscribeFromOrgReferrals(orgId: string) {
        if (!orgId) return;
        const key = `org:${orgId}:referrals`;
        this.scheduleUnsubscribe(key, () => {
            if (!this.activeOrgReferralSubscriptions.has(orgId)) return;
            console.log(`Store: Unsubscribing from organization ${orgId} referrals`);
            this.activeOrgReferralSubscriptions.delete(orgId);
            socket.emit('leave_room', `org:${orgId}:referrals`);
        });
    }

    // --- Notifications Actions ---
    fetchNotifications = (userId: string) => {
        socket.emit('get_data', { type: 'notifications', id: userId }, (data: Notification[]) => {
            if (data) {
                this.notifications = data;
                this.updateUnreadCount();
            }
        });
    };

    markNotificationAsRead = (id: string) => {
        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.MARK_NOTIFICATION_READ, payload: { id } }, (response: any) => {
                if (response.status === 'ok') {
                    const index = this.notifications.findIndex(n => n.id === id);
                    if (index > -1) {
                        this.notifications[index].isRead = true;
                        this.updateUnreadCount();
                    }
                    resolve();
                } else reject(new Error(response.message || 'Failed to mark notification as read'));
            });
        });
    };

    markAllNotificationsAsRead = (userId: string) => {
        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.MARK_ALL_NOTIFICATIONS_READ, payload: { userId } }, (response: any) => {
                if (response.status === 'ok') {
                    this.notifications.forEach(n => n.isRead = true);
                    this.updateUnreadCount();
                    resolve();
                } else reject(new Error(response.message || 'Failed to mark all as read'));
            });
        });
    };

    deleteNotification = (id: string) => {
        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.DELETE_NOTIFICATION, payload: { id } }, (response: any) => {
                if (response.status === 'ok') {
                    this.notifications = this.notifications.filter(n => n.id !== id);
                    this.updateUnreadCount();
                    resolve();
                } else reject(new Error(response.message || 'Failed to delete notification'));
            });
        });
    };

    // --- Org Referral / Claim Actions ---
    fetchOrgReferrals = (orgId: string) => {
        return new Promise<any[]>((resolve, reject) => {
            socket.emit('get_data', { type: 'org_referrals', orgId }, (data: any[]) => {
                if (data) resolve(data);
                else reject(new Error('Failed to fetch organization referrals'));
            });
        });
    };

    referOrgContactViaToken = (token: string, contactEmails: string[]) => {
        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.REFER_ORG_CONTACT_VIA_TOKEN, payload: { token, contactEmails } }, (response: any) => {
                if (response.status === 'ok') resolve();
                else reject(new Error(response.message || 'Failed to refer contact'));
            });
        });
    };
    
    referOrgContact = (orgId: string, contactEmails: string[], referredByUserId: string) => {
        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.REFER_ORG_CONTACT, payload: { orgId, contactEmails, referredByUserId } }, (response: any) => {
                if (response.status === 'ok') resolve();
                else reject(new Error(response.message || 'Failed to nominate contact'));
            });
        });
    };

    declineClaim = (token: string) => {
        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.DECLINE_CLAIM, payload: { token } }, (response: any) => {
                if (response.status === 'ok') resolve();
                else reject(new Error(response.message || 'Failed to decline claim'));
            });
        });
    };

    getClaimInfo = (token: string): Promise<any> => {
        return new Promise((resolve) => {
            socket.emit('get_data', { type: 'claim_info', token }, (data: any) => resolve(data));
        });
    };

    claimOrgViaToken = (token: string, userId: string) => {
        return new Promise<Organization>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.CLAIM_ORG_VIA_TOKEN, payload: { token, userId } }, (response: any) => {
                if (response.status === 'ok') {
                    this.mergeOrganization(response.data);
                    resolve(response.data);
                } else reject(new Error(response.message || 'Failed to claim organization via token'));
            });
        });
    };

    claimOrganization = (id: string, userId: string) => {
        return new Promise<Organization>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.CLAIM_ORG, payload: { id, userId } }, (response: any) => {
                if (response.status === 'ok') resolve(response.data);
                else reject(new Error(response.message || 'Failed to claim organization'));
            });
        });
    };

    // --- User Membership Actions ---
    fetchUserMemberships(userId: string, globalRole?: string) {
        if (!userId) return;
        this.currentUserId = userId;
        if (globalRole) this.globalRole = globalRole;
        socket.emit('get_data', { type: 'user_memberships', id: userId }, (data: { orgs: OrgMembership[], teams: any[] }) => {
            if (data) {
                this.userOrgMemberships = data.orgs;
                this.userTeamMemberships = data.teams;
                const orgIds = new Set<string>();
                data.orgs.forEach(m => orgIds.add(m.orgId));
                data.teams.forEach(m => orgIds.add(m.orgId));
                this.subscribeToOrganizationSummaries(Array.from(orgIds));
                this.notifyListeners();
            }
        });
    }

    getUserOrganizations() {
        const orgIds = new Set([
            ...this.userOrgMemberships.map(m => m.orgId),
            ...this.userTeamMemberships.map(m => m.orgId)
        ]);
        return this.organizations.filter(o => orgIds.has(o.id));
    }

    getAdminOrgIds(userId: string, globalRole?: string) {
        if (globalRole === 'admin') return this.organizations.map(o => o.id);
        const orgIds = new Set<string>();
        this.userOrgMemberships.forEach(m => {
            if (m.roleId === 'role-org-admin') orgIds.add(m.orgId);
        });
        this.userTeamMemberships.forEach(m => {
            if (m.roleId === 'role-coach') orgIds.add(m.orgId);
        });
        return Array.from(orgIds);
    }

    getPendingClaims = (email: string): Promise<any[]> => {
        return new Promise((resolve) => {
            socket.emit('get_data', { type: 'pending_claims', email }, (data: any[]) => resolve(data || []));
        });
    };

    getUserBadges = (userId: string) => {
        return new Promise<UserBadge[]>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.GET_USER_BADGES, payload: { userId } }, (response: any) => {
                if (response.status === 'ok') resolve(response.data);
                else reject(new Error(response.message || 'Failed to fetch badges'));
            });
        });
    };

    // --- Org Profile Actions ---
    addOrgProfile = (profile: Partial<OrgProfile>) => {
        return new Promise<OrgProfile>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.ADD_ORG_PROFILE, payload: profile }, (response: any) => {
                if (response.status === 'ok') {
                    this.mergeOrgProfile(response.data);
                    resolve(response.data);
                } else reject(new Error(response.message || 'Failed to add organization profile'));
            });
        });
    };

    deleteOrgProfile = (id: string) => {
        const profile = this.orgProfiles.find(p => p.id === id);
        if (profile) {
            this.orgProfiles = this.orgProfiles.filter(p => p.id !== id);
            this.teamMemberships = this.teamMemberships.filter(m => m.orgProfileId !== id);
            this.organizationMemberships = this.organizationMemberships.filter(m => m.orgProfileId !== id);
            this.notifyListeners();
            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.DELETE_ORG_PROFILE, payload: { id } }, (response: any) => {
                    if (response.status === 'ok') resolve();
                    else reject(new Error(response.message || 'Failed to delete organization profile'));
                });
            });
        }
        return Promise.reject(new Error('Profile not found'));
    };

    updateOrgProfile = (id: string, data: Partial<OrgProfile>) => {
        const index = this.orgProfiles.findIndex(p => p.id === id);
        if (index > -1) {
            this.orgProfiles[index] = { ...this.orgProfiles[index], ...data };
            this.notifyListeners();
        }
        return new Promise<OrgProfile>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.UPDATE_ORG_PROFILE, payload: { id, data } }, (response: any) => {
                if (response.status === 'ok') {
                    this.mergeOrgProfile(response.data);
                    resolve(response.data);
                } else reject(new Error(response.message || 'Failed to update organization profile'));
            });
        });
    };

    searchProfiles = (query: string, orgId?: string): Promise<OrgProfile[]> => {
        return new Promise((resolve) => {
            socket.emit('get_data', { type: 'search_people', query, orgId }, (data: OrgProfile[]) => {
                if (data) data.forEach(p => this.mergeOrgProfile(p));
                resolve(data || []);
            });
        });
    };

    findMatchingUser = (email?: string, name?: string, birthdate?: string): Promise<User | null> => {
        return new Promise((resolve) => {
            socket.emit('get_data', { type: 'find_matching_user', email, name, birthdate }, (user: User | null) => resolve(user));
        });
    };

    // --- Reports Actions ---
    submitReport = (data: { entityType: string; entityId: string; reason: string; description?: string; reporterUserId: string }) => {
        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.SUBMIT_REPORT, payload: data }, (response: any) => {
                if (response.status === 'ok') resolve();
                else reject(new Error(response.message || 'Failed to submit report'));
            });
        });
    };

    fetchReports(entityType?: string) {
        if (!this.currentUserId) return;
        socket.emit('get_data', { type: 'reports', id: this.currentUserId, entityType }, (data: any[]) => {
            if (data) {
                this.reports = data;
                this.notifyListeners();
            }
        });
    }

    // --- Home Feed ---
    getHomeFeed = (userId: string | undefined, timezone: string) => {
        return new Promise<any>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.FEED_GET_HOME, payload: { userId, timezone } }, (response: any) => {
                if (response.status === 'ok') resolve(response.data);
                else reject(new Error(response.message || 'Failed to fetch home feed'));
            });
        });
    };

    // --- Permissions ---
    canSeeAdmin(userId: string, globalRole?: string) {
        if (globalRole === 'admin') return true;
        const hasOrgAdmin = this.userOrgMemberships.some(m => m.roleId === 'role-org-admin');
        const hasCoach = this.userTeamMemberships.some(m => m.roleId === 'role-coach');
        return hasOrgAdmin || hasCoach;
    }

    // --- Helpers ---
    protected mergeNotification(notification: Notification) {
        const index = this.notifications.findIndex(n => n.id === notification.id);
        if (index > -1) this.notifications[index] = { ...this.notifications[index], ...notification };
        else this.notifications.unshift(notification);
        this.updateUnreadCount();
    }

    protected mergeReferral(referral: any) {
        const index = this.orgReferrals.findIndex(r => r.id === referral.id);
        if (index > -1) this.orgReferrals[index] = { ...this.orgReferrals[index], ...referral };
        else this.orgReferrals.unshift(referral);
        this.notifyListeners();
    }

    protected updateUnreadCount() {
        this.unreadCount = this.notifications.filter(n => !n.isRead).length;
        this.notifyListeners();
    }
}
