import { create } from 'zustand';

interface UnsavedChangesState {
  isDirty: boolean;
  onDiscard: (() => void) | null;
  setDirty: (dirty: boolean, onDiscard?: () => void) => void;
  clear: () => void;
  showDialog: boolean;
  pendingAction: (() => void) | null;
  triggerDiscardPrompt: (action: () => void) => void;
  confirmDiscard: () => void;
  cancelDiscard: () => void;
  setPendingAction: (action: (() => void) | null) => void;
  setShowDialog: (show: boolean) => void;
}

export const useUnsavedChangesStore = create<UnsavedChangesState>((set, get) => ({
  isDirty: false,
  onDiscard: null,
  setDirty: (dirty, onDiscard = undefined) =>
    set({ isDirty: dirty, onDiscard: onDiscard ?? null }),
  clear: () => set({ isDirty: false, onDiscard: null, showDialog: false, pendingAction: null }),
  showDialog: false,
  pendingAction: null,
  triggerDiscardPrompt: (action) => {
    if (!get().isDirty) {
      action();
      return;
    }
    set({ showDialog: true, pendingAction: action });
  },
  confirmDiscard: () => {
    const { onDiscard, pendingAction, clear } = get();
    onDiscard?.();
    clear();
    pendingAction?.();
  },
  cancelDiscard: () => {
    set({ showDialog: false, pendingAction: null });
  },
  setPendingAction: (action) => set({ pendingAction: action }),
  setShowDialog: (show) => set({ showDialog: show }),
}));
