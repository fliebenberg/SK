"use client";

import { MetalButton } from "@/components/ui/MetalButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { TeamMembership, Person } from "@sk/types";
import { PersonnelAutocomplete } from "@/components/ui/PersonnelAutocomplete";
import { addPersonAction, addTeamMemberAction, removeTeamMemberAction } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useThemeColors } from "@/hooks/useThemeColors";
import { Trash2, Plus, UserPlus, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { store } from "@/app/store/store";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";

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
  const { isDark, metalVariant } = useThemeColors();
  const [isAdding, setIsAdding] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(false);
  const orgId = store.getTeam(teamId)?.organizationId || "";
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; membershipId: string; name: string }>({
    isOpen: false,
    membershipId: "",
    name: "",
  });
  const [editingPlayer, setEditingPlayer] = useState<{ isOpen: boolean; personId: string; name: string }>({
    isOpen: false,
    personId: "",
    name: "",
  });

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;

    setLoading(true);
    try {
      // For now, we assume simple flow: create new person and add to team
      // Use store for optimistic update
      // 1. Create or Use Person
      let personId = selectedPerson?.id;
      
      if (!personId && newPlayerName.trim()) {
        const newPerson = await store.addPerson({ name: newPlayerName });
        personId = newPerson.id;
      }
      
      if (personId) {
        await store.addTeamMember(personId, teamId, "role-player");
      }

      setNewPlayerName("");
      setSelectedPerson(null);
      setIsAdding(false);
      // router.refresh(); // Not needed with store reactivity if we subscribe? 
      // This component creates players but receives them via props `players`.
      // The parent component passes `players`. We need to verify if parent is reactive.
      // Parent is `admin/organizations/[id]/teams/[teamId]/players/page.tsx` or similar?
      // Actually `TeamPlayersList` receives `players` prop.
      // If we update store, `players` prop needs to update.
      // We must check the parent component.

    } catch (error) {
      console.error("Failed to add player:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePlayer = (membershipId: string, name: string) => {
    setConfirmDelete({ isOpen: true, membershipId, name });
  };

  const onConfirmDelete = async () => {
    if (!confirmDelete.membershipId) return;
    
    try {
      await store.removeTeamMember(confirmDelete.membershipId);
      setConfirmDelete({ isOpen: false, membershipId: "", name: "" });
    } catch (error) {
      console.error("Failed to remove player:", error);
    }
  };

  const handleEditPlayer = (personId: string, name: string) => {
    setEditingPlayer({ isOpen: true, personId, name });
  };

  const onConfirmEdit = async () => {
    if (!editingPlayer.personId || !editingPlayer.name.trim()) return;
    
    try {
      await store.updatePerson(editingPlayer.personId, { name: editingPlayer.name });
      setEditingPlayer({ isOpen: false, personId: "", name: "" });
    } catch (error) {
      console.error("Failed to update player:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Players</h3>
        <MetalButton
          onClick={() => setIsAdding(!isAdding)}
          variantType="filled"
          glowColor="hsl(var(--primary))"
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
                <Label htmlFor="playerName">Player Name</Label>
                <PersonnelAutocomplete
                  organizationId={orgId}
                  value={newPlayerName}
                  onChange={setNewPlayerName}
                  onSelectPerson={setSelectedPerson}
                  placeholder="Search or enter player name"
                />
              </div>
              <MetalButton
                type="submit"
                variantType="filled"
                glowColor="hsl(var(--primary))"
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
                
                 <div className="flex items-center gap-2">
                    <MetalButton
                        variantType="outlined"
                        className="text-muted-foreground hover:text-primary h-8 w-8 p-0"
                        onClick={() => handleEditPlayer(player.id, player.name)}
                        title="Edit player"
                    >
                        <Pencil className="w-4 h-4" />
                    </MetalButton>
                    <MetalButton
                        variantType="outlined"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                        onClick={() => handleRemovePlayer(player.membershipId, player.name)}
                        glowColor="hsl(var(--destructive))"
                        title="Remove from team"
                    >
                        <Trash2 className="w-4 h-4" />
                    </MetalButton>
                 </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <ConfirmationModal
        isOpen={confirmDelete.isOpen}
        onOpenChange={(open) => setConfirmDelete({ ...confirmDelete, isOpen: open })}
        title="Remove Player"
        description={`Are you sure you want to remove ${confirmDelete.name} from the team? This action cannot be undone.`}
        onConfirm={onConfirmDelete}
      />

      <Dialog open={editingPlayer.isOpen} onOpenChange={(open) => setEditingPlayer({ ...editingPlayer, isOpen: open })}>
        <DialogContent className="border-border/50 bg-card/95 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-orbitron)' }}>Edit Player</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editName">Player Name</Label>
              <Input
                id="editName"
                value={editingPlayer.name}
                onChange={(e) => setEditingPlayer({ ...editingPlayer, name: e.target.value })}
                placeholder="Enter player name"
                className="bg-background/50"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
             <MetalButton 
                variantType="outlined" 
                onClick={() => setEditingPlayer({ ...editingPlayer, isOpen: false })}
             >
                Cancel
             </MetalButton>
             <MetalButton 
                variantType="filled" 
                glowColor="hsl(var(--primary))"
                onClick={onConfirmEdit}
             >
                Save Changes
             </MetalButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
