"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { SiteDetailsHeader } from "@/components/admin/sites/SiteDetailsHeader";
import { useOrganization } from "@/hooks/useOrganization";

export default function SiteCreatePage() {
  const params = useParams();
  const id = params.id as string;
  const { org, isLoading } = useOrganization(id, { subscribeData: true });

  if (isLoading && !org) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="mt-4 text-muted-foreground font-orbitron">Loading organization...</p>
      </div>
    );
  }

  if (!org) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create New Site"
        description={`Add a new facility or field to ${org.name}.`}
      />
      
      <SiteDetailsHeader orgId={id} isCreating={true} />
    </div>
  );
}
