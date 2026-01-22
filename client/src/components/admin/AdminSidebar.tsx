"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn, getContrastColor, getInitials, isPlaceholderLogo } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  Users,
  Trophy,
  MapPin,
  Calendar,
  Settings,
  Menu,
  ChevronsUpDown,
  Plus,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { Organization } from "@sk/types";
import { useAdminNavigation } from "@/hooks/useAdminNavigation";

interface AdminSidebarProps extends React.HTMLAttributes<HTMLDivElement> {}

export function AdminSidebar({ className }: AdminSidebarProps) {
  const router = useRouter();
  const { pathname, organizations, currentOrg, sidebarItems } = useAdminNavigation();

  const handleOrgChange = (org: Organization) => {
      router.push(`/admin/organizations/${org.id}`);
  };

  const contrastColor = currentOrg ? getContrastColor(currentOrg.primaryColor) : '#ffffff';
  const hasActualLogo = currentOrg?.logo && !isPlaceholderLogo(currentOrg.logo);

  return (
    <div className={cn("pb-12 h-full flex flex-col", className)}>
      <div className="space-y-4 py-4 flex-1">
        <div className="px-3 py-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full justify-between mb-4 h-auto py-2"
                style={currentOrg ? {
                    backgroundColor: currentOrg.primaryColor || undefined,
                    borderColor: currentOrg.secondaryColor || undefined,
                    borderWidth: '2px',
                    color: contrastColor
                } : undefined}
              >
                <div className="flex items-center gap-2 truncate">
                    {hasActualLogo ? (
                        <div className="w-6 h-6 rounded-md overflow-hidden border border-border bg-background flex-shrink-0">
                            <img src={currentOrg.logo} alt={currentOrg.name} className="w-full h-full object-cover" />
                        </div>
                    ) : (
                        <div 
                            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                            style={{ 
                                backgroundColor: currentOrg?.secondaryColor || 'var(--muted)',
                                color: currentOrg?.primaryColor || 'var(--muted-foreground)'
                            }}
                        >
                            {currentOrg ? getInitials(currentOrg.name, currentOrg.shortName) : <Building2 className="w-3 h-3" />}
                        </div>
                    )}
                    <span className="truncate font-medium">
                        {currentOrg ? currentOrg.name : "Select Organization"}
                    </span>
                </div>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[200px]">
              <DropdownMenuLabel>My Organizations</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {organizations.map((org) => {
                const orgContrast = getContrastColor(org.primaryColor);
                const orgHasLogo = org.logo && !isPlaceholderLogo(org.logo);
                return (
                  <DropdownMenuItem
                    key={org.id}
                    onSelect={() => handleOrgChange(org)}
                    className="justify-between mb-1 cursor-pointer"
                    style={{
                        backgroundColor: org.primaryColor || 'transparent',
                        borderColor: org.secondaryColor || 'transparent',
                        borderWidth: '2px',
                        borderStyle: 'solid',
                        color: orgContrast
                    }}
                  >
                    <div className="flex items-center gap-2">
                        {orgHasLogo ? (
                            <div className="w-8 h-8 rounded-md overflow-hidden border border-border bg-background flex-shrink-0">
                                <img src={org.logo} alt={org.name} className="w-full h-full object-cover" />
                            </div>
                        ) : (
                            <div 
                                className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 text-xs font-bold"
                                style={{ 
                                    backgroundColor: org.secondaryColor || 'var(--muted)',
                                    color: org.primaryColor || 'var(--muted-foreground)'
                                }}
                            >
                                {getInitials(org.name, org.shortName)}
                            </div>
                        )}
                        <span className="font-medium">{org.name}</span>
                    </div>
                    {currentOrg?.id === org.id && <Check className="h-4 w-4" />}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push("/admin/organizations/new")}>
                <Plus className="mr-2 h-4 w-4" />
                Create New
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
            Admin
          </h2>
          <div className="space-y-1">
            {sidebarItems.map((item) => (
              <Button
                key={item.href}
                variant={pathname === item.href ? "secondary" : "ghost"}
                className="w-full justify-start"
                asChild
              >
                <Link href={item.href}>
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.title}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-3 py-2 mt-auto">
        <div className="space-y-1">
            <div className="my-2 border-t border-border/50" />
            <Button
                variant={pathname === "/admin/settings" ? "secondary" : "ghost"}
                className="w-full justify-start"
                asChild
            >
                <Link href="/admin/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                </Link>
            </Button>
        </div>
      </div>
    </div>
  );
}

export function MobileSidebar() {
    const [open, setOpen] = useState(false);
    const router = useRouter();
    const { pathname, organizations, currentOrg, sidebarItems } = useAdminNavigation();
    const contrastColor = currentOrg ? getContrastColor(currentOrg.primaryColor) : '#ffffff';
    const hasActualLogo = currentOrg?.logo && !isPlaceholderLogo(currentOrg.logo);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" className="md:hidden">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle Menu</span>
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="pr-0 flex flex-col h-full">
                <SheetTitle className="sr-only">Mobile Navigation Menu</SheetTitle>
                <SheetDescription className="sr-only">
                    Navigation menu for accessing administration features.
                </SheetDescription>
                <div className="px-3 py-2 flex-1">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                        <Button 
                            variant="outline" 
                            className="w-full justify-between mb-4 h-auto py-2"
                            style={currentOrg ? {
                                backgroundColor: currentOrg.primaryColor || undefined,
                                borderColor: currentOrg.secondaryColor || undefined,
                                borderWidth: '2px',
                                color: contrastColor
                            } : undefined}
                        >
                            <div className="flex items-center gap-2 truncate">
                                {hasActualLogo ? (
                                    <div className="w-6 h-6 rounded-full overflow-hidden border border-border bg-background flex-shrink-0">
                                        <img src={currentOrg.logo} alt={currentOrg.name} className="w-full h-full object-cover" />
                                    </div>
                                ) : (
                                    <div 
                                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                                        style={{ 
                                            backgroundColor: currentOrg?.secondaryColor || 'var(--muted)',
                                            color: currentOrg?.primaryColor || 'var(--muted-foreground)'
                                        }}
                                    >
                                        {currentOrg ? getInitials(currentOrg.name, currentOrg.shortName) : <Building2 className="w-3 h-3" />}
                                    </div>
                                )}
                                <span className="truncate font-medium">
                                    {currentOrg ? currentOrg.name : "Select Organization"}
                                </span>
                            </div>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[200px]">
                        <DropdownMenuLabel>My Organizations</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {organizations.map((org) => {
                            const orgContrast = getContrastColor(org.primaryColor);
                            const orgHasLogo = org.logo && !isPlaceholderLogo(org.logo);
                            return (
                                <DropdownMenuItem
                                key={org.id}
                                onSelect={() => {
                                    router.push(`/admin/organizations/${org.id}`);
                                    setOpen(false);
                                }}
                                className="justify-between mb-1 cursor-pointer"
                                style={{
                                    backgroundColor: org.primaryColor || 'transparent',
                                    borderColor: org.secondaryColor || 'transparent',
                                    borderWidth: '2px',
                                    borderStyle: 'solid',
                                    color: orgContrast
                                }}
                                >
                                <div className="flex items-center gap-2">
                                    {orgHasLogo ? (
                                        <div className="w-8 h-8 rounded-md overflow-hidden border border-border bg-background flex-shrink-0">
                                            <img src={org.logo} alt={org.name} className="w-full h-full object-cover" />
                                        </div>
                                    ) : (
                                        <div 
                                            className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 text-xs font-bold"
                                            style={{ 
                                                backgroundColor: org.secondaryColor || 'var(--muted)',
                                                color: org.primaryColor || 'var(--muted-foreground)'
                                            }}
                                        >
                                            {getInitials(org.name, org.shortName)}
                                        </div>
                                    )}
                                    <span className="font-medium">{org.name}</span>
                                </div>
                                {currentOrg?.id === org.id && <Check className="h-4 w-4" />}
                                </DropdownMenuItem>
                            );
                        })}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => {
                            router.push("/admin/organizations/new");
                            setOpen(false);
                        }}>
                            <Plus className="mr-2 h-4 w-4" />
                            Create New
                        </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
                        Admin
                    </h2>
                    <div className="space-y-1">
                        {sidebarItems.map((item) => (
                            <Button
                                key={item.href}
                                variant={pathname === item.href ? "secondary" : "ghost"}
                                className="w-full justify-start"
                                asChild
                                onClick={() => setOpen(false)}
                            >
                                <Link href={item.href}>
                                    <item.icon className="mr-2 h-4 w-4" />
                                    {item.title}
                                </Link>
                            </Button>
                        ))}
                    </div>
                </div>

                <div className="px-3 py-2 mt-auto">
                    <div className="space-y-1">
                        <div className="my-2 border-t border-border/50" />
                        <Button
                            variant={pathname === "/admin/settings" ? "secondary" : "ghost"}
                            className="w-full justify-start"
                            asChild
                            onClick={() => setOpen(false)}
                        >
                            <Link href="/admin/settings">
                                <Settings className="mr-2 h-4 w-4" />
                                Settings
                            </Link>
                        </Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
