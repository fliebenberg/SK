"use client";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, description, className, children }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-col xl:flex-row items-center justify-between gap-6 text-center xl:text-left">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-orbitron)' }}>
            {title}
          </h1>
          {description && <p className="text-muted-foreground">{description}</p>}
        </div>
        {children && (
          <div className="flex flex-row items-center gap-2 w-full xl:w-auto">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
