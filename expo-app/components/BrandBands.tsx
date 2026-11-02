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
 *
 * Each band is a large square, turned so one side is the slanted edge, and clipped by the parent. A
 * `skewX` looked right on web but stayed straight on a phone, and a `rotate` about the square's own
 * centre needs no `transformOrigin`.
 */
const SLANT_DEGREES = 24;
const MARK = 44;
const BAND_EDGE = 51;
const STRIPE_EDGE = 65;
const TEXT_INSET = 78;
/** Bigger than any card or banner, so the square always covers everything left of its edge. */
const SQUARE = 1000;

const radians = (SLANT_DEGREES * Math.PI) / 180;
// Where the turned square's top-right corner lands, measured from its centre.
const CORNER_X = (SQUARE / 2) * (Math.cos(radians) + Math.sin(radians));
const CORNER_Y = (SQUARE / 2) * (Math.sin(radians) - Math.cos(radians));

/** How far from the left edge the text starts, beside a logo this wide. */
export const brandBandInset = (markSize: number = MARK) => Math.round(TEXT_INSET * (markSize / MARK));

export function BrandBands({ secondary, tertiary, markSize = MARK }: { secondary: string; tertiary: string; markSize?: number }) {
  const scale = markSize / MARK;
  const band = (color: string, edge: number) => (
    <View
      style={{
        position: 'absolute', width: SQUARE, height: SQUARE,
        // Puts that corner on the card's top edge, `edge` from the left.
        left: edge * scale - CORNER_X - SQUARE / 2, top: -CORNER_Y - SQUARE / 2,
        backgroundColor: color, transform: [{ rotate: `${SLANT_DEGREES}deg` }],
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
