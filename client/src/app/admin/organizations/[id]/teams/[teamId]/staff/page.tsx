"use client";

import { MetalButton } from "@/components/ui/MetalButton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { store } from "@/lib/store";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Person, TeamMembership } from "@sk/types";
import { Plus, Trash2, Briefcase } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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
  const [newStaffRole, setNewStaffRole] = useState<'Coach' | 'Staff'>('Coach');
  const router = useRouter();

  useEffect(() => {
    const update = () => {
        const data = store.getTeamMembers(params.teamId as string).filter(p => p.roleId === 'role-coach' || p.roleId === 'role-staff');
        setStaff(data);
        if (data.length >= 0) setLoading(false);
    };
    
    // Initial load
    update();
    const unsubscribe = store.subscribe(update);
    return () => unsubscribe();
  }, [params.teamId]);

  const handleAddStaff = async () => {
    if (!newStaffName.trim()) return;
    
    const { teamId } = await params;
    const person = store.addPerson({
      name: newStaffName,
    });
    // Map selection to ID
    const roleId = newStaffRole === 'Coach' ? 'role-coach' : 'role-staff';
    store.addTeamMember(person.id, teamId, roleId);
    
    setNewStaffName("");
    setNewStaffRole('Coach');
    setIsDialogOpen(false);
    
    // Reload local state
    const data = store.getTeamMembers(teamId).filter(p => p.roleId === 'role-coach' || p.roleId === 'role-staff');
    setStaff(data);
    router.refresh();
  };

  const handleRemoveStaff = async (membershipId: string) => {
    if (!confirm("Remove this staff member from the team?")) return;
    
    store.removeTeamMember(membershipId);
    
    const { teamId } = await params;
    const data = store.getTeamMembers(teamId).filter(p => p.roleId === 'role-coach' || p.roleId === 'role-staff');
    setStaff(data);
    router.refresh();
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Staff ({staff.length})</h2>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <MetalButton variantType="filled" glowColor="hsl(var(--primary))" className="text-primary-foreground">
              <Plus className="mr-2 h-4 w-4" /> Add Staff
            </MetalButton>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Staff Member</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  placeholder="Jane Smith"
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
              
              <button 
                onClick={() => handleRemoveStaff(person.membershipId)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </CardContent>
          </Card>
        ))}
        
        {staff.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
            <p>No staff members assigned yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
