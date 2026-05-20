import React from 'react';
import { Image } from 'expo-image';
import { View, Text } from 'tamagui';
import { Organization } from '@sk/types';
import { getInitials, getContrastColor, isPlaceholderLogo, getOrgLogoUrl } from '../../lib/utils';

interface OrgLogoProps {
  organization: Partial<Organization> | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export function OrgLogo({ 
  organization, 
  size = 'md', 
  rounded = 'md'
}: OrgLogoProps) {
  if (!organization) return null;

  const hasActualLogo = organization.logo && !isPlaceholderLogo(organization.logo);
  const initials = getInitials(organization.name || "", organization.shortName);
  const initialsColor = organization.primaryColor ? getContrastColor(organization.primaryColor) : undefined;
  
  const sizeMap = {
    xs: 24,
    sm: 32,
    md: 56,
    lg: 96,
    xl: 128
  };

  const pixelSize = sizeMap[size];

  const roundedMap = {
    none: 0,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: pixelSize / 2
  };

  const borderRadius = roundedMap[rounded];

  const fontSizeMap = {
    xs: 10,
    sm: 12,
    md: 18,
    lg: 32,
    xl: 48
  };

  const fontSize = fontSizeMap[size];

  if (hasActualLogo) {
    const tier = (size === 'xs' || size === 'sm') ? 'thumb' : 'medium';
    return (
      <View 
        width={pixelSize} 
        height={pixelSize} 
        borderRadius={borderRadius} 
        overflow="hidden"
        borderWidth={1}
        borderColor="$gray5"
        backgroundColor="#18181b"
        justifyContent="center"
        alignItems="center"
      >
        <Image 
          source={getOrgLogoUrl(organization.logo, tier)} 
          style={{ width: '100%', height: '100%' }}
          contentFit="cover" 
        />
      </View>
    );
  }

  return (
    <View 
      width={pixelSize} 
      height={pixelSize} 
      borderRadius={borderRadius} 
      overflow="hidden"
      borderWidth={1}
      borderColor="$gray5"
      backgroundColor={organization.primaryColor || '#27272a'}
      justifyContent="center"
      alignItems="center"
    >
      <Text 
        fontWeight="900" 
        fontSize={fontSize} 
        color={initialsColor || '$color'}
        textAlign="center"
        fontFamily="$heading"
        opacity={organization.primaryColor ? 1 : 0.4}
      >
        {initials}
      </Text>
    </View>
  );
}
