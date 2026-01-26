"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { Loader2 } from "lucide-react";

export function NavigationLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // When the route actually changes, we stop loading
  useEffect(() => {
    setLoading(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    const handleNavigationStart = (url: string) => {
      // Don't show for hash links or external links
      if (url.includes("#")) return;
      
      try {
        const targetUrl = new URL(url, window.location.origin);
        if (targetUrl.origin !== window.location.origin) return;
        
        // If it's a different path/query, start the timer
        if (targetUrl.pathname !== window.location.pathname || targetUrl.search !== window.location.search) {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            setLoading(true);
          }, 2000);
        }
      } catch (e) {
        // Ignore invalid URLs
      }
    };

    const handleAnchorClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const anchor = target.closest("a");

      if (anchor && anchor.href && anchor.target !== "_blank") {
        handleNavigationStart(anchor.href);
      }
    };

    // We can also try to monkey-patch pushState to catch router.push
    const originalPushState = window.history.pushState;
    window.history.pushState = function(...args) {
        if (typeof args[2] === 'string') {
            handleNavigationStart(args[2]);
        }
        return originalPushState.apply(this, args);
    };

    document.addEventListener("click", handleAnchorClick);
    return () => {
      document.removeEventListener("click", handleAnchorClick);
      window.history.pushState = originalPushState;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!loading) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/60 backdrop-blur-sm transition-all duration-300">
      <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-card border border-border/50 shadow-2xl animate-in fade-in zoom-in duration-300">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <span className="text-xl font-bold tracking-widest text-foreground uppercase animate-pulse" style={{ fontFamily: 'var(--font-orbitron)' }}>
          Processing...
        </span>
      </div>
    </div>
  );
}
