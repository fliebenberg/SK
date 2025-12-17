"use client";

import { MetalButton } from "@/components/ui/MetalButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { TeamMembership, Person } from "@/types";
import { addPersonAction, addTeamMemberAction, removeTeamMemberAction } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useThemeColors } from "@/hooks/useThemeColors";
import { Trash2, Plus, UserPlus } from "lucide-react";

import { store } from "@/lib/store";

interface TeamMemberWithDetails extends Person {
  roleId: string;
  membershipId: string;
}

interface TeamPlayersListProps {
  teamId: string;
  players: TeamMemberWithDetails[];
}

export function TeamPlayersList({ teamId, players }: TeamPlayersListProps) {
  const router = useRouter();
  const { isDark, metalVariant, primaryColor } = useThemeColors();
  const [isAdding, setIsAdding] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;

    setLoading(true);
    try {
      // For now, we assume simple flow: create new person and add to team
      // In future, we might want to search existing people first
      await addPersonAction(newPlayerName, "role-player", teamId);
      setNewPlayerName("");
      setIsAdding(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to add player:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePlayer = async (membershipId: string) => {
    if (!confirm("Are you sure you want to remove this player from the team?")) return;
    
    try {
      await removeTeamMemberAction(membershipId, teamId);
      router.refresh();
    } catch (error) {
      console.error("Failed to remove player:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Players</h3>
        <MetalButton
          onClick={() => setIsAdding(!isAdding)}
          variantType="filled"
          glowColor={primaryColor}
          metalVariant={metalVariant}
          className="text-primary-foreground whitespace-nowrap"
          icon={<Plus className="w-4 h-4" />}
          size="sm"
        >
          Add Player
        </MetalButton >
      </div>

      {isAdding && (
        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-6">
            <form onSubmit={handleAddPlayer} className="flex gap-4 items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="playerName">New Player Name</Label>
                <Input
                  id="playerName"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="Enter player name"
                  className="bg-background/50"
                  autoFocus
                />
              </div>
              <MetalButton
                type="submit"
                variantType="filled"
                glowColor={primaryColor}
                metalVariant={metalVariant}
                disabled={loading}
              >
                {loading ? "Adding..." : "Add"}
              </MetalButton>
              <MetalButton
                type="button"
                variantType="outlined"
                onClick={() => setIsAdding(false)}
                disabled={loading}
              >
                Cancel
              </MetalButton>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {players.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            <UserPlus className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No players in this team yet.</p>
            <p className="text-sm">Click "Add Player" to get started.</p>
          </div>
        ) : (
          players.map((player) => (
            <Card key={player.membershipId} className="border-border/50 bg-card/30 hover:bg-card/50 transition-colors">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                   <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                      {player.name.charAt(0).toUpperCase()}
                   </div>
                   <div>
                      <p className="font-medium">{player.name}</p>
                      <p className="text-xs text-muted-foreground">{store.getTeamRole(player.roleId)?.name}</p>
                   </div>
                </div>
                
                <MetalButton
                   variantType="outlined"
                   className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                   onClick={() => handleRemovePlayer(player.membershipId)}
                   title="Remove from team"
                >
                   <Trash2 className="w-4 h-4" />
                </MetalButton>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
