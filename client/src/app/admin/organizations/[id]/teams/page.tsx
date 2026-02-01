"use client";

import { MetalButton } from "@/components/ui/MetalButton";
import { store } from "@/app/store/store";
import { Plus, Users, Trophy, Circle, Shield, Target, Disc, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamListFilter } from "@/components/admin/TeamListFilter";
import { DeactivatedTeamsSection } from "@/components/admin/DeactivatedTeamsSection";
import { TeamList } from "@/components/admin/TeamList";
import { GroupedTeamList } from "@/components/admin/GroupedTeamList";
import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Organization, Team, Sport } from "@sk/types";

// Helper for icons (keep outside component)
const getSportIcon = (sport: string) => {
  const normalizedSport = sport.toLowerCase();
  if (normalizedSport.includes('soccer') || normalizedSport.includes('football')) return <Activity className="h-4 w-4" />;
  if (normalizedSport.includes('rugby')) return <Shield className="h-4 w-4" />;
  if (normalizedSport.includes('cricket')) return <Target className="h-4 w-4" />;
  if (normalizedSport.includes('netball')) return <Disc className="h-4 w-4" />;
  if (normalizedSport.includes('basketball')) return <Circle className="h-4 w-4" />;
  return <Trophy className="h-4 w-4" />;
};

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AgeGroupFilter } from "@/components/admin/AgeGroupFilter";

// ... (imports)

export default function TeamManagementPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const sportParam = searchParams.get('sport');

  const [groupBy, setGroupBy] = useState<'none' | 'sport' | 'age'>('none');
  const [ageFilter, setAgeFilter] = useState<string>("all");
  const [org, setOrg] = useState<Organization | undefined>(undefined);
  const [teams, setTeams] = useState<Team[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);

  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    const updateData = () => {
        setOrg(store.getOrganization(id));
        setTeams(store.getTeams(id));
        setSports(store.getSports());
    };

    updateData();
    const unsubscribe = store.subscribe(updateData);
    return () => unsubscribe();
  }, [id]);

  useEffect(() => {
      if (!hasInitialized && teams.length > 0) {
          const uniqueSportIds = new Set(teams.map(t => t.sportId));
          // If multiple sports, default to 'sport', otherwise 'age'
          setGroupBy(uniqueSportIds.size > 1 ? 'sport' : 'age');
          setHasInitialized(true);
      }
  }, [teams, hasInitialized]);

  if (!org) return <div>Loading...</div>;

  // Derived state
  let currentSport = "all";
  if (org.supportedSportIds?.length === 1) {
    currentSport = org.supportedSportIds[0];
  } else if (sportParam) {
    currentSport = sportParam;
  }

  // Filter teams
  const filteredTeams = teams.filter(t => {
      const matchSport = currentSport === "all" || t.sportId === currentSport;
      const matchAge = ageFilter === "all" || t.ageGroup === ageFilter;
      return matchSport && matchAge;
  });

  // Unique Age Groups for Filter
  // We collect age groups from ALL teams (or should it be filtered by sport? usually better to show relevant ones)
  // Let's filter available age groups based on current sport selection to be helpful
  const availableAgeGroups = Array.from(new Set(
      (currentSport === "all" ? teams : teams.filter(t => t.sportId === currentSport))
      .map(t => t.ageGroup)
      .filter(Boolean)
  )).sort();

  // Sort teams
  const sortedTeams = [...filteredTeams].sort((a, b) => a.name.localeCompare(b.name));

  const activeTeams = sortedTeams.filter(t => t.isActive ?? true);
  const deactivatedTeams = sortedTeams.filter(t => !(t.isActive ?? true));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6">
        <div className="text-center xl:text-left">
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-orbitron)' }}>Team Management</h1>
          <p className="text-muted-foreground">Manage your organization's teams and rosters.</p>
        </div>

        {/* Toolbar: Add Button (Top on Mobile) + Filters (Bottom on Mobile) */}
        <div className="flex flex-col md:flex-row-reverse items-center justify-between gap-4">
             {/* Add Team Button */}
             <div className="w-full md:w-auto flex justify-end">
                <MetalButton 
                    variantType="filled" 
                    glowColor="hsl(var(--primary))"
                    size="sm"
                    className="text-primary-foreground whitespace-nowrap w-full md:w-auto"
                    icon={<Plus className="h-4 w-4" />}
                    href={`/admin/organizations/${id}/teams/new`}
                >
                    Add Team
                </MetalButton>
             </div>

             {/* Filters & Grouping */}
             <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <TeamListFilter 
                    sports={org.supportedSportIds.map(id => store.getSport(id)).filter((s): s is NonNullable<typeof s> => !!s)} 
                    currentSport={currentSport} 
                    organizationId={id} 
                />
                
                <AgeGroupFilter 
                    ageGroups={availableAgeGroups}
                    currentAgeGroup={ageFilter}
                    onFilterChange={setAgeFilter}
                />

                <div className="flex items-center gap-2">
                     <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider whitespace-nowrap hidden sm:inline-block">Group By:</span>
                     <div className="w-[140px]">
                        <Select value={groupBy} onValueChange={(v: any) => setGroupBy(v)}>
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder="Group By" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">No Grouping</SelectItem>
                                <SelectItem value="sport">Sport</SelectItem>
                                <SelectItem value="age">Age Group</SelectItem>
                            </SelectContent>
                        </Select>
                     </div>
                </div>
             </div>
        </div>
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-0 md:p-6">
          <GroupedTeamList 
            teams={activeTeams} 
            organizationId={id} 
            sports={store.getSports()} 
            groupBy={groupBy}
            isActive={true} 
          />
        </CardContent>
      </Card>

      <DeactivatedTeamsSection 
        teams={deactivatedTeams} 
        organizationId={id} 
        sports={store.getSports()} 
        groupBy={groupBy}
      />
    </div>
  );
}
