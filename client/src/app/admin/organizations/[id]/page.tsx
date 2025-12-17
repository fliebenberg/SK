import { MetalButton } from "@/components/ui/MetalButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { store } from "@/lib/store";
import { Users, Trophy, MapPin, Calendar } from "lucide-react";
import Link from "next/link";
import { OrgDetailsHeader } from "@/components/admin/OrgDetailsHeader";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrganizationDetailsPage({ params }: PageProps) {
  const { id } = await params;
  // In a real app, fetch org by ID. Here we mock it or get from store if it matches.
  const org = store.getOrganization(id); 
  
  if (org.id !== id) {
      // Handle not found or mismatch in this mock scenario
      // For now, just show the mock org regardless of ID for demo purposes
  }

  const managementSections = [
    {
      title: "People",
      description: "Manage staff, coaches, and members.",
      icon: Users,
      href: `/admin/organizations/${id}/people`,
      count: "--", // Placeholder
    },
    {
      title: "Teams",
      description: "Manage teams and squads.",
      icon: Trophy,
      href: `/admin/organizations/${id}/teams`,
      count: ((org.supportedSportIds || []).length === 1 
        ? store.getTeams(id).filter(t => t.sportId === (org.supportedSportIds || [])[0])
        : store.getTeams(id)).filter(t => (t.isActive ?? true)).length,
    },
    {
      title: "Venues",
      description: "Manage fields, courts, and facilities.",
      icon: MapPin,
      href: `/admin/organizations/${id}/venues`,
      count: store.getVenues(id).length,
    },
    {
      title: "Events",
      description: "Schedule games and tournaments.",
      icon: Calendar,
      href: `/admin/organizations/${id}/events`,
      count: store.getGames().length, // Games filtering logic TBD
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
