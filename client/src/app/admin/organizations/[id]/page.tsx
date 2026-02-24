

"use client";
import { cn } from "@/lib/utils";

import { MetalButton } from "@/components/ui/MetalButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { store } from "@/app/store/store";
import { Users, Trophy, MapPin, Calendar } from "lucide-react";
import Link from "next/link";
import { OrgDetailsHeader } from "@/components/admin/OrgDetailsHeader";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Organization } from "@sk/types";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminNavigation } from "@/hooks/useAdminNavigation";
import { toast } from "@/hooks/use-toast";
import { ShieldCheck, AlertTriangle, Trash2, Power, PowerOff, Flag } from "lucide-react";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { ReportDialog } from "@/components/ui/ReportDialog";
import { Button } from "@/components/ui/button";

export default function OrganizationDetailsPage() {
  const params = useParams();
  const id = params.id as string;
  
  const [org, setOrg] = useState<Organization | undefined>(undefined);
  const [counts, setCounts] = useState({ teams: 0, venues: 0, events: 0, people: 0 });
  const { user, isAuthenticated } = useAuth();
  const { hasOwnedOrg } = useAdminNavigation();
  const [isClaiming, setIsClaiming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false });
  const [confirmDeactivate, setConfirmDeactivate] = useState({ isOpen: false });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const router = useRouter();

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

  const handleDeactivate = async () => {
    if (!org) return;
    setIsProcessing(true);
    try {
        await store.updateOrganization(org.id, { isActive: !org.isActive });
        toast({
            title: org.isActive ? "Organization Deactivated" : "Organization Activated",
            description: `${org.name} has been ${org.isActive ? "deactivated" : "activated"}.`,
            variant: "success"
        });
        setConfirmDeactivate({ isOpen: false });
    } catch (e: any) {
        toast({
            title: "Action Failed",
            description: e.message || "Something went wrong.",
            variant: "destructive"
        });
    } finally {
        setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!org) return;
    setIsProcessing(true);
    try {
        await store.deleteOrganization(org.id);
        toast({
            title: "Organization Deleted",
            description: `${org.name} has been permanently removed.`,
            variant: "success"
        });
        router.push("/admin/organizations");
    } catch (e: any) {
        toast({
            title: "Deletion Failed",
            description: e.message || "Ensure no linked teams, events, or venues exist.",
            variant: "destructive"
        });
    } finally {
        setIsProcessing(false);
    }
  };

  const canDelete = counts.teams === 0 && counts.venues === 0 && counts.events === 0 && counts.people === 0;
  const isAppAdmin = user?.globalRole === 'admin';

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
    <div className="space-y-8">
      <PageHeader
        title="Organization Dashboard"
        description="Overview and management of your organization's resources."
      >
        <div className="flex items-center justify-center gap-2 w-full xl:w-auto">
          <Link href={`/admin/organizations/${id}/edit`}>
            <MetalButton 
              variantType="outlined" 
              size="sm"
              glowColor="hsl(var(--primary))"
              icon={<ShieldCheck className="w-4 h-4" />}
            >
              Settings
            </MetalButton>
          </Link>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-muted-foreground hover:text-destructive transition-colors shrink-0 h-9 w-9 rounded-full border border-border/50 bg-muted/20"
            onClick={() => setIsReportDialogOpen(true)}
            title="Report Organization"
          >
            <Flag className="w-4 h-4" />
          </Button>
        </div>
      </PageHeader>

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

      {isAppAdmin && (
        <section className="space-y-6 border-t border-destructive/10 pt-12 mt-12">
            <h2 className="text-xl font-black uppercase tracking-tight text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Danger Zone
            </h2>
            <div className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-1">
                        <h3 className="font-bold text-lg">{org.isActive ? "Deactivate Organization" : "Activate Organization"}</h3>
                        <p className="text-sm text-muted-foreground italic">
                            {org.isActive 
                                ? "Marks the organization as inactive. It will become read-only but retain its history." 
                                : "Enables all features and editing for this organization."}
                        </p>
                    </div>
                    <MetalButton 
                        variantType="outlined" 
                        className={cn(
                            "border-destructive/50 text-destructive hover:bg-destructive/10",
                            !org.isActive && "border-primary/50 text-primary hover:bg-primary/10"
                        )} 
                        glowColor={org.isActive ? "hsl(38, 92%, 50%)" : "hsl(var(--primary))"}
                        onClick={() => setConfirmDeactivate({ isOpen: true })}
                        disabled={isProcessing}
                        icon={org.isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                    >
                        {org.isActive ? "Deactivate Organization" : "Activate Organization"}
                    </MetalButton>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-1">
                        <h3 className="font-bold text-lg">Delete Organization</h3>
                        <p className="text-sm text-muted-foreground italic">Permanently removes this organization and all associated data. This action cannot be undone.</p>
                    </div>
                    <MetalButton 
                        variantType="outlined" 
                        className="border-destructive/50 text-destructive hover:bg-destructive/10" 
                        glowColor="hsl(var(--destructive))" 
                        onClick={() => setConfirmDelete({ isOpen: true })} 
                        disabled={!canDelete || isProcessing}
                        icon={<Trash2 className="w-4 h-4" />}
                    >
                        Delete Organization
                    </MetalButton>
                </div>
                {!canDelete && (
                    <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest text-center animate-in fade-in slide-in-from-top-1">
                        Cannot delete organization because it still has linked entities ({counts.teams} teams, {counts.venues} venues, {counts.events} events, {counts.people} people).
                    </p>
                )}
            </div>

            <ConfirmationModal
                isOpen={confirmDeactivate.isOpen}
                onOpenChange={(open) => setConfirmDeactivate({ isOpen: open })}
                onConfirm={handleDeactivate}
                title={org.isActive ? "Deactivate Organization?" : "Activate Organization?"}
                description={org.isActive 
                    ? `Are you sure you want to deactivate ${org.name}? This will make the organization read-only.`
                    : `Are you sure you want to activate ${org.name}? This will enable all functions for the organization.`
                }
                confirmText={org.isActive ? "Deactivate" : "Activate"}
                variant={org.isActive ? "destructive" : "default"}
            />

            <ConfirmationModal
                isOpen={confirmDelete.isOpen}
                onOpenChange={(open) => setConfirmDelete({ isOpen: open })}
                onConfirm={handleDelete}
                title="Delete Organization?"
                description={`This action is permanent and cannot be undone. All data associated with ${org.name} will be lost.`}
                confirmText="Delete Permanently"
                variant="destructive"
            />
        </section>
      )}

      {org && (
        <ReportDialog 
            isOpen={isReportDialogOpen}
            onClose={() => setIsReportDialogOpen(false)}
            entityType="organization"
            entityId={org.id}
            entityName={org.name}
        />
      )}
    </div>
  );
}
