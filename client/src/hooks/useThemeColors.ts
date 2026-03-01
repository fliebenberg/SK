"use client";

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function useThemeColors() {
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Use resolvedTheme for behavior logic (which reflects actual state including 'system' resolution)
  const isDark = mounted && (resolvedTheme?.includes('dark') || false);
  const metalVariant: 'silver-dark' | 'silver' = isDark ? 'silver-dark' : 'silver';
  
  // Use a stable default during hydration (before mount) to match SSR
  // resolvedTheme will be 'dark-orange', 'light-orange', or 'dark-green'
  const primaryColor = mounted 
    ? (resolvedTheme?.includes('orange') ? 'hsl(24, 95%, 53%)' : 'hsl(142, 70%, 50%)')
    : 'hsl(142, 70%, 50%)';

  return {
    theme,
    resolvedTheme,
    isDark,
    metalVariant,
    primaryColor,
    mounted
  };
}

