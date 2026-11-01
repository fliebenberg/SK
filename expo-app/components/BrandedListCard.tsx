import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { orgColors } from '@sk/shared';
import { inkOnBrand } from '../utils/colorUtils';

/**
 * The card every browsing list uses (docs/design_spec.md §5.4): one record in its organisation's
 * colours, showing only what tells it from the others. It has no buttons; the whole card opens the
 * record. The top row is the name, with any flags on the right; the row under it says where it
 * belongs on the left and what it is on the right.
 *
 * The organisation's second colour is a slanted band down the left, running behind the logo, and a
 * third colour is a thinner stripe to its right. Organisations have no third colour yet (`ORG-17`),
 * so the second fills both; pass `tertiaryColor` once they do and nothing else on the card changes.
 */
const SLANT = '-24deg';
/** Where each band's edge is, halfway up the card; the slant carries it either way from there. */
const BAND_EDGE = 36;
const STRIPE_EDGE = 50;
/** Far enough past the card's left edge that the slant never shows a gap there. */
const OVERHANG = 60;

export function BrandedListCard({
  primaryColor, secondaryColor, tertiaryColor, mark, title, subtitle, detail, flags = [], onPress, accessibilityLabel, testID,
}: {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  tertiaryColor?: string | null;
  /** The logo or crest, 44 wide. */
  mark: React.ReactNode;
  title: string;
  subtitle?: string | null;
  /** What it is, on the right under the flags: for a team its sport and age group. */
  detail?: React.ReactNode;
  flags?: string[];
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { primary, secondary } = orgColors({ primaryColor, secondaryColor });
  const ink = inkOnBrand(primary);
  const band = (color: string, edge: number) => (
    <View
      style={{
        position: 'absolute', top: -24, bottom: -24, left: -OVERHANG, width: OVERHANG + edge,
        backgroundColor: color, transform: [{ skewX: SLANT }],
      }}
    />
  );

  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? title}
      className="overflow-hidden rounded-2xl shadow-sm"
      style={{
        flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 14, paddingVertical: 12, backgroundColor: primary,
      }}
    >
      {band(tertiaryColor || secondary, STRIPE_EDGE)}
      {band(secondary, BAND_EDGE)}
      <View style={{ width: 44, height: 44 }}>{mark}</View>
      <View className="flex-1 min-w-0 ml-2">
        <View className="flex-row items-start gap-2">
          <Text style={{ color: ink.text }} className="flex-1 font-orbitron-bold text-sm uppercase tracking-wide leading-tight">
            {title}
          </Text>
          {flags.length ? (
            <View className="flex-row flex-wrap justify-end gap-1 flex-shrink" style={{ maxWidth: '50%' }}>
              {flags.map(flag => (
                <View key={flag} style={{ backgroundColor: ink.chip, borderColor: ink.border }} className="border px-1.5 py-0.5 rounded">
                  <Text numberOfLines={1} style={{ color: ink.text }} className="font-orbitron-bold text-[9px] uppercase tracking-widest">
                    {flag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <View className="flex-row items-start gap-2.5 mt-1" style={{ minHeight: 16 }}>
          <Text style={{ color: ink.subtext }} className="flex-1 min-w-0 font-inter text-xs leading-4">
            {subtitle}
          </Text>
          {detail}
        </View>
      </View>
    </TouchableOpacity>
  );
}
