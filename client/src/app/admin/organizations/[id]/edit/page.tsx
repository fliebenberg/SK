"use client";

import { OrgDetailsHeader } from "@/components/admin/OrgDetailsHeader";
import { store } from "@/app/store/store";
import { notFound, useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Organization } from "@sk/types";
import { PageHeader } from "@/components/ui/PageHeader";

import { useOrganization } from "@/hooks/useOrganization";

export default function OrganizationEditPage() {
  const params = useParams();
  const id = params.id as string;
  const { org, isLoading: loading } = useOrganization(id, { subscribeData: true });

  if (loading && !org) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="mt-4 text-muted-foreground font-orbitron">Loading settings...</p>
      </div>
    );
  }

  if (!org) return null;

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
