"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Organization } from "@sk/types";
import { getOrganizationsAction } from "@/app/actions";
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
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);

  useEffect(() => {
    const fetchOrgs = async () => {
        const orgs = await getOrganizationsAction();
        setOrganizations(orgs);
    
        const match = pathname.match(/\/admin\/organizations\/([^\/]+)/);
        if (match) {
          const orgId = match[1];
          if (orgId === 'new') {
            setCurrentOrg(null);
          } else {
            const found = orgs.find(o => o.id === orgId);
            if (found) setCurrentOrg(found);
          }
        } else {
            setCurrentOrg(null);
        }
    };

    fetchOrgs();

    const handleOrgUpdate = () => {
        fetchOrgs();
    };

    window.addEventListener('organization-updated', handleOrgUpdate);

    return () => {
        window.removeEventListener('organization-updated', handleOrgUpdate);
    };
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
