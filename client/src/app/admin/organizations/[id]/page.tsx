

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

export default function OrganizationDetailsPage() {
  const params = useParams();
  const id = params.id as string;
  
  const [org, setOrg] = useState<Organization | undefined>(undefined);
  const [counts, setCounts] = useState({ teams: 0, venues: 0, events: 0, people: 0 });

  useEffect(() => {
    const updateData = () => {
        const organization = store.getOrganization(id);
        const teams = store.getTeams(id);
        const venues = store.getVenues(id);
        const members = store.getOrganizationMembers(id);
        const eventCount = store.getEvents(id).length;

        if (organization) {
            setOrg(organization);
            setCounts({
                teams: teams.length,
                venues: venues.length,
                events: eventCount,
                people: members.length
            });
        }
    };

    updateData();
    store.subscribeToOrganization(id);
    const unsubscribe = store.subscribe(updateData);
    
    return () => {
        unsubscribe();
        store.unsubscribeFromOrganization(id);
    };
  }, [id]);

  if (!org) return <div>Loading...</div>;

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
