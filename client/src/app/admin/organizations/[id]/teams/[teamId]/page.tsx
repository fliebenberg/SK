"use client";

import { store } from "@/app/store/store";
import { TeamDetailsForm } from "@/components/admin/TeamDetailsForm";
import { Organization, Team } from "@sk/types";
import { useParams } from "next/navigation";
import { MetalButton } from "@/components/ui/MetalButton";
import { useTeam } from "@/hooks/useEntity";
import { useOrganization } from "@/hooks/useOrganization";

export default function TeamDetailsPage() {
  const params = useParams();
  const id = params.id as string;
  const teamId = params.teamId as string;
  
  const { team, isLoading: teamLoading } = useTeam(teamId);
  const { org, isLoading: orgLoading } = useOrganization(id);

  const loading = teamLoading || orgLoading;

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
