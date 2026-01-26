"use client";

import { MetalButton } from "@/components/ui/MetalButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { store } from "@/app/store/store";
// import { addTeamAction } from "@/app/actions";
import { useRouter, useParams } from "next/navigation";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function NewTeamPage() {
  const params = useParams();
  const organizationId = params?.id as string;
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    sportId: "",
    ageGroup: "",
  });

  const org = store.getOrganization(organizationId);
  const availableSports = (org?.supportedSportIds || []).map(id => store.getSport(id)).filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
        // Optimistic update via Client Store
        const newTeam = await store.addTeam({
            name: formData.name,
            sportId: formData.sportId,
            ageGroup: formData.ageGroup,
            organizationId: organizationId,
        });

        if (newTeam) {
            console.log("Team created (client):", newTeam.id, "for Org:", organizationId);
            const path = `/admin/organizations/${organizationId}/teams/${newTeam.id}`;
            console.log("Redirecting to:", path);
            router.push(path);
        }
    } catch (error) {
        console.error("Failed to create team", error);
    } finally {
        setLoading(false);
    }
  };

  const handleCancel = () => {
    router.push(`/admin/organizations/${organizationId}/teams`);
  };

  return (
    <div className="max-w-2xl">
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Add New Team</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Team Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-background/50"
                placeholder="e.g. First XI"
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sport">Sport</Label>
                <Select
                  value={formData.sportId}
                  onValueChange={(value) => setFormData({ ...formData, sportId: value })}
                  required
                >
                  <SelectTrigger id="sport" className="bg-background/50">
                    <SelectValue placeholder="Select sport" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSports.map((sport) => (
                      <SelectItem key={sport!.id} value={sport!.id}>
                        {sport!.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="ageGroup">Age Group</Label>
                <Input
                  id="ageGroup"
                  value={formData.ageGroup}
                  onChange={(e) => setFormData({ ...formData, ageGroup: e.target.value })}
                  className="bg-background/50"
                  placeholder="e.g. U19"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4">
                <MetalButton
                    type="button"
                    variantType="outlined"
                    onClick={handleCancel}
                    className="text-muted-foreground hover:text-foreground"
                    disabled={loading}
                >
                    Cancel
                </MetalButton>
                <MetalButton
                    type="submit"
                    variantType="filled"
                    glowColor="hsl(var(--primary))"
                    className="text-primary-foreground"
                    disabled={loading || !formData.sportId || !formData.name || !formData.ageGroup}
                >
                    {loading ? "Creating..." : "Create Team"}
                </MetalButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
