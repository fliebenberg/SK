

"use client";

import { MetalButton } from "@/components/ui/MetalButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { store } from "@/app/store/store";
import { Users, Trophy, MapPin, Calendar } from "lucide-react";
import Link from "next/link";
import { OrgDetailsHeader } from "@/components/admin/OrgDetailsHeader";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Organization } from "@sk/types";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminNavigation } from "@/hooks/useAdminNavigation";
import { toast } from "@/hooks/use-toast";
import { ShieldCheck } from "lucide-react";

export default function OrganizationDetailsPage() {
  const params = useParams();
  const id = params.id as string;
  
  const [org, setOrg] = useState<Organization | undefined>(undefined);
  const [counts, setCounts] = useState({ teams: 0, venues: 0, events: 0, people: 0 });
  const { user, isAuthenticated } = useAuth();
  const { hasOwnedOrg } = useAdminNavigation();
  const [isClaiming, setIsClaiming] = useState(false);

  useEffect(() => {
    const updateData = () => {
        const organization = store.getOrganization(id);

        if (organization) {
            setOrg(organization);
            setCounts({
                teams: organization.teamCount || 0,
                venues: organization.venueCount || 0,
                events: organization.eventCount || 0,
                people: organization.memberCount || 0
            });
        }
    };

    updateData();
    // Use lightweight summary subscription for dashboard efficiency
    store.subscribeToOrganizationSummary(id);
    
    const unsubscribe = store.subscribe(updateData);
    
    return () => {
        unsubscribe();
        store.unsubscribeFromOrganizationSummary(id);
    };
  }, [id]);

  if (!org) return <div>Loading...</div>;

  const handleClaim = async () => {
    if (!user) return;
    setIsClaiming(true);
    try {
        await store.claimOrganization(id, user.id);
        toast({
            title: "Success",
            description: `You have successfully claimed ${org.name}!`,
            variant: "success"
        });
    } catch (e: any) {
        toast({
            title: "Claim Failed",
            description: e.message || "Something went wrong.",
            variant: "destructive"
        });
    } finally {
        setIsClaiming(false);
    }
  };

  const managementSections = [
    {
      title: "People",
      description: "Manage staff, coaches, and members.",
      icon: Users,
      href: `/admin/organizations/${id}/people`,
      count: counts.people,
    },
    {
      title: "Teams",
      description: "Manage teams and squads.",
      icon: Trophy,
      href: `/admin/organizations/${id}/teams`,
      count: counts.teams,
    },
    {
      title: "Venues",
      description: "Manage fields, courts, and facilities.",
      icon: MapPin,
      href: `/admin/organizations/${id}/venues`,
      count: counts.venues,
    },
    {
      title: "Events",
      description: "Schedule games and tournaments.",
      icon: Calendar,
      href: `/admin/organizations/${id}/events`,
      count: counts.events,
    },
  ];

  return (
    <div className="space-y-6">
      <OrgDetailsHeader organization={org} readOnly={true} />

      {!org.isClaimed && (
        <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900">
            <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    <ShieldCheck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                    <CardTitle className="text-blue-900 dark:text-blue-100">Claim This Organization</CardTitle>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                        This organization is currently a community placeholder. Claim it to become the administrator and manage its teams, venues, and events.
                    </p>
                </div>
                <div className="flex flex-col gap-2">
                    {isAuthenticated ? (
                        (hasOwnedOrg && user?.globalRole !== 'admin') ? (
                            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium italic">
                                You already own an organization.
                            </p>
                        ) : (
                            <MetalButton 
                                onClick={handleClaim} 
                                disabled={isClaiming}
                                variantType="filled"
                                glowColor="hsl(var(--primary))"
                            >
                                {isClaiming ? "Claiming..." : "Claim Now"}
                            </MetalButton>
                        )
                    ) : (
                        <Link href={`/login?callbackUrl=/admin/organizations/${id}`}>
                            <MetalButton variantType="filled" glowColor="hsl(var(--primary))">
                                Log in to Claim
                            </MetalButton>
                        </Link>
                    )}
                </div>
            </CardHeader>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {managementSections.map((section) => (
          <Card key={section.title} className="hover:border-primary/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xl font-medium">
                {section.title}
              </CardTitle>
              <section.icon className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {section.description}
                </p>
                <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold">{section.count}</div>
                    <Link href={section.href}>
                        <MetalButton 
                            variantType="outlined" 
                            size="sm" 
                            glowColor="hsl(var(--primary))"
                        >
                            Manage
                        </MetalButton>
                    </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
