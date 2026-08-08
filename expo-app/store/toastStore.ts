import { create } from 'zustand';

export type ToastType = 'error' | 'success' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number; // duration in ms (default: 4500ms)
  timestamp: number;
}

export interface ShowToastOptions {
  type?: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastStoreState {
  toasts: ToastMessage[];
  showToast: (options: ShowToastOptions) => string;
  showError: (message: string, title?: string, options?: { duration?: number }) => string;
  showSuccess: (message: string, title?: string, options?: { duration?: number }) => string;
  showWarning: (message: string, title?: string, options?: { duration?: number }) => string;
  showInfo: (message: string, title?: string, options?: { duration?: number }) => string;
  dismissToast: (id: string) => void;
  clearAll: () => void;
}

const DEDUPLICATION_WINDOW_MS = 2500;
const DEFAULT_DURATION_MS = 4500;

export const useToastStore = create<ToastStoreState>((set, get) => ({
  toasts: [],

  showToast: (options: ShowToastOptions) => {
    const { toasts } = get();
    const now = Date.now();
    const type = options.type || 'error';
    const message = options.message || 'An unexpected error occurred';

    // Deduplication check: ignore identical message & type within deduplication window
    const recentDuplicate = toasts.find(
      (t) => t.type === type && t.message === message && now - t.timestamp < DEDUPLICATION_WINDOW_MS
    );

    if (recentDuplicate) {
      return recentDuplicate.id;
    }

    const id = `toast-${now}-${Math.random().toString(36).substring(2, 7)}`;
    const newToast: ToastMessage = {
      id,
      type,
      title: options.title,
      message,
      duration: options.duration ?? DEFAULT_DURATION_MS,
      timestamp: now,
    };

    set((state) => ({
      // Limit total visible toasts to 4 at a time
      toasts: [...state.toasts.slice(-3), newToast],
    }));

    return id;
  },

  showError: (message: string, title?: string, options?: { duration?: number }) => {
    return get().showToast({
      type: 'error',
      title: title || 'Error',
      message,
      duration: options?.duration,
    });
  },

  showSuccess: (message: string, title?: string, options?: { duration?: number }) => {
    return get().showToast({
      type: 'success',
      title: title || 'Success',
      message,
      duration: options?.duration,
    });
  },

  showWarning: (message: string, title?: string, options?: { duration?: number }) => {
    return get().showToast({
      type: 'warning',
      title: title || 'Warning',
      message,
      duration: options?.duration,
    });
  },

  showInfo: (message: string, title?: string, options?: { duration?: number }) => {
    return get().showToast({
      type: 'info',
      title: title || 'Notice',
      message,
      duration: options?.duration,
    });
  },

  dismissToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearAll: () => {
    set({ toasts: [] });
  },
}));
