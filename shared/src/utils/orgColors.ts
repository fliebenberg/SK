/**
 * An organisation's brand colours, and what stands in when one is missing (decided 2026-10-01).
 *
 * **A new organisation starts in the app's own two colours** — orange and electric blue — until an
 * admin sets its real ones, so banners show two colours from the start (decided 2026-10-03).
 *
 * **After that, each colour falls back to the one before it.** An admin may clear the secondary
 * colour, and the org is then painted in its primary alone; the primary is required on every
 * organisation, and only data that predates that falls back to the app's orange.
 *
 * Every screen that paints with an org's colours takes them from {@link orgColors} rather than
 * writing its own `|| '#…'` — there were over thirty of those, each with its own guess.
 */

/** The app's primary orange — the primary colour a new organisation starts with, and the last fallback. */
export const DEFAULT_ORG_PRIMARY_COLOR = '#FF3E00';

/** The app's electric blue — the secondary colour a new organisation starts with. Never a fallback. */
export const DEFAULT_ORG_SECONDARY_COLOR = '#00E5FF';

/** A six-digit hex colour, `#` included — the only shape the colour fields store. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

/** A colour as stored: trimmed and upper-case, or `null` for blank. Throws on anything else. */
export function normalizeHexColor(value: unknown, field = 'Colour'): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`${field} must be a hex colour, like #FF3E00.`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isHexColor(trimmed)) throw new Error(`${field} must be a hex colour, like #FF3E00.`);
  return trimmed.toUpperCase();
}

const filled = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/** The colours to paint an organisation with, every gap filled by the rule above. */
export function orgColors(org?: { primaryColor?: string | null; secondaryColor?: string | null } | null): {
  primary: string;
  secondary: string;
} {
  const primary = filled(org?.primaryColor) ?? DEFAULT_ORG_PRIMARY_COLOR;
  return { primary, secondary: filled(org?.secondaryColor) ?? primary };
}
