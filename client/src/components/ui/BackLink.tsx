"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface BackLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "compact";
}

export function BackLink({ href, children, className, variant = "compact" }: BackLinkProps) {
  return (
    <Link 
      href={href} 
      className={cn(
        "inline-flex items-center text-muted-foreground hover:text-primary transition-colors w-fit group",
        variant === "compact" && "text-[10px] font-black uppercase tracking-widest",
        variant === "default" && "text-sm font-medium",
        className
      )}
    >
      <ChevronLeft 
        className={cn(
          "transition-transform group-hover:-translate-x-0.5",
          variant === "compact" ? "h-3 w-3 mr-0.5" : "h-4 w-4 mr-1"
        )} 
      />
      {children}
    </Link>
  );
}
