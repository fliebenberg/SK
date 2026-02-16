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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { store } from "@/app/store/store";
import { Team, Sport, Organization } from "@sk/types";
import { Loader2 } from "lucide-react";
import { MetalButton } from "@/components/ui/MetalButton";

interface TeamCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  initialName?: string;
  initialSportId?: string;
  initialAgeGroup?: string;
  onCreated: (team: Team) => void;
}

export function TeamCreationDialog({
  open,
  onOpenChange,
  organizationId,
  initialName = "",
  initialSportId = "",
  initialAgeGroup = "Open",
  onCreated,
}: TeamCreationDialogProps) {
  const [loading, setLoading] = useState(false);
  const [sports, setSports] = useState<Sport[]>([]);
  const [formData, setFormData] = useState({
    name: initialName,
    sportId: initialSportId,
    ageGroup: initialAgeGroup,
  });
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);

  useEffect(() => {
    const update = () => {
        setSports(store.getSports());
        const org = store.getOrganization(organizationId);
        if (org) setCurrentOrg(org);
        else if (organizationId) store.fetchOrganization(organizationId);
    };
    update();
    const unsub = store.subscribe(update);
    return unsub;
  }, [organizationId]);

  useEffect(() => {
    if (open) {
      setFormData({
        name: initialName,
        sportId: initialSportId || (sports[0]?.id || ""),
        ageGroup: initialAgeGroup,
      });
    }
  }, [open, initialName, initialSportId, initialAgeGroup, sports]);

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.sportId || !organizationId) return;

    setLoading(true);
    try {
      const newTeam = await store.addTeam({
        name: formData.name,
        organizationId,
        sportId: formData.sportId,
        ageGroup: formData.ageGroup,
      });
      onCreated(newTeam);
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Team</DialogTitle>
          <DialogDescription>
            Register a new team for this organization.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="team-name">Team Name</Label>
            <Input
              id="team-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. 1st Team"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="team-sport">Sport</Label>
              <Select
                value={formData.sportId}
                onValueChange={(val) => setFormData({ ...formData, sportId: val })}
              >
                <SelectTrigger id="team-sport">
                  <SelectValue placeholder="Select sport" />
                </SelectTrigger>
                <SelectContent>
                  {(currentOrg?.supportedSportIds?.length ? sports.filter(s => currentOrg.supportedSportIds.includes(s.id)) : sports).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="team-age">Age Group</Label>
              <Input
                id="team-age"
                value={formData.ageGroup}
                onChange={(e) => setFormData({ ...formData, ageGroup: e.target.value })}
                placeholder="e.g. Open"
              />
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
            disabled={loading || !formData.name.trim() || !formData.sportId}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Team
          </MetalButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
