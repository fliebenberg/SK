"use client";

import { MetalButton } from "@/components/ui/MetalButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { PageHeader } from "@/components/ui/PageHeader";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Site } from "@sk/types";
import { useOrganization } from "@/hooks/useOrganization";
import Link from "next/link";

export default function SiteManagementPage() {
  const params = useParams();
  const id = params.id as string;

  const { org, isLoading: loading } = useOrganization(id, { subscribeData: true });
  const [sites, setSites] = useState<Site[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // Delete State
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; siteId: string; name: string }>({
    isOpen: false,
    siteId: "",
    name: "",
  });

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

  const handleSort = (key: 'name' | 'address') => {
    setSortConfig(current => ({
        key,
        direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const filteredSites = sites.filter(v => {
    if (!showInactive && v.isActive === false) return false;

    const facilities = store.getFacilities(v.id);
    const facilityMatch = facilities.some(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesSearch = v.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (v.address?.fullAddress || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (v.address?.city || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                          facilityMatch;
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sites"
        description="Manage fields, courts, and facilities."
      >
        <div className="flex items-center gap-4 flex-1 justify-end">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input 
                    type="checkbox" 
                    checked={showInactive} 
                    onChange={(e) => setShowInactive(e.target.checked)} 
                    className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                />
                Show Inactive
            </label>
            <div className="relative flex-1 max-w-xs md:max-w-md">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search sites..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 bg-background/50 h-9"
                />
            </div>
            <Link href={`/admin/organizations/${id}/sites/create`}>
              <MetalButton 
                      variantType="filled" 
                      glowColor="hsl(var(--primary))"
                      size="sm"
                      className="text-primary-foreground whitespace-nowrap h-9 px-3"
                      icon={<Plus className="h-4 w-4" />}
                  >
                      <span className="hidden md:inline">Add Site</span>
                      <span className="md:hidden">Add</span>
              </MetalButton>
            </Link>
        </div>
      </PageHeader>

      {/* Grid of Site Cards */}
      {sortedSites.length === 0 ? (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <MapPin className="h-12 w-12 opacity-20 mb-4" />
            <p className="text-lg font-medium">No sites found.</p>
            {searchQuery && <p className="text-sm">Try adjusting your search query.</p>}
            {!searchQuery && <p className="text-sm">Start by adding your first field or facility.</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedSites.map((site) => {
            const facilities = store.getFacilities(site.id);
            return (
              <Card key={site.id} className={`group border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/50 transition-all duration-300 ${site.isActive === false ? 'opacity-60' : ''}`}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-xl font-orbitron tracking-tight truncate max-w-[200px]" title={site.name}>
                          {site.name}
                        </CardTitle>
                        {site.isActive === false && (
                          <span className="px-2 py-0.5 rounded text-xs text-muted-foreground bg-muted font-medium border">Inactive</span>
                        )}
                      </div>
                      <div className="flex items-center text-sm text-muted-foreground">
                        <MapPin className="h-3 w-3 mr-1 shrink-0" />
                        <span className="truncate max-w-[180px]" title={site.address?.fullAddress || "No address provided"}>
                          {site.address?.fullAddress || "No address provided"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Link href={`/admin/organizations/${id}/sites/${site.id}/edit`}>
                        <MetalButton
                          variantType="outlined"
                          className="text-muted-foreground hover:text-primary h-8 w-8 p-0"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </MetalButton>
                      </Link>
                      <MetalButton
                        variantType="outlined"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                        onClick={() => handleDeleteSite(site.id, site.name)}
                        glowColor="hsl(var(--destructive))"
                        title="Delete"
                        disabled={isProcessing}
                      >
                        <Trash2 className="w-4 h-4" />
                      </MetalButton>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Facilities ({facilities.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {facilities.length > 0 ? (
                        facilities.map(f => (
                          <div 
                            key={f.id} 
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${f.isActive === false ? 'bg-muted text-muted-foreground ring-border' : 'bg-primary/10 text-primary ring-primary/20'}`}
                          >
                            {f.name}
                            {f.isActive === false && " (Inactive)"}
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No facilities assigned</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      
      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmDelete.isOpen}
        onOpenChange={(open) => setConfirmDelete({ ...confirmDelete, isOpen: open })}
        title="Delete Site"
        description={`Are you sure you want to delete ${confirmDelete.name}? This may affect events scheduled at this site.`}
        onConfirm={onConfirmDelete}
      />
    </div>
  );
}
