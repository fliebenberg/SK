import { socketService } from "../../lib/socketService";

export class BaseStore {
    loaded: boolean = false;
    connected: boolean = false;
    protected listeners: (() => void)[] = [];

    isLoaded = () => this.loaded;
    isConnected = () => this.connected;

    subscribe(listener: () => void) {
        this.listeners.push(listener);
        return () => this.unsubscribe(listener);
    }

    unsubscribe(listener: () => void) {
        this.listeners = this.listeners.filter(l => l !== listener);
    }

    protected notifyListeners() {
        this.listeners.forEach(l => l());
    }
}
