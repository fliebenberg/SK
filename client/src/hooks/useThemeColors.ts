"use client";

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function useThemeColors() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && theme?.includes('dark');
  const metalVariant: 'silver-dark' | 'silver' = isDark ? 'silver-dark' : 'silver';
  
  // Use a stable default during hydration (before mount) to match SSR
  const primaryColor = mounted 
    ? (theme?.includes('orange') ? 'hsl(24, 95%, 53%)' : 'hsl(142, 70%, 50%)')
    : 'hsl(142, 70%, 50%)';

  return {
    theme,
    isDark,
    metalVariant,
    primaryColor,
    mounted
  };
}
