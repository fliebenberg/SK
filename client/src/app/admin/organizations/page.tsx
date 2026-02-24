"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MetalButton } from "@/components/ui/MetalButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { store } from "@/app/store/store";
import { Plus, ArrowRight, Building2 } from "lucide-react";
import { Organization } from "@sk/types";
import { PageHeader } from "@/components/ui/PageHeader";


import { OrgLogo } from "@/components/ui/OrgLogo";
import { Users, Calendar, Trophy } from "lucide-react";

export default function OrganizationsPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>(() => store.getOrganizations());
  const [loading, setLoading] = useState(!store.isLoaded());

  useEffect(() => {
    const update = () => {
        const loaded = store.isLoaded();
        setOrganizations([...store.getOrganizations()]);
        if (loaded) setLoading(false);
    };

    update();
    store.fetchOrganizations();
    const unsubscribe = store.subscribe(update);
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            <p className="text-muted-foreground">
                Connecting to server...
            </p>
            {!store.isConnected() && (
                 <p className="text-xs text-red-500 bg-red-50 px-3 py-1 rounded">
                    Ensure server is running on port 3001
                 </p>
            )}
        </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {organizations.length > 0 && (
        <PageHeader
          title="Your Organizations"
          description="Select an organization to manage or create a new one."
          className="mb-8"
        >
          <Link href="/admin/organizations/new">
            <MetalButton 
              variantType="filled" 
              size="sm"
              glowColor="hsl(var(--primary))"
              className="text-primary-foreground"
              icon={<Plus className="h-4 w-4" />}
            >
              Create Organization
            </MetalButton>
          </Link>
        </PageHeader>
      )}

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
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
          {organizations.map((org) => (
            <Card 
              key={org.id} 
              className="group hover:shadow-xl transition-all duration-300 cursor-pointer border-t-4 flex flex-col relative overflow-hidden bg-card/50 backdrop-blur-sm" 
              onClick={() => router.push(`/admin/organizations/${org.id}`)}
              style={{
                borderTopColor: org.primaryColor || 'hsl(var(--primary))',
              }}
            >
              <CardHeader className="flex flex-row items-start gap-4 space-y-0 pb-4 pt-6 px-6">
                <OrgLogo 
                  organization={org} 
                  size="lg" 
                  className="ring-2 ring-background shadow-lg transition-transform group-hover:scale-105"
                />
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-xl font-black truncate group-hover:text-primary transition-colors">
                    {org.name}
                  </CardTitle>
                  <p className="text-sm font-mono text-muted-foreground flex items-center gap-1 opacity-70">
                    {org.shortName || org.id.slice(0, 8).toUpperCase()}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {org.supportedSportIds?.slice(0, 3).map(id => (
                      <span key={id} className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                        {store.getSport(id)?.name}
                      </span>
                    ))}
                    {org.supportedSportIds && org.supportedSportIds.length > 3 && (
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                        +{org.supportedSportIds.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-6 pb-8 flex flex-col flex-1">
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col items-center p-2 rounded-lg bg-muted/30 border border-border/5">
                    <Users className="h-4 w-4 text-muted-foreground mb-1" />
                    <span className="text-sm font-bold">{org.memberCount || 0}</span>
                    <span className="text-[10px] text-muted-foreground uppercase">Members</span>
                  </div>
                  <div className="flex flex-col items-center p-2 rounded-lg bg-muted/30 border border-border/5">
                    <Trophy className="h-4 w-4 text-muted-foreground mb-1" />
                    <span className="text-sm font-bold">{org.teamCount || 0}</span>
                    <span className="text-[10px] text-muted-foreground uppercase">Teams</span>
                  </div>
                  <div className="flex flex-col items-center p-2 rounded-lg bg-muted/30 border border-border/5">
                    <Calendar className="h-4 w-4 text-muted-foreground mb-1" />
                    <span className="text-sm font-bold">{org.eventCount || 0}</span>
                    <span className="text-[10px] text-muted-foreground uppercase">Events</span>
                  </div>
                </div>
              </CardContent>
              
              {/* Subtle background glow based on primary color */}
              <div 
                className="absolute -right-20 -bottom-20 w-40 h-40 rounded-full blur-[100px] opacity-[0.03] group-hover:opacity-[0.08] transition-opacity pointer-events-none"
                style={{ backgroundColor: org.primaryColor || 'hsl(var(--primary))' }}
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
