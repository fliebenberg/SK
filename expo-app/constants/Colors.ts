export const COLORS = {
  brand: {
    orange: '#FF3E00',
    blue: '#00E5FF',
    red: '#FF003C',
    green: '#00E676',
  },
  light: {
    background: '#F8FAFC',
    surface: '#FFFFFF',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    placeholder: '#64748B',
  },
  dark: {
    background: '#0F172A',
    surface: 'rgba(255, 255, 255, 0.05)',
    textPrimary: '#FFFFFF',
    textSecondary: '#94A3B8',
    border: 'rgba(255, 255, 255, 0.08)',
    placeholder: '#94A3B8',
  }
} as const;

export function getThemeColor(isDark: boolean, key: keyof typeof COLORS.light): string {
  return isDark ? COLORS.dark[key] : COLORS.light[key];
}
