/**
 * The app's colours, named for what they are for, each with a light and a dark value (2026-10-03,
 * `UI-24`). The one place a colour is defined.
 *
 * Two readers, one source:
 * - **Classes.** [tailwind.config.js](../tailwind.config.js) turns every token into a Tailwind
 *   colour backed by a CSS variable — `text-ink-muted`, `bg-card`, `border-line`,
 *   `bg-success-soft` — and writes the variables for `:root` and `.dark:root`. A screen names the
 *   purpose; the theme picks the shade, so a missing `dark:` half cannot happen.
 * - **Values.** [Colors.ts](./Colors.ts) reads the same tokens for what a class cannot reach: an
 *   icon's `color`, `placeholderTextColor`, an inline style.
 *
 * CommonJS, not TypeScript, because the Tailwind config is loaded by Node before anything is
 * compiled. Types are in `theme.d.ts`.
 *
 * Each tone (`primary`, `accent`, `success`, `warning`, `danger`, `info`, `special`) has five:
 * the tone itself (a fill — a button, a dot), `on-<tone>` (text and icons on that fill, worked out
 * below), `-ink` (text and icons in that tone, on the page or on
 * its own tint), `-soft` (a tinted background) and `-line` (the border of a tinted container). The
 * `-ink` shades are the badge shades of design_spec §1.1, which reach 7:1 on their tint.
 *
 * Dark-mode tints and lines are solid colours, worked out as a share of the tone laid over the dark
 * card colour, rather than translucent: a variable holds a colour's three channels so that
 * Tailwind's opacity modifier (`bg-primary/10`) still works, and a translucent value would leave no
 * room for it.
 */

const CARD_DARK = '#0F172A';

