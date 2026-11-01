import React from 'react';
import { View } from 'react-native';

/**
 * An organisation's second and third colours as slanted bands down the left of a card or banner
 * (docs/design_spec.md §5.4), so the list cards and the banners draw them the same way. The parent
 * is the primary colour and clips them.
 *
 * Both bands are placed from the top edge, where they reach furthest right, so `brandBandInset`
 * keeps the text clear of them however tall the content grows. They run behind the logo, and scale
 * with it: the sizes here are the list card's, whose logo is 44 wide.
 */
const SLANT = '-24deg';
const MARK = 44;
const BAND_EDGE = 51;
const STRIPE_EDGE = 65;
const TEXT_INSET = 78;
/** Far enough past the left edge that the slant never shows a gap there. */
const OVERHANG = 60;

/** How far from the left edge the text starts, beside a logo this wide. */
export const brandBandInset = (markSize: number = MARK) => Math.round(TEXT_INSET * (markSize / MARK));

export function BrandBands({ secondary, tertiary, markSize = MARK }: { secondary: string; tertiary: string; markSize?: number }) {
  const scale = markSize / MARK;
  const band = (color: string, edge: number) => (
    <View
      style={{
        position: 'absolute', top: 0, bottom: 0, left: -OVERHANG, width: OVERHANG + edge * scale,
        backgroundColor: color, transformOrigin: 'left top', transform: [{ skewX: SLANT }],
      }}
    />
  );
  return (
    <>
      {band(tertiary, STRIPE_EDGE)}
      {band(secondary, BAND_EDGE)}
    </>
  );
}
