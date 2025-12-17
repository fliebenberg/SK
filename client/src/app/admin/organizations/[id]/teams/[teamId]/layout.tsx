import { store } from "@/lib/store";
import { MetalButton } from "@/components/ui/MetalButton";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";
import { AdminTabs } from "@/components/admin/AdminTabs";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string; teamId: string }>;
}

export default async function TeamLayout({ children, params }: LayoutProps) {
  const { id, teamId } = await params;
  const team = store.getTeam(teamId);

  if (!team) {
    notFound();
  }

  const tabs = [
    { name: "Details", href: `/admin/organizations/${id}/teams/${teamId}`, exact: true },
    { name: "Players", href: `/admin/organizations/${id}/teams/${teamId}/players` },
    { name: "Staff", href: `/admin/organizations/${id}/teams/${teamId}/staff` },
    { name: "Stats", href: `/admin/organizations/${id}/teams/${teamId}/stats` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/admin/organizations/${id}/teams`}>
          <MetalButton variantType="outlined" size="icon" className="h-10 w-10 rounded-full" glowColor="hsl(var(--foreground))">
            <ChevronLeft className="h-5 w-5" />
          </MetalButton>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-orbitron)' }}>
            {team.name}
          </h1>
          <p className="text-muted-foreground">
            {store.getSport(team.sportId)?.name} • {team.ageGroup}
          </p>
        </div>
      </div>

      <div className="border-b border-border/50">
        <AdminTabs tabs={tabs} />
      </div>

      <div className="min-h-[400px]">
        {children}
      </div>
    </div>
  );
}
