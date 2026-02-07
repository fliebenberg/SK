"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeInitializer } from "@/components/theme-initializer";
import { AuthProvider } from "@/contexts/AuthContext";
import { NavigationLoader } from "@/components/NavigationLoader";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { Toaster } from "@/components/ui/toast";
import { Suspense, ReactNode } from "react";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem={true}
        disableTransitionOnChange
        themes={["light-orange", "dark-green", "dark-orange"]}
      >
        <ThemeInitializer />
        <AuthProvider>
          <Suspense fallback={null}>
            <NavigationLoader />
          </Suspense>
          <OfflineIndicator />
          {children}
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
