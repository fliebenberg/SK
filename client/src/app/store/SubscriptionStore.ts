import { socket } from "../../lib/socketService";
import { StateStore } from "./StateStore";

export class SubscriptionStore extends StateStore {
    // Track active subscriptions to avoid duplicates
    protected activeTeamSubscriptions: Set<string> = new Set();
    protected activeOrgSubscriptions: Set<string> = new Set();
    protected activeOrgDataSubscriptions: Set<string> = new Set();
    protected activeOrgSummarySubscriptions: Set<string> = new Set();
    protected activeEventSubscriptions: Set<string> = new Set();
    protected activeSiteSubscriptions: Set<string> = new Set();
    protected activeFacilitySubscriptions: Set<string> = new Set();
    protected activeGameSubscriptions: Set<string> = new Set();
    protected activeOrgReferralSubscriptions: Set<string> = new Set();

    // Subscription Timer Management
    protected unsubscribeTimers: Map<string, any> = new Map();
    protected readonly DEBOUNCE_MS = 2 * 60 * 1000; // 2 minutes

    protected cancelUnsubscribe(key: string) {
        if (this.unsubscribeTimers.has(key)) {
            console.log(`Store: Cancelling pending unsubscribe for ${key}`);
            clearTimeout(this.unsubscribeTimers.get(key));
            this.unsubscribeTimers.delete(key);
            return true;
        }
        return false;
    }

    protected scheduleUnsubscribe(key: string, callback: () => void) {
        this.cancelUnsubscribe(key);
        
        console.log(`Store: Scheduling unsubscribe for ${key} in ${this.DEBOUNCE_MS/1000}s`);
        const timer = setTimeout(() => {
            console.log(`Store: Executing unsubscribe for ${key}`);
            callback();
            this.unsubscribeTimers.delete(key);
        }, this.DEBOUNCE_MS);
        
        this.unsubscribeTimers.set(key, timer);
    }
}
