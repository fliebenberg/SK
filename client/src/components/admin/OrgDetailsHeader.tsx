"use client";

import { useState, useEffect, useRef } from "react";
import { Organization } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Save, X, Building2 } from "lucide-react";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { store } from "@/lib/store";
import { useRouter } from "next/navigation";
import { updateOrganizationAction, createOrganizationAction } from "@/app/actions";
// import { AVAILABLE_SPORTS } from "@/lib/constants"; // Removed in favor of store

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

interface OrgDetailsHeaderProps {
  organization?: Organization;
  isCreating?: boolean;
  readOnly?: boolean;
}

export function OrgDetailsHeader({ organization, isCreating = false, readOnly = false }: OrgDetailsHeaderProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: organization?.name || "",
    logo: organization?.logo || "",
    primaryColor: organization?.primaryColor || "#000000",
    secondaryColor: organization?.secondaryColor || "#ffffff",
    supportedSportIds: organization?.supportedSportIds || [],
    shortName: organization?.shortName || "",
  });

  const nameInputRef = useRef<HTMLTextAreaElement>(null);

  // Focus name input on creation
  useEffect(() => {
    if (isCreating && nameInputRef.current) {
        setTimeout(() => {
            nameInputRef.current?.focus();
        }, 100);
    }
  }, [isCreating]);

  // Auto-resize name textarea
  useEffect(() => {
    if (nameInputRef.current) {
        nameInputRef.current.style.height = 'auto';
        nameInputRef.current.style.height = nameInputRef.current.scrollHeight + 'px';
    }
  }, [formData.name]);

  const hasChanges = () => {
      if (isCreating) return true;
      if (!organization) return false;
      return (
          formData.name !== organization.name ||
          formData.logo !== organization.logo ||
          formData.primaryColor !== organization.primaryColor ||
          formData.secondaryColor !== organization.secondaryColor ||
          formData.shortName !== organization.shortName ||
          JSON.stringify(formData.supportedSportIds) !== JSON.stringify(organization.supportedSportIds)
      );
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;

    if (isCreating) {
        const newOrg = await createOrganizationAction({
            ...formData,
            supportedSportIds: formData.supportedSportIds || [],
        });
        
        window.dispatchEvent(new CustomEvent('organization-updated', { 
            detail: { orgId: newOrg.id } 
        }));

        router.push(`/admin/organizations/${newOrg.id}`);
    } else if (organization) {
        await updateOrganizationAction(organization.id, formData);
        
        // Update client-side store for immediate reflection in Client Components
        store.updateOrganization(organization.id, formData);

        window.dispatchEvent(new CustomEvent('organization-updated', { 
            detail: { orgId: organization.id } 
        }));
        
        router.refresh();
        router.push(`/admin/organizations/${organization.id}`); // Redirect to dashboard after save
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
        });
    }
  };

  if (!organization && !isCreating) return null;

  return (
    <div className="flex flex-col gap-6 group">
      <div className="flex flex-col md:flex-row md:items-center gap-6">
        {/* Box 1: Logo */}
        <div className="w-32 h-32 flex-shrink-0 mx-auto md:mx-0">
             {readOnly ? (
                 organization?.logo ? (
                    <div className="w-full h-full rounded-md overflow-hidden shadow-sm border border-border">
                        <img src={organization.logo} alt={organization.name} className="w-full h-full object-cover" />
                    </div>
                 ) : (
                    <div className="w-full h-full rounded-md overflow-hidden shadow-sm border border-border bg-muted flex items-center justify-center">
                        <Building2 className="w-12 h-12 text-muted-foreground/50" />
                    </div>
                 )
             ) : (
                <ImageUpload
                    value={formData.logo}
                    onChange={(base64) => setFormData({ ...formData, logo: base64 })}
                    className="w-full h-full rounded-md overflow-hidden shadow-sm border border-border"
                    minimal
                />
             )}
        </div>
        
        {/* Box 2: Name and Code */}
        <div className="flex-1 flex flex-col gap-2 pt-1 min-w-0 w-full items-center md:items-start">
              {readOnly ? (
                 <h1 className="text-3xl md:text-4xl font-bold tracking-tight px-2 md:-ml-2">{formData.name}</h1>
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
                        className="text-3xl md:text-4xl font-bold tracking-tight bg-transparent border-none p-0 focus:outline-none resize-none overflow-hidden rounded px-2 md:-ml-2 w-full leading-tight text-center md:text-left break-words max-h-[6rem] transition-all hover:bg-muted hover:ring-1 hover:ring-ring cursor-text"
                        placeholder="Organization Name"
                        rows={1}
                        style={{ minHeight: '1.2em' }}
                    />
                </div>
              )}
              <div className="flex items-center gap-2 justify-center md:justify-start w-full md:w-auto">
                <span className="text-sm text-muted-foreground font-medium">CODE:</span>
                {readOnly ? (
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

      {!readOnly && (
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
                            {store.getSports().map((sport) => (
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
        </div>
      )}

      {!readOnly && hasChanges() && (
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
