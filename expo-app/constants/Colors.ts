export const COLORS = {
  brand: {
    orange: '#FF3E00',
    blue: '#00E5FF',
    red: '#FF003C',
    green: '#00E676',
    yellow: '#FFC400',
  },
  light: {
    background: '#F8FAFC',
    surface: '#FFFFFF',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    placeholder: '#64748B',
    /**
     * "This is done" as *text or a functional icon* — never `brand.green` in light mode.
     *
     * `#00E676` scores **1.67:1** on white, which fails the 4.5:1 floor in
     * [design_spec §6.3](file:///c:/Fred/Coding/SK/docs/design_spec.md) outright; this is
     * emerald-800, at **7.7:1**, so it clears AAA for the small secondary text it usually marks.
     * Exactly the swap the spec already mandates for `#00E5FF`, applied to green.
     * `brand.green` remains correct for *fills* on a dark surface and for dark mode generally.
     */
    success: '#065F46',
  },
  dark: {
    background: '#0F172A',
    surface: 'rgba(255, 255, 255, 0.05)',
    textPrimary: '#FFFFFF',
    textSecondary: '#94A3B8',
    border: 'rgba(255, 255, 255, 0.08)',
    placeholder: '#94A3B8',
    /** 10.7:1 on the dark background — the brand green needs no swap here. */
    success: '#00E676',
  }
} as const;

export function getThemeColor(isDark: boolean, key: keyof typeof COLORS.light): string {
  return isDark ? COLORS.dark[key] : COLORS.light[key];
}
