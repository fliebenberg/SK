"use client";

import Link from "next/link";
import { MetalButton } from "@/components/ui/MetalButton";
import { FeatureSection } from "@/components/FeatureSection";
import { Trophy, Users, Calendar, ArrowRight, Activity, Plus } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { store } from "@/lib/store";

export default function Home() {
  const [hoveredSection, setHoveredSection] = useState<'left' | 'right' | null>(null);
  const [hasOrg, setHasOrg] = useState(false);

  useEffect(() => {
    // Check if user has an organization
    const org = store.getOrganization();
    setHasOrg(!!org);
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

            <Link href="/admin" className="pt-4">
              <MetalButton 
                variantType="secondary"
                className="min-w-[200px] text-lg"
              >
                <span className="flex items-center gap-2">
                  {hasOrg ? (
                    <>Manage your organisation <ArrowRight className="w-5 h-5" /></>
                  ) : (
                    <>Add your organisation <Plus className="w-5 h-5" /></>
                  )}
                </span>
              </MetalButton>
            </Link>
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
  );
}
