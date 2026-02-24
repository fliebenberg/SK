"use client";

import { MetalButton } from "@/components/ui/MetalButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { store } from "@/app/store/store";
import { MapPin, Plus, Pencil, Trash2, Search, ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
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
import { PageHeader } from "@/components/ui/PageHeader";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Organization, Venue } from "@sk/types";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function VenueManagementPage() {
  const params = useParams();
  const id = params.id as string;
  const { isDark, metalVariant } = useThemeColors();

  const [org, setOrg] = useState<Organization | undefined>(undefined);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");

  // Add Venue State
  const [isAdding, setIsAdding] = useState(false);
  const [newVenue, setNewVenue] = useState({ name: "", address: "" });

  // Edit/Delete State
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; venueId: string; name: string }>({
    isOpen: false,
    venueId: "",
    name: "",
  });
  const [editingVenue, setEditingVenue] = useState<{ isOpen: boolean; id: string; name: string; address: string }>({
    isOpen: false,
    id: "",
    name: "",
    address: "",
  });

  // Sorting state
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'address'; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc'
  });

  useEffect(() => {
    const updateData = () => {
        const currentOrg = store.getOrganization(id);
        const currentVenues = store.getVenues(id);
        setOrg(currentOrg);
        setVenues(currentVenues);
    };

    updateData();
    store.subscribeToOrganizationData(id);
    // Subscribe to stores
    const unsubscribe = store.subscribe(updateData);
    
    return () => {
        unsubscribe();
    };
  }, [id]);

  const handleAddVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVenue.name.trim()) return;

    setLoading(true);
    try {
      await store.addVenue({ 
        name: newVenue.name, 
        address: newVenue.address,
        organizationId: id 
      });

      setNewVenue({ name: "", address: "" });
      setIsAdding(false);
    } catch (error) {
      console.error("Failed to add venue:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVenue = (venueId: string, name: string) => {
    setConfirmDelete({ isOpen: true, venueId, name });
  };

  const onConfirmDelete = async () => {
    if (!confirmDelete.venueId) return;
    setLoading(true);
    try {
        await store.deleteVenue(confirmDelete.venueId);
        setConfirmDelete({ isOpen: false, venueId: "", name: "" });
    } catch (error) {
        console.error("Failed to delete venue:", error);
    } finally {
        setLoading(false);
    }
  };

  const handleEditVenue = (venue: Venue) => {
    setEditingVenue({ isOpen: true, id: venue.id, name: venue.name, address: venue.address });
  };

  const onConfirmEdit = async () => {
    if (!editingVenue.id || !editingVenue.name.trim()) return;
    setLoading(true);
    try {
      await store.updateVenue(editingVenue.id, { 
        name: editingVenue.name, 
        address: editingVenue.address 
      });
      setEditingVenue({ isOpen: false, id: "", name: "", address: "" });
    } catch (error) {
      console.error("Failed to update venue:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key: 'name' | 'address') => {
    setSortConfig(current => ({
        key,
        direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const filteredVenues = venues.filter(v => {
    const matchesSearch = v.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (v.address || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });
  
  const sortedVenues = [...filteredVenues].sort((a, b) => {
    const aValue = (a[sortConfig.key] || "").toString().toLowerCase();
    const bValue = (b[sortConfig.key] || "").toString().toLowerCase();
    
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const getSortIcon = (key: 'name' | 'address') => {
    if (sortConfig.key !== key) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
    return sortConfig.direction === 'asc' ? 
        <ChevronUp className="ml-2 h-4 w-4 text-primary" /> : 
        <ChevronDown className="ml-2 h-4 w-4 text-primary" />;
  };

  if (!org) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Venues"
        description="Manage fields, courts, and facilities."
      >
             <div className="relative flex-1 md:w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search venues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 bg-background/50 h-9"
                />
              </div>
            <MetalButton 
                    variantType="filled" 
                    glowColor="hsl(var(--primary))"
                    size="sm"
                    className="text-primary-foreground whitespace-nowrap h-9 px-3"
                    icon={<Plus className="h-4 w-4" />}
                    onClick={() => setIsAdding(true)}
                >
                    <span className="hidden md:inline">Add Venue</span>
                    <span className="md:hidden">Add</span>
            </MetalButton>
      </PageHeader>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="px-4 py-4 md:px-6 md:py-6">
          <CardTitle>Organization Venues ({sortedVenues.length})</CardTitle>
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
                        onClick={() => handleSort('address')}
                        className="flex items-center hover:text-foreground transition-colors"
                    >
                        Address
                        {getSortIcon('address')}
                    </button>
                </TableHead>
                <TableHead className="text-right pr-4 md:pr-2">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedVenues.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={4} className="text-center py-20 text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                            <MapPin className="h-12 w-12 opacity-20" />
                            <p className="text-lg font-medium">No venues found.</p>
                            {searchQuery && <p className="text-sm">Try adjusting your search query.</p>}
                            {!searchQuery && <p className="text-sm">Start by adding your first field or facility.</p>}
                        </div>
                    </TableCell>
                </TableRow>
              ) : (
                sortedVenues.map((venue) => (
                  <TableRow key={venue.id} className="group hover:bg-muted/50">
                    <TableCell className="pl-4 md:pl-2 py-3">
                         <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                              <MapPin className="h-4 w-4" />
                         </div>
                    </TableCell>
                    <TableCell className="font-medium py-3">
                        {venue.name}
                    </TableCell>
                    <TableCell className="py-3 text-muted-foreground">
                        {venue.address || "No address provided"}
                    </TableCell>
                    <TableCell className="text-right pr-4 md:pr-2 py-3">
                        <div className="flex items-center justify-end gap-2">
                            <MetalButton
                                variantType="outlined"
                                className="text-muted-foreground hover:text-primary h-8 w-8 p-0"
                                onClick={() => handleEditVenue(venue)}
                                title="Edit"
                            >
                                <Pencil className="w-4 h-4" />
                            </MetalButton>
                            <MetalButton
                                variantType="outlined"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                                onClick={() => handleDeleteVenue(venue.id, venue.name)}
                                glowColor="hsl(var(--destructive))"
                                title="Delete"
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
      
      {/* Add Venue Dialog */}
      <Dialog open={isAdding} onOpenChange={setIsAdding}>
        <DialogContent className="border-border/50 bg-card/95 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-orbitron)' }}>Add New Venue</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddVenue} className="space-y-4 py-4">
             <div className="space-y-2">
                <Label htmlFor="venueName">Venue Name</Label>
                <Input
                    id="venueName"
                    value={newVenue.name}
                    onChange={(e) => setNewVenue({ ...newVenue, name: e.target.value })}
                    placeholder="e.g. Main Stadium, South Court"
                    className="bg-background/50"
                    required
                />
             </div>
             <div className="space-y-2">
                <Label htmlFor="venueAddress">Address / Location</Label>
                <Input
                    id="venueAddress"
                    value={newVenue.address}
                    onChange={(e) => setNewVenue({ ...newVenue, address: e.target.value })}
                    placeholder="Physical address or internal location"
                    className="bg-background/50"
                />
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
                    disabled={loading || !newVenue.name.trim()}
                 >
                    {loading ? "Adding..." : "Add Venue"}
                 </MetalButton>
             </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmDelete.isOpen}
        onOpenChange={(open) => setConfirmDelete({ ...confirmDelete, isOpen: open })}
        title="Delete Venue"
        description={`Are you sure you want to delete ${confirmDelete.name}? This may affect events scheduled at this venue.`}
        onConfirm={onConfirmDelete}
      />

      {/* Edit Dialog */}
      <Dialog open={editingVenue.isOpen} onOpenChange={(open) => setEditingVenue({ ...editingVenue, isOpen: open })}>
        <DialogContent className="border-border/50 bg-card/95 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-orbitron)' }}>Edit Venue</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editName">Venue Name</Label>
              <Input
                id="editName"
                value={editingVenue.name}
                onChange={(e) => setEditingVenue({ ...editingVenue, name: e.target.value })}
                placeholder="Enter venue name"
                className="bg-background/50"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editAddress">Address / Location</Label>
              <Input
                id="editAddress"
                value={editingVenue.address}
                onChange={(e) => setEditingVenue({ ...editingVenue, address: e.target.value })}
                placeholder="Enter address"
                className="bg-background/50"
              />
            </div>
          </div>
          <DialogFooter>
             <MetalButton 
                variantType="outlined" 
                onClick={() => setEditingVenue({ ...editingVenue, isOpen: false })}
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
