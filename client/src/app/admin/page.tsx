"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Organization } from "@/types";
import { getOrganizationsAction } from "@/app/actions";

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        const orgs = await getOrganizationsAction();
        
        if (orgs.length === 1) {
          // If only one organization, redirect directly to its detail page
          router.push(`/admin/organizations/${orgs[0].id}`);
        } else {
          // Otherwise, redirect to organizations list
          router.push('/admin/organizations');
        }
      } catch (error) {
        console.error("Failed to fetch organizations:", error);
        // On error, default to organizations list
        router.push('/admin/organizations');
      }
    };

    fetchOrgs();
  }, [router]);

  return <div className="p-8">Loading...</div>;
}
