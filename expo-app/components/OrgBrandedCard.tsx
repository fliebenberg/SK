import React from 'react';
import { View, ViewStyle } from 'react-native';

interface OrgBrandedCardProps {
  primaryColor?: string;
  secondaryColor?: string;
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle | ViewStyle[];
}

export function OrgBrandedCard({
  primaryColor = '#FF3E00',
  secondaryColor = '#00E5FF',
  children,
  className = '',
  style,
}: OrgBrandedCardProps) {
  const finalPrimary = primaryColor.trim() || '#FF3E00';
  const finalSecondary = secondaryColor.trim() || '#00E5FF';

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
