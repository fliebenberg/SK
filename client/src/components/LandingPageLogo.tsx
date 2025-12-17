"use client";

import { MetalText } from "@/components/MetalText";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function LandingPageLogo() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Default to silver/light if not mounted or unknown
  const isDark = mounted && theme?.includes("dark");
  const metalVariant = isDark ? "silver-dark" : "silver";

  return (
    <MetalText size="xl" glowColor="hsl(var(--primary))" glowSize="lg" metalVariant={metalVariant} text="ScoreKeeper" />
  );
}
