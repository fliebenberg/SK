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
import { HeroGameCard } from "@/components/feed/HeroGameCard";
import { FeedItemCard } from "@/components/feed/FeedItemCard";
import { PersonalizationModal } from "@/components/feed/PersonalizationModal";
import { FeedHomeResponse } from "@sk/types";

export default function Home() {
  const { isAuthenticated, isLoading: authLoading, loginWithGoogle, user } = useAuth();
  const router = useRouter();
  
  // State
  const [hasOrg, setHasOrg] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPersonalization, setShowPersonalization] = useState(false);
  
  // Feed Data
  const [feedData, setFeedData] = useState<FeedHomeResponse | null>(null);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);

  useEffect(() => {
    // Check if user has an organization
    const checkOrg = () => {
        if (!isAuthenticated) {
            setHasOrg(false);
            return;
        }
        const hasOwned = store.userOrgMemberships.some(m => m.roleId === 'role-org-admin');
        setHasOrg(hasOwned);
    };
    
    const unsubscribe = store.subscribe(checkOrg);
    return () => unsubscribe();
  }, [isAuthenticated]);

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

  useEffect(() => {
    const loadFeed = async () => {
        setIsLoadingFeed(true);
        try {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const data = await store.getHomeFeed(user?.id, timezone);
            setFeedData(data);
            
            // Show personalization prompt for new authenticated users who haven't set preferences
            // For now, we'll simulate this by checking if the feed implies no preferences were found
            if (isAuthenticated && data && data.personalizedFeed.length === 0) {
                 // For demo purposes, we will rely on a manual CTA click for now
                 // setShowPersonalization(true); 
            }
        } catch (error) {
            console.error("Failed to load feed", error);
        } finally {
            setIsLoadingFeed(false);
        }
    };

    if (store.isConnected()) {
        loadFeed();
    } else {
        const unsubscribe = store.subscribe(() => {
            if (store.isConnected()) {
                loadFeed();
                unsubscribe();
            }
        });
        return () => unsubscribe();
    }
  }, [isAuthenticated, user]);

  return (
    <>
      <main className="flex min-h-[calc(100vh-4rem)] flex-col bg-background text-foreground selection:bg-primary/30 overflow-x-hidden">
      
        {/* TOP BANNER / CTA */}
        <div className="w-full bg-gradient-to-r from-muted/50 via-background to-muted/50 border-b border-border py-4 px-6 md:px-12 flex flex-col md:flex-row items-center justify-between gap-4">
             <div className="text-center md:text-left">
                  <h2 className="text-xl font-bold font-orbitron text-primary">ScoreKeeper</h2>
                  <p className="text-sm text-muted-foreground">Follow the action, manage your games. All in one place.</p>
             </div>
             <div className="flex items-center gap-3">
                  {!isAuthenticated && (
                       <Button variant="outline" size="sm" onClick={() => setShowAuthModal(true)}>
                           Sign In
                       </Button>
                  )}
                  {isAuthenticated && !hasOrg && (
                       <Button variant="outline" size="sm" onClick={() => router.push('/admin')}>
                           <Plus className="w-4 h-4 mr-2" /> Add Organization
                       </Button>
                  )}
                  {isAuthenticated && hasOrg && (
                       <Button variant="default" size="sm" onClick={() => router.push('/admin')}>
                           Manage Organization <ArrowRight className="w-4 h-4 ml-2" />
                       </Button>
                  )}
             </div>
        </div>

        {/* FEED LAYOUT */}
        <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8 flex flex-col xl:flex-row gap-8">
            
            {/* MAIN COLUMN */}
            <div className="flex-1 flex flex-col gap-10 min-w-0">
                
                {/* HERO CAROUSEL: LIVE & SOON */}
                <section>
                    <div className="flex justify-between items-end mb-4 pr-1">
                        <h3 className="text-2xl font-bold font-orbitron flex items-center gap-2">
                             Activity Hub <Activity className="w-5 h-5 text-primary" />
                        </h3>
                    </div>
                    
                    {isLoadingFeed ? (
                        <div className="flex gap-4 overflow-hidden pt-2">
                             {[1, 2, 3].map(i => (
                                 <div key={i} className="h-[180px] w-full max-w-sm rounded-xl bg-muted animate-pulse flex-shrink-0" />
                             ))}
                        </div>
                    ) : feedData?.heroGames?.length ? (
                        <div className="flex overflow-x-auto pb-6 pt-2 -mx-4 px-4 md:-mx-8 md:px-8 gap-6 snap-x snap-mandatory hide-scrollbar">
                            {feedData.heroGames.map(game => (
                                <HeroGameCard key={game.id} game={game} />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-border p-8 text-center bg-muted/20">
                             <p className="text-muted-foreground">No live action right now. Check back later!</p>
                        </div>
                    )}
                </section>

                {/* PERSONALIZATION PROMPT (Animated Banner) */}
                {isAuthenticated && (
                     <section className="relative overflow-hidden rounded-xl border border-primary/20 bg-primary/5 p-6 hover:bg-primary/10 transition-colors cursor-pointer" onClick={() => setShowPersonalization(true)}>
                           <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-4">
                                <div>
                                     <h4 className="text-lg font-bold">Make ScoreKeeper Yours</h4>
                                     <p className="text-sm text-muted-foreground">Tell us what sports and teams you follow to customize this feed.</p>
                                </div>
                                <Button variant="default" className="whitespace-nowrap shadow-md shadow-primary/20">Customize Feed</Button>
                           </div>
                     </section>
                )}

                {/* ACTIVITY TIMELINE */}
                <section>
                    <h3 className="text-xl font-bold mb-4 font-orbitron">My Feed</h3>
                    
                    {isLoadingFeed ? (
                        <div className="space-y-4">
                             {[1, 2, 3, 4].map(i => (
                                 <div key={i} className="h-[80px] w-full rounded-lg bg-muted animate-pulse" />
                             ))}
                        </div>
                    ) : feedData?.personalizedFeed?.length ? (
                        <div className="flex flex-col gap-3">
                            {feedData.personalizedFeed.map((item, idx) => (
                                <FeedItemCard key={item.id || idx} item={item} />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-xl border border-border p-8 text-center">
                             <p className="text-muted-foreground mb-4">You have no upcoming matches or recent results in your feed.</p>
                             {!isAuthenticated ? (
                                 <Button variant="outline" onClick={() => setShowAuthModal(true)}>Sign In to Follow Teams</Button>
                             ) : (
                                 <Button variant="outline" onClick={() => setShowPersonalization(true)}>Discover Sports</Button>
                             )}
                        </div>
                    )}
                </section>

            </div>

            {/* SIDEBAR: DISCOVERY */}
            <div className="xl:w-[350px] flex flex-col gap-8 shrink-0">
                 
                 <section className="rounded-xl border border-border bg-card p-5">
                      <h4 className="font-bold flex items-center gap-2 mb-4 border-b pb-2">
                          <Users className="w-4 h-4 text-muted-foreground"/> Trending Organizations
                      </h4>
                      {isLoadingFeed ? (
                           <div className="h-[150px] bg-muted animate-pulse rounded-md" />
                      ) : feedData?.discovery?.trendingOrganizations?.length ? (
                           <div className="flex flex-col gap-3">
                                {feedData.discovery.trendingOrganizations.map(org => (
                                     <div key={org.id} className="flex flex-col gap-1 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                                          <span className="font-semibold text-sm">{org.name}</span>
                                          <span className="text-xs text-muted-foreground line-clamp-1">Public Organization</span>
                                     </div>
                                ))}
                           </div>
                      ) : (
                           <p className="text-sm text-muted-foreground">No trending organizations right now.</p>
                      )}
                 </section>

                 <section className="rounded-xl border border-border bg-card p-5">
                      <h4 className="font-bold flex items-center gap-2 mb-4 border-b pb-2">
                          <Trophy className="w-4 h-4 text-muted-foreground"/> Top Tournaments
                      </h4>
                      {isLoadingFeed ? (
                           <div className="h-[150px] bg-muted animate-pulse rounded-md" />
                      ) : feedData?.discovery?.popularTournaments?.length ? (
                           <div className="flex flex-col gap-3">
                                {feedData.discovery.popularTournaments.map(tournament => (
                                     <div key={tournament.id} className="flex flex-col gap-1 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                                          <span className="font-semibold text-sm">{tournament.name}</span>
                                          <div className="flex gap-2 items-center">
                                               <span className="text-xs px-2 py-0.5 bg-muted rounded-full">Event</span>
                                          </div>
                                     </div>
                                ))}
                           </div>
                      ) : (
                           <p className="text-sm text-muted-foreground">No popular tournaments right now.</p>
                      )}
                 </section>

            </div>

        </div>

        {/* LEGACY FEATURE SECTIONS (Kept for Unauthenticated Users primarily, pushed down) */}
        {!isAuthenticated && (
            <div className="relative z-10 bg-background border-t border-border mt-12">
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
        )}

      </main>
      
      {isAuthenticated && user && (
           <PersonalizationModal 
               open={showPersonalization} 
               onOpenChange={setShowPersonalization} 
               userId={user.id} 
           />
      )}
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
