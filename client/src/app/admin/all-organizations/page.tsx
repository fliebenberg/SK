"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MetalButton } from "@/components/ui/MetalButton";
import { Card, CardContent } from "@/components/ui/card";
import { store } from "@/app/store/store";
import { Search, Filter, ArrowRight, Building2, CheckCircle, HelpCircle } from "lucide-react";
import { Organization } from "@sk/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { OrgLogo } from "@/components/ui/OrgLogo";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function AllOrganizationsPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUnclaimedOnly, setShowUnclaimedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  useEffect(() => {
    const update = () => {
        setOrganizations([...store.organizations]);
        setTotal(store.totalOrganizations);
        setLoading(false);
    };

    update();
    const unsubscribe = store.subscribe(update);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setLoading(true);
    store.fetchOrganizations(page, limit, searchQuery, showUnclaimedOnly ? false : undefined);
  }, [page, searchQuery, showUnclaimedOnly]);

  if (loading && organizations.length === 0) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            <p className="text-muted-foreground">Loading organizations...</p>
        </div>
    );
  }

  const TotalPages = Math.ceil(total / limit);

  return (
    <div className="h-full flex flex-col gap-6">
      <PageHeader
        title="All Organizations"
        description="Search and manage all organizations in the system. Use the filters to find unclaimed ones."
      />

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card/30 p-4 rounded-xl border border-border/50 backdrop-blur-sm">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search organizations..." 
            className="pl-9 bg-background/50 border-border/50 focus:ring-primary/20"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <MetalButton
            variantType={showUnclaimedOnly ? "filled" : "outlined"}
            size="sm"
            onClick={() => setShowUnclaimedOnly(!showUnclaimedOnly)}
            className="flex-1 sm:flex-none justify-start h-10 px-4"
            icon={<Filter className="h-4 w-4" />}
          >
            {showUnclaimedOnly ? "Showing Unclaimed" : "All Statuses"}
          </MetalButton>
        </div>
      </div>

      <div className="grid gap-4">
        {organizations.length === 0 ? (
          <Card className="border-dashed py-12 flex flex-col items-center justify-center text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold">No organizations found</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Try adjusting your search or filters to find what you're looking for.
            </p>
          </Card>
        ) : (
          organizations.map((org: Organization) => (
            <Card 
              key={org.id} 
              className="group hover:bg-muted/30 transition-all duration-200 cursor-pointer overflow-hidden border-border/40"
              onClick={() => router.push(`/admin/organizations/${org.id}`)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <OrgLogo organization={org} size="sm" className="shadow-sm" />
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold truncate text-lg">{org.name}</h3>
                    <Badge variant="outline" className="font-mono text-[10px] hidden sm:inline-flex">
                      {org.shortName || org.id.slice(0, 8).toUpperCase()}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                      {org.teamCount || 0} Teams
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                      {org.memberCount || 0} Members
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="hidden md:flex flex-col items-end">
                    <div className="flex items-center gap-1.5">
                      {org.isClaimed ? (
                        <>
                          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                          <span className="text-sm font-medium text-green-600 dark:text-green-400">Claimed</span>
                        </>
                      ) : (
                        <>
                          <HelpCircle className="h-3.5 w-3.5 text-amber-500" />
                          <span className="text-sm font-medium text-amber-600 dark:text-amber-400">Unclaimed</span>
                        </>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold mt-0.5">Status</span>
                  </div>

                  <div className="bg-primary/5 p-2 rounded-full group-hover:bg-primary/10 transition-colors">
                    <ArrowRight className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {TotalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-4">
          <MetalButton 
            variantType="outlined" 
            size="sm" 
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </MetalButton>
          <span className="text-sm font-medium">
            Page {page} of {TotalPages}
          </span>
          <MetalButton 
            variantType="outlined" 
            size="sm" 
            onClick={() => setPage(p => Math.min(TotalPages, p + 1))}
            disabled={page === TotalPages}
          >
            Next
          </MetalButton>
        </div>
      )}
    </div>
  );
}

