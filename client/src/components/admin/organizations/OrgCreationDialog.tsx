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
import { useAuth } from "@/contexts/AuthContext";

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
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: initialName,
    shortName: "",
    primaryColor: "#000000",
    secondaryColor: "#ffffff",
    logo: "",
  });

  const [referralEmails, setReferralEmails] = useState<string[]>([""]);

  // Sync initial name when it changes (e.g. from autocomplete)
  useEffect(() => {
    if (open) {
      setFormData((prev) => ({
        ...prev,
        name: initialName,
        shortName: initialName.substring(0, 3).toUpperCase(),
        logo: "", // Reset logo on open
      }));
      setReferralEmails([""]); // Reset referrals
    }
  }, [open, initialName]);

  const handleReferralChange = (index: number, value: string) => {
    const newEmails = [...referralEmails];
    newEmails[index] = value;
    setReferralEmails(newEmails);
  };

  const addReferralField = () => {
    setReferralEmails([...referralEmails, ""]);
  };

  const removeReferralField = (index: number) => {
    const newEmails = referralEmails.filter((_, i) => i !== index);
    setReferralEmails(newEmails.length ? newEmails : [""]);
  };

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

      // Process referrals if any valid emails exist
      const validEmails = referralEmails
        .map(e => e.trim())
        .filter(e => e && e.includes('@')); // Basic validation
      
      if (validEmails.length > 0 && user?.id) {
          try {
             await store.referOrgContact(newOrg.id, validEmails, user.id);
             console.log("Referrals initiated for", newOrg.id);
          } catch (referralError) {
             console.error("Failed to submit referrals:", referralError);
             // We don't block the org creation success, just log the error
          }
      }
        
      // ACTUALLY: I'll defer the referral call to a separate helper or assume `store` can handle it if I pass the ID.
      // Let's update the component to accept `currentUserId` as a prop.
      // Wait, `OrgCreationDialog` is used in `AdminEventsPage` or similar.
      // I'll assume the parent passes it.
      
      // Re-reading code... I don't see `currentUserId` in props.
      // I will add it to the interface.
      
      onCreated(newOrg);
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // ... (render part)


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
              {/* Box 3: Referrals */}
            <div className="col-span-2 border-t pt-4 mt-2">
                <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                        <Label className="text-base font-semibold text-primary flex items-center gap-2">
                             <span className="bg-primary/10 text-primary p-1 rounded-md">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-users-round"><path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a9 9 0 0 0-2.2-2.2"/></svg>
                             </span>
                             Known Contacts?
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            Help us get this organization claimed! If you know who manages <strong>{formData.name || "this organization"}</strong>, add their email below. We'll send them an invite to claim it.
                        </p>
                    </div>
                    
                    <div className="space-y-2">
                        {referralEmails.map((email, index) => (
                            <div key={index} className="flex gap-2">
                                <Input
                                    value={email}
                                    onChange={(e) => handleReferralChange(index, e.target.value)}
                                    placeholder="contact@school.edu"
                                    className="text-sm"
                                    type="email"
                                />
                                {referralEmails.length > 1 && (
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => removeReferralField(index)}
                                        className="h-10 w-10 text-muted-foreground hover:text-destructive"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                    
                    <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={addReferralField}
                        className="text-xs h-8 border-dashed"
                    >
                        + Add Another Contact
                    </Button>
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
