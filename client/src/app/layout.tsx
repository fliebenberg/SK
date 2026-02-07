import type { Metadata } from "next";
import { Inter, Orbitron } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeInitializer } from "@/components/theme-initializer";
import { AuthProvider } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { NavigationLoader } from "@/components/NavigationLoader";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { Suspense } from "react";
import { Toaster } from "@/components/ui/toast";
import { ClientProviders } from "@/components/ClientProviders";
import { Footer } from "@/components/Footer";

const inter = Inter({ subsets: ["latin"] });
const orbitron = Orbitron({ subsets: ["latin"], variable: "--font-orbitron" });

export const metadata: Metadata = {
  title: "Sports Manager",
  description: "Manage your sports teams and events",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(inter.className, orbitron.variable, "min-h-screen bg-background font-sans antialiased flex flex-col")}>
        <ClientProviders>
          <Navbar />
          <main className="flex-1">
            {children}
          </main>
          <Footer />
        </ClientProviders>
      </body>
    </html>
  );
}
