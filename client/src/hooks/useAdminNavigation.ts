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
  Building2,
  AlertCircle,
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
            const gameMatch = pathname.match(/\/admin\/games\/([^\/]+)/);
            if (gameMatch) {
                const gameId = gameMatch[1];
                const game = store.getGame(gameId);
                if (game) {
                    const event = store.getEvent(game.eventId);
                    if (event) {
                        const adminOrgIds = store.getAdminOrgIds(user.id, user.globalRole);
                        const involvedOrgIds = new Set([event.orgId, ...(event.participatingOrgIds || [])]);
                        
                        game.participants?.forEach(p => {
                            const team = store.getTeam(p.teamId);
                            if (team) involvedOrgIds.add(team.orgId);
                        });

                        // 1. Keep currently selected org if valid
                        if (currentOrg && involvedOrgIds.has(currentOrg.id) && adminOrgIds.includes(currentOrg.id)) {
                            return;
                        }

                        // 2. Resolve first accessible involved org
                        const firstAccessibleInvolved = Array.from(involvedOrgIds).find(id => adminOrgIds.includes(id));
                        if (firstAccessibleInvolved) {
                            const org = allOrgs.find(o => o.id === firstAccessibleInvolved);
                            if (org) {
                                setCurrentOrg(org);
                                return;
                            }
                        }

                        // 3. Fallback for global admins
                        if (user.globalRole === 'admin') {
                            const org = allOrgs.find(o => o.id === event.orgId);
                            if (org) {
                                setCurrentOrg(org);
                                return;
                            }
                        }
                    }
                }
            }
            setCurrentOrg(null);
        }
    };

    update(); // Initial check
    const unsubscribe = store.subscribe(update);
    return () => unsubscribe();
  }, [pathname, user, currentOrg]); // Added currentOrg to dependency to allow sticky logic if it's already set

  const getSidebarItems = (): SidebarItem[] => {
      if (currentOrg) {
          const isOrgAdmin = user?.globalRole === 'admin' || 
            store.userOrgMemberships.some(m => m.orgId === currentOrg.id && m.roleId === 'role-org-admin');

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
              title: "Sites",
              href: `/admin/organizations/${currentOrg.id}/sites`,
              icon: MapPin,
          });
          items.push({
              title: "Events",
              href: `/admin/organizations/${currentOrg.id}/events`,
              icon: Calendar,
          });

          if (user?.globalRole === 'admin') {
              items.push({
                  title: "All Organizations",
                  href: "/admin/all-organizations",
                  icon: Building2,
              });
              items.push({
                  title: "Reports",
                  href: "/admin/reports",
                  icon: AlertCircle,
              });
          }

          return items;
      }

      if (user?.globalRole === 'admin') {
          return [
              {
                  title: "All Organizations",
                  href: "/admin/all-organizations",
                  icon: Building2,
              },
              {
                  title: "Reports",
                  href: "/admin/reports",
                  icon: AlertCircle,
              }
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
    hasOwnedOrg,
  };
}
