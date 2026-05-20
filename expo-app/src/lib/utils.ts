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

import { API_URL } from '../constants/api';

export function getInitials(name: string, code?: string) {
  if (code) return code.toUpperCase();
  const words = name.split(" ").filter(w => w.length > 0);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function getContrastColor(hexcolor: string | undefined): string | undefined {
  if (!hexcolor || hexcolor === 'transparent' || hexcolor === 'undefined') return undefined;

  let hex = hexcolor.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }

  if (hex.length !== 6) return undefined;

  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) return undefined;

  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000000' : '#ffffff';
}

export function isPlaceholderLogo(url?: string) {
  if (!url) return true;
  if (url.startsWith('data:') || url.startsWith('#')) return false;
  if (!url.startsWith('http')) return false;
  return url.includes("dicebear.com");
}

export function getOrgLogoUrl(logo?: string, tier: 'large' | 'medium' | 'thumb' = 'medium') {
  if (!logo) return "";
  if (logo.startsWith('http') || logo.startsWith('data:')) return logo;
  return `${API_URL}/uploads/logos/${logo}_${tier}.webp`;
}

export function getUserAvatarUrl(image?: string, tier: 'large' | 'medium' | 'thumb' = 'medium') {
  if (!image) return "";
  if (image.startsWith('http') || image.startsWith('data:')) return image;
  return `${API_URL}/uploads/profiles/${image}_${tier}.webp`;
}

