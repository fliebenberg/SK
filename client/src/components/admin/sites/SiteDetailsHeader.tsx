"use client";

import { useState, useEffect, useRef } from "react";
import { Site, Facility, Address } from "@sk/types";
import { MetalButton } from "@/components/ui/MetalButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Pencil, Save, X, MapPin, Plus, Trash2, Building2
} from "lucide-react";
import { AddressInput } from "@/components/ui/AddressInput";
import { AddressMap } from "@/components/ui/AddressMap";
import { LocationPicker } from "@/components/ui/LocationPicker";
import { GenericAutocomplete } from "@/components/ui/GenericAutocomplete";
import { store } from "@/app/store/store";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SiteDetailsHeaderProps {
  site?: Site;
  orgId: string;
  isCreating?: boolean;
}

export function SiteDetailsHeader({ site, orgId, isCreating = false }: SiteDetailsHeaderProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: site?.name || "",
    address: site?.address || { fullAddress: "" } as Address,
  });

  // Facilities State
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [isAddingFacility, setIsAddingFacility] = useState(false);
  const [newFacility, setNewFacility] = useState({ 
    name: "", 
    surfaceType: "", 
    primarySportId: "",
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined
  });
  const [newFacilitySportSearch, setNewFacilitySportSearch] = useState("");
  
  const [editingFacility, setEditingFacility] = useState<{ 
    id: string; 
    name: string; 
    surfaceType: string;
    primarySportId: string;
    latitude?: number;
    longitude?: number;
  } | null>(null);
  const [editingFacilitySportSearch, setEditingFacilitySportSearch] = useState("");

  const [confirmDeleteFacility, setConfirmDeleteFacility] = useState<{ isOpen: boolean; id: string; name: string }>({ 
    isOpen: false, 
    id: "", 
    name: "" 
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const nameInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isCreating && nameInputRef.current) {
        setTimeout(() => {
            nameInputRef.current?.focus();
        }, 100);
    }
  }, [isCreating]);

  useEffect(() => {
    if (nameInputRef.current) {
        nameInputRef.current.style.height = 'auto';
        nameInputRef.current.style.height = nameInputRef.current.scrollHeight + 'px';
    }
  }, [formData.name]);

  // Sync Facilities
  useEffect(() => {
    if (isCreating || !site) return;

    const updateFacilities = () => {
        setFacilities(store.getFacilities(site.id));
    };

    updateFacilities();
    store.fetchFacilitiesForSite(site.id);
    const unsubscribe = store.subscribe(updateFacilities);
    
    return () => {
        unsubscribe();
    };
  }, [site?.id, isCreating]);

  const hasChanges = () => {
      if (isCreating) return true;
      if (!site) return false;
      
      return (
          formData.name !== (site.name || "") ||
          JSON.stringify(formData.address) !== JSON.stringify(site.address || { fullAddress: "" })
      );
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    setIsProcessing(true);

    try {
        const addressToStore = { ...formData.address };
        
        if (isCreating) {
            // Strip ID on creation to ensure the backend generates a new unique address record
            delete (addressToStore as any).id;
        } else if (site?.address?.id) {
            // Preserve the site's existing address ID when editing to ensure it updates correctly
            (addressToStore as any).id = site.address.id;
        }

        if (isCreating) {
            await store.addSite({
                name: formData.name,
                address: addressToStore as Address,
                orgId: orgId
            });
            router.push(`/admin/organizations/${orgId}/sites`);
        } else if (site) {
            await store.updateSite(site.id, {
                ...formData,
                address: addressToStore as Address
            });
            router.push(`/admin/organizations/${orgId}/sites`);
        }
    } catch (error) {
        console.error("Failed to save site:", error);
    } finally {
        setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    router.push(`/admin/organizations/${orgId}/sites`);
  };

  // Facility Actions
  const handleAddFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!site || !newFacility.name.trim()) return;
    setIsProcessing(true);
    try {
      await store.addFacility({ 
          siteId: site.id, 
          name: newFacility.name, 
          surfaceType: newFacility.surfaceType,
          primarySportId: newFacility.primarySportId || undefined,
          latitude: newFacility.latitude,
          longitude: newFacility.longitude
      });
      setNewFacility({ 
          name: "", 
          surfaceType: "", 
          primarySportId: "",
          latitude: undefined,
          longitude: undefined
      });
      setNewFacilitySportSearch("");
      setIsAddingFacility(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFacility) return;
    setIsProcessing(true);
    try {
      await store.updateFacility(editingFacility.id, { 
          name: editingFacility.name, 
          surfaceType: editingFacility.surfaceType,
          primarySportId: editingFacility.primarySportId || undefined,
          latitude: editingFacility.latitude,
          longitude: editingFacility.longitude
      });
      setEditingFacility(null);
      setEditingFacilitySportSearch("");
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteFacility = async () => {
    if (!confirmDeleteFacility.id) return;
    setIsProcessing(true);
    try {
      await store.deleteFacility(confirmDeleteFacility.id);
      setConfirmDeleteFacility({ isOpen: false, id: "", name: "" });
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Site Header Area */}
      <div className="flex flex-col xl:flex-row xl:items-center gap-6">
        {/* Site Icon */}
        <div className="w-32 h-32 flex-shrink-0 mx-auto xl:mx-0 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
             <MapPin className="w-16 h-16 text-primary" />
        </div>
        
        {/* Name and Basic Info */}
        <div className="flex-1 flex flex-col gap-2 pt-1 min-w-0 w-full items-center xl:items-start">
            <div className="relative w-full group/name">
                <textarea
                    ref={nameInputRef}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="text-3xl md:text-4xl font-bold tracking-tight bg-transparent border-none p-0 focus:outline-none resize-none overflow-hidden rounded px-2 xl:-ml-2 w-full leading-tight text-center xl:text-left break-words transition-all hover:bg-muted hover:ring-1 hover:ring-ring cursor-text"
                    placeholder="Site Name (e.g. Main Stadium)"
                    rows={1}
                    style={{ minHeight: '1.2em' }}
                />
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="w-4 h-4" />
                <span className="text-sm font-medium uppercase tracking-wider">Organization Site</span>
            </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-2 gap-8 border-t pt-8">
        {/* Physical Address Section */}
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-lg">Physical Location</h3>
            </div>
            
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="siteAddress" className="text-sm font-bold uppercase tracking-widest text-muted-foreground/70">
                        Address Search
                    </Label>
                    <AddressInput
                        id="siteAddress"
                        value={formData.address?.fullAddress}
                        onChange={(addr) => setFormData({ ...formData, address: addr })}
                        placeholder="Search for site address..."
                        className="bg-background/50 h-11"
                    />
                </div>
                
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <AddressMap 
                        address={formData.address} 
                        className="w-full aspect-video rounded-xl border border-border/50 shadow-sm overflow-hidden"
                    />
                </div>

                <p className="text-xs text-muted-foreground italic leading-relaxed bg-muted/30 p-3 rounded-lg border border-border/50">
                    Setting a precise address helps participants find the exact location of fields and facilities.
                </p>
            </div>
        </div>

        {/* Facilities Section (Only when editing) */}
        {!isCreating && site && (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Plus className="h-5 w-5 text-primary" />
                        <h3 className="font-bold text-lg">Facilities ({facilities.length})</h3>
                    </div>
                    {!isAddingFacility && !editingFacility && (
                        <MetalButton 
                            variantType="filled" 
                            size="sm" 
                            onClick={() => setIsAddingFacility(true)}
                            icon={<Plus className="w-3 h-3" />}
                        >
                            Add Facility
                        </MetalButton>
                    )}
                </div>

                {(isAddingFacility || editingFacility) ? (
                    <Card className="border-primary/20 bg-primary/5 animate-in fade-in zoom-in-95 duration-200">
                        <CardHeader className="py-3 px-4">
                            <CardTitle className="text-sm font-bold uppercase tracking-wider text-primary">
                                {isAddingFacility ? "New Facility" : "Edit Facility"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <form onSubmit={isAddingFacility ? handleAddFacility : handleEditFacility} className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Facility Name</Label>
                                        <Input
                                            required
                                            value={isAddingFacility ? newFacility.name : editingFacility!.name}
                                            onChange={e => isAddingFacility ? setNewFacility({...newFacility, name: e.target.value}) : setEditingFacility({...editingFacility!, name: e.target.value})}
                                            placeholder="Field 1, Court A..."
                                            className="bg-background/70"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Surface (Optional)</Label>
                                        <Input
                                            value={isAddingFacility ? newFacility.surfaceType : editingFacility!.surfaceType}
                                            onChange={e => isAddingFacility ? setNewFacility({...newFacility, surfaceType: e.target.value}) : setEditingFacility({...editingFacility!, surfaceType: e.target.value})}
                                            placeholder="Grass, Indoor, Clay..."
                                            className="bg-background/70"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Primary Sport</Label>
                                        <GenericAutocomplete
                                            items={store.sports.map(s => ({ id: s.id, label: s.name, data: s }))}
                                            value={isAddingFacility ? newFacilitySportSearch : editingFacilitySportSearch}
                                            onChange={(val) => isAddingFacility ? setNewFacilitySportSearch(val) : setEditingFacilitySportSearch(val)}
                                            onSelect={(item) => {
                                                if (isAddingFacility) {
                                                    setNewFacility({ ...newFacility, primarySportId: item?.id || "" });
                                                    if (item) setNewFacilitySportSearch(item.label);
                                                } else {
                                                    setEditingFacility({ ...editingFacility!, primarySportId: item?.id || "" });
                                                    if (item) setEditingFacilitySportSearch(item.label);
                                                }
                                            }}
                                            placeholder="Select sport..."
                                            className="bg-background/70"
                                        />
                                    </div>

                                    <div className="col-span-1 sm:col-span-2 space-y-1.5">
                                        <Label className="text-xs">Location on Map</Label>
                                        <LocationPicker
                                            latitude={isAddingFacility ? newFacility.latitude : editingFacility?.latitude}
                                            longitude={isAddingFacility ? newFacility.longitude : editingFacility?.longitude}
                                            defaultCenter={formData.address?.latitude != null && formData.address?.longitude != null ? { lat: formData.address.latitude, lng: formData.address.longitude } : undefined}
                                            onChange={(lat, lng) => isAddingFacility ? setNewFacility({ ...newFacility, latitude: lat, longitude: lng }) : setEditingFacility({ ...editingFacility!, latitude: lat, longitude: lng })}
                                            className="w-full"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <MetalButton 
                                        type="button" 
                                        variantType="outlined" 
                                        size="sm"
                                        onClick={() => { setIsAddingFacility(false); setEditingFacility(null); }}
                                    >
                                        Cancel
                                    </MetalButton>
                                    <MetalButton 
                                        type="submit" 
                                        variantType="filled" 
                                        glowColor="hsl(var(--primary))"
                                        size="sm"
                                        disabled={isProcessing}
                                    >
                                        {isProcessing ? "Saving..." : "Save Facility"}
                                    </MetalButton>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="border border-border/50 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead className="font-bold text-xs">FACILITY</TableHead>
                                    <TableHead className="font-bold text-xs">SPORT</TableHead>
                                    <TableHead className="font-bold text-xs">SURFACE</TableHead>
                                    <TableHead className="text-right font-bold text-xs">ACTIONS</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {facilities.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-12 text-muted-foreground italic">
                                            No facilities added yet.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    facilities.map(f => (
                                        <TableRow key={f.id} className="group hover:bg-primary/5 transition-colors">
                                            <TableCell className="font-semibold">
                                                <div className="flex flex-col">
                                                    <span>{f.name}</span>
                                                    {f.latitude != null && f.longitude != null && (
                                                        <span className="text-[10px] text-muted-foreground truncate max-w-[200px]" title={`${f.latitude}, ${f.longitude}`}>
                                                            {f.latitude.toFixed(4)}, {f.longitude.toFixed(4)}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm font-medium">
                                                {store.sports.find(s => s.id === f.primarySportId)?.name || '--'}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm uppercase tracking-tight">{f.surfaceType || '--'}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <MetalButton 
                                                        variantType="outlined" 
                                                        className="h-7 w-7 p-0 border-transparent hover:border-border" 
                                                        onClick={() => {
                                                            setEditingFacility({ 
                                                                id: f.id, 
                                                                name: f.name, 
                                                                surfaceType: f.surfaceType || '',
                                                                primarySportId: f.primarySportId || '',
                                                                latitude: f.latitude,
                                                                longitude: f.longitude
                                                            });
                                                            setEditingFacilitySportSearch(store.sports.find(s => s.id === f.primarySportId)?.name || '');
                                                        }}
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </MetalButton>
                                                    <MetalButton 
                                                        variantType="outlined" 
                                                        className="h-7 w-7 p-0 border-transparent hover:border-destructive hover:bg-destructive/10" 
                                                        glowColor="hsl(var(--destructive))"
                                                        onClick={() => setConfirmDeleteFacility({ isOpen: true, id: f.id, name: f.name })}
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                                    </MetalButton>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>
        )}
      </div>

      {/* Global Actions */}
      <div className="flex gap-3 justify-center md:justify-end border-t pt-8">
            <MetalButton 
                variantType="outlined" 
                onClick={handleCancel}
                disabled={isProcessing}
                className="min-w-[120px]"
            >
                Cancel
            </MetalButton>
            <MetalButton 
                variantType="filled" 
                glowColor="hsl(var(--primary))"
                onClick={handleSave}
                disabled={isProcessing || !formData.name.trim() || (!isCreating && !hasChanges())}
                className="min-w-[120px]"
            >
                {isProcessing ? "Saving..." : (isCreating ? "Create Site" : "Save Changes")}
            </MetalButton>
      </div>

      {/* Confirmations */}
      <ConfirmationModal
        isOpen={confirmDeleteFacility.isOpen}
        onOpenChange={(op) => setConfirmDeleteFacility({ ...confirmDeleteFacility, isOpen: op })}
        title="Delete Facility"
        description={`Are you sure you want to delete ${confirmDeleteFacility.name}? This cannot be undone.`}
        onConfirm={handleDeleteFacility}
      />
    </div>
  );
}
