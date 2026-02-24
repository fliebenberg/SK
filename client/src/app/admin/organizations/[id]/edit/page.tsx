"use client";

import { OrgDetailsHeader } from "@/components/admin/OrgDetailsHeader";
import { store } from "@/app/store/store";
import { notFound, useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Organization } from "@sk/types";
import { PageHeader } from "@/components/ui/PageHeader";

export default function OrganizationEditPage() {
  const params = useParams();
  const id = params.id as string;
  const [org, setOrg] = useState<Organization | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const update = () => {
        const o = store.getOrganization(id);
        if (o) {
            setOrg(o);
            setLoading(false);
        }
    };
    update(); // Initial check
    const unsubscribe = store.subscribe(update);
    return () => unsubscribe();
  }, [id]);

  if (loading) return <div>Loading...</div>;
  if (!org) {
    return <div>Organization not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization Settings"
        description="Manage your organization's details, branding, and preferences."
      />
      
      <OrgDetailsHeader organization={org} />
    </div>
  );
}
