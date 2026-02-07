"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  name?: string | null;
  image?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  rounded?: "sm" | "md" | "lg" | "xl" | "full" | "none";
}

const sizeMap = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
  xl: "h-24 w-24 text-3xl",
  "2xl": "h-32 w-32 text-4xl",
};

const roundedMap = {
  none: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
};

const gradients = [
  "from-[#FF5F6D] to-[#FFC371]", // Sunset
  "from-[#2193b0] to-[#6dd5ed]", // Blue sky
  "from-[#ee9ca7] to-[#ffdde1]", // Rose
  "from-[#4568DC] to-[#B06AB3]", // Purple transition
  "from-[#0575E6] to-[#021B79]", // Deep blue
  "from-[#00b09b] to-[#96c93d]", // Green
  "from-[#f12711] to-[#f5af19]", // Fire
  "from-[#8E2DE2] to-[#4A00E0]", // Electric violet
];

export function UserAvatar({ name, image, size = "md", className, rounded = "full" }: UserAvatarProps) {
  const initials = useMemo(() => {
    if (!name) return "?";
    return name
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }, [name]);

  const gradient = useMemo(() => {
    if (!name) return gradients[0];
    let hash = 0;
    const cleanName = name.trim();
    for (let i = 0; i < cleanName.length; i++) {
      hash = cleanName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % gradients.length;
    return gradients[index];
  }, [name]);

  if (image && image !== "" && image !== "null" && image !== "undefined") {
    return (
      <div className={cn("relative flex-shrink-0 overflow-hidden border border-border", sizeMap[size], roundedMap[rounded], className)}>
        <img
          src={image}
          alt={name || "User"}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex items-center justify-center font-bold text-white shadow-lg flex-shrink-0 uppercase tracking-tighter ring-2 ring-background overflow-hidden",
        `bg-gradient-to-br ${gradient}`,
        sizeMap[size],
        roundedMap[rounded],
        className
      )}
    >
      <span style={{ fontFamily: 'var(--font-orbitron)' }}>{initials}</span>
      <div className="absolute inset-0 bg-white/10" />
    </div>
  );
}
