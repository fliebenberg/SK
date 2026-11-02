import React from 'react';
import { View, Image, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getOrgLogoUrl } from '../services/assets';

import { useActiveTheme } from '../store/settingsStore';
import { themeColor } from '../constants/Colors';
interface OrgLogoProps {
  logo?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  primaryColor?: string;
  fallbackIconSize?: number;
  style?: ViewStyle;
}

export function OrgLogo({ 
  logo, 
  size = 'md', 
  className = '', 
  primaryColor, 
  fallbackIconSize,
  style
}: OrgLogoProps) {
  const isDark = useActiveTheme() === 'dark';
  // Determine dimensions based on size prop
  let dim = 48;
  // A rounded square, everywhere; a person's photo is the round one (docs/design_spec.md).
  let borderRadius = 12;
  let iconSize = fallbackIconSize || 24;

  if (typeof size === 'number') {
    dim = size;
    borderRadius = Math.round(size * 0.25);
    iconSize = fallbackIconSize || Math.round(size * 0.5);
  } else {
    switch (size) {
      case 'sm':
        dim = 32;
        borderRadius = 8;
        iconSize = fallbackIconSize || 16;
        break;
      case 'md':
        dim = 48;
        borderRadius = 12;
        iconSize = fallbackIconSize || 24;
        break;
      case 'lg':
        dim = 64;
        borderRadius = 16;
        iconSize = fallbackIconSize || 32;
        break;
      case 'xl':
        dim = 96;
        borderRadius = 24;
        iconSize = fallbackIconSize || 48;
        break;
    }
  }

  return (
    // A logo always sits on its white plate, so a dark transparent one shows on any colour behind it.
    <View
      className={`${logo ? 'bg-logo-plate' : ''} ${className}`}
      style={[
        {
          width: dim,
          height: dim,
          borderRadius: borderRadius,
          overflow: 'hidden',
          justifyContent: 'center',
          alignItems: 'center',
        },
        style
      ]}
    >
      {logo ? (
        <Image
          source={{ uri: getOrgLogoUrl(logo, typeof size === 'string' && size === 'sm' ? 'thumb' : 'medium') }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      ) : (
        <View 
          className="w-full h-full items-center justify-center bg-sunken"
          style={{ width: '100%', height: '100%' }}
        >
          <Ionicons name="business" size={iconSize} color={primaryColor || themeColor(isDark, 'ink-muted')} />
        </View>
      )}
    </View>
  );
}
