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
  if (code) return code.slice(0, 2).toUpperCase();
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function isPlaceholderLogo(url?: string) {
  if (!url) return true;
  return url.includes("dicebear.com");
}
