"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Organization } from "@sk/types";
import { store } from "@/app/store/store";
import {
  LayoutDashboard,
  Users,
  Trophy,
  MapPin,
  Calendar,
  Settings,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export interface SidebarItem {
    title: string;
    href: string;
    icon: React.ElementType;
}

export function useAdminNavigation() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [hasOwnedOrg, setHasOwnedOrg] = useState(false);

  useEffect(() => {
    const update = () => {
        const allOrgs = store.getOrganizations();
        
        if (!user) {
            setOrganizations([]);
            setCurrentOrg(null);
            return;
        }

        const adminOrgIds = store.getAdminOrgIds(user.id, user.globalRole);
        const filteredOrgs = allOrgs.filter(o => adminOrgIds.includes(o.id));
        setOrganizations(filteredOrgs);

        const hasOwned = user.globalRole === 'admin' || 
          store.userOrgMemberships.some(m => m.roleId === 'role-org-admin');
        setHasOwnedOrg(hasOwned);
        
        const match = pathname.match(/\/admin\/organizations\/([^\/]+)/);
        if (match) {
          const orgId = match[1];
          if (orgId === 'new') {
            setCurrentOrg(null);
          } else {
            const found = allOrgs.find(o => o.id === orgId);
            if (found) setCurrentOrg(found);
          }
        } else {
            setCurrentOrg(null);
        }
    };

    update(); // Initial check
    const unsubscribe = store.subscribe(update);
    return () => unsubscribe();
  }, [pathname, user]);

  const getSidebarItems = (): SidebarItem[] => {
      if (currentOrg) {
          const isOrgAdmin = user?.globalRole === 'admin' || 
            store.userOrgMemberships.some(m => m.organizationId === currentOrg.id && m.roleId === 'role-org-admin');

          const items: SidebarItem[] = [
              {
                  title: "Dashboard",
                  href: `/admin/organizations/${currentOrg.id}`,
                  icon: LayoutDashboard,
              },
          ];

          if (isOrgAdmin) {
              items.push({
                  title: "Organization Settings",
                  href: `/admin/organizations/${currentOrg.id}/edit`,
                  icon: Settings,
              });
              items.push({
                  title: "People",
                  href: `/admin/organizations/${currentOrg.id}/people`,
                  icon: Users,
              });
          }

          items.push({
              title: "Teams",
              href: `/admin/organizations/${currentOrg.id}/teams`,
              icon: Trophy,
          });
          items.push({
              title: "Venues",
              href: `/admin/organizations/${currentOrg.id}/venues`,
              icon: MapPin,
          });
          items.push({
              title: "Events",
              href: `/admin/organizations/${currentOrg.id}/events`,
              icon: Calendar,
          });

          return items;
      }

      return [
          {
              title: "Dashboard",
              href: "/admin",
              icon: LayoutDashboard,
          },
      ];
  };

  return {
    pathname,
    organizations,
    currentOrg,
    sidebarItems: getSidebarItems(),
    hasOwnedOrg,
  };
}
