import React from 'react';
import { orgColors } from '@sk/shared';
import { View, ViewStyle } from 'react-native';

interface OrgBrandedCardProps {
  /** `null` is accepted: an org read from the database may have no colour stored. */
  primaryColor?: string | null;
  secondaryColor?: string | null;
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle | ViewStyle[];
}

export function OrgBrandedCard({
  primaryColor,
  secondaryColor,
  children,
  className = '',
  style,
}: OrgBrandedCardProps) {
  // Each colour falls back to the one before it (`orgColors`).
  const { primary: finalPrimary, secondary: finalSecondary } = orgColors({ primaryColor, secondaryColor });

  return (
    <View 
      className={`relative overflow-hidden rounded-2xl shadow-sm ${className}`}
      style={[
        { backgroundColor: finalPrimary },
        ...(Array.isArray(style) ? style : style ? [style] : []),
      ]}
    >
      {/* Secondary color accent shapes inside banner */}
      {/* Outer semi-transparent halo for bottom-right circle */}
      <View 
        className="absolute w-40 h-40 rounded-full opacity-35"
        style={{ 
          backgroundColor: finalSecondary,
          right: -56,
          bottom: -56,
        }}
      />
      {/* Solid inner bottom-right circle */}
      <View 
        className="absolute w-32 h-32 rounded-full"
        style={{ 
          backgroundColor: finalSecondary,
          right: -40,
          bottom: -40,
        }}
      />
      {/* Top-left accent circle */}
      <View 
        className="absolute -left-6 -top-6 w-20 h-20 rounded-full opacity-20"
        style={{ backgroundColor: finalSecondary }}
      />
      
      {children}
    </View>
  );
}
