/** @colour-data — works out black or white text to read on an arbitrary colour, such as an org's brand colour. */
export function getContrastColor(hexcolor: string | undefined): string {
  if (!hexcolor || hexcolor === 'transparent' || hexcolor === 'undefined') return '#ffffff';
  let hex = hexcolor.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '#ffffff';
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000000' : '#ffffff';
}

export function hexToRgba(hex: string | undefined, opacity: number): string {
  if (!hex || hex === 'transparent' || hex === 'undefined') return `rgba(255, 62, 0, ${opacity})`;
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(char => char + char).join('');
  }
  if (cleanHex.length !== 6) return `rgba(255, 62, 0, ${opacity})`;
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(255, 62, 0, ${opacity})`;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Black or white, whichever reads better on `hex` by the WCAG contrast ratio — for text on a
 * colour an organisation chose, like the band under a team's crest. No colour gives both less than
 * about 4.6:1, so this is the best any colour allows; `getContrastColor` above guesses from
 * brightness instead, and gets mid-tones wrong.
 */
export function readableTextOn(hex: string | undefined): '#000000' | '#FFFFFF' {
  const clean = (hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '#FFFFFF';
  const channel = (i: number) => {
    const c = parseInt(clean.substring(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  // Contrast with black is (L + 0.05) / 0.05, with white 1.05 / (L + 0.05); they cross at L ≈ 0.179.
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#FFFFFF';
}

/**
 * The colours for content drawn over a brand colour — an org's banner card: black-based on a light
 * colour, white-based on a dark one, with the softer shades for subtext, borders and chips. The
 * one place those shades are written, so the banners cannot drift apart (`UI-24`).
 */
export function inkOnBrand(hex: string | undefined) {
  const text = getContrastColor(hex);
  const isLight = text === '#000000';
  const shade = (onLight: number, onDark: number) =>
    isLight ? `rgba(0, 0, 0, ${onLight})` : `rgba(255, 255, 255, ${onDark})`;
  return {
    isLight,
    text,
    /** The opposite of `text`: a solid button set into the banner. */
    inverse: isLight ? '#FFFFFF' : '#000000',
    subtext: shade(0.6, 0.7),
    border: shade(0.1, 0.15),
    badge: shade(0.06, 0.15),
    chip: shade(0.08, 0.25),
    button: shade(0.08, 0.2),
  };
}
