"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MetalButton } from "@/components/ui/MetalButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { store } from "@/lib/store";
import { Plus, ArrowRight, Building2 } from "lucide-react";
import { Organization } from "@/types";
import { getOrganizationsAction } from "@/app/actions";

export default function OrganizationsPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        const orgs = await getOrganizationsAction();
        setOrganizations(orgs);
        setLoading(false);
      } catch (error) {
        console.error("Failed to fetch organizations:", error);
        setLoading(false);
      }
    };

    fetchOrgs();
  }, [router]);

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col md:flex-row items-center md:justify-between gap-4 mb-8 text-center md:text-left">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-orbitron)' }}>Your Organizations</h1>
          <p className="text-muted-foreground">
            Select an organization to manage or create a new one.
          </p>
        </div>
        <Link href="/admin/organizations/new">
          <MetalButton 
            variantType="filled" 
            size="sm"
            glowColor="hsl(var(--primary))"
            className="text-primary-foreground"
          >
            <div className="flex items-center gap-2 whitespace-nowrap">
              <Plus className="h-4 w-4" />
              <span>Create Organization</span>
            </div>
          </MetalButton>
        </Link>
      </div>

      {organizations.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center space-y-4 min-h-[400px] border-2 border-dashed rounded-lg">
          <div className="p-4 bg-muted rounded-full">
            <Building2 className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">No Organizations Found</h2>
          <p className="text-muted-foreground max-w-sm text-center">
            You don't have any organizations yet. Create one to get started with managing your teams and events.
          </p>
          <Link href="/admin/organizations/new">
            <MetalButton 
              variantType="filled" 
              size="sm"
              glowColor="hsl(var(--primary))"
              className="text-primary-foreground"
            >
              <div className="flex items-center gap-2 whitespace-nowrap">
                <Plus className="h-4 w-4" />
                <span>Create Organization</span>
              </div>
            </MetalButton>
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {organizations.map((org) => (
            <Card 
              key={org.id} 
              className="hover:shadow-md transition-shadow cursor-pointer relative overflow-hidden flex flex-col" 
              onClick={() => router.push(`/admin/organizations/${org.id}`)}
              style={{
                backgroundColor: org.primaryColor || 'hsl(var(--card))',
                borderColor: org.secondaryColor || 'hsl(var(--border))',
                borderWidth: '5px',
              }}
            >
              {/* Semi-transparent overlay for text readability */}
              <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]" />
              
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-3 px-4 relative z-10">
                <CardTitle className="text-xl font-bold text-white drop-shadow-md">{org.name}</CardTitle>
                <Building2 className="h-5 w-5 text-white/80" />
              </CardHeader>
              <CardContent className="relative z-10 px-4 pb-4 flex flex-col flex-1">
                <div className="flex-1">
                  <div className="text-sm text-white/90 drop-shadow">
                    Sports: {org.supportedSportIds?.map(id => store.getSport(id)?.name).filter(Boolean).join(", ")}
                  </div>
                </div>
                <Link href={`/admin/organizations/${org.id}`} className="mt-4 block">
                  <MetalButton 
                    variantType="outlined" 
                    size="sm"
                    glowColor="hsl(var(--primary))"
                    className="w-full"
                  >
                    <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                      <span>Manage</span>
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </MetalButton>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
