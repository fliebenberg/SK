"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNavigationGuardContext } from '@/contexts/NavigationGuardContext';
import { ConfirmationModal } from './ui/ConfirmationModal';

/**
 * Global component that intercepts navigation when there are unsaved changes.
 */
export function NavigationGuard() {
  const { 
    isDirty, 
    setIsDirty, 
    isModalOpen, 
    setIsModalOpen, 
    pendingAction, 
    setPendingAction 
  } = useNavigationGuardContext();
  
  const router = useRouter();
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  // 1. External navigation (tab closure, refresh, external links)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = ''; // Standard way to trigger browser confirmation
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // 2. Internal navigation (Click interception for <a> and <Link>)
  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      
      // If it's a link and we have unsaved changes
      if (anchor && anchor.href && isDirty) {
        // Parse the URL to see if it's internal
        try {
          const url = new URL(anchor.href);
          const isInternal = url.origin === window.location.origin;
          const isSamePath = url.pathname === window.location.pathname && url.search === window.location.search;

          if (isInternal && !isSamePath) {
            e.preventDefault();
            e.stopPropagation();
            setPendingUrl(anchor.href);
            setIsModalOpen(true);
          }
        } catch (err) {
          // Ignore invalid URLs
        }
      }
    };

    // Capture phase to intercept before Next.js Link handles it
    window.addEventListener('click', handleAnchorClick, true);
    return () => window.removeEventListener('click', handleAnchorClick, true);
  }, [isDirty, setIsModalOpen]);

  // 3. Browser Back/Forward (Popstate)
  useEffect(() => {
    const handlePopState = () => {
      if (isDirty) {
        // The URL has already changed. We push the current URL back onto the stack 
        // to "stay" on the page, then show the warning.
        window.history.pushState(null, '', window.location.href);
        setIsModalOpen(true);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isDirty, setIsModalOpen]);

  const handleConfirm = () => {
    setIsDirty(false); // Reset dirty state to allow action
    setIsModalOpen(false);
    
    // 1. If we have a pending context action (like theme change)
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
      return;
    }

    // 2. If we have a pending URL from a click
    if (pendingUrl) {
      router.push(pendingUrl);
      setPendingUrl(null);
    } else {
        // 3. If it was a popstate (back button)
        router.back();
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    setPendingUrl(null);
    setPendingAction(null);
  };

  return (
    <ConfirmationModal
      isOpen={isModalOpen}
      onOpenChange={setIsModalOpen}
      title="Unsaved Changes"
      description="You have unsaved changes that will be lost if you leave this page. Are you sure you want to discard them?"
      confirmText="Discard & Leave"
      cancelText="Stay on Page"
      onConfirm={handleConfirm}
      variant="destructive"
    />
  );
}
