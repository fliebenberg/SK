"use client";

import Link from "next/link";
import { MetalButton } from "@/components/ui/MetalButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { store } from "@/lib/store";
import { Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

import { Team } from "@sk/types";

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>(store.getTeams());
  
  useEffect(() => {
     const updateTeams = () => setTeams([...store.getTeams()]);
     // Initial checks
     updateTeams();
     const unsubscribe = store.subscribe(updateTeams);
     return () => unsubscribe();
  }, []);


  return (
    <div className="container mx-auto py-8 px-4 min-h-screen">
      <div className="flex flex-col md:flex-row items-center justify-between mb-12 gap-6">
        <div className="text-center md:text-left">
          <h1 className="text-4xl font-bold tracking-tight mb-2" style={{ fontFamily: 'var(--font-orbitron)' }}>
            TEAMS
          </h1>
          <p className="text-muted-foreground">Manage your sports teams and rosters.</p>
        </div>
        <Link href="/teams/new">
          <MetalButton 
            variantType="filled" 
            glowColor="hsl(var(--primary))"
            className="text-primary-foreground"
          >
            <span className="flex items-center gap-2">
              <Plus className="mr-2 h-4 w-4" /> Add Team
            </span>
          </MetalButton>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => (
          <div key={team.id} className="group relative p-6 rounded-xl bg-card border border-border hover:border-primary/50 transition-all duration-300 hover:-translate-y-1">
            {/* Metallic overlay */}
            <div className="absolute inset-0 rounded-xl opacity-5 bg-[url('https://www.transparenttextures.com/patterns/brushed-alum.png')] pointer-events-none" />
            
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold" style={{ fontFamily: 'var(--font-orbitron)' }}>{team.name}</h3>
                <div className="p-2 rounded-full bg-muted">
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              
              <div className="text-sm text-muted-foreground mb-6">
                <span className="font-semibold text-foreground">{store.getSport(team.sportId)?.name}</span> • {team.ageGroup}
              </div>

              <Link href={`/teams/${team.id}`} className="block">
                <MetalButton variantType="outlined" glowColor="hsl(var(--foreground))" className="w-full">
                  View Details
                </MetalButton>
              </Link>
            </div>
          </div>
        ))}
        
        {teams.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
            <p>No teams found.</p>
            <p className="text-sm mt-2">Create a team to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
