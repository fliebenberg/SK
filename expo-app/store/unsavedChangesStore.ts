import { create } from 'zustand';

interface UnsavedChangesState {
  isDirty: boolean;
  onDiscard: (() => void) | null;
  setDirty: (dirty: boolean, onDiscard?: () => void) => void;
  clear: () => void;
}

export const useUnsavedChangesStore = create<UnsavedChangesState>((set) => ({
  isDirty: false,
  onDiscard: null,
  setDirty: (dirty, onDiscard = undefined) =>
    set({ isDirty: dirty, onDiscard: onDiscard ?? null }),
  clear: () => set({ isDirty: false, onDiscard: null }),
}));
