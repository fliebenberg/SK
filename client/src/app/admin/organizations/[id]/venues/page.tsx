"use client";

import { MetalButton } from "@/components/ui/MetalButton";
import { Plus, MapPin } from "lucide-react";
import { useParams } from "next/navigation";
import { store } from "@/app/store/store";
import { useState, useEffect } from "react";
import { Organization } from "@sk/types";

export default function VenueManagementPage() {
  const params = useParams();
  const id = params.id as string;
  const [org, setOrg] = useState<Organization | undefined>(undefined);

  useEffect(() => {
    setOrg(store.getOrganization(id));
    const unsubscribe = store.subscribe(() => setOrg(store.getOrganization(id)));
    return () => unsubscribe();
  }, [id]);

  if (!org) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row items-center justify-between gap-6 text-center xl:text-left">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-orbitron)' }}>Venue Management</h1>
          <p className="text-muted-foreground">Manage fields, courts, and facilities.</p>
        </div>
        <div className="flex flex-row items-center gap-4">
            <MetalButton 
                variantType="filled" 
                glowColor="hsl(var(--primary))"
                size="sm"
                className="text-primary-foreground whitespace-nowrap"
                icon={<Plus className="h-4 w-4" />}
            >
                Add Venue
            </MetalButton>
        </div>
      </div>

      <div className="grid gap-6">
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-border/50 rounded-xl bg-card/30 text-muted-foreground">
              <MapPin className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-lg font-medium">No venues yet</p>
              <p className="max-w-xs text-center text-sm opacity-60 mt-1">
                  Start by adding your first field or facility to the organization.
              </p>
          </div>
      </div>
    </div>
  );
}
