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
  // If it's a data URL or hex color (sometimes logos are just colors in early dev), it's not a placeholder
  if (url.startsWith('data:') || url.startsWith('#')) return false;
  // If it's an internal ID (doesn't start with http/data), it's a real optimized logo
  if (!url.startsWith('http')) return false;
  return url.includes("dicebear.com");
}

export function getOrgLogoUrl(logo?: string, tier: 'large' | 'medium' | 'thumb' = 'medium') {
  if (!logo) return "";
  if (logo.startsWith('http') || logo.startsWith('data:')) return logo;
  
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001";
  return `${serverUrl}/uploads/logos/${logo}_${tier}.webp`;
}

export function getUserAvatarUrl(image?: string, tier: 'large' | 'medium' | 'thumb' = 'medium') {
  if (!image) return "";
  if (image.startsWith('http') || image.startsWith('data:')) return image;
  
  return `/uploads/avatars/${image}_${tier}.webp`;
}

export function formatTime(isoString: string): string {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(isoString: string, short: boolean = false): string {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (short) {
         return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}
