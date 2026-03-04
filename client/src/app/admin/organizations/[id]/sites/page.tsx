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
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
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
