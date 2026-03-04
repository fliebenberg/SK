"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { SiteDetailsHeader } from "@/components/admin/sites/SiteDetailsHeader";
import { useOrganization } from "@/hooks/useOrganization";
import { store } from "@/app/store/store";
import { useState, useEffect } from "react";
import { Site } from "@sk/types";

export default function SiteEditPage() {
  const params = useParams();
  const id = params.id as string;
  const siteId = params.siteId as string;
  
  const { org, isLoading } = useOrganization(id, { subscribeData: true });
  const [site, setSite] = useState<Site | undefined>(undefined);

  useEffect(() => {
    const updateSite = () => {
        setSite(store.getSite(siteId));
    };

    updateSite();
    const unsubscribe = store.subscribe(updateSite);
    
    return () => {
        unsubscribe();
    };
  }, [siteId]);

  if (isLoading || !site) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="mt-4 text-muted-foreground font-orbitron">Loading site details...</p>
      </div>
    );
  }

  if (!org) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Site"
        description={`Modify details or manage facilities for ${site.name}.`}
      />
      
      <SiteDetailsHeader site={site} orgId={id} />
    </div>
  );
}
