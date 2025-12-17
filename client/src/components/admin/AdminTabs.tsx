"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface Tab {
  name: string;
  href: string;
  exact?: boolean;
}

interface AdminTabsProps {
  tabs: Tab[];
}

export function AdminTabs({ tabs }: AdminTabsProps) {
  const pathname = usePathname();

  return (
    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
      {tabs.map((tab) => {
        const isActive = tab.exact 
          ? pathname === tab.href 
          : pathname?.startsWith(tab.href);
            
        return (
          <Link
            key={tab.name}
            href={tab.href}
            className={cn(
              "whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors hover:border-primary/50 hover:text-foreground",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.name}
          </Link>
        );
      })}
    </nav>
  );
}
