"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface NavigationGuardContextType {
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  confirmNavigation: (onConfirm: () => void) => void;
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  pendingAction: (() => void) | null;
  setPendingAction: (action: (() => void) | null) => void;
}

const NavigationGuardContext = createContext<NavigationGuardContextType | undefined>(undefined);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const [isDirty, setIsDirtyInternal] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const setIsDirty = useCallback((dirty: boolean) => {
    setIsDirtyInternal(dirty);
  }, []);

  const confirmNavigation = useCallback((onConfirm: () => void) => {
    if (isDirty) {
      setPendingAction(() => onConfirm);
      setIsModalOpen(true);
    } else {
      onConfirm();
    }
  }, [isDirty]);

  return (
    <NavigationGuardContext.Provider value={{ 
        isDirty, 
        setIsDirty, 
        confirmNavigation,
        isModalOpen,
        setIsModalOpen,
        pendingAction,
        setPendingAction
    }}>
      {children}
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuardContext() {
  const context = useContext(NavigationGuardContext);
  if (context === undefined) {
    throw new Error('useNavigationGuardContext must be used within a NavigationGuardProvider');
  }
  return context;
}
