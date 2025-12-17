import { MetalButton } from "@/components/ui/MetalButton";
import { store } from "@/lib/store";
import { Plus, Users, Trophy, Circle, Shield, Target, Disc, Activity } from "lucide-react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamListFilter } from "@/components/admin/TeamListFilter";
import { DeactivatedTeamsSection } from "@/components/admin/DeactivatedTeamsSection";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
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

export default async function TeamManagementPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { sport } = await searchParams;
  
  const org = store.getOrganization(id);
  const allTeams = store.getTeams(id);
  
  // Determine default sport selection
  let currentSport = "all";
  if (org.supportedSportIds.length === 1) {
    currentSport = org.supportedSportIds[0];
  } else if (typeof sport === 'string') {
    currentSport = sport;
  }

  // Filter teams
  const filteredTeams = currentSport === "all" 
    ? allTeams 
    : allTeams.filter(t => t.sportId === currentSport);

  // Sort teams: Active first, then Deactivated (though we split them below)
  const teams = [...filteredTeams].sort((a, b) => a.name.localeCompare(b.name));

  const activeTeams = teams.filter(t => t.isActive ?? true);
  const deactivatedTeams = teams.filter(t => !(t.isActive ?? true));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-orbitron)' }}>Team Management</h1>
          <p className="text-muted-foreground">Manage your organization's teams and rosters.</p>
        </div>
        <div className="flex flex-row items-center gap-4">
            <TeamListFilter 
                sports={org.supportedSportIds.map(id => store.getSport(id)).filter((s): s is NonNullable<typeof s> => !!s)} 
                currentSport={currentSport} 
                organizationId={id} 
            />
            <MetalButton 
                    variantType="filled" 
                    glowColor="hsl(var(--primary))"
                    size="sm"
                    className="text-primary-foreground whitespace-nowrap"
                    icon={<Plus className="h-4 w-4" />}
                    href={`/admin/organizations/${id}/teams/new`}
                >
                    Add Team
                </MetalButton>
        </div>
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="px-4 py-4 md:px-6 md:py-6">
          <CardTitle>Teams ({activeTeams.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 md:p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px] pl-4 md:pl-2"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Age Group</TableHead>
                <TableHead className="hidden md:table-cell">Players</TableHead>
                <TableHead className="text-right pr-4 md:pr-2">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeTeams.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No active teams found for the selected criteria.
                  </TableCell>
                </TableRow>
              ) : (
                activeTeams.map((team) => (
                  <TableRow 
                    key={team.id} 
                    className="group hover:bg-muted/50"
                  >
                    <TableCell className="pl-4 md:pl-2 py-3">
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary">
                            {getSportIcon(store.getSport(team.sportId)?.name || '')}
                        </div>
                    </TableCell>
                    <TableCell className="font-medium py-3">
                        <div className="flex flex-col">
                            <span>{team.name}</span>
                            <span className="text-xs text-muted-foreground md:hidden">{team.ageGroup} • {store.getTeamMembers(team.id).filter(p => p.roleId === 'role-player').length} Players</span>
                        </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell py-3">{team.ageGroup}</TableCell>
                    <TableCell className="hidden md:table-cell py-3">
                        <div className="flex items-center gap-1 text-muted-foreground">
                            <Users className="h-3 w-3" />
                            {store.getTeamMembers(team.id).filter(p => p.roleId === 'role-player').length}
                        </div>
                    </TableCell>
                    <TableCell className="text-right pr-4 md:pr-2 py-3">
                        <MetalButton 
                          variantType="outlined" 
                          size="sm" 
                          className="h-8 text-xs px-3" 
                          glowColor="hsl(var(--primary))"
                          href={`/admin/organizations/${id}/teams/${team.id}`}
                        >
                          Manage
                        </MetalButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DeactivatedTeamsSection teams={deactivatedTeams} organizationId={id} sports={store.getSports()} />
    </div>
  );
}
