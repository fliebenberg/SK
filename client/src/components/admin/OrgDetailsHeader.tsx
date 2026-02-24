"use client";

import { useState, useEffect, useRef } from "react";
import { Organization } from "@sk/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Save, X, Building2, Flag } from "lucide-react";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { store } from "@/app/store/store";
import { useRouter } from "next/navigation";
import { cn, getInitials, isPlaceholderLogo } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ChevronDown } from "lucide-react";
import { OrgLogo } from "@/components/ui/OrgLogo";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { PowerOff } from "lucide-react";

interface OrgDetailsHeaderProps {
  organization?: Organization;
  isCreating?: boolean;
  readOnly?: boolean;
}

export function OrgDetailsHeader({ organization, isCreating = false, readOnly = false }: OrgDetailsHeaderProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: organization?.name || "",
    logo: organization?.logo || "",
    primaryColor: organization?.primaryColor || "#000000",
    secondaryColor: organization?.secondaryColor || "#ffffff",
    supportedSportIds: organization?.supportedSportIds || [],
    shortName: organization?.shortName || "",
    supportedRoleIds: organization?.supportedRoleIds || (isCreating ? ['role-org-admin', 'role-org-member'] : []),
  });
  const [similarOrgs, setSimilarOrgs] = useState<Organization[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isMatchesDismissed, setIsMatchesDismissed] = useState(false);
  const [lastSearchedName, setLastSearchedName] = useState("");

  const nameInputRef = useRef<HTMLTextAreaElement>(null);

  // Focus name input on creation
  useEffect(() => {
    if (isCreating && nameInputRef.current) {
        setTimeout(() => {
            nameInputRef.current?.focus();
        }, 100);
    }
  }, [isCreating]);

  const [sports, setSports] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    const updateSports = () => setSports(store.getSports());
    updateSports();
    const unsubscribe = store.subscribe(updateSports);
    return () => unsubscribe();
  },[]);

  useEffect(() => {
    if (nameInputRef.current) {
        nameInputRef.current.style.height = 'auto';
        nameInputRef.current.style.height = nameInputRef.current.scrollHeight + 'px';
    }
  }, [formData.name]);
  
  // Similar Org Lookup
  useEffect(() => {
    if (!isCreating || !formData.name.trim() || formData.name.length < 3) {
      setSimilarOrgs([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await store.searchSimilarOrganizations(formData.name);
        setSimilarOrgs(results);
        
        // If the name has changed significantly from the last time we showed matches,
        // reset the dismissal state.
        if (Math.abs(formData.name.length - lastSearchedName.length) > 3) {
            setIsMatchesDismissed(false);
            setLastSearchedName(formData.name);
        }
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.name, isCreating, lastSearchedName]);

  const hasChanges = () => {
      if (isCreating) return true;
      if (!organization) return false;
      return (
          formData.name !== organization.name ||
          formData.logo !== organization.logo ||
          formData.primaryColor !== organization.primaryColor ||
          formData.secondaryColor !== organization.secondaryColor ||
          formData.shortName !== organization.shortName ||
          JSON.stringify(formData.supportedSportIds) !== JSON.stringify(organization.supportedSportIds) ||
          JSON.stringify(formData.supportedRoleIds) !== JSON.stringify(organization.supportedRoleIds)
      );
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;

    if (isCreating) {
        // Optimistic update
        const newOrg = await store.addOrganization({
            ...formData,
            supportedSportIds: formData.supportedSportIds || [],
            supportedRoleIds: formData.supportedRoleIds || [],
            creatorId: user?.id,
        });
        
        // No need for window event dispatch if we just navigate
        // The store update should propagate to anything listening
        // But the redirect is key.
        
        // window.dispatch event was for legacy refresh?
        
        router.push(`/admin/organizations/${newOrg.id}`);
    } else if (organization) {
        // CSR: Use the store directly to update the organization via WebSockets
        await store.updateOrganization(organization.id, formData);
        
        // CSR: Trigger a custom event if other non-reactive parts of the app need to know
        window.dispatchEvent(new CustomEvent('organization-updated', { 
            detail: { orgId: organization.id } 
        }));
        
        // CSR: Rely on the store's reactive updates and client-side navigation
        router.push(`/admin/organizations/${organization.id}`); 
    }
  };

  const handleCancel = () => {
    if (isCreating) {
        router.back();
        return;
    }

    if (organization) {
        setFormData({
            name: organization.name,
            logo: organization.logo || "",
            primaryColor: organization.primaryColor || "#000000",
            secondaryColor: organization.secondaryColor || "#ffffff",
            supportedSportIds: organization.supportedSportIds || [],
            shortName: organization.shortName || "",
            supportedRoleIds: organization.supportedRoleIds || [],
        });
    }
  };

  if (!organization && !isCreating) return null;

  const currentInitials = getInitials(formData.name, formData.shortName);
  const hasActualLogo = formData.logo && !isPlaceholderLogo(formData.logo);
  const isDeactivated = organization?.isActive === false;
  const isEffectiveReadOnly = readOnly || isDeactivated;

  return (
    <div className="flex flex-col gap-6">
      {isDeactivated && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4 flex items-center gap-3 animate-pulse">
            <PowerOff className="w-5 h-5 text-destructive" />
            <div className="flex-1">
                <p className="text-sm font-bold text-destructive">This organization is deactivated.</p>
                <p className="text-xs text-muted-foreground italic">All fields are read-only. Contact an app administrator to reactivate it.</p>
            </div>
            <Badge variant="destructive" className="uppercase font-black px-3 py-1">Inactive</Badge>
        </div>
      )}
      <div className="flex flex-col xl:flex-row xl:items-center gap-6">
        {/* Box 1: Logo */}
        <div className="w-32 h-32 flex-shrink-0 mx-auto xl:mx-0">
             {isEffectiveReadOnly ? (
                 <OrgLogo organization={formData} size="xl" />
             ) : (
                <ImageUpload
                    value={hasActualLogo ? formData.logo : ""}
                    onChange={(base64) => setFormData({ ...formData, logo: base64 })}
                    className="w-full h-full rounded-md overflow-hidden shadow-sm border border-border"
                    minimal
                    placeholderPrimary={formData.primaryColor}
                    placeholderSecondary={formData.secondaryColor}
                    initials={currentInitials}
                />
             )}
        </div>
        
        {/* Box 2: Name and Code */}
        <div className="flex-1 flex flex-col gap-2 pt-1 min-w-0 w-full items-center xl:items-start">
              {isEffectiveReadOnly ? (
                 <h1 className="text-3xl md:text-4xl font-bold tracking-tight px-2 xl:-ml-2">{formData.name}</h1>
              ) : (
                <div className="relative w-full group/name">
                    <textarea
                        ref={nameInputRef}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        onInput={(e) => {
                            e.currentTarget.style.height = 'auto';
                            e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                        }}
                        className="text-3xl md:text-4xl font-bold tracking-tight bg-transparent border-none p-0 focus:outline-none resize-none overflow-hidden rounded px-2 xl:-ml-2 w-full leading-tight text-center xl:text-left break-words max-h-[6rem] transition-all hover:bg-muted hover:ring-1 hover:ring-ring cursor-text"
                        placeholder="Organization Name"
                        rows={1}
                        style={{ minHeight: '1.2em' }}
                    />
                </div>
              )}
              
              {isCreating && similarOrgs.length > 0 && !isMatchesDismissed && (
                <Dialog open={true} onOpenChange={(open) => { if(!open) setIsMatchesDismissed(true); }}>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-orange-400">
                                <Building2 className="w-5 h-5" />
                                Similar Organizations Found
                            </DialogTitle>
                            <DialogDescription>
                                Before creating a new organization, please check if it already exists in our system.
                            </DialogDescription>
                        </DialogHeader>
                        
                        <div className="flex flex-col gap-3 py-4 max-h-[300px] overflow-y-auto pr-2">
                            {similarOrgs.map(org => (
                                <button
                                    key={org.id}
                                    onClick={() => router.push(`/admin/organizations/${org.id}`)}
                                    className="flex items-center gap-3 bg-card border border-border p-3 rounded-lg text-sm hover:bg-accent transition-colors text-left group"
                                >
                                    <OrgLogo organization={org} size="sm" />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-foreground truncate">{org.name}</div>
                                        <div className="flex items-center gap-2 mt-1">
                                            {org.isClaimed ? (
                                                <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-medium">CLAIMED</span>
                                            ) : (
                                                <span className="text-[10px] bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded font-medium">UNCLAIMED</span>
                                            )}
                                            {org.shortName && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{org.shortName}</span>}
                                        </div>
                                    </div>
                                    <ChevronDown className="w-4 h-4 text-muted-foreground -rotate-90 group-hover:translate-x-1 transition-transform" />
                                </button>
                            ))}
                        </div>

                        <DialogFooter className="flex flex-col sm:flex-row gap-2">
                            <Button 
                                variant="outline" 
                                className="w-full sm:w-auto"
                                onClick={() => setIsMatchesDismissed(true)}
                            >
                                Proceed with New Organization
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
              )}

              <div className="flex items-center gap-2 justify-center xl:justify-start w-full xl:w-auto">
                <span className="text-sm text-muted-foreground font-medium">CODE:</span>
                {isEffectiveReadOnly ? (
                    <span className="text-xl font-bold font-mono px-1">{formData.shortName || "--"}</span>
                ) : (
                    <Input
                        value={formData.shortName}
                        onChange={(e) => setFormData({ ...formData, shortName: e.target.value.toUpperCase().slice(0, 6) })}
                        className="text-xl font-bold font-mono bg-transparent border-none p-0 h-auto focus-visible:ring-0 rounded px-1 w-24 text-center uppercase transition-all hover:bg-muted hover:ring-1 hover:ring-ring cursor-text"
                        placeholder="SHS"
                        maxLength={6}
                    />
                )}
              </div>
        </div>
      </div>

      {!isEffectiveReadOnly && (
        <div className="grid md:grid-cols-2 gap-8 border-t pt-6">
            {/* Box 3: Colors */}
            <div className="space-y-4">
                <h3 className="font-medium text-sm text-foreground">Organization Colors</h3>
                <div className="flex flex-col gap-3 text-sm text-muted-foreground w-fit md:w-auto items-start">
                    <div className="flex items-center gap-2 group/color relative">
                        <span className="w-6 h-6 rounded-md border block shadow-sm" style={{ backgroundColor: formData.primaryColor }} />
                        <span className="">Primary</span>
                        <Input 
                            type="color" 
                            value={formData.primaryColor}
                            onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full p-0 border-0"
                        />
                    </div>
                    <div className="flex items-center gap-2 group/color relative">
                        <span className="w-6 h-6 rounded-md border block shadow-sm" style={{ backgroundColor: formData.secondaryColor }} />
                        <span className="">Secondary</span>
                        <Input 
                            type="color" 
                            value={formData.secondaryColor}
                            onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full p-0 border-0"
                        />
                    </div>
                </div>
            </div>

            {/* Box 4: Sports */}
            <div className="space-y-4">
                <h3 className="font-medium text-sm text-foreground">Sports Configuration</h3>
                <div className="flex flex-col gap-1 w-full max-w-xs">
                    <Label className="text-xs text-muted-foreground">Sports Offered</Label>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full justify-between bg-transparent border-input/50">
                                {formData.supportedSportIds.length > 0 
                                    ? `${formData.supportedSportIds.length} Selected` 
                                    : "Select Sports"}
                                <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-56" align="start">
                            <DropdownMenuLabel>Available Sports</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {sports.map((sport) => (
                                <DropdownMenuCheckboxItem
                                    key={sport.id}
                                    checked={(formData.supportedSportIds || []).includes(sport.id)}
                                    onSelect={(e) => e.preventDefault()}
                                    onCheckedChange={(checked) => {
                                        const currentSports = formData.supportedSportIds || [];
                                        const newSports = checked
                                            ? [...currentSports, sport.id]
                                            : currentSports.filter((s) => s !== sport.id);
                                        setFormData({ ...formData, supportedSportIds: newSports });
                                    }}
                                >
                                    {sport.name}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Box 5: Roles */}
            <div className="space-y-4">
                <h3 className="font-medium text-sm text-foreground">Role Configuration</h3>
                <div className="flex flex-col gap-1 w-full max-w-xs">
                    <Label className="text-xs text-muted-foreground">Organization Roles</Label>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full justify-between bg-transparent border-input/50">
                                {formData.supportedRoleIds?.length || 0 > 0 
                                    ? `${formData.supportedRoleIds?.length} Selected` 
                                    : "Select Roles"}
                                <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-56" align="start">
                            <DropdownMenuLabel>Available Roles</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {store.getOrganizationRoles().map((role) => (
                                <DropdownMenuCheckboxItem
                                    key={role.id}
                                    checked={(formData.supportedRoleIds || []).includes(role.id)}
                                    onSelect={(e) => e.preventDefault()}
                                    onCheckedChange={(checked) => {
                                        const currentRoles = formData.supportedRoleIds || [];
                                        const newRoles = checked
                                            ? [...currentRoles, role.id]
                                            : currentRoles.filter((r) => r !== role.id);
                                        setFormData({ ...formData, supportedRoleIds: newRoles });
                                    }}
                                >
                                    {role.name}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </div>
      )}

      {!isEffectiveReadOnly && hasChanges() && (
        <div className="flex gap-2 animate-in fade-in slide-in-from-top-2 w-full justify-center md:justify-end">
            <Button onClick={handleSave} size="sm" disabled={!formData.name.trim()}>
                <Save className="w-4 h-4 mr-2" /> {isCreating ? "Create" : "Save"}
            </Button>
            <Button onClick={handleCancel} variant="ghost" size="sm">
                <X className="w-4 h-4 mr-2" /> Cancel
            </Button>
        </div>
      )}

    </div>
  );
}
