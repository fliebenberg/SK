"use client";

import { MetalButton } from "@/components/ui/MetalButton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { store } from "@/app/store/store";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Person, TeamMembership } from "@sk/types";
import { Plus, Trash2, Briefcase, Pencil } from "lucide-react";
import { PersonnelAutocomplete } from "@/components/ui/PersonnelAutocomplete";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function TeamStaffPage() {
  const params = useParams();
  // const teamId = params.teamId as string; is handled in effect usage or by accessing params directly
  
  const [staff, setStaff] = useState<(Person & { roleId: string; roleName?: string; membershipId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [newStaffRole, setNewStaffRole] = useState<'Coach' | 'Staff'>('Coach');
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; membershipId: string; name: string }>({
    isOpen: false,
    membershipId: "",
    name: "",
  });
  const [editingStaff, setEditingStaff] = useState<{ isOpen: boolean; personId: string; membershipId: string; name: string; role: 'Coach' | 'Staff' }>({
    isOpen: false,
    personId: "",
    membershipId: "",
    name: "",
    role: 'Coach',
  });
  const router = useRouter();

  useEffect(() => {
    const teamId = params.teamId as string;
    
    // Subscribe to this specific team's data room
    store.subscribeToTeam(teamId);

    const update = () => {
        const data = store.getTeamMembers(teamId).filter(p => p.roleId === 'role-coach' || p.roleId === 'role-staff');
        setStaff(data);
        // We can consider 'loading' done if we have data or if the store has processed the subscription response.
        // For now, let's just turn off loading on first update callback or timeout?
        // Actually, store.getTeamMembers returns locally cached data.
        // If it's valid, we show it.
        setLoading(false);
    };
    
    // Initial update
    update();
    const unsubscribe = store.subscribe(update);
    
    return () => {
        unsubscribe();
        store.unsubscribeFromTeam(teamId);
    };
  }, [params.teamId]);

  const handleAddStaff = async () => {
    if (!newStaffName.trim()) return;
    
    const teamId = params.teamId as string;
    const orgId = store.getTeam(teamId)?.organizationId || "";

    let personId = selectedPerson?.id;
    if (!personId) {
      const person = await store.addPerson({
        name: newStaffName,
      });
      personId = person.id;
      // Ensure they are in the organization
      await store.addOrganizationMember(personId, orgId, 'role-org-manager');
    }

    // Map selection to ID
    const roleId = newStaffRole === 'Coach' ? 'role-coach' : 'role-staff';
    await store.addTeamMember(personId, teamId, roleId);
    
    setNewStaffName("");
    setSelectedPerson(null);
    setNewStaffRole('Coach');
    setIsDialogOpen(false);
    
    // Reload local state
    const data = store.getTeamMembers(teamId).filter(p => p.roleId === 'role-coach' || p.roleId === 'role-staff');
    setStaff(data);
    router.refresh();
  };

  const handleRemoveStaff = (membershipId: string, name: string) => {
    setConfirmDelete({ isOpen: true, membershipId, name });
  };

  const onConfirmDelete = async () => {
    if (!confirmDelete.membershipId) return;
    
    await store.removeTeamMember(confirmDelete.membershipId);
    
    const teamId = params.teamId as string;
    const data = store.getTeamMembers(teamId).filter(p => p.roleId === 'role-coach' || p.roleId === 'role-staff');
    setStaff(data);
    setConfirmDelete({ isOpen: false, membershipId: "", name: "" });
    router.refresh();
  };

  const handleEditStaff = (person: Person & { roleId: string; roleName?: string; membershipId: string }) => {
    setEditingStaff({
      isOpen: true,
      personId: person.id,
      membershipId: person.membershipId,
      name: person.name,
      role: person.roleId === 'role-coach' ? 'Coach' : 'Staff',
    });
  };

  const onConfirmEdit = async () => {
    if (!editingStaff.personId || !editingStaff.name.trim()) return;
    
    try {
      // 1. Update Person (Name)
      await store.updatePerson(editingStaff.personId, { name: editingStaff.name });
      
      // 2. Update Membership (Role)
      const roleId = editingStaff.role === 'Coach' ? 'role-coach' : 'role-staff';
      await store.updateTeamMember(editingStaff.membershipId, { roleId });
      
      setEditingStaff({ ...editingStaff, isOpen: false });
      
      // Reload local state
      const teamId = params.teamId as string;
      const data = store.getTeamMembers(teamId).filter(p => p.roleId === 'role-coach' || p.roleId === 'role-staff');
      setStaff(data);
      router.refresh();

    } catch (error) {
      console.error("Failed to update staff:", error);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Staff ({staff.length})</h2>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <MetalButton 
              variantType="filled" 
              glowColor="hsl(var(--primary))" 
              className="text-primary-foreground whitespace-nowrap"
              icon={<Plus className="h-4 w-4" />}
              size="sm"
            >
              Add Staff
            </MetalButton>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Staff Member</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <PersonnelAutocomplete
                  organizationId={store.getTeam(params.teamId as string)?.organizationId || ""}
                  value={newStaffName}
                  onChange={setNewStaffName}
                  onSelectPerson={setSelectedPerson}
                  placeholder="Search or enter name..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={newStaffRole} onValueChange={(v: 'Coach' | 'Staff') => setNewStaffRole(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Coach">Coach</SelectItem>
                    <SelectItem value="Staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <MetalButton variantType="filled" onClick={handleAddStaff} glowColor="hsl(var(--primary))">
                Add Staff
              </MetalButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {staff.map((person) => (
          <Card key={person.id} className="group relative overflow-hidden border-border/50 bg-card/50 hover:border-primary/50 transition-colors">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Briefcase className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-medium">{person.name}</div>
                  <div className="text-xs text-muted-foreground">{person.roleName || store.getTeamRole(person.roleId)?.name}</div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleEditStaff(person)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:text-primary"
                    title="Edit staff"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => handleRemoveStaff(person.membershipId, person.name)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:text-destructive"
                    title="Remove from team"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {staff.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
            <p>No staff members assigned yet.</p>
          </div>
        )}
      </div>
      <ConfirmationModal
        isOpen={confirmDelete.isOpen}
        onOpenChange={(open) => setConfirmDelete({ ...confirmDelete, isOpen: open })}
        title="Remove Staff"
        description={`Are you sure you want to remove ${confirmDelete.name} from the team? This action cannot be undone.`}
        onConfirm={onConfirmDelete}
      />

      <Dialog open={editingStaff.isOpen} onOpenChange={(open) => setEditingStaff({ ...editingStaff, isOpen: open })}>
        <DialogContent className="border-border/50 bg-card/95 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-orbitron)' }}>Edit Staff Member</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editStaffName">Name</Label>
              <Input
                id="editStaffName"
                value={editingStaff.name}
                onChange={(e) => setEditingStaff({ ...editingStaff, name: e.target.value })}
                placeholder="Enter name"
                className="bg-background/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editStaffRole">Role</Label>
              <Select value={editingStaff.role} onValueChange={(v: 'Coach' | 'Staff') => setEditingStaff({ ...editingStaff, role: v })}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Coach">Coach</SelectItem>
                  <SelectItem value="Staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
             <MetalButton 
                variantType="outlined" 
                onClick={() => setEditingStaff({ ...editingStaff, isOpen: false })}
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
