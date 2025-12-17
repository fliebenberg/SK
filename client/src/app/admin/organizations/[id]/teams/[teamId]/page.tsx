"use client";

import { store } from "@/lib/store";
import { TeamDetailsForm } from "@/components/admin/TeamDetailsForm";
import { Organization, Team } from "@sk/types";
import { useParams } from "next/navigation";
import { MetalButton } from "@/components/ui/MetalButton";
import { useState, useEffect } from "react";

export default function TeamDetailsPage() {
  const params = useParams();
  const id = params.id as string;
  const teamId = params.teamId as string;
  
  const [team, setTeam] = useState<Team | undefined>(() => store.getTeam(teamId));
  const [org, setOrg] = useState<Organization | undefined>(() => store.getOrganization(id));
  const [loading, setLoading] = useState(!store.getTeam(teamId));

  useEffect(() => {
    const updateData = () => {
        const t = store.getTeam(teamId);
        const o = store.getOrganization(id);
        const loaded = store.isLoaded();
        
        if (t) setTeam(t);
        if (o) setOrg(o);
        
        if (t && o) {
            setLoading(false);
        } else if (loaded) {
            // Store is loaded but we missing data?
            // If strictly missing, stop loading so we show error
            setLoading(false); 
        }
    };

    updateData();
    const unsubscribe = store.subscribe(updateData);
    return () => unsubscribe();
  }, [id, teamId]);

  if (loading) {
     return <div className="p-8">Loading team details...</div>;
  }

  if (!team || !org) {
      return (
          <div className="p-8 space-y-4">
              <h1 className="text-xl font-bold text-destructive">Team Not Found</h1>
              <p>The requested team could not be found.</p>
              <MetalButton onClick={() => window.location.reload()} variantType="outlined">
                  Retry
              </MetalButton>
          </div>
      );
  }

  return (
    <TeamDetailsForm initialTeam={team} organization={org} />
  );
}
