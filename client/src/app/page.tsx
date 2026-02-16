"use client";

import Link from "next/link";
import { MetalButton } from "@/components/ui/MetalButton";
import { FeatureSection } from "@/components/FeatureSection";
import { Trophy, Users, Calendar, ArrowRight, Activity, Plus, ShieldAlert } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { store } from "@/app/store/store";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function Home() {
  const { isAuthenticated, isLoading: authLoading, loginWithGoogle } = useAuth();
  const router = useRouter();
  const [hoveredSection, setHoveredSection] = useState<'left' | 'right' | null>(null);
  const [hasOrg, setHasOrg] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    // Check if user has an organization
    const checkOrg = () => {
        if (!isAuthenticated) {
            setHasOrg(false);
            return;
        }
        const isAppAdmin = store.userOrgMemberships.some(m => false); // Placeholder or use AuthContext
        // Use store helper if available
        const hasOwned = store.userOrgMemberships.some(m => m.roleId === 'role-org-admin');
        setHasOrg(hasOwned);
    };
    
    checkOrg();
    const unsubscribe = store.subscribe(checkOrg);
    return () => unsubscribe();
  }, []);

  const managementFeatures = [
    {
      title: "Team Management",
      description: "Effortlessly manage rosters, player details, and staff assignments. Keep your team organized and ready for every match.",
      imagePath: "/images/feature-team-management.png"
    },
    {
      title: "Tournament Setup",
      description: "Create and manage complex tournament structures with ease. Automated progression and clear visual draws for everyone.",
      imagePath: "/images/feature-tournament-brackets.png"
    },
    {
      title: "Smart Scheduling",
      description: "Drag-and-drop scheduling that handles conflicts automatically. Manage venues, times, and officials in one place.",
      imagePath: "/images/feature-scheduling.png"
    }
  ];

  const audienceFeatures = [
    {
      title: "Live Scores",
      description: "Real-time score updates that keep fans engaged. Every goal, point, and play is instantly available.",
      imagePath: "/images/feature-live-scores.png"
    },
    {
      title: "Player Stats",
      description: "Deep dive into player performance with detailed statistics and visualizations. Track progress throughout the season.",
      imagePath: "/images/feature-player-stats.png"
    },
    {
      title: "Mobile Experience",
      description: "A seamless experience on any device. Fans can follow the action from anywhere, anytime.",
      imagePath: "/images/feature-mobile-view.png"
    }
  ];

  return (
    <>
      <main className="flex min-h-screen flex-col bg-background text-foreground selection:bg-primary/30 overflow-x-hidden">
      
      {/* HERO SECTION */}
      <div className="flex flex-col md:flex-row min-h-[calc(100vh-4rem)]">
        {/* LEFT SECTION: Management */}
        <section 
          className={cn(
            "relative flex flex-col items-center justify-center p-8 md:p-16 transition-all duration-500 ease-in-out border-b md:border-b-0 md:border-r border-border",
            hoveredSection === 'left' ? 'md:w-[55%]' : hoveredSection === 'right' ? 'md:w-[45%]' : 'md:w-1/2',
            "w-full min-h-[50vh] md:min-h-full"
          )}
          onMouseEnter={() => setHoveredSection('left')}
          onMouseLeave={() => setHoveredSection(null)}
        >
          {/* Base Gradient - Clean & Simple */}
          <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/20 to-background z-0" />
          
          {/* Subtle Vignette */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-background/80 z-0" />

          <div className="relative z-10 flex flex-col items-center md:items-start text-center md:text-left space-y-6 max-w-lg">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-foreground to-muted-foreground" style={{ fontFamily: 'var(--font-orbitron)' }}>
              PROFESSIONAL <br/>
              <span className="text-muted-foreground">SPORT MANAGEMENT</span>
            </h2>
            
            <p className="text-lg text-muted-foreground leading-relaxed">
              Set up your organisation, manage teams and matches and organise tournaments.
            </p>

            <div className="pt-4">
              <MetalButton 
                variantType="secondary"
                className="min-w-[200px] text-lg"
                onClick={() => {
                  if (isAuthenticated) {
                    router.push('/admin');
                  } else {
                    setShowAuthModal(true);
                  }
                }}
              >
                <span className="flex items-center gap-2">
                  {hasOrg ? (
                    <>Manage your organisation <ArrowRight className="w-5 h-5" /></>
                  ) : (
                    <>Add your organisation <Plus className="w-5 h-5" /></>
                  )}
                </span>
              </MetalButton>
            </div>
          </div>
        </section>

        {/* RIGHT SECTION: Audience */}
        <section 
          className={cn(
            "relative flex flex-col items-center justify-center p-8 md:p-16 transition-all duration-500 ease-in-out",
            hoveredSection === 'right' ? 'md:w-[55%]' : hoveredSection === 'left' ? 'md:w-[45%]' : 'md:w-1/2',
            "w-full min-h-[50vh] md:min-h-full"
          )}
          onMouseEnter={() => setHoveredSection('right')}
          onMouseLeave={() => setHoveredSection(null)}
        >
          {/* Base Gradient - Clean & Simple */}
          <div className="absolute inset-0 bg-gradient-to-br from-muted via-background to-muted z-0" />
          
          {/* Very Subtle Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 blur-[100px] rounded-full pointer-events-none z-0" />

          <div className="relative z-10 flex flex-col items-center md:items-end text-center md:text-right space-y-6 max-w-lg">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-foreground to-muted-foreground" style={{ fontFamily: 'var(--font-orbitron)' }}>
              NEVER MISS <br/>
              <span className="text-primary drop-shadow-[0_0_15px_rgba(var(--primary),0.5)]">A MOMENT</span>
            </h2>
            
            <p className="text-lg text-muted-foreground leading-relaxed">
              Follow your favorite teams and players live. Real-time scores and stats delivered instantly.
            </p>

            <Link href="/live" className="pt-4">
              <MetalButton 
                variantType="filled" 
                glowColor="hsl(var(--primary))" 
                className="text-primary-foreground min-w-[200px] text-lg"
              >
                <span className="flex items-center gap-2">
                  Live Scores <Activity className="w-5 h-5" />
                </span>
              </MetalButton>
            </Link>
          </div>
        </section>
      </div>

      {/* FEATURE SECTIONS */}
      <div className="relative z-10 bg-background">
        <FeatureSection 
          title="Manage like a Pro" 
          description="Everything you need to run your sports organization efficiently. From the back office to the field."
          features={managementFeatures}
          alignment="left"
          className="bg-gradient-to-b from-background to-muted/30"
        />

        <FeatureSection 
          title="Game Day, Every Day" 
          description="Be part of the action on the field, wherever you are. Real-time updates, comprehensive stats and all the info at your fingertips."
          features={audienceFeatures}
          alignment="right"
          className="bg-gradient-to-b from-muted/30 to-background"
        />
      </div>

    </main>
      <Dialog open={showAuthModal} onOpenChange={setShowAuthModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <ShieldAlert className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-2xl font-bold tracking-tight">Authentication Required</DialogTitle>
            <DialogDescription className="text-base mt-2">
              You need to be logged in to manage or create an organization on ScoreKeeper.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 flex flex-col gap-3">
            <Button 
              type="button"
              variant="outline"
              className="w-full h-11 flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-slate-900 border-border font-semibold shadow-sm"
              onClick={() => {
                loginWithGoogle();
                setShowAuthModal(false);
              }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </Button>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase">
                <span className="bg-background px-2 text-muted-foreground whitespace-nowrap">
                  Or use your account
                </span>
              </div>
            </div>

            <Button 
              variant="default" 
              className="w-full h-11 text-base font-semibold"
              onClick={() => router.push('/login?callbackUrl=/admin')}
            >
              Log In
            </Button>
            <Button 
              variant="outline" 
              className="w-full h-11 text-base font-semibold"
              onClick={() => router.push('/signup?callbackUrl=/admin')}
            >
              Create Account
            </Button>
          </div>
          <DialogFooter className="sm:justify-center text-sm text-muted-foreground border-t pt-4">
            New to ScoreKeeper? Join thousands of managers today.
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
