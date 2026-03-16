"use client";

import { MetalButton } from "@/components/ui/MetalButton";
import { store } from "@/app/store/store";
import { useRouter } from "next/navigation";
import { Users, Activity, Shield, Target, Disc, Trophy, Circle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Team, Sport } from "@sk/types";
import { cn } from "@/lib/utils";

interface TeamListProps {
  teams: Team[];
  orgId: string;
  sports: Sport[];
  isActive?: boolean;
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

export function TeamList({ teams, orgId, sports, isActive = true }: TeamListProps) {
  const router = useRouter();

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-none">
          <TableHead className="w-[48px] pl-3"></TableHead>
          <TableHead className="hidden md:table-cell">Sport</TableHead>
          <TableHead className="px-1">Name</TableHead>
          <TableHead className="hidden md:table-cell">Age Group</TableHead>
          {isActive && <TableHead className="hidden md:table-cell">Players</TableHead>}
          <TableHead className="hidden md:table-cell text-right pr-2">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {teams.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
              <div className="flex flex-col items-center justify-center opacity-40">
                <Users className="h-10 w-10 mb-2" />
                <p className="text-sm font-medium">
                  {isActive ? "No active teams found." : "No deactivated teams."}
                </p>
              </div>
            </TableCell>
          </TableRow>
        ) : (
          teams.map((team) => (
            <TableRow 
              key={team.id} 
              onClick={() => router.push(`/admin/organizations/${orgId}/teams/${team.id}`)}
              className={cn(
                "group cursor-pointer transition-colors active:scale-[0.99] border-border/40",
                isActive ? "hover:bg-primary/[0.03]" : "opacity-75 hover:bg-muted/50"
              )}
            >
              <TableCell className="pl-3 py-3 w-[48px]">
                  <div className={cn(
                    "flex items-center justify-center h-9 w-9 rounded-full border transition-all",
                    isActive ? "bg-primary/5 text-primary border-primary/10 group-hover:bg-primary/10 group-hover:scale-110" : "bg-muted text-muted-foreground border-transparent"
                  )}>
                      {getSportIcon(sports.find(s => s.id === team.sportId)?.name || '')}
                  </div>
              </TableCell>
              <TableCell className="hidden md:table-cell py-3">
                  <span className="font-semibold text-muted-foreground/70">
                      {sports.find(s => s.id === team.sportId)?.name}
                  </span>
              </TableCell>
              <TableCell className="py-3 px-1">
                  <div className="flex flex-col min-w-0">
                      <span className="font-bold text-base tracking-tight leading-none mb-1 group-hover:text-primary transition-colors">{team.name}</span>
                      <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-muted-foreground/60 md:hidden flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{sports.find(s => s.id === team.sportId)?.name}</span>
                        <span className="opacity-30">•</span> 
                        <span>{team.ageGroup}</span>
                        {isActive && (
                          <>
                            <span className="opacity-30">•</span> 
                            <span className="flex items-center gap-0.5">
                              <Users className="h-2.5 w-2.5" />
                              {team.playerCount || 0}
                            </span>
                          </>
                        )}
                      </span>
                  </div>
              </TableCell>
              <TableCell className="hidden md:table-cell py-3 font-bold text-muted-foreground/80">
                  {team.ageGroup}
              </TableCell>
              {isActive && (
                <TableCell className="hidden md:table-cell py-3">
                    <div className="flex items-center gap-1.5 font-bold text-muted-foreground/60">
                        <Users className="h-3.5 w-3.5" />
                        {team.playerCount || 0}
                    </div>
                </TableCell>
              )}
              <TableCell className="hidden md:table-cell text-right pr-2 py-3">
                  <MetalButton 
                    variantType="outlined" 
                    size="sm" 
                    className="h-8 text-[10px] font-black uppercase tracking-widest px-4 shadow-sm" 
                    glowColor="hsl(var(--primary))"
                  >
                    Manage
                  </MetalButton>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

