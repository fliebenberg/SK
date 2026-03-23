"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNavigationGuardContext } from '@/contexts/NavigationGuardContext';
import { ConfirmationModal } from './ui/ConfirmationModal';

/**
 * Global component that intercepts navigation when there are unsaved changes.
 */
export function NavigationGuard() {
  const { isDirty, setIsDirty } = useNavigationGuardContext();
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
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
            setShowModal(true);
          }
        } catch (err) {
          // Ignore invalid URLs
        }
      }
    };

    // Capture phase to intercept before Next.js Link handles it
    window.addEventListener('click', handleAnchorClick, true);
    return () => window.removeEventListener('click', handleAnchorClick, true);
  }, [isDirty]);

  // 3. Browser Back/Forward (Popstate)
  // Note: Handling popstate perfectly in App Router is complex without custom routers.
  // This is a best-effort warning.
  useEffect(() => {
    const handlePopState = () => {
      if (isDirty) {
        // The URL has already changed. We push the current URL back onto the stack 
        // to "stay" on the page, then show the warning.
        window.history.pushState(null, '', window.location.href);
        setShowModal(true);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isDirty]);

  const handleConfirm = () => {
    setIsDirty(false); // Reset dirty state to allow navigation
    setShowModal(false);
    
    // If we have a pending URL from a click, navigate to it
    if (pendingUrl) {
      router.push(pendingUrl);
      setPendingUrl(null);
    } else {
        // If it was a popstate (back button), we've already pushState'd back.
        // Ideally we would trigger the back action again, but NEXT.JS router.back()
        // might conflict with our history manipulation. 
        // For now, Discard & Leave on a back button will just reset isDirty 
        // and user will have to click back again, or we can try router.back().
        router.back();
    }
  };

  const handleCancel = () => {
    setShowModal(false);
    setPendingUrl(null);
  };

  return (
    <ConfirmationModal
      isOpen={showModal}
      onOpenChange={setShowModal}
      title="Unsaved Changes"
      description="You have unsaved changes that will be lost if you leave this page. Are you sure you want to discard them?"
      confirmText="Discard & Leave"
      cancelText="Stay on Page"
      onConfirm={handleConfirm}
      variant="destructive"
    />
  );
}
