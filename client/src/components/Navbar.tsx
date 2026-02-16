"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { MobileSidebar } from "@/components/admin/AdminSidebar";
import { UserMenu } from "@/components/UserMenu";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Menu, X, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { store } from "@/app/store/store";

export function Navbar() {
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuth();
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [canSeeAdmin, setCanSeeAdmin] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setCanSeeAdmin(false);
      return;
    }

    const updatePermissions = () => {
      setCanSeeAdmin(isAuthenticated);
    };

    updatePermissions();
    return store.subscribe(updatePermissions);
  }, [isAuthenticated, user]);

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
            {canSeeAdmin && (
              <Link href="/admin" className="transition-colors hover:text-primary/80 text-primary font-semibold">
                Admin
              </Link>
            )}
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
          
          {isAuthenticated && (
            <Link href="/notifications" className="relative p-2 text-foreground/60 hover:text-primary transition-colors">
              <Bell className="w-6 h-6" />
              {store.unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {store.unreadCount > 9 ? '9+' : store.unreadCount}
                </span>
              )}
            </Link>
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
            {canSeeAdmin && (
              <Link 
                href="/admin" 
                className="px-4 py-2 hover:bg-accent text-primary font-semibold rounded-md transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Admin Panel
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
