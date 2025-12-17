"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Users, Activity, Shield, Target, Disc, Trophy, Circle } from "lucide-react";
import { MetalButton } from "@/components/ui/MetalButton";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
// StoreClass import removed
// Actually, passing store methods to client component is bad.
// Better to pass the player counts or just the raw data if we can calculate it.
// For now let's just assume we pass the full team objects and handle simple display.
// The main page uses `store.getPersons(team.id).filter...`. We should probably do that calculation in the parent and pass it down, OR simpler: just don't show player count in the deactivated list or accept we can't easily access store here without prop drilling.
// Wait, the main page is a Server Component, so it has access to store.
// We should probably just render the TableContent here?
// Actually simpler: The parent (Server Component) can pass the teams.
// But checking player count requires store access.
// Let's import store here? It's a client component, store is a singleton. It *might* work but data sync issues again?
// NO. Client components mock store is separate.
// BEST APPROACH: Parent Server Component passes `teams` AND a map of `playerCounts`.
// OR: Just don't show player counts for deactivated teams for now to keep it simple. User just wants to see them and reactivate.

import { Team, Sport } from "@sk/types";

interface DeactivatedTeamsSectionProps {
  teams: Team[];
  organizationId: string;
  sports: Sport[];
}

const getSportIcon = (sport: string) => {
  const normalizedSport = sport.toLowerCase();
  if (normalizedSport.includes('soccer') || normalizedSport.includes('football')) return <Activity className="h-4 w-4" />;
  if (normalizedSport.includes('rugby')) return <Shield className="h-4 w-4" />;
  if (normalizedSport.includes('cricket')) return <Target className="h-4 w-4" />;
  if (normalizedSport.includes('netball')) return <Disc className="h-4 w-4" />;
  if (normalizedSport.includes('basketball')) return <Circle className="h-4 w-4" />;
  return <Trophy className="h-4 w-4" />;
};

export function DeactivatedTeamsSection({ teams, organizationId, sports }: DeactivatedTeamsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (teams.length === 0) return null;

  return (
    <div className="space-y-4 pt-8 border-t border-border/50">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
      >
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="font-medium text-sm">Deactivated Teams ({teams.length})</span>
      </button>

      {isOpen && (
        <div className="rounded-md border border-border/50 bg-muted/20">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px] pl-4 md:pl-2"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Age Group</TableHead>
                <TableHead className="text-right pr-4 md:pr-2">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {teams.map((team) => (
                  <TableRow 
                    key={team.id} 
                    className="group opacity-75 hover:opacity-100 hover:bg-muted/50"
                  >
                    <TableCell className="pl-4 md:pl-2 py-3">
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted text-muted-foreground">
                            {getSportIcon(sports.find(s => s.id === team.sportId)?.name || '')}
                        </div>
                    </TableCell>
                    <TableCell className="font-medium py-3">
                        <div className="flex flex-col">
                            <span>{team.name}</span>
                            <span className="text-xs text-muted-foreground md:hidden">{team.ageGroup}</span>
                        </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell py-3">{team.ageGroup}</TableCell>
                    <TableCell className="text-right pr-4 md:pr-2 py-3">
                      <Link href={`/admin/organizations/${organizationId}/teams/${team.id}`}>
                        <MetalButton variantType="outlined" size="sm" className="h-8 text-xs px-3" glowColor="hsl(var(--primary))">
                          Manage
                        </MetalButton>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
