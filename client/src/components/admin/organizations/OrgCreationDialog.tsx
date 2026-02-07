"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { store } from "@/app/store/store";
import { Organization } from "@sk/types";
import { Loader2, X } from "lucide-react";
import { MetalButton } from "@/components/ui/MetalButton";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { getInitials } from "@/lib/utils";

interface OrgCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  onCreated: (org: Organization) => void;
  supportedSportIds?: string[];
}

export function OrgCreationDialog({
  open,
  onOpenChange,
  initialName = "",
  onCreated,
  supportedSportIds = [],
}: OrgCreationDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: initialName,
    shortName: "",
    primaryColor: "#000000",
    secondaryColor: "#ffffff",
    logo: "",
  });

  // Sync initial name when it changes (e.g. from autocomplete)
  useEffect(() => {
    if (open) {
      setFormData((prev) => ({
        ...prev,
        name: initialName,
        shortName: initialName.substring(0, 3).toUpperCase(),
        logo: "", // Reset logo on open
      }));
    }
  }, [open, initialName]);

  const handleSave = async () => {
    if (!formData.name.trim()) return;

    setLoading(true);
    try {
      const newOrg = await store.addOrganization({
        name: formData.name,
        shortName: formData.shortName,
        primaryColor: formData.primaryColor,
        secondaryColor: formData.secondaryColor,
        logo: formData.logo,
        supportedSportIds,
        supportedRoleIds: [],
      });
      onCreated(newOrg);
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const currentInitials = getInitials(formData.name, formData.shortName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Register Organization</DialogTitle>
          <DialogDescription>
            Add a new organization to the system. This info is used for displays and schedules.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-4">
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 flex-shrink-0">
                <ImageUpload
                    value={formData.logo}
                    onChange={(base64) => setFormData({ ...formData, logo: base64 })}
                    className="w-full h-full rounded-md overflow-hidden shadow-sm border border-border"
                    minimal
                    placeholderPrimary={formData.primaryColor}
                    placeholderSecondary={formData.secondaryColor}
                    initials={currentInitials}
                />
            </div>
            <div className="flex-1 grid gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="title">Name</Label>
                    <Input
                        id="title"
                        value={formData.name}
                        onChange={(e) => {
                            const newName = e.target.value;
                            setFormData((prev) => ({
                                ...prev,
                                name: newName,
                                shortName: prev.shortName === prev.name.substring(0, 3).toUpperCase() 
                                    ? newName.substring(0, 3).toUpperCase() 
                                    : prev.shortName
                            }));
                        }}
                        placeholder="e.g. Springvale High"
                        autoFocus
                    />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="code">Code (Short Name)</Label>
                    <Input
                        id="code"
                        value={formData.shortName}
                        onChange={(e) => setFormData({ ...formData, shortName: e.target.value.toUpperCase().slice(0, 6) })}
                        placeholder="e.g. SPR"
                        maxLength={6}
                    />
                </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t">
            <div className="grid gap-2">
                <Label>Primary Color</Label>
                <div className="flex items-center gap-2 relative h-10 px-3 rounded-md border border-input bg-background/50 group/color cursor-pointer">
                    <input
                        type="color"
                        value={formData.primaryColor}
                        onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                    />
                    <div 
                        className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                        style={{ backgroundColor: formData.primaryColor }}
                    />
                    <span className="text-xs font-mono uppercase text-muted-foreground">{formData.primaryColor}</span>
                </div>
            </div>
            <div className="grid gap-2">
                <Label>Secondary Color</Label>
                <div className="flex items-center gap-2 relative h-10 px-3 rounded-md border border-input bg-background/50 group/color cursor-pointer">
                    <input
                        type="color"
                        value={formData.secondaryColor}
                        onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                    />
                    <div 
                        className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                        style={{ backgroundColor: formData.secondaryColor }}
                    />
                    <span className="text-xs font-mono uppercase text-muted-foreground">{formData.secondaryColor}</span>
                </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <MetalButton 
            variantType="outlined"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </MetalButton>
          <MetalButton 
            variantType="filled"
            onClick={handleSave}
            disabled={loading || !formData.name.trim()}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Register Organization
          </MetalButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
