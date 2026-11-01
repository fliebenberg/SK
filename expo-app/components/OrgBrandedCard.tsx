import React from 'react';
import { orgColors } from '@sk/shared';
import { View, ViewStyle } from 'react-native';
import { BrandBands, brandBandInset } from './BrandBands';

const PADDING = 14;

interface OrgBrandedCardProps {
  /** `null` is accepted: an org read from the database may have no colour stored. */
  primaryColor?: string | null;
  secondaryColor?: string | null;
  tertiaryColor?: string | null;
  /** The logo, on the bands. Everything else goes beside it, so no text ever sits on them. */
  mark: React.ReactNode;
  markSize: number;
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  testID?: string;
}

/**
 * An organisation's banner, at the top of its pages: the look of the list cards
 * (`BrandedListCard`, docs/design_spec.md §5.4), with room for more than a card shows.
 */
export function OrgBrandedCard({
  primaryColor,
  secondaryColor,
  tertiaryColor,
  mark,
  markSize,
  children,
  style,
  testID,
}: OrgBrandedCardProps) {
  // Each colour falls back to the one before it (`orgColors`).
  const { primary, secondary, tertiary } = orgColors({ primaryColor, secondaryColor, tertiaryColor });

  return (
    <View
      testID={testID}
      className="overflow-hidden rounded-2xl shadow-sm flex-row items-start"
      style={[
        { backgroundColor: primary, padding: PADDING },
        ...(Array.isArray(style) ? style : style ? [style] : []),
      ]}
    >
      <BrandBands secondary={secondary} tertiary={tertiary} markSize={markSize} />
      {mark}
      <View className="flex-1 min-w-0" style={{ marginLeft: brandBandInset(markSize) - PADDING - markSize }}>
        {children}
      </View>
    </View>
  );
}
