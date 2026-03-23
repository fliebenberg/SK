"use client";

import { useEffect } from 'react';
import { useNavigationGuardContext } from '@/contexts/NavigationGuardContext';

/**
 * Hook to flag a page as having unsaved changes.
 * @param isDirty Whether the page currently has unsaved changes.
 */
export function useUnsavedChanges(isDirty: boolean) {
  const { setIsDirty } = useNavigationGuardContext();

  useEffect(() => {
    setIsDirty(isDirty);
    
    // Cleanup on unmount
    return () => {
      setIsDirty(false);
    };
  }, [isDirty, setIsDirty]);
}
