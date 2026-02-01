"use client";

import { MetalButton } from "@/components/ui/MetalButton";
import { store } from "@/app/store/store";
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
  organizationId: string;
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

export function TeamList({ teams, organizationId, sports, isActive = true }: TeamListProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50px] pl-4 md:pl-2"></TableHead>
          <TableHead className="hidden md:table-cell">Sport</TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="hidden md:table-cell">Age Group</TableHead>
          {isActive && <TableHead className="hidden md:table-cell">Players</TableHead>}
          <TableHead className="text-right pr-4 md:pr-2">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {teams.length === 0 ? (
          <TableRow>
            <TableCell colSpan={isActive ? 6 : 5} className="text-center py-8 text-muted-foreground">
              {isActive ? "No active teams found for the selected criteria." : "No deactivated teams."}
            </TableCell>
          </TableRow>
        ) : (
          teams.map((team) => (
            <TableRow 
              key={team.id} 
              className={cn(
                "group",
                isActive ? "hover:bg-muted/50" : "opacity-75 hover:opacity-100 hover:bg-muted/50"
              )}
            >
              <TableCell className="pl-4 md:pl-2 py-3">
                  <div className={cn(
                    "flex items-center justify-center h-8 w-8 rounded-full",
                    isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                      {getSportIcon(sports.find(s => s.id === team.sportId)?.name || '')}
                  </div>
              </TableCell>
              <TableCell className="hidden md:table-cell py-3">
                  <span className="font-medium text-muted-foreground">
                      {sports.find(s => s.id === team.sportId)?.name}
                  </span>
              </TableCell>
              <TableCell className="font-medium py-3">
                  <div className="flex flex-col">
                      <span>{team.name}</span>
                      <span className="text-xs text-muted-foreground md:hidden">
                        {sports.find(s => s.id === team.sportId)?.name} • {team.ageGroup}
                        {isActive && ` • ${team.playerCount || 0} Players`}
                      </span>
                  </div>
              </TableCell>
              <TableCell className="hidden md:table-cell py-3">
                  {team.ageGroup}
              </TableCell>
              {isActive && (
                <TableCell className="hidden md:table-cell py-3">
                    <div className="flex items-center gap-1 text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {team.playerCount || 0}
                    </div>
                </TableCell>
              )}
              <TableCell className="text-right pr-4 md:pr-2 py-3">
                  <MetalButton 
                    variantType="outlined" 
                    size="sm" 
                    className="h-8 text-xs px-3 w-fit ml-auto" 
                    glowColor="hsl(var(--primary))"
                    href={`/admin/organizations/${organizationId}/teams/${team.id}`}
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
