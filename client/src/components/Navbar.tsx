"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { MobileSidebar } from "@/components/admin/AdminSidebar";
import { UserMenu } from "@/components/UserMenu";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Navbar() {
  const pathname = usePathname();
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Default to silver/light if not mounted or unknown
  const isDark = mounted && theme?.includes("dark");
  const metalVariant = isDark ? "silver-dark" : "silver";

  const toggleMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  return (
    <nav className="border-b bg-background transition-colors duration-300 relative z-50">
      <div className="flex h-16 items-center px-4 container mx-auto">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg mr-6">
          <Logo size="sm" metalVariant={metalVariant} glowColor="hsl(var(--primary))" />
          <span className="hidden md:inline">ScoreKeeper</span>
        </Link>
        
        {/* Desktop Navigation - Hide on Admin routes */}
        {!pathname?.startsWith('/admin') && (
          <div className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="/teams" className="transition-colors hover:text-foreground/80 text-foreground/60">
              Teams
            </Link>
            <Link href="/venues" className="transition-colors hover:text-foreground/80 text-foreground/60">
              Venues
            </Link>
            <Link href="/live" className="transition-colors hover:text-foreground/80 text-foreground/60">
              Live Scores
            </Link>
          </div>
        )}

        <div className="ml-auto flex items-center gap-4">
          {/* Mobile Menu Button - Public routes */}
          {!pathname?.startsWith('/admin') && (
            <button 
              className="md:hidden p-2 text-foreground/60 hover:text-foreground transition-colors"
              onClick={toggleMenu}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          )}

          {/* Admin Mobile Menu - Admin routes */}
          {pathname?.startsWith('/admin') && (
            <div className="md:hidden">
              <MobileSidebar />
            </div>
          )}
          
          <UserMenu />
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-16 left-0 w-full bg-background border-b border-border shadow-lg animate-in slide-in-from-top-5 duration-200">
          <div className="flex flex-col p-4 space-y-4">
            <Link 
              href="/teams" 
              className="px-4 py-2 hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Teams
            </Link>
            <Link 
              href="/venues" 
              className="px-4 py-2 hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Venues
            </Link>
            <Link 
              href="/live" 
              className="px-4 py-2 hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Live Scores
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
