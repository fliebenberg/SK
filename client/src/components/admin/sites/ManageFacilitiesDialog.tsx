"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MetalButton } from "@/components/ui/MetalButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { store } from "@/app/store/store";
import { Site, Facility } from "@sk/types";
import { Plus, Pencil, Trash2, MapPin } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";

export function ManageFacilitiesDialog({
  isOpen,
  onOpenChange,
  site
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  site: Site | null;
}) {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [newFacility, setNewFacility] = useState({ name: "", surfaceType: "" });
  const [editingFacility, setEditingFacility] = useState<{ id: string; name: string; surfaceType: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });

  useEffect(() => {
    if (!site || !isOpen) return;

    const updateData = () => {
      setFacilities(store.getFacilities(site.id));
    };

    updateData(); // initial
    store.subscribeToFacility(site.id); // Or anything that triggers facility sync if we implement it.
    // Actually the app/layout or store handles fetching data on join. The room is `site:${site.id}:facilities` which we added in index.ts
    // Wait, in index.ts we added: `socket.emit('join_room', \`site:${result.siteId}:facilities\`);` but the store `subscribeToOrganizationData` doesn't fetch facilities right now. 
    // We can just rely on getFacilities which returns what's in store. Let's make sure it's synced.
    // Actually, client store doesn't subscribe to facilities when org is loaded, we might need a fetch call.
    store.fetchFacilitiesForSite(site.id);
    
    const unsubscribe = store.subscribe(updateData);
    return () => unsubscribe();
  }, [site, isOpen]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!site || !newFacility.name.trim()) return;
    setLoading(true);
    try {
      await store.addFacility({ siteId: site.id, name: newFacility.name, surfaceType: newFacility.surfaceType });
      setNewFacility({ name: "", surfaceType: "" });
      setIsAdding(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFacility) return;
    setLoading(true);
    try {
      await store.updateFacility(editingFacility.id, { name: editingFacility.name, surfaceType: editingFacility.surfaceType });
      setEditingFacility(null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete.id) return;
    setLoading(true);
    try {
      await store.deleteFacility(confirmDelete.id);
      setConfirmDelete({ isOpen: false, id: "", name: "" });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (!site) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="border-border/50 bg-card/95 backdrop-blur-md max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-orbitron)' }}>
              Facilities for {site.name}
            </DialogTitle>
          </DialogHeader>

          {isAdding || editingFacility ? (
            <form onSubmit={isAdding ? handleAddSubmit : handleEditSubmit} className="space-y-4 py-4 border-b border-border/50 pb-6 mb-2">
               <h3 className="text-sm font-semibold text-primary">{isAdding ? 'Add New Facility' : 'Edit Facility'}</h3>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Facility Name</Label>
                    <Input
                      required
                      value={isAdding ? newFacility.name : editingFacility!.name}
                      onChange={e => isAdding ? setNewFacility({...newFacility, name: e.target.value}) : setEditingFacility({...editingFacility!, name: e.target.value})}
                      placeholder="e.g. Field 1, Court A"
                      className="bg-background/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Surface Type (Optional)</Label>
                    <Input
                      value={isAdding ? newFacility.surfaceType : editingFacility!.surfaceType}
                      onChange={e => isAdding ? setNewFacility({...newFacility, surfaceType: e.target.value}) : setEditingFacility({...editingFacility!, surfaceType: e.target.value})}
                      placeholder="e.g. Grass, Indoor, Clay"
                      className="bg-background/50"
                    />
                  </div>
               </div>
               <div className="flex justify-end gap-2 pt-2">
                  <MetalButton type="button" variantType="outlined" onClick={() => { setIsAdding(false); setEditingFacility(null); }}>
                    Cancel
                  </MetalButton>
                  <MetalButton type="submit" variantType="filled" glowColor="hsl(var(--primary))" disabled={loading}>
                    {loading ? "Saving..." : "Save Facility"}
                  </MetalButton>
               </div>
            </form>
          ) : (
            <div className="flex justify-end py-2">
               <MetalButton 
                 variantType="filled" 
                 glowColor="hsl(var(--primary))" 
                 size="sm" 
                 icon={<Plus className="w-4 h-4"/>} 
                 onClick={() => setIsAdding(true)}
               >
                 Add Facility
               </MetalButton>
            </div>
          )}

          <div className="border rounded-md border-border/50 overflow-hidden mt-4">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Facility</TableHead>
                  <TableHead>Surface Type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {facilities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                       No facilities added to this site yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  facilities.map(f => (
                     <TableRow key={f.id} className="hover:bg-muted/30">
                       <TableCell className="font-medium">{f.name}</TableCell>
                       <TableCell className="text-muted-foreground">{f.surfaceType || 'N/A'}</TableCell>
                       <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                             <MetalButton 
                               variantType="outlined" 
                               className="h-8 w-8 p-0" 
                               onClick={() => setEditingFacility({ id: f.id, name: f.name, surfaceType: f.surfaceType || '' })}
                             >
                               <Pencil className="w-4 h-4 text-muted-foreground" />
                             </MetalButton>
                             <MetalButton 
                               variantType="outlined" 
                               className="h-8 w-8 p-0 hover:bg-destructive/10" 
                               glowColor="hsl(var(--destructive))"
                               onClick={() => setConfirmDelete({ isOpen: true, id: f.id, name: f.name })}
                             >
                               <Trash2 className="w-4 h-4 text-destructive" />
                             </MetalButton>
                          </div>
                       </TableCell>
                     </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmationModal
        isOpen={confirmDelete.isOpen}
        onOpenChange={(op) => setConfirmDelete({ ...confirmDelete, isOpen: op })}
        title="Delete Facility"
        description={`Are you sure you want to delete ${confirmDelete.name}?`}
        onConfirm={handleDelete}
      />
    </>
  );
}
