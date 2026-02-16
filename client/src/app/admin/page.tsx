"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { store } from "@/app/store/store";
import { OrgLogo } from "@/components/ui/OrgLogo";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldAlert, Plus } from "lucide-react";

export default function AdminPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [adminOrgIds, setAdminOrgIds] = useState<string[]>([]);
  const [isStoreLoaded, setIsStoreLoaded] = useState(false);

  useEffect(() => {
    setMounted(true);
    const update = () => {
       if (user) {
         setAdminOrgIds(store.getAdminOrgIds(user.id, user.globalRole));
       }
       setIsStoreLoaded(store.isLoaded());
    };
    update();
    return store.subscribe(update);
  }, [user]);

  useEffect(() => {
    if (authLoading || !mounted || !isStoreLoaded) return;

    if (!isAuthenticated || !user) {
      router.replace('/');
      return;
    }

    const orgIds = store.getAdminOrgIds(user.id, user.globalRole);
    
    // REDIRECTION LOGIC
    if (user.globalRole === 'admin' && pathname === '/admin') {
       // Global Admins go to the full organizations list if at root admin
       router.replace('/admin/organizations');
    } else if (orgIds.length === 1 && pathname === '/admin') {
       // Single Org Admins go straight to their dashboard if at root admin
       router.replace(`/admin/organizations/${orgIds[0]}`);
    }
  }, [authLoading, mounted, isAuthenticated, user, isStoreLoaded, router, pathname]);

  if (authLoading || !mounted || !isStoreLoaded) {
    return (
      <div className="flex items-center justify-center min-vh-100 p-8">
        <div className="text-center">
           <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
           <p className="text-muted-foreground">Checking permissions...</p>
        </div>
      </div>
    );
  }

  // If we didn't redirect, it means they have multiple orgs to choose from OR it's loading.
  const adminOrgs = store.getOrganizations().filter(org => adminOrgIds.includes(org.id));

  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl min-h-[80vh]">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-muted-foreground">Select an organization to manage</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {adminOrgs.map(org => (
          <Card 
            key={org.id} 
            className="hover:border-primary/50 transition-colors cursor-pointer group" 
            onClick={() => router.push(`/admin/organizations/${org.id}`)}
          >
            <CardHeader className="flex flex-row items-center gap-4 space-y-0">
               <OrgLogo organization={org} size="md" />
               <div className="flex-1 min-w-0">
                  <CardTitle className="text-xl truncate">{org.name}</CardTitle>
                  <CardDescription>Manage organization details</CardDescription>
               </div>
               <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </CardHeader>
          </Card>
        ))}
      </div>

      {adminOrgs.length === 0 && user?.globalRole !== 'admin' && (
        <div className="text-center p-12 bg-accent/20 rounded-xl border border-dashed">
           <Plus className="h-12 w-12 text-primary mx-auto mb-4" />
           <p className="text-xl font-medium mb-1">Welcome to ScoreKeeper</p>
           <p className="text-muted-foreground mb-6">You are not part of any organizations yet. Would you like to create your own?</p>
           <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                variant="default" 
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => router.push('/admin/organizations/new')}
              >
                Create New Organization
              </Button>
              <Button variant="outline" onClick={() => router.push('/')}>
                Return Home
              </Button>
           </div>
        </div>
      )}
    </div>
  );
}
