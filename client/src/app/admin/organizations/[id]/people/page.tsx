"use client";

import { MetalButton } from "@/components/ui/MetalButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { store } from "@/app/store/store";
import { Users, Plus, Pencil, Trash2, Search, UserPlus, ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { PersonnelAutocomplete } from "@/components/ui/PersonnelAutocomplete";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Organization, Person } from "@sk/types";
import { useThemeColors } from "@/hooks/useThemeColors";

interface OrganizationMemberWithDetails extends Person {
  roleId: string;
  roleName?: string;
  membershipId: string;
  startDate?: string;
  endDate?: string;
  personOrgId?: string;
}

export default function OrganizationPeoplePage() {
  const params = useParams();
  const id = params.id as string;
  const { isDark, metalVariant } = useThemeColors();

  const [org, setOrg] = useState<Organization | undefined>(undefined);
  const [members, setMembers] = useState<OrganizationMemberWithDetails[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // Add Member State
  const [isAdding, setIsAdding] = useState(false);
  const [newMemberData, setNewMemberData] = useState({
    name: "",
    email: "",
    birthdate: "",
    nationalId: "",
    personOrgId: "",
    roleId: "role-org-member"
  });
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);

  // Edit/Delete State
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; membershipId: string; name: string }>({
    isOpen: false,
    membershipId: "",
    name: "",
  });
  const [editingPerson, setEditingPerson] = useState<{ 
    isOpen: boolean; 
    personId: string; 
    name: string; 
    roleId: string; 
    membershipId: string;
    email: string;
    birthdate: string;
    nationalId: string;
    personOrgId: string;
  }>({
    isOpen: false,
    personId: "",
    name: "",
    roleId: "",
    membershipId: "",
    email: "",
    birthdate: "",
    nationalId: "",
    personOrgId: "",
  });

  const [availableRoles, setAvailableRoles] = useState<{id: string, name: string}[]>([]);

  // Sorting state
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'roleName'; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'desc'
  });

  useEffect(() => {
    const updateRoles = () => {
        const allRoles = store.getOrganizationRoles();
        if (org?.supportedRoleIds && org.supportedRoleIds.length > 0) {
            setAvailableRoles(allRoles.filter(r => org.supportedRoleIds?.includes(r.id)));
        } else {
            setAvailableRoles(allRoles);
        }
    };
    updateRoles();
    const unsubscribe = store.subscribe(updateRoles);
    return () => unsubscribe();
  }, [org]);

  useEffect(() => {
    const updateData = () => {
        const currentOrg = store.getOrganization(id);
        const currentMembers = store.getOrganizationMembers(id);
        console.log(`PeoplePage: Updating data for org ${id}. Found ${currentMembers.length} members.`);
        setOrg(currentOrg);
        setMembers(currentMembers);
    };

    updateData();
    // Subscribe to organization strictly for member updates
    store.subscribeToOrganization(id);
    const unsubscribe = store.subscribe(updateData);
    
    return () => {
        console.log(`PeoplePage: Unsubscribing from org ${id}`);
        unsubscribe();
        store.unsubscribeFromOrganization(id);
    };
  }, [id]);

  useEffect(() => {
    // When opening dialog, set default role
    if (isAdding && availableRoles.length > 0) {
        const defaultRole = availableRoles.find(r => r.name === 'Member')?.id || availableRoles[0]?.id;
        setNewMemberData(prev => ({ ...prev, roleId: defaultRole || 'role-org-member' }));
    }
  }, [isAdding, availableRoles]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberData.name.trim()) return;

    setLoading(true);
    try {
      let personId = selectedPerson?.id;
      
      if (!personId && newMemberData.name.trim()) {
        // Try to find a matching user first
        const matchingUser = await store.findMatchingUser(
          newMemberData.email || undefined,
          newMemberData.name,
          newMemberData.birthdate || undefined
        );

        const newPerson = await store.addPerson({ 
          id: matchingUser?.id || `person-${Date.now()}`,
          name: newMemberData.name,
          email: newMemberData.email || undefined,
          birthdate: newMemberData.birthdate || undefined,
          nationalId: newMemberData.nationalId || undefined
        });
        personId = newPerson.id;
      } else if (personId) {
        // Update existing person metadata if provided
        await store.updatePerson(personId, {
          email: newMemberData.email || undefined,
          birthdate: newMemberData.birthdate || undefined,
          nationalId: newMemberData.nationalId || undefined
        });
      }
      
      if (personId) {
        // Add to organization with selected role
        await store.addOrganizationMember(personId, id, newMemberData.roleId);
        
        // Save organization-specific identifier if provided
        if (newMemberData.personOrgId) {
          await store.setPersonIdentifier(personId, id, newMemberData.personOrgId);
        }
      }

      setNewMemberData({
        name: "",
        email: "",
        birthdate: "",
        nationalId: "",
        personOrgId: "",
        roleId: "role-org-member"
      });
      setSelectedPerson(null);
      setIsAdding(false);
    } catch (error) {
      console.error("Failed to add member:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = (membershipId: string, name: string) => {
    setConfirmDelete({ isOpen: true, membershipId, name });
  };

  const onConfirmDelete = async () => {
    if (!confirmDelete.membershipId) return;
    setLoading(true);
    try {
        await store.removeOrganizationMember(confirmDelete.membershipId);
        setConfirmDelete({ isOpen: false, membershipId: "", name: "" });
    } catch (error) {
        console.error("Failed to remove member:", error);
    } finally {
        setLoading(false);
    }
  };

  const handleEditPerson = (member: OrganizationMemberWithDetails) => {
    setEditingPerson({ 
      isOpen: true, 
      personId: member.id, 
      name: member.name, 
      roleId: member.roleId, 
      membershipId: member.membershipId,
      email: member.email || "",
      birthdate: member.birthdate || "",
      nationalId: member.nationalId || "",
      personOrgId: member.personOrgId || "",
    });
  };

  const onConfirmEdit = async () => {
    if (!editingPerson.personId || !editingPerson.name.trim()) return;
    setLoading(true);
    try {
      await store.updatePerson(editingPerson.personId, { 
        name: editingPerson.name,
        email: editingPerson.email || undefined,
        birthdate: editingPerson.birthdate || undefined,
        nationalId: editingPerson.nationalId || undefined
      });
      
      if (editingPerson.roleId && editingPerson.membershipId) {
          await store.updateOrganizationMember(editingPerson.membershipId, editingPerson.roleId);
      }

      if (editingPerson.personOrgId) {
        await store.setPersonIdentifier(editingPerson.personId, id, editingPerson.personOrgId);
      }

      setEditingPerson({ ...editingPerson, isOpen: false });
    } catch (error) {
      console.error("Failed to update person:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key: 'name' | 'roleName') => {
    setSortConfig(current => ({
        key,
        direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const filteredMembers = members.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (m.roleName || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || m.roleId === roleFilter;
    return matchesSearch && matchesRole;
  });
  
  const sortedMembers = [...filteredMembers].sort((a, b) => {
    const aValue = (a[sortConfig.key] || "").toString().toLowerCase();
    const bValue = (b[sortConfig.key] || "").toString().toLowerCase();
    
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const getSortIcon = (key: 'name' | 'roleName') => {
    if (sortConfig.key !== key) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
    return sortConfig.direction === 'asc' ? 
        <ChevronUp className="ml-2 h-4 w-4 text-primary" /> : 
        <ChevronDown className="ml-2 h-4 w-4 text-primary" />;
  };

  if (!org) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row items-center justify-between gap-6 text-center xl:text-left">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-orbitron)' }}>People</h1>
          <p className="text-muted-foreground">Manage your organization's staff and members.</p>
        </div>
        <div className="flex flex-row items-center gap-2 w-full xl:w-auto">
             <div className="relative flex-1 md:w-48">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 bg-background/50 h-9"
                />
              </div>
              <div className="w-24 md:w-40">
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="bg-background/50 h-9 px-2 md:px-3">
                        <SelectValue placeholder="Roles" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Roles</SelectItem>
                        {availableRoles.map(role => (
                            <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
              </div>
            <MetalButton 
                    variantType="filled" 
                    glowColor="hsl(var(--primary))"
                    size="sm"
                    className="text-primary-foreground whitespace-nowrap h-9 px-3"
                    icon={<Plus className="h-4 w-4" />}
                    onClick={() => setIsAdding(true)}
                >
                    <span className="hidden md:inline">Add Person</span>
                    <span className="md:hidden">Add</span>
            </MetalButton>
        </div>
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="px-4 py-4 md:px-6 md:py-6">
          <CardTitle>Members ({sortedMembers.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 md:p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px] pl-4 md:pl-2"></TableHead>
                <TableHead>
                    <button 
                        onClick={() => handleSort('name')}
                        className="flex items-center hover:text-foreground transition-colors"
                    >
                        Name
                        {getSortIcon('name')}
                    </button>
                </TableHead>
                <TableHead>
                    <button 
                        onClick={() => handleSort('roleName')}
                        className="flex items-center hover:text-foreground transition-colors"
                    >
                        Role
                        {getSortIcon('roleName')}
                    </button>
                </TableHead>
                <TableHead className="hidden md:table-cell">Org ID</TableHead>
                <TableHead className="text-right pr-4 md:pr-2">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMembers.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                            <UserPlus className="h-10 w-10 opacity-20" />
                            <p>No members found.</p>
                            {searchQuery && <p className="text-xs">Try adjusting your search query.</p>}
                        </div>
                    </TableCell>
                </TableRow>
              ) : (
                sortedMembers.map((member) => (
                  <TableRow key={member.membershipId} className="group hover:bg-muted/50">
                    <TableCell className="pl-4 md:pl-2 py-3">
                         <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                              {member.name.charAt(0).toUpperCase()}
                         </div>
                    </TableCell>
                    <TableCell className="font-medium py-3">
                        {member.name}
                    </TableCell>
                    <TableCell className="py-3 text-muted-foreground">
                        {member.roleName || "Member"}
                    </TableCell>
                    <TableCell className="py-3 text-muted-foreground hidden md:table-cell font-mono text-xs">
                        {member.personOrgId || "-"}
                    </TableCell>
                    <TableCell className="text-right pr-4 md:pr-2 py-3">
                        <div className="flex items-center justify-end gap-2">
                            <MetalButton
                                variantType="outlined"
                                className="text-muted-foreground hover:text-primary h-8 w-8 p-0"
                                onClick={() => handleEditPerson(member)}
                                title="Edit"
                            >
                                <Pencil className="w-4 h-4" />
                            </MetalButton>
                            <MetalButton
                                variantType="outlined"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                                onClick={() => handleRemoveMember(member.membershipId, member.name)}
                                glowColor="hsl(var(--destructive))"
                                title="Remove"
                            >
                                <Trash2 className="w-4 h-4" />
                            </MetalButton>
                        </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Add Member Dialog */}
      <Dialog open={isAdding} onOpenChange={setIsAdding}>
        <DialogContent className="border-border/50 bg-card/95 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-orbitron)' }}>Add Person to Organization</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddMember} className="space-y-4 py-4">
             <div className="space-y-2">
                <Label htmlFor="personName">Name</Label>
                <PersonnelAutocomplete
                  organizationId={id}
                  value={newMemberData.name}
                  onChange={(val) => setNewMemberData(prev => ({ ...prev, name: val }))}
                  onSelectPerson={(p) => {
                    setSelectedPerson(p);
                    if (p) {
                      setNewMemberData(prev => ({ 
                        ...prev, 
                        name: p.name,
                        email: p.email || prev.email,
                        birthdate: p.birthdate || prev.birthdate,
                        nationalId: p.nationalId || prev.nationalId
                      }));
                    }
                  }}
                  placeholder="Search or enter name"
                />
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="space-y-2">
                  <Label htmlFor="newEmail">Email</Label>
                  <Input
                    id="newEmail"
                    type="email"
                    value={newMemberData.email}
                    onChange={(e) => setNewMemberData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="email@example.com"
                    className="bg-background/50"
                  />
               </div>
               <div className="space-y-2">
                  <Label htmlFor="newOrgId">Organization ID (e.g. Student #)</Label>
                  <Input
                    id="newOrgId"
                    value={newMemberData.personOrgId}
                    onChange={(e) => setNewMemberData(prev => ({ ...prev, personOrgId: e.target.value }))}
                    placeholder="ID Number"
                    className="bg-background/50"
                  />
               </div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="space-y-2">
                  <Label htmlFor="newBirthdate">Birthdate</Label>
                  <Input
                    id="newBirthdate"
                    type="date"
                    value={newMemberData.birthdate}
                    onChange={(e) => setNewMemberData(prev => ({ ...prev, birthdate: e.target.value }))}
                    className="bg-background/50"
                  />
               </div>
               <div className="space-y-2">
                  <Label htmlFor="newNationalId">National ID</Label>
                  <Input
                    id="newNationalId"
                    value={newMemberData.nationalId}
                    onChange={(e) => setNewMemberData(prev => ({ ...prev, nationalId: e.target.value }))}
                    placeholder="ID / Passport"
                    className="bg-background/50"
                  />
               </div>
             </div>
             <div className="space-y-2">
                <Label htmlFor="newRole">Role</Label>
                <Select
                    value={newMemberData.roleId}
                    onValueChange={(val) => setNewMemberData(prev => ({ ...prev, roleId: val }))}
                >
                    <SelectTrigger className="bg-background/50">
                        <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                        {availableRoles.map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                                {role.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
             </div>
             <DialogFooter>
                 <MetalButton 
                    variantType="outlined" 
                    type="button"
                    onClick={() => setIsAdding(false)}
                 >
                    Cancel
                 </MetalButton>
                 <MetalButton 
                    variantType="filled" 
                    glowColor="hsl(var(--primary))"
                    type="submit"
                    disabled={loading || !newMemberData.name.trim()}
                 >
                    {loading ? "Adding..." : "Add Person"}
                 </MetalButton>
             </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmDelete.isOpen}
        onOpenChange={(open) => setConfirmDelete({ ...confirmDelete, isOpen: open })}
        title="Remove Member"
        description={`Are you sure you want to remove ${confirmDelete.name} from the organization? They will be removed from all teams in this organization as well.`}
        onConfirm={onConfirmDelete}
      />

      {/* Edit Dialog */}
      <Dialog open={editingPerson.isOpen} onOpenChange={(open) => setEditingPerson({ ...editingPerson, isOpen: open })}>
        <DialogContent className="border-border/50 bg-card/95 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-orbitron)' }}>Edit Person</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editName">Name</Label>
              <Input
                id="editName"
                value={editingPerson.name}
                onChange={(e) => setEditingPerson({ ...editingPerson, name: e.target.value })}
                placeholder="Enter name"
                className="bg-background/50"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editEmail">Email</Label>
                <Input
                  id="editEmail"
                  type="email"
                  value={editingPerson.email}
                  onChange={(e) => setEditingPerson({ ...editingPerson, email: e.target.value })}
                  placeholder="email@example.com"
                  className="bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editOrgId">Organization ID</Label>
                <Input
                  id="editOrgId"
                  value={editingPerson.personOrgId}
                  onChange={(e) => setEditingPerson({ ...editingPerson, personOrgId: e.target.value })}
                  placeholder="ID Number"
                  className="bg-background/50"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editBirthdate">Birthdate</Label>
                <Input
                  id="editBirthdate"
                  type="date"
                  value={editingPerson.birthdate}
                  onChange={(e) => setEditingPerson({ ...editingPerson, birthdate: e.target.value })}
                  className="bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editNationalId">National ID</Label>
                <Input
                  id="editNationalId"
                  value={editingPerson.nationalId}
                  onChange={(e) => setEditingPerson({ ...editingPerson, nationalId: e.target.value })}
                  placeholder="ID / Passport"
                  className="bg-background/50"
                />
              </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="editRole">Role</Label>
                <Select
                    value={editingPerson.roleId}
                    onValueChange={(value) => setEditingPerson({ ...editingPerson, roleId: value })}
                >
                    <SelectTrigger className="bg-background/50">
                        <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                        {availableRoles.map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                                {role.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
          </div>
          <DialogFooter>
             <MetalButton 
                variantType="outlined" 
                onClick={() => setEditingPerson({ ...editingPerson, isOpen: false })}
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
