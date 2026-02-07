import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getContrastColor(hexcolor: string) {
  // If no color provided, default to white text
  if (!hexcolor || hexcolor === 'transparent') return '#ffffff';

  // Remove the hash if it exists
  const hex = hexcolor.replace('#', '');

  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Calculate luminance
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;

  // Return black or white based on contrast
  return yiq >= 128 ? '#000000' : '#ffffff';
}

export function getInitials(name: string, code?: string) {
  if (code) return code.toUpperCase();
  const words = name.split(" ").filter(w => w.length > 0);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Returns a Tailwind font size class for initials based on text length and container size.
 * @param text The initials string
 * @param containerSize The size of the container ('xs', 'sm', 'md', 'lg', 'xl')
 */
export function getOrgInitialsFontSize(text: string, containerSize: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md') {
  const len = text.length;
  
  const sizes = {
    xs: { // ~24px (Sidebar collapsed)
      any: "text-[10px]"
    },
    sm: { // ~32px (Sidebar active org)
      any: "text-xs"
    },
    md: { // ~56px (Event List)
      1: "text-3xl",
      2: "text-2xl",
      3: "text-xl",
      4: "text-lg",
      default: "text-sm"
    },
    lg: { // ~96px 
      1: "text-5xl",
      2: "text-4xl",
      3: "text-3xl",
      4: "text-2xl",
      default: "text-xl"
    },
    xl: { // ~128px (Org Settings)
      1: "text-7xl",
      2: "text-6xl",
      3: "text-5xl",
      4: "text-4xl",
      default: "text-3xl"
    }
  };

  const config = sizes[containerSize];
  if ('any' in config) return config.any;
  
  return config[len as keyof typeof config] || config.default;
}

export function isPlaceholderLogo(url?: string) {
  if (!url) return true;
  return url.includes("dicebear.com");
}
