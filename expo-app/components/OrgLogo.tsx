import React from 'react';
import { View, Image, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getOrgLogoUrl } from '../services/api';

interface OrgLogoProps {
  logo?: string;
  settings?: Record<string, any>;
  size?: 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  primaryColor?: string;
  fallbackIconSize?: number;
  style?: ViewStyle;
}

export function OrgLogo({ 
  logo, 
  settings, 
  size = 'md', 
  className = '', 
  primaryColor, 
  fallbackIconSize,
  style
}: OrgLogoProps) {
  // Determine dimensions based on size prop
  let dim = 48;
  let borderRadius = 12; // Squircle style
  let iconSize = fallbackIconSize || 24;

  if (typeof size === 'number') {
    dim = size;
    borderRadius = className.includes('rounded-full') ? Math.round(size / 2) : Math.round(size * 0.25);
    iconSize = fallbackIconSize || Math.round(size * 0.5);
  } else {
    switch (size) {
      case 'sm':
        dim = 32;
        borderRadius = className.includes('rounded-full') ? 16 : 8;
        iconSize = fallbackIconSize || 16;
        break;
      case 'md':
        dim = 48;
        borderRadius = className.includes('rounded-full') ? 24 : 12;
        iconSize = fallbackIconSize || 24;
        break;
      case 'lg':
        dim = 64;
        borderRadius = className.includes('rounded-full') ? 32 : 16;
        iconSize = fallbackIconSize || 32;
        break;
      case 'xl':
        dim = 96;
        borderRadius = className.includes('rounded-full') ? 48 : 24;
        iconSize = fallbackIconSize || 48;
        break;
    }
  }

  const logoConfig = settings?.logoConfig || { scale: 1, x: 0, y: 0 };
  const scale = logoConfig.scale ?? 1;
  const x = logoConfig.x ?? 0;
  const y = logoConfig.y ?? 0;

  return (
    <View 
      style={[
        { 
          width: dim, 
          height: dim, 
          borderRadius: borderRadius, 
          overflow: 'hidden', 
          justifyContent: 'center', 
          alignItems: 'center',
          backgroundColor: '#FFFFFF',
        },
        style
      ]}
      className={className}
    >
      {logo ? (
        <Image 
          source={{ uri: getOrgLogoUrl(logo, typeof size === 'string' && size === 'sm' ? 'thumb' : 'medium') }} 
          style={{ 
            width: '100%', 
            height: '100%',
            transform: [
              { scale: scale },
              { translateX: x * dim },
              { translateY: y * dim }
            ]
          }}
          resizeMode="cover"
        />
      ) : (
        <View 
          className="w-full h-full items-center justify-center bg-slate-100 dark:bg-slate-800"
          style={{ width: '100%', height: '100%' }}
        >
          <Ionicons name="business" size={iconSize} color={primaryColor || "#64748B"} />
        </View>
      )}
    </View>
  );
}
