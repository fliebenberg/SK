"use client";

import { Team, Sport } from "@sk/types";
import { TeamList } from "@/components/admin/TeamList";

interface GroupedTeamListProps {
  teams: Team[];
  organizationId: string;
  sports: Sport[];
  groupBy: 'none' | 'sport' | 'age';
  isActive: boolean;
}

export function GroupedTeamList({ teams, organizationId, sports, groupBy, isActive }: GroupedTeamListProps) {
  if (groupBy === 'none') {
    return (
      <TeamList 
        teams={teams} 
        organizationId={organizationId} 
        sports={sports} 
        isActive={isActive} 
      />
    );
  }

  // Grouping Logic
  const groups = teams.reduce((acc, team) => {
    let key = "Other";
    if (groupBy === 'sport') {
        key = sports.find(s => s.id === team.sportId)?.name || "Other";
    } else if (groupBy === 'age') {
        key = team.ageGroup || "Other";
    }
    
    if (!acc[key]) acc[key] = [];
    acc[key].push(team);
    return acc;
  }, {} as Record<string, Team[]>);

  return (
    <div className="space-y-8">
      {Object.entries(groups).map(([group, groupTeams]) => {
        // Sort teams within the group based on the grouping context
        const sortedGroupTeams = [...groupTeams].sort((a, b) => {
            if (groupBy === 'sport') {
                // When grouped by sport, sort by Age Group
                const ageCompare = (a.ageGroup || "").localeCompare(b.ageGroup || "");
                if (ageCompare !== 0) return ageCompare;
            } else if (groupBy === 'age') {
                // When grouped by age, sort by Sport Name
                const sportA = sports.find(s => s.id === a.sportId)?.name || "";
                const sportB = sports.find(s => s.id === b.sportId)?.name || "";
                const sportCompare = sportA.localeCompare(sportB);
                if (sportCompare !== 0) return sportCompare;
            }
            // Fallback to name sort
            return a.name.localeCompare(b.name);
        });

        return (
            <div key={group} className="space-y-2">
                <div className="px-4 md:px-0 flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground bg-muted/30 px-2 py-1 rounded">{group}</span>
                    <span className="text-xs text-muted-foreground">({groupTeams.length})</span>
                </div>
                <TeamList 
                    teams={sortedGroupTeams} 
                    organizationId={organizationId} 
                    sports={sports} 
                    isActive={isActive} 
                />
            </div>
        );
      })}
    </div>
  );
}
