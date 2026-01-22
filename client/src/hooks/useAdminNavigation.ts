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

export interface SidebarItem {
    title: string;
    href: string;
    icon: React.ElementType;
}

export function useAdminNavigation() {
  const pathname = usePathname();
  const [organizations, setOrganizations] = useState<Organization[]>(store.getOrganizations());
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);

  useEffect(() => {
    const update = () => {
        const orgs = store.getOrganizations();
        setOrganizations([...orgs]);
        
        const match = pathname.match(/\/admin\/organizations\/([^\/]+)/);
        if (match) {
          const orgId = match[1];
          if (orgId === 'new') {
            setCurrentOrg(null);
          } else {
            const found = orgs.find(o => o.id === orgId);
            if (found) setCurrentOrg(found);
            // If not found in store yet (loading?), currentOrg becomes null, showing dashboard only
          }
        } else {
            setCurrentOrg(null);
        }
    };

    update(); // Initial check
    const unsubscribe = store.subscribe(update);
    return () => unsubscribe();
  }, [pathname]);

  const getSidebarItems = (): SidebarItem[] => {
      if (currentOrg) {
          return [
              {
                  title: "Dashboard",
                  href: `/admin/organizations/${currentOrg.id}`,
                  icon: LayoutDashboard,
              },
              {
                  title: "Organization Settings",
                  href: `/admin/organizations/${currentOrg.id}/edit`,
                  icon: Settings,
              },
              {
                  title: "People",
                  href: `/admin/organizations/${currentOrg.id}/people`,
                  icon: Users,
              },
              {
                  title: "Teams",
                  href: `/admin/organizations/${currentOrg.id}/teams`,
                  icon: Trophy,
              },
              {
                  title: "Venues",
                  href: `/admin/organizations/${currentOrg.id}/venues`,
                  icon: MapPin,
              },
              {
                  title: "Events",
                  href: `/admin/organizations/${currentOrg.id}/events`,
                  icon: Calendar,
              },
          ];
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
  };
}