/** `share` of `hex` laid over `base`, as a hex colour. */
function over(base, hex, share) {
  const ch = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const mix = [0, 1, 2].map(i => Math.round(ch(base, i) + (ch(hex, i) - ch(base, i)) * share));
  return '#' + mix.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** WCAG relative luminance of a hex colour. */
function luminance(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

const WHITE = '#FFFFFF';
const NEAR_BLACK = '#020617';

/**
 * White or near-black, whichever reads better on `fill` (`UI-25`). The fills are bright in dark
 * mode and some are mid-tones in light — white is 1.7:1 on the dark-mode green, 3.5:1 on the brand
 * orange — so each tone's label colour is worked out from its fill, per theme, rather than chosen.
 */
function labelOn(fill) {
  const l = luminance(fill);
  return (l + 0.05) / (luminance(NEAR_BLACK) + 0.05) >= 1.05 / (l + 0.05) ? NEAR_BLACK : WHITE;
}

/** A tint and a border for a tone in dark mode, from its hue. */
const darkSoft = hex => over(CARD_DARK, hex, 0.12);
const darkLine = hex => over(CARD_DARK, hex, 0.3);

const tokens = {
  // --- Surfaces --------------------------------------------------------------------------------
  /** The page behind everything. */
  canvas: { light: '#F8FAFC', dark: '#020617' },
  /** A card, panel, dialog or list. */
  card: { light: '#FFFFFF', dark: CARD_DARK },
  /** Set into a card: an input, a chip, a segmented track, a stat tile. */
  sunken: { light: '#F1F5F9', dark: '#1E293B' },
  /** The inside of a text input or a closed select. */
  field: { light: '#F8FAFC', dark: '#020617' },
  /**
   * Lifted off a sunken track: the selected segment, a page number, a stepper button. The dark value
   * is as far above `sunken` as white is in light mode, and no further: slate-700 would take the
   * orange and muted text under 4.5:1.
   */
  raised: { light: '#FFFFFF', dark: '#273449' },
  /**
   * A dialog, sheet or menu floating over the page. In dark mode a step lighter than `card`, so it
   * stands off the page behind its scrim.
   */
  popover: { light: '#FFFFFF', dark: '#1E293B' },
  /** A tooltip's dark bubble, in both themes; its text is `on-fill`. */
  tooltip: { light: '#0F172A', dark: '#334155' },
  /** The white plate behind an org's logo, in both themes: logos are drawn for white. */
  'logo-plate': { light: '#FFFFFF', dark: '#FFFFFF' },
  /** A drop shadow's colour (`shadowColor`); the shadow's opacity sets how strong it is. */
  shadow: { light: '#000000', dark: '#000000' },
  /** The scrim behind a dialog; use with an opacity, `bg-overlay/60`. */
  overlay: { light: '#020617', dark: '#000000' },

  // --- Text --------------------------------------------------------------------------------------
  /** Names, values, headings. */
  ink: { light: '#0F172A', dark: '#FFFFFF' },
  /** Body text a step down: descriptions, secondary values. */
  'ink-soft': { light: '#334155', dark: '#CBD5E1' },
  /**
   * Labels, counts, meta lines. The light value sits between slate-500 and slate-600: slate-500 is
   * 4.34:1 on `sunken`, under the floor, and slate-600 comes too close to `ink-soft` (2026-10-04).
   */
  'ink-muted': { light: '#5A6779', dark: '#94A3B8' },
  /** Placeholders, disabled text and decorative marks — never text that must be read (2.6:1). */
  'ink-faint': { light: '#94A3B8', dark: '#64748B' },
  /**
   * White text in both themes, on what is dark in both: a tooltip, the scrim, a photo, a fill that
   * is not a tone. On a tone's fill use that tone's `on-<tone>` instead.
   */
  'on-fill': { light: '#FFFFFF', dark: '#FFFFFF' },
  /** Near-black text in both themes, on what is bright in both: a logo plate, a yellow card. */
  'on-bright': { light: '#020617', dark: '#020617' },

  // --- Lines -------------------------------------------------------------------------------------
  /** Card and input borders. */
  line: { light: '#E2E8F0', dark: over(CARD_DARK, '#FFFFFF', 0.08) },
  /** Dividers between rows. */
  'line-soft': { light: '#F1F5F9', dark: over(CARD_DARK, '#FFFFFF', 0.05) },
  /** A border that must stand out: a focused or selected control. */
  'line-strong': { light: '#CBD5E1', dark: over(CARD_DARK, '#FFFFFF', 0.2) },
  /**
   * The edge of a chosen option — the selected segment of a switch, the active pill tab, a ticked
   * filter chip (`UI-26`, 2026-10-04). A chosen option is shown raised, in ink, and never orange, so
   * it cannot be mistaken for a button. Near-white in dark mode, where `line-strong` disappeared.
   */
  'line-selected': { light: '#CBD5E1', dark: '#CBD5E1' },

  // --- Tones -------------------------------------------------------------------------------------
  /**
   * The brand orange: primary buttons, links, and a filter that is narrowing a list. Not a chosen
   * option — a switch always has one, and orange on every toolbar would drown the signal (`UI-26`).
   */
  primary: { light: '#FF3E00', dark: '#FF3E00' },
  /**
   * Links and orange text. Not the brand orange itself, which is 4.14:1 on dark `sunken`: a deeper
   * burnt orange in light mode and a lighter one in dark, 6–7:1 on every surface (2026-10-04).
   */
  'primary-ink': { light: '#A8360A', dark: '#FF7A45' },
  'primary-soft': { light: '#FFF7ED', dark: darkSoft('#FF3E00') },
  'primary-line': { light: '#FED7AA', dark: darkLine('#FF3E00') },

  /** The electric blue: the second brand colour. */
  accent: { light: '#00E5FF', dark: '#00E5FF' },
  'accent-ink': { light: '#155E75', dark: '#00E5FF' },
  'accent-soft': { light: '#ECFEFF', dark: darkSoft('#00E5FF') },
  'accent-line': { light: '#A5F3FC', dark: darkLine('#00E5FF') },

  /** Done, won, confirmed, on ScoreKeeper. */
  success: { light: '#059669', dark: '#00E676' },
  'success-ink': { light: '#065F46', dark: '#6EE7B7' },
  'success-soft': { light: '#ECFDF5', dark: darkSoft('#00E676') },
  'success-line': { light: '#A7F3D0', dark: darkLine('#00E676') },

  /** Worth knowing, needs attention: a minor, a pending invite. */
  warning: { light: '#F59E0B', dark: '#FFC400' },
  'warning-ink': { light: '#78350F', dark: '#FCD34D' },
  'warning-soft': { light: '#FFFBEB', dark: darkSoft('#FFC400') },
  'warning-line': { light: '#FDE68A', dark: darkLine('#FFC400') },

  /** Refused, failed, lost, destructive. */
  danger: { light: '#DC2626', dark: '#FF003C' },
  'danger-ink': { light: '#991B1B', dark: '#F87171' }, // Dark: a true red; #FCA5A5 read as pink (2026-10-05).
  'danger-soft': { light: '#FEF2F2', dark: darkSoft('#FF003C') },
  'danger-line': { light: '#FECACA', dark: darkLine('#FF003C') },

  /** Neutral information: the Staff badge. */
  info: { light: '#2563EB', dark: '#60A5FA' },
  'info-ink': { light: '#1E40AF', dark: '#93C5FD' },
  'info-soft': { light: '#EFF6FF', dark: darkSoft('#3B82F6') },
  'info-line': { light: '#BFDBFE', dark: darkLine('#3B82F6') },

  /** A meaning of its own that fits no tone above: the Dependant tag. */
  special: { light: '#7C3AED', dark: '#A78BFA' },
  'special-ink': { light: '#5B21B6', dark: '#C4B5FD' },
  'special-soft': { light: '#F5F3FF', dark: darkSoft('#8B5CF6') },
  'special-line': { light: '#DDD6FE', dark: darkLine('#8B5CF6') },
};

// Each tone's label colour: `on-primary`, `on-success`… — white or near-black, whichever reads better
// on that tone's fill in each theme.
for (const tone of ['primary', 'accent', 'success', 'warning', 'danger', 'info', 'special']) {
  tokens[`on-${tone}`] = { light: labelOn(tokens[tone].light), dark: labelOn(tokens[tone].dark) };
}

/** "#0F172A" → "15 23 42", the form a CSS variable holds so opacity modifiers work. */
function channels(hex) {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(' ');
}

/** The CSS variables for one theme: `{ '--ink-muted': '100 116 139', … }`. */
function cssVariables(mode) {
  return Object.fromEntries(Object.entries(tokens).map(([name, value]) => [`--${name}`, channels(value[mode])]));
}

/**
 * The Tailwind colours: `ink: { DEFAULT, soft, muted, faint }`, `success: { DEFAULT, ink, soft,
 * line }` and so on, each `rgb(var(--…) / <alpha-value>)`.
 */
function tailwindColors() {
  const colors = {};
  for (const name of Object.keys(tokens)) {
    const value = `rgb(var(--${name}) / <alpha-value>)`;
    const [group, ...rest] = name.split('-');
    const key = rest.join('-') || 'DEFAULT';
    // `on-fill` and `on-bright` stay whole names: `text-on-fill`.
    if (group === 'on') {
      colors[name] = value;
      continue;
    }
    colors[group] = typeof colors[group] === 'object' ? colors[group] : {};
    colors[group][key] = value;
  }
  return colors;
}

module.exports = { tokens, cssVariables, tailwindColors };
