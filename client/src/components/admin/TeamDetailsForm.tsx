"use client";

import { MetalButton } from "@/components/ui/MetalButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { store } from "@/app/store/store";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Team, Organization, Game } from "@sk/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
// import { TeamPlayersList } from "./TeamPlayersList"; // Not needed here anymore
// NOTE: We should eventually move updateTeam to a Server Action too, but for now store updates might be tricky if we mix client/server stores. 
// Ideally we move ALL writes to Server Actions.
// But for this specific bug fix (404), we just need to display the data.

interface TeamDetailsFormProps {
  initialTeam: Team;
  organization: Organization; // Pass org to get sports
}

// import { updateTeamAction } from "@/app/actions";

export function TeamDetailsForm({ initialTeam, organization }: TeamDetailsFormProps) {
  const [team, setTeam] = useState<Team>(initialTeam);
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: initialTeam.name,
    sportId: initialTeam.sportId,
    ageGroup: initialTeam.ageGroup,
  });
  const [availableSports, setAvailableSports] = useState<any[]>([]); // Using any for now to match store return type inference or Sport[]
  const [hasGames, setHasGames] = useState(false);

  useEffect(() => {
    const updateSports = () => {
      const sports = (organization.supportedSportIds || [])
          .map(id => store.getSport(id))
          .filter(Boolean);
      setAvailableSports(sports);
      
      const games = store.getGames(organization.id);
      const teamHasGames = games.some(g => g.homeTeamId === initialTeam.id || g.awayTeamId === initialTeam.id);
      setHasGames(teamHasGames);
    };

    // Initial load
    updateSports();

    // Subscribe
    const unsubscribe = store.subscribe(() => {
        updateSports();
        const updatedTeam = store.getTeam(initialTeam.id);
        if (updatedTeam) {
            setTeam(updatedTeam);
            // Sync form data to prevent "ghost" dirty state
            setFormData({
                name: updatedTeam.name,
                sportId: updatedTeam.sportId,
                ageGroup: updatedTeam.ageGroup,
            });
        }
    });
    return () => unsubscribe();
  }, [organization.supportedSportIds, initialTeam.id, organization.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await store.updateTeam(team.id, formData);
      if (updated) {
          setTeam(updated);
      }
    } catch (error) {
      console.error("Failed to update team:", error);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: team.name,
      sportId: team.sportId,
      ageGroup: team.ageGroup,
    });
  };

  const handleToggleStatus = async () => {
    const newStatus = !(team.isActive ?? true);
    try {
      const updatedTeam = await store.updateTeam(team.id, { isActive: newStatus });
      if (updatedTeam) {
        setTeam(updatedTeam);
      }
    } catch (error) {
      console.error("Failed to toggle team status:", error);
    }
  };

  const handleDelete = async () => {
    // window.confirm removed in favor of AlertDialog
    try {
        await store.deleteTeam(team.id);
        router.push(`/admin/organizations/${organization.id}/teams`);
    } catch (error: any) {
        console.error("Failed to delete team:", error);
        toast({
            title: "Error",
            description: error.message || "Failed to delete team",
            variant: "destructive"
        });
    }
  };

  const isDirty = (
    formData.name !== team.name ||
    formData.sportId !== team.sportId ||
    formData.ageGroup !== team.ageGroup
  );

  const isActive = team.isActive ?? true;

  return (
    <div className="max-w-2xl">
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Team Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Team Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-background/50"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sport">Sport</Label>
                <Select
                  value={formData.sportId}
                  onValueChange={(value) => setFormData({ ...formData, sportId: value })}
                >
                  <SelectTrigger id="sport" className="bg-background/50">
                    <SelectValue placeholder="Select sport" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSports.map((sport) => (
                      <SelectItem key={sport!.id} value={sport!.id}>
                        {sport!.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="ageGroup">Age Group</Label>
                <Input
                  id="ageGroup"
                  value={formData.ageGroup}
                  onChange={(e) => setFormData({ ...formData, ageGroup: e.target.value })}
                  className="bg-background/50"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <MetalButton
                type="button"
                variantType={isActive ? "secondary" : "filled"}
                glowColor={isActive ? undefined : "hsl(var(--primary))"}
                onClick={handleToggleStatus}
                className={isActive ? "text-muted-foreground" : "text-primary-foreground"}
              >
                {isActive ? "Deactivate Team" : "Activate Team"}
              </MetalButton>

              {!hasGames && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <MetalButton
                          type="button"
                          variantType="filled"
                          glowColor="hsl(var(--destructive))"
                          className="text-destructive-foreground hover:bg-destructive/90"
                      >
                          Delete Team
                      </MetalButton>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete the team "{team.name}" and remove it from the organization.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
              )}

              {isDirty && (
                <div className="flex items-center gap-2">
                    <MetalButton
                        type="button"
                        variantType="outlined"
                        onClick={handleCancel}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        Cancel
                    </MetalButton>
                    <MetalButton
                        type="submit"
                        variantType="filled"
                        glowColor="hsl(var(--primary))"
                        className="text-primary-foreground"
                    >
                        Save Changes
                    </MetalButton>
                </div>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-4">
        <span className="font-bold text-destructive">Note:</span> Teams cannot be deleted once they have been allocated to a game. You can deactivate a team if you dont want them to be available for future schedules.
      </p>
    </div>
  );
}
