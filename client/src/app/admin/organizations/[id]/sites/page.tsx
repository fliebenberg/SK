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
import { ManageFacilitiesDialog } from "@/components/admin/sites/ManageFacilitiesDialog";
import { AddressInput } from "@/components/ui/AddressInput";
import { AddressMap } from "@/components/ui/AddressMap";

import { useState, useEffect } from "react";
import { useParams, notFound } from "next/navigation";
import { Organization, Site, Address } from "@sk/types";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useOrganization } from "@/hooks/useOrganization";

export default function SiteManagementPage() {
  const params = useParams();
  const id = params.id as string;
  const { isDark, metalVariant } = useThemeColors();

  const { org, isLoading: loading } = useOrganization(id, { subscribeData: true });
  const [sites, setSites] = useState<Site[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState("");

  // Add Site State
  const [isAdding, setIsAdding] = useState(false);
  const [newSite, setNewSite] = useState({ 
    name: "", 
    address: { fullAddress: "" } as Partial<Address> 
  });

  // Edit/Delete State
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; siteId: string; name: string }>({
    isOpen: false,
    siteId: "",
    name: "",
  });
  const [editingSite, setEditingSite] = useState<{ 
    isOpen: boolean; 
    id: string; 
    name: string; 
    address: Partial<Address> 
  }>({
    isOpen: false,
    id: "",
    name: "",
    address: { fullAddress: "" },
  });
  
  // Facilities State
  const [managingFacilitiesFor, setManagingFacilitiesFor] = useState<Site | null>(null);

  // Sorting state
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'address'; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc'
  });

  useEffect(() => {
    const updateSites = () => {
        setSites(store.getSites(id));
    };

    updateSites();
    const unsubscribe = store.subscribe(updateSites);
    
    return () => {
        unsubscribe();
    };
  }, [id]);

  if (loading && !org) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="mt-4 text-muted-foreground font-orbitron">Loading site data...</p>
      </div>
    );
  }

  if (!org) return null;

  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSite.name.trim()) return;

    setIsProcessing(true);
    try {
      await store.addSite({ 
        name: newSite.name, 
        address: newSite.address as Address,
        orgId: id 
      });

      setNewSite({ name: "", address: { fullAddress: "" } });
      setIsAdding(false);
    } catch (error) {
      console.error("Failed to add site:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteSite = (siteId: string, name: string) => {
    setConfirmDelete({ isOpen: true, siteId, name });
  };

  const onConfirmDelete = async () => {
    if (!confirmDelete.siteId) return;
    setIsProcessing(true);
    try {
        await store.deleteSite(confirmDelete.siteId);
        setConfirmDelete({ isOpen: false, siteId: "", name: "" });
    } catch (error) {
        console.error("Failed to delete site:", error);
    } finally {
        setIsProcessing(false);
    }
  };

  const handleEditSite = (site: Site) => {
    setEditingSite({ 
      isOpen: true, 
      id: site.id, 
      name: site.name, 
      address: site.address || { fullAddress: "" } 
    });
  };

  const getEditingDirty = () => {
    const original = sites.find(v => v.id === editingSite.id);
    if (!original) return false;
    return (
      editingSite.name !== original.name ||
      JSON.stringify(editingSite.address) !== JSON.stringify(original.address || { fullAddress: "" })
    );
  };

  const onConfirmEdit = async () => {
    if (!editingSite.id || !editingSite.name.trim()) return;
    setIsProcessing(true);
    try {
      await store.updateSite(editingSite.id, { 
        name: editingSite.name, 
        address: editingSite.address as Address
      });
      setEditingSite({ isOpen: false, id: "", name: "", address: { fullAddress: "" } });
    } catch (error) {
      console.error("Failed to update site:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSort = (key: 'name' | 'address') => {
    setSortConfig(current => ({
        key,
        direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const filteredSites = sites.filter(v => {
    const matchesSearch = v.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (v.address?.fullAddress || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (v.address?.city || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });
  
  const sortedSites = [...filteredSites].sort((a, b) => {
    let aValue = "";
    let bValue = "";

    if (sortConfig.key === 'address') {
        aValue = (a.address?.fullAddress || "").toLowerCase();
        bValue = (b.address?.fullAddress || "").toLowerCase();
    } else {
        aValue = (a.name || "").toLowerCase();
        bValue = (b.name || "").toLowerCase();
    }
    
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
        title="Sites"
        description="Manage fields, courts, and facilities."
      >
             <div className="relative flex-1 md:w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search sites..."
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
                    <span className="hidden md:inline">Add Site</span>
                    <span className="md:hidden">Add</span>
            </MetalButton>
      </PageHeader>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="px-4 py-4 md:px-6 md:py-6">
          <CardTitle>Organization Sites ({sortedSites.length})</CardTitle>
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
              {sortedSites.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={4} className="text-center py-20 text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                            <MapPin className="h-12 w-12 opacity-20" />
                            <p className="text-lg font-medium">No sites found.</p>
                            {searchQuery && <p className="text-sm">Try adjusting your search query.</p>}
                            {!searchQuery && <p className="text-sm">Start by adding your first field or facility.</p>}
                        </div>
                    </TableCell>
                </TableRow>
              ) : (
                sortedSites.map((site) => (
                  <TableRow key={site.id} className="group hover:bg-muted/50">
                    <TableCell className="pl-4 md:pl-2 py-3">
                         <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                              <MapPin className="h-4 w-4" />
                         </div>
                    </TableCell>
                    <TableCell className="font-medium py-3">
                        {site.name}
                    </TableCell>
                    <TableCell className="py-3 text-muted-foreground">
                        {site.address?.fullAddress || "No address provided"}
                    </TableCell>
                    <TableCell className="text-right pr-4 md:pr-2 py-3">
                        <div className="flex items-center justify-end gap-2">
                            <MetalButton
                                variantType="outlined"
                                className="text-muted-foreground hover:text-primary h-8 px-2 whitespace-nowrap"
                                onClick={() => setManagingFacilitiesFor(site)}
                                title="Manage Facilities"
                            >
                                <MapPin className="w-4 h-4 mr-1" />
                                <span className="text-xs hidden md:inline">Facilities</span>
                            </MetalButton>
                            <MetalButton
                                variantType="outlined"
                                className="text-muted-foreground hover:text-primary h-8 w-8 p-0"
                                onClick={() => handleEditSite(site)}
                                title="Edit"
                            >
                                <Pencil className="w-4 h-4" />
                            </MetalButton>
                            <MetalButton
                                variantType="outlined"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                                onClick={() => handleDeleteSite(site.id, site.name)}
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
      
      {/* Add Site Dialog */}
      <Dialog open={isAdding} onOpenChange={setIsAdding}>
        <DialogContent className="border-border/50 bg-card/95 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-orbitron)' }}>Add New Site</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSite} className="space-y-4 py-4">
             <div className="space-y-2">
                <Label htmlFor="siteName">Site Name</Label>
                <Input
                    id="siteName"
                    value={newSite.name}
                    onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
                    placeholder="e.g. Main Stadium, South Court"
                    className="bg-background/50"
                    required
                />
             </div>
              <div className="space-y-2">
                <Label htmlFor="siteAddress">Physical Address</Label>
                <AddressInput
                    id="siteAddress"
                    value={newSite.address.fullAddress}
                    onChange={(addr) => setNewSite({ ...newSite, address: addr })}
                    placeholder="Search for site address..."
                    className="bg-background/50 h-10"
                />
              </div>
              
              <AddressMap 
                address={newSite.address as Address} 
                className="pt-2"
              />
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
                    disabled={loading || !newSite.name.trim()}
                 >
                    {loading ? "Adding..." : "Add Site"}
                 </MetalButton>
             </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmDelete.isOpen}
        onOpenChange={(open) => setConfirmDelete({ ...confirmDelete, isOpen: open })}
        title="Delete Site"
        description={`Are you sure you want to delete ${confirmDelete.name}? This may affect events scheduled at this site.`}
        onConfirm={onConfirmDelete}
      />

      {/* Edit Dialog */}
      <Dialog open={editingSite.isOpen} onOpenChange={(open) => setEditingSite({ ...editingSite, isOpen: open })}>
        <DialogContent className="border-border/50 bg-card/95 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-orbitron)' }}>Edit Site</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editName">Site Name</Label>
              <Input
                id="editName"
                value={editingSite.name}
                onChange={(e) => setEditingSite({ ...editingSite, name: e.target.value })}
                placeholder="Enter site name"
                className="bg-background/50"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editAddress">Physical Address</Label>
              <AddressInput
                id="editAddress"
                value={editingSite.address.fullAddress}
                onChange={(addr) => setEditingSite({ ...editingSite, address: addr })}
                placeholder="Search for address..."
                className="bg-background/50 h-10"
              />
            </div>

            <AddressMap 
                address={editingSite.address as Address} 
                className="pt-2"
            />
          </div>
          <DialogFooter>
             {getEditingDirty() ? (
               <div className="flex gap-2 w-full justify-end animate-in fade-in slide-in-from-right-2">
                 <MetalButton 
                    variantType="outlined" 
                    onClick={() => setEditingSite({ ...editingSite, isOpen: false })}
                 >
                    Cancel
                 </MetalButton>
                 <MetalButton 
                    variantType="filled" 
                    glowColor="hsl(var(--primary))"
                    onClick={onConfirmEdit}
                    disabled={loading || !editingSite.name.trim()}
                 >
                    Save Changes
                 </MetalButton>
               </div>
             ) : (
                <MetalButton 
                  variantType="outlined" 
                  onClick={() => setEditingSite({ ...editingSite, isOpen: false })}
                  className="w-full sm:w-auto"
                >
                  Close
                </MetalButton>
             )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <ManageFacilitiesDialog 
         isOpen={!!managingFacilitiesFor}
         onOpenChange={(open) => !open && setManagingFacilitiesFor(null)}
         site={managingFacilitiesFor}
      />
    </div>
  );
}
