"use client";

import { OrgDetailsHeader } from "@/components/admin/OrgDetailsHeader";
import { store } from "@/app/store/store";
import { notFound, useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Organization } from "@sk/types";

export default function OrganizationEditPage() {
  const params = useParams();
  const id = params.id as string;
  const [org, setOrg] = useState<Organization | undefined>(() => store.getOrganization(id));
  const [loading, setLoading] = useState(!store.getOrganization(id));

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
      <div className="border-b pb-4 flex flex-col xl:flex-row items-center justify-between gap-6 text-center xl:text-left">
        <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-orbitron)' }}>Organization Settings</h1>
            <p className="text-muted-foreground mt-2">
            Manage your organization&apos;s details, branding, and preferences.
            </p>
        </div>
      </div>
      
      <OrgDetailsHeader organization={org} />
    </div>
  );
}
