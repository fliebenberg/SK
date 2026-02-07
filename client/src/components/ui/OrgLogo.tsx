"use client";

import { Organization } from "@sk/types";
import { cn, getInitials, getOrgInitialsFontSize, isPlaceholderLogo } from "@/lib/utils";

interface OrgLogoProps {
  organization: Partial<Organization> | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export function OrgLogo({ 
  organization, 
  size = 'md', 
  className,
  rounded = 'md'
}: OrgLogoProps) {
  if (!organization) return null;

  const hasActualLogo = organization.logo && !isPlaceholderLogo(organization.logo);
  const initials = getInitials(organization.name || "", organization.shortName);
  
  const sizeClasses = {
    xs: "w-6 h-6",
    sm: "w-8 h-8",
    md: "w-14 h-14",
    lg: "w-24 h-24",
    xl: "w-32 h-32"
  };

  const roundedClasses = {
    none: "rounded-none",
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-xl",
    full: "rounded-full"
  };

  const containerClasses = cn(
    "flex shrink-0 items-center justify-center overflow-hidden border border-border/10 select-none",
    sizeClasses[size],
    roundedClasses[rounded],
    className
  );

  if (hasActualLogo) {
    return (
      <div className={containerClasses}>
        <img 
          src={organization.logo} 
          alt={organization.name} 
          className="h-full w-full object-cover" 
        />
      </div>
    );
  }

  return (
    <div 
      className={containerClasses}
      style={{ 
        backgroundColor: organization.primaryColor || 'var(--muted)',
        color: organization.secondaryColor || 'inherit'
      }}
    >
      <span className={cn(
        "font-black leading-none",
        getOrgInitialsFontSize(initials, size),
        !organization.primaryColor && "opacity-30"
      )}>
        {initials}
      </span>
    </div>
  );
}
