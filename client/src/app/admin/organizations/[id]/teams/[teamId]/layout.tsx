"use client";

import { store } from "@/app/store/store";
import { MetalButton } from "@/components/ui/MetalButton";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Team } from "@sk/types";

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const id = params.id as string;
  const teamId = params.teamId as string;
  
  const [team, setTeam] = useState<Team | undefined>(() => store.getTeam(teamId));
  const [loading, setLoading] = useState(!store.getTeam(teamId));

  useEffect(() => {
    const update = () => {
        const t = store.getTeam(teamId);
        setTeam(t); // Always update state
        if (store.isLoaded() || t) {
             setLoading(false);
        }
    };
    update();
    const unsubscribe = store.subscribe(update);
    return () => unsubscribe();
  }, [teamId]);

  if (loading) {
      return (
        <div className="space-y-6">
            <div className="flex items-center gap-4 animate-pulse">
                <div className="h-10 w-10 rounded-full bg-muted" />
                <div className="space-y-2">
                    <div className="h-8 w-48 bg-muted rounded" />
                    <div className="h-4 w-24 bg-muted rounded" />
                </div>
            </div>
            {children}
        </div>
      );
  }

  if (!team) {
     // Allow children to render even if team not found in layout? 
     // Usually layout provides context. If layout fails, page fails.
     // But strictly speaking, the Page handles its own "Not Found" UI too.
     // Let's render a fallback or just return children wrapped?
     // If we return just children, they might look broken without header.
     // Better to show a generic header or 404 here locally.
     return (
         <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href={`/admin/organizations/${id}/teams`}>
                    <MetalButton variantType="outlined" size="icon" className="h-10 w-10 rounded-full" glowColor="hsl(var(--foreground))">
                        <ChevronLeft className="h-5 w-5" />
                    </MetalButton>
                </Link>
                <div>
                   <h1 className="text-3xl font-bold text-destructive">Team Not Found</h1>
                </div>
            </div>
            {children}
         </div>
     );
  }

  const tabs = [
    { name: "Details", href: `/admin/organizations/${id}/teams/${teamId}`, exact: true },
    { name: "Events", href: `/admin/organizations/${id}/teams/${teamId}/events` },
    { name: "Players", href: `/admin/organizations/${id}/teams/${teamId}/players` },
    { name: "Staff", href: `/admin/organizations/${id}/teams/${teamId}/staff` },
    { name: "Stats", href: `/admin/organizations/${id}/teams/${teamId}/stats` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/admin/organizations/${id}/teams`}>
          <MetalButton variantType="outlined" size="icon" className="h-10 w-10 rounded-full" glowColor="hsl(var(--foreground))">
            <ChevronLeft className="h-5 w-5" />
          </MetalButton>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-orbitron)' }}>
            {team.name}
          </h1>
          <p className="text-muted-foreground">
            {store.getSport(team.sportId)?.name} • {team.ageGroup}
          </p>
        </div>
      </div>

      <div className="border-b border-border/50">
        <AdminTabs tabs={tabs} />
      </div>

      <div className="min-h-[400px]">
        {children}
      </div>
    </div>
  );
}
