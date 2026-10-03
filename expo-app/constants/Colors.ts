import { tokens, type ThemeToken } from './theme';

export type { ThemeToken };

/**
 * A theme token's colour as a value, for what a class cannot reach — an icon's `color`,
 * `placeholderTextColor`, an inline style. The same tokens the `text-ink-muted`-style classes
 * use ([theme.js](./theme.js)), so a value and a class for one purpose always agree. With `opacity`
 * (0–1) it gives the colour at that share as `rgba(…)`, the twin of a class's `/30`.
 */
export function themeColor(isDark: boolean, token: ThemeToken, opacity?: number): string {
  const hex = tokens[token][isDark ? 'dark' : 'light'];
  if (opacity === undefined) return hex;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
