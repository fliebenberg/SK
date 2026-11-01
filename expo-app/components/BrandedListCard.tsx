import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { orgColors } from '@sk/shared';
import { inkOnBrand } from '../utils/colorUtils';
import { BrandBands } from './BrandBands';

/**
 * The card every browsing list uses (docs/design_spec.md §5.4): one record in its organisation's
 * colours, showing only what tells it from the others. It has no buttons; the whole card opens the
 * record. The top row is the name, with any flags on the right; the row under it says where it
 * belongs on the left and what it is on the right.
 *
 * The organisation's second colour is a slanted band down the left, running behind the logo, and
 * its third colour a thinner stripe to the band's right (`BrandBands`). Without a third colour, the
 * second fills both.
 */
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
  const { primary, secondary, tertiary } = orgColors({ primaryColor, secondaryColor, tertiaryColor });
  const ink = inkOnBrand(primary);

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
      <BrandBands secondary={secondary} tertiary={tertiary} />
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
