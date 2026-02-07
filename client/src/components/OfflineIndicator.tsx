"use client";

import { useEffect, useState } from "react";
import { store } from "@/app/store/store";
import { WifiOff } from "lucide-react";

export function OfflineIndicator() {
  const [connected, setConnected] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Initial state
    setConnected(store.isConnected());

    // Subscribe to state changes
    const unsubscribe = store.subscribe(() => {
      setConnected(store.isConnected());
    });

    return () => unsubscribe();
  }, []);

  if (!mounted || connected) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-destructive text-destructive-foreground px-3 py-1.5 rounded-full flex items-center gap-2 text-[10px] font-bold shadow-lg border border-destructive-foreground/20 backdrop-blur-sm bg-opacity-90">
        <WifiOff className="w-3.5 h-3.5" />
        <span>Offline - Reconnecting...</span>
      </div>
    </div>
  );
}
