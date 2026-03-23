"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeInitializer } from "@/components/theme-initializer";
import { AuthProvider } from "@/contexts/AuthContext";
import { NavigationLoader } from "@/components/NavigationLoader";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { Toaster } from "@/components/ui/toast";
import { Suspense, ReactNode } from "react";
import { NavigationGuardProvider } from "@/contexts/NavigationGuardContext";
import { NavigationGuard } from "@/components/NavigationGuard";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem={true}
        disableTransitionOnChange
        themes={["light-orange", "dark-green", "dark-orange"]}
        value={{
          "dark-green": "dark-green",
          "dark-orange": "dark-orange",
          "light-orange": "light-orange",
          "dark": "dark-orange",
          "light": "light-orange"
        }}
      >
        <ThemeInitializer />
        <AuthProvider>
          <NavigationGuardProvider>
            <Suspense fallback={null}>
              <NavigationLoader />
            </Suspense>
            <OfflineIndicator />
            <NavigationGuard />
            {children}
            <Toaster />
          </NavigationGuardProvider>
        </AuthProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

