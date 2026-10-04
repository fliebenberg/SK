/** Types for [theme.js](./theme.js), the app's colour tokens. */

export type ThemeMode = 'light' | 'dark';

export type ThemeToken =
  | 'canvas' | 'card' | 'sunken' | 'field' | 'raised' | 'popover' | 'tooltip' | 'overlay' | 'shadow' | 'logo-plate'
  | 'ink' | 'ink-soft' | 'ink-muted' | 'ink-faint' | 'on-fill' | 'on-bright'
  | 'on-primary' | 'on-accent' | 'on-success' | 'on-warning' | 'on-danger' | 'on-info' | 'on-special'
  | 'line' | 'line-soft' | 'line-strong'
  | 'primary' | 'primary-ink' | 'primary-soft' | 'primary-line'
  | 'accent' | 'accent-ink' | 'accent-soft' | 'accent-line'
  | 'success' | 'success-ink' | 'success-soft' | 'success-line'
  | 'warning' | 'warning-ink' | 'warning-soft' | 'warning-line'
  | 'danger' | 'danger-ink' | 'danger-soft' | 'danger-line'
  | 'info' | 'info-ink' | 'info-soft' | 'info-line'
  | 'special' | 'special-ink' | 'special-soft' | 'special-line';

export const tokens: Record<ThemeToken, Record<ThemeMode, string>>;
export function cssVariables(mode: ThemeMode): Record<string, string>;
export function tailwindColors(): Record<string, string | Record<string, string>>;
